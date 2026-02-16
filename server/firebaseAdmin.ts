import admin from "firebase-admin";

let firebaseAdminApp: admin.app.App | null = null;

function getFirebaseAdmin(): admin.app.App | null {
  if (firebaseAdminApp) return firebaseAdminApp;

  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
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

    if (decoded.aud !== process.env.VITE_FIREBASE_PROJECT_ID) {
      console.error("Firebase token audience mismatch");
      return null;
    }

    return decoded;
  } catch (error) {
    console.error("Firebase ID token verification failed:", error);
    return null;
  }
}
