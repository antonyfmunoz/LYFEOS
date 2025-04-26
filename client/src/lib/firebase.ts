import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.appspot.com`,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase only if keys are available
let app;
let auth;

try {
  // Check if the API key is available
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "undefined") {
    console.warn("Firebase API key not found. Firebase authentication will not be available.");
  } else {
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    console.log("Firebase initialized successfully!");
  }
} catch (error) {
  console.error("Error initializing Firebase:", error);
}

// If auth wasn't initialized, create a mock auth object
if (!auth) {
  auth = {
    // This is a minimal mock of the Firebase auth object to prevent errors
    // when the Firebase keys aren't available
    currentUser: null,
    onAuthStateChanged: (callback) => {
      callback(null);
      return () => {}; // Return unsubscribe function
    },
    signOut: () => Promise.resolve(),
  } as any;
}

export { app, auth };