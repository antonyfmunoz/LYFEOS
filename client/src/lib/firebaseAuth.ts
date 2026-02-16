import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signInWithCustomToken as firebaseSignInWithCustomToken,
  sendEmailVerification as firebaseSendEmailVerification,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  applyActionCode as firebaseApplyActionCode,
  UserCredential,
} from "firebase/auth";
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

export const firebaseSignInWithEmail = async (email: string, password: string): Promise<UserCredential | null> => {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    console.error("Firebase email sign-in error:", error);
    return null;
  }
};

export const sendVerificationEmail = async (): Promise<boolean> => {
  try {
    let user = auth.currentUser;
    if (!user) {
      const res = await fetch('/api/auth/firebase-custom-token', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const { token } = await res.json();
        const cred = await firebaseSignInWithCustomToken(auth, token);
        user = cred.user;
      }
    }
    if (!user) return false;
    const actionCodeSettings = {
      url: `${window.location.origin}/verify-email`,
      handleCodeInApp: true,
    };
    await firebaseSendEmailVerification(user, actionCodeSettings);
    return true;
  } catch (error: any) {
    console.error("Send verification email error:", error);
    return false;
  }
};

export const sendPasswordReset = async (email: string): Promise<boolean> => {
  try {
    const actionCodeSettings = {
      url: `${window.location.origin}/reset-password`,
      handleCodeInApp: true,
    };
    await firebaseSendPasswordResetEmail(auth, email, actionCodeSettings);
    return true;
  } catch (error: any) {
    console.error("Send password reset email error:", error);
    if (error.code === 'auth/user-not-found') {
      return true;
    }
    throw error;
  }
};

export const verifyPasswordResetCode = async (oobCode: string): Promise<string> => {
  return await firebaseVerifyPasswordResetCode(auth, oobCode);
};

export const confirmPasswordReset = async (oobCode: string, newPassword: string): Promise<boolean> => {
  try {
    await firebaseConfirmPasswordReset(auth, oobCode, newPassword);
    return true;
  } catch (error: any) {
    console.error("Confirm password reset error:", error);
    throw error;
  }
};

export const signInWithCustomToken = async (token: string): Promise<UserCredential | null> => {
  try {
    return await firebaseSignInWithCustomToken(auth, token);
  } catch (error: any) {
    console.error("Custom token sign-in error:", error);
    return null;
  }
};

export const applyVerificationCode = async (oobCode: string): Promise<boolean> => {
  try {
    await firebaseApplyActionCode(auth, oobCode);
    return true;
  } catch (error: any) {
    console.error("Apply verification code error:", error);
    throw error;
  }
};
