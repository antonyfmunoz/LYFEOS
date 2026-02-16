import { GoogleAuthProvider, OAuthProvider, signInWithPopup, UserCredential } from "firebase/auth";
import { auth } from "./firebase";
import { toast } from "@/hooks/use-toast";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

export const signInWithGoogle = async (): Promise<UserCredential | null> => {
  try {
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      toast({
        title: "Firebase Configuration Missing",
        description: "Firebase API keys are not set. Please configure Firebase to use Google Sign-in.",
        variant: "destructive"
      });
      return null;
    }
    
    const result = await signInWithPopup(auth, googleProvider);
    return result;
  } catch (error: any) {
    console.error("Google sign-in error:", error);
    if (error.code === 'auth/popup-closed-by-user') {
      return null;
    }
    throw error;
  }
};

export const signInWithApple = async (): Promise<UserCredential | null> => {
  try {
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      toast({
        title: "Firebase Configuration Missing",
        description: "Firebase API keys are not set. Please configure Firebase to use Apple Sign-in.",
        variant: "destructive"
      });
      return null;
    }
    
    const result = await signInWithPopup(auth, appleProvider);
    return result;
  } catch (error: any) {
    console.error("Apple sign-in error:", error);
    if (error.code === 'auth/popup-closed-by-user') {
      return null;
    }
    throw error;
  }
};
