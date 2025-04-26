import { GoogleAuthProvider, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { auth } from "./firebase";
import { toast } from "@/hooks/use-toast";

// Initialize Google provider
const googleProvider = new GoogleAuthProvider();

// Google sign-in
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
    
    // Add custom parameters
    googleProvider.setCustomParameters({
      prompt: "select_account" // Force account selection even if only one account is available
    });
    
    await signInWithRedirect(auth, googleProvider);
    return true;
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }
};

// Handle redirect result
export const handleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    
    if (result) {
      // This gives you a Google Access Token, which can be used to access Google APIs
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      
      // The signed-in user info
      const user = result.user;
      
      return { user, token };
    }
    
    return null;
  } catch (error: any) {
    console.error("Redirect result error:", error);
    
    // Handle errors
    const errorCode = error.code;
    const errorMessage = error.message;
    
    // The email of the user's account used
    const email = error.customData?.email;
    
    // The AuthCredential type that was used
    const credential = GoogleAuthProvider.credentialFromError(error);
    
    toast({
      title: "Authentication Error",
      description: errorMessage || "Error authenticating with Google. Please try again.",
      variant: "destructive"
    });
    
    throw error;
  }
};