import { GoogleAuthProvider, OAuthProvider, signInWithRedirect, signInWithPopup, getRedirectResult, UserCredential, AuthError } from "firebase/auth";
import { auth } from "./firebase";
import { Auth } from "firebase/auth";
import { toast } from "@/hooks/use-toast";

const googleProvider = new GoogleAuthProvider();

const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

export const signInWithGoogle = async () => {
  try {
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      toast({
        title: "Firebase Configuration Missing",
        description: "Firebase API keys are not set. Please configure Firebase to use Google Sign-in.",
        variant: "destructive"
      });
      return null;
    }
    
    googleProvider.setCustomParameters({
      prompt: "select_account"
    });
    
    await signInWithRedirect(auth, googleProvider);
    return true;
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }
};

export const signInWithApple = async () => {
  try {
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      toast({
        title: "Firebase Configuration Missing",
        description: "Firebase API keys are not set. Please configure Firebase to use Apple Sign-in.",
        variant: "destructive"
      });
      return null;
    }
    
    await signInWithRedirect(auth, appleProvider);
    return true;
  } catch (error) {
    console.error("Apple sign-in error:", error);
    throw error;
  }
};

export const handleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    
    if (result) {
      const user = result.user;
      const providerId = result.providerId;
      
      let token: string | undefined;
      if (providerId === "google.com") {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        token = credential?.accessToken;
      } else if (providerId === "apple.com") {
        const credential = OAuthProvider.credentialFromResult(result);
        token = credential?.accessToken;
      }
      
      return { user, token, providerId };
    }
    
    return null;
  } catch (error: any) {
    console.error("Redirect result error:", error);
    
    const errorMessage = error.message;
    
    toast({
      title: "Authentication Error",
      description: errorMessage || "Error authenticating. Please try again.",
      variant: "destructive"
    });
    
    throw error;
  }
};
