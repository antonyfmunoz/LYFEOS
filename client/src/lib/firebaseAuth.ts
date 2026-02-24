import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithCustomToken as firebaseSignInWithCustomToken,
  sendEmailVerification as firebaseSendEmailVerification,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  applyActionCode as firebaseApplyActionCode,
  UserCredential,
  browserPopupRedirectResolver,
} from "firebase/auth";
import { auth } from "./firebase";
import { toast } from "@/hooks/use-toast";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

function isMobileBrowser(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isMobileSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
}

function isPopupRecoverableError(error: any): boolean {
  const recoverableCodes = [
    'auth/popup-blocked',
    'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment',
    'auth/unauthorized-domain',
  ];
  if (recoverableCodes.includes(error?.code)) return true;
  if (isMobileBrowser() && !error?.code) return true;
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('load failed') || msg.includes('network request failed') || msg.includes('popup_closed')) return true;
  return false;
}

function isAppleProvider(provider: GoogleAuthProvider | OAuthProvider): boolean {
  return provider instanceof OAuthProvider && (provider as any).providerId === 'apple.com';
}

async function signInWithProvider(provider: GoogleAuthProvider | OAuthProvider, providerName: string): Promise<UserCredential | null> {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) {
    toast({
      title: "Firebase Configuration Missing",
      description: `Firebase API keys are not set. Please configure Firebase to use ${providerName} Sign-in.`,
      variant: "destructive"
    });
    return null;
  }

  const isApple = isAppleProvider(provider);

  if (isMobileBrowser() && !isApple) {
    console.log(`Mobile browser detected, using redirect flow directly for ${providerName}`);
    try {
      localStorage.setItem('lyfeos-oauth-redirect-pending', providerName.toLowerCase());
      await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
      return null;
    } catch (redirectError: any) {
      console.error(`${providerName} redirect failed:`, redirectError?.code, redirectError?.message);
      localStorage.removeItem('lyfeos-oauth-redirect-pending');
      toast({
        title: "Login Error",
        description: `${providerName} sign-in failed: ${redirectError?.message || redirectError?.code || 'Please try again.'}`,
        variant: "destructive"
      });
      return null;
    }
  }

  try {
    console.log(`Attempting popup sign-in for ${providerName}${isApple && isMobileBrowser() ? ' (Apple always uses popup on mobile)' : ''}`);
    const result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    return result;
  } catch (error: any) {
    console.error(`${providerName} popup sign-in error:`, error?.code, error?.message);

    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      return null;
    }

    if (!isApple && isPopupRecoverableError(error)) {
      console.log(`Popup failed (${error.code || error?.message || 'unknown'}), falling back to redirect for ${providerName}`);
      try {
        localStorage.setItem('lyfeos-oauth-redirect-pending', providerName.toLowerCase());
        await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
        return null;
      } catch (redirectError: any) {
        console.error(`${providerName} redirect also failed:`, redirectError?.code, redirectError?.message);
        localStorage.removeItem('lyfeos-oauth-redirect-pending');
        toast({
          title: "Login Error",
          description: `${providerName} sign-in failed: ${redirectError?.message || redirectError?.code || 'Please try again.'}`,
          variant: "destructive"
        });
        return null;
      }
    }

    if (isApple && isPopupRecoverableError(error)) {
      console.log(`Apple popup failed (${error.code || error?.message || 'unknown'}), trying redirect as last resort`);
      try {
        localStorage.setItem('lyfeos-oauth-redirect-pending', 'apple');
        await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
        return null;
      } catch (redirectError: any) {
        console.error('Apple redirect also failed:', redirectError?.code, redirectError?.message);
        localStorage.removeItem('lyfeos-oauth-redirect-pending');
      }
    }

    toast({
      title: "Login Error",
      description: `${providerName} sign-in failed: ${error?.message || error?.code || 'Please try again.'}`,
      variant: "destructive"
    });
    return null;
  }
}

export const signInWithGoogle = async (): Promise<UserCredential | null> => {
  return signInWithProvider(googleProvider, "Google");
};

export const signInWithApple = async (): Promise<UserCredential | null> => {
  return signInWithProvider(appleProvider, "Apple");
};

export const checkRedirectResult = async (): Promise<UserCredential | null> => {
  try {
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    if (result) {
      localStorage.removeItem('lyfeos-oauth-redirect-pending');
      console.log("OAuth redirect result received:", result.user?.email);
    }
    return result;
  } catch (error: any) {
    console.error("OAuth redirect result error:", error?.code, error?.message);
    localStorage.removeItem('lyfeos-oauth-redirect-pending');
    return null;
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status} getting Firebase token`);
      }
      const { token } = await res.json();
      const cred = await firebaseSignInWithCustomToken(auth, token);
      user = cred.user;
    }
    if (!user) {
      throw new Error('Could not sign into Firebase. Please try again.');
    }
    const actionCodeSettings = {
      url: `${window.location.origin}/verify-email`,
      handleCodeInApp: true,
    };
    await firebaseSendEmailVerification(user, actionCodeSettings);
    return true;
  } catch (error: any) {
    console.error("Send verification email error:", error);
    throw error;
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
