import { initializeApp, FirebaseApp } from "firebase/app";
import { initializeAuth, Auth, Unsubscribe, NextOrObserver, User, connectAuthEmulator, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, browserPopupRedirectResolver } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

function resolveProjectId(): string {
  const actual = import.meta.env.VITE_FIREBASE_ACTUAL_PROJECT_ID;
  const fallback = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const candidates = [actual, fallback].filter(Boolean);
  for (const id of candidates) {
    if (id && !id.includes(':') && !id.includes(' ')) {
      return id;
    }
  }
  return 'lyfeos-a55f4';
}

const firebaseProjectId = resolveProjectId();

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${firebaseProjectId}.firebaseapp.com`,
  projectId: firebaseProjectId,
  storageBucket: `${firebaseProjectId}.firebasestorage.googleapis.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let db: any;
let auth: Auth = {
  currentUser: null,
  onAuthStateChanged: (callback: NextOrObserver<User | null>): Unsubscribe => {
    if (typeof callback === 'function') {
      callback(null);
    }
    return () => {};
  },
  signOut: () => Promise.resolve(),
} as Auth;

try {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "undefined") {
    console.warn("Firebase API key not found. Firebase authentication will not be available.");
  } else {
    app = initializeApp(firebaseConfig);
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    
    db = getFirestore(app);
    
    if (import.meta.env.DEV) {
    }
    
  }
} catch (error) {
  console.error("Error initializing Firebase:", error);
}

export { app, auth, db };
