import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, Unsubscribe, NextOrObserver, User, connectAuthEmulator } from "firebase/auth";
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
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (typeof window !== 'undefined' ? window.location.host : `${firebaseProjectId}.firebaseapp.com`),
  projectId: firebaseProjectId,
  storageBucket: `${firebaseProjectId}.firebasestorage.googleapis.com`,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase only if keys are available
let app: FirebaseApp | undefined;
let db: any;
// Initialize with a mock Auth object to prevent errors when Firebase is not available
let auth: Auth = {
  // This is a minimal mock of the Firebase auth object to prevent errors
  // when the Firebase keys aren't available
  currentUser: null,
  onAuthStateChanged: (callback: NextOrObserver<User | null>): Unsubscribe => {
    if (typeof callback === 'function') {
      callback(null);
    }
    return () => {}; // Return unsubscribe function
  },
  signOut: () => Promise.resolve(),
} as Auth;

try {
  // Check if the API key is available
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "undefined") {
    console.warn("Firebase API key not found. Firebase authentication will not be available.");
  } else {
    // Initialize Firebase with persistence options
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    
    // Initialize Firestore
    db = getFirestore(app);
    
    // Use emulator settings if in development
    if (import.meta.env.DEV) {
      // These lines can be uncommented if using Firebase emulators for local development
      // connectAuthEmulator(auth, 'http://localhost:9099');
      // connectFirestoreEmulator(db, 'localhost', 8080);
    }
    
  }
} catch (error) {
  console.error("Error initializing Firebase:", error);
}

export { app, auth, db };