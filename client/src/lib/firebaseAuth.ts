import { 
  GoogleAuthProvider, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut,
  UserCredential
} from "firebase/auth";
import { auth } from "./firebase";

// Google Provider
const googleProvider = new GoogleAuthProvider();

/**
 * Initiates Google Sign In with Redirect
 * Call this function when the user clicks on the "Login with Google" button
 */
export function signInWithGoogle() {
  return signInWithRedirect(auth, googleProvider);
}

/**
 * Handles the redirect result after returning from the OAuth provider
 * Call this function on page load when the user is redirected back to your site
 */
export async function handleRedirectResult(): Promise<UserCredential | null> {
  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    
    // This gives you a Google Access Token, which you can use to access Google APIs
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    
    // The signed-in user info
    const user = result.user;
    console.log("Successfully authenticated with Google", { user });
    
    return result;
  } catch (error: any) {
    // Handle Errors here
    const errorCode = error.code;
    const errorMessage = error.message;
    console.error("Error during authentication redirect", { errorCode, errorMessage });
    
    // The email of the user's account used
    const email = error.customData?.email;
    // The AuthCredential type that was used
    const credential = GoogleAuthProvider.credentialFromError(error);
    
    throw error;
  }
}

/**
 * Sign out the currently authenticated user
 */
export async function logOut() {
  return signOut(auth);
}