import admin from "firebase-admin";

let firebaseAdminApp: admin.app.App | null = null;

function getFirebaseAdmin(): admin.app.App | null {
  if (firebaseAdminApp) return firebaseAdminApp;

  let projectId: string | undefined;
  const saKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (saKey) {
    try { projectId = JSON.parse(saKey).project_id; } catch {}
  }
  if (!projectId) {
    projectId = process.env.VITE_FIREBASE_ACTUAL_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  }
  if (!projectId) {
    console.warn("Firebase project ID not configured. Phone verification will not work.");
    return null;
  }

  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      firebaseAdminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId,
      });
    } else {
      firebaseAdminApp = admin.initializeApp({
        projectId,
      });
      console.warn("Firebase Admin initialized without service account. Token verification may have limited functionality.");
    }

    return firebaseAdminApp;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
    return null;
  }
}

export async function verifyFirebaseIdToken(idToken: string): Promise<admin.auth.DecodedIdToken | null> {
  const app = getFirebaseAdmin();
  if (!app) {
    console.error("Firebase Admin not available — cannot verify phone token");
    return null;
  }

  try {
    const decoded = await admin.auth(app).verifyIdToken(idToken);

    let expectedAudience: string | undefined;
    const saKeyForAud = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (saKeyForAud) {
      try { expectedAudience = JSON.parse(saKeyForAud).project_id; } catch {}
    }
    if (!expectedAudience) {
      expectedAudience = process.env.VITE_FIREBASE_ACTUAL_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    }
    if (expectedAudience && decoded.aud !== expectedAudience) {
      console.error("Firebase token audience mismatch:", decoded.aud, "expected:", expectedAudience);
      return null;
    }

    return decoded;
  } catch (error) {
    console.error("Firebase ID token verification failed:", error);
    return null;
  }
}

export async function createFirebaseUser(email: string, password: string): Promise<string | null> {
  const app = getFirebaseAdmin();
  if (!app) {
    console.warn("Firebase Admin not available — skipping Firebase user creation");
    return null;
  }

  try {
    const existing = await admin.auth(app).getUserByEmail(email).catch(() => null);
    if (existing) {
      return existing.uid;
    }
    const userRecord = await admin.auth(app).createUser({ email, password });
    return userRecord.uid;
  } catch (error) {
    console.error("Failed to create Firebase user:", error);
    return null;
  }
}

export async function getFirebaseUserByEmail(email: string): Promise<admin.auth.UserRecord | null> {
  const app = getFirebaseAdmin();
  if (!app) return null;

  try {
    return await admin.auth(app).getUserByEmail(email);
  } catch {
    return null;
  }
}

export async function checkFirebaseEmailVerified(uid: string): Promise<boolean> {
  const app = getFirebaseAdmin();
  if (!app) return false;

  try {
    const userRecord = await admin.auth(app).getUser(uid);
    return userRecord.emailVerified;
  } catch {
    return false;
  }
}

export async function createCustomToken(uid: string): Promise<string | null> {
  const app = getFirebaseAdmin();
  if (!app) return null;

  try {
    return await admin.auth(app).createCustomToken(uid);
  } catch (error) {
    console.error("Failed to create Firebase custom token:", error);
    return null;
  }
}

export async function updateFirebaseUserPassword(uid: string, newPassword: string): Promise<boolean> {
  const app = getFirebaseAdmin();
  if (!app) return false;

  try {
    await admin.auth(app).updateUser(uid, { password: newPassword });
    return true;
  } catch (error) {
    console.error("Failed to update Firebase user password:", error);
    return false;
  }
}
