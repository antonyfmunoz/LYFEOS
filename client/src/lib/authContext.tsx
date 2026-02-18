import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "./queryClient";
import { auth } from "./firebase";
import { signInWithGoogle, signInWithApple, firebaseSignInWithEmail, sendVerificationEmail, checkRedirectResult } from "./firebaseAuth";
import { User as FirebaseUser, onAuthStateChanged, Auth } from "firebase/auth";
import { applyPrimaryColor } from "./applyPrimaryColor";
import { getLocalDateString } from "./utils";


interface User {
  id: number;
  username: string | null;
}

interface AuthResponse {
  user: {
    id: number;
    username: string | null;
  };
  isNewUser?: boolean;
  primaryColor?: string;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, password: string, extraData?: { avatarColor?: string }) => Promise<void>;
  completeRegistration: (data: Record<string, any>) => Promise<{ id: number; username: string } | null>;
  logout: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  registerPreLogoutCallback: (callback: () => Promise<void> | void) => void;
  unregisterPreLogoutCallback: (callback: () => Promise<void> | void) => void;
  setPendingPassword: (password: string) => void;
  getPendingPassword: () => string | null;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();
  
  const pendingPasswordRef = React.useRef<string | null>(null);
  const setPendingPassword = (password: string) => { pendingPasswordRef.current = password; };
  const getPendingPassword = () => pendingPasswordRef.current;

  // Pre-logout callbacks - called BEFORE logout clears auth to allow saving data
  const preLogoutCallbacksRef = React.useRef<Set<() => Promise<void> | void>>(new Set());
  
  const registerPreLogoutCallback = React.useCallback((callback: () => Promise<void> | void) => {
    preLogoutCallbacksRef.current.add(callback);
  }, []);
  
  const unregisterPreLogoutCallback = React.useCallback((callback: () => Promise<void> | void) => {
    preLogoutCallbacksRef.current.delete(callback);
  }, []);

  const processOAuthResult = async (result: any) => {
    if (!result || !result.user) return;
    
    const { displayName, email, uid, photoURL } = result.user;
    console.log("Successfully signed in via OAuth:", { displayName, email, uid });
    
    const response = await fetch("/api/auth/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, email, displayName, photoURL }),
      credentials: "include"
    });
    
    if (!response.ok) {
      throw new Error("Failed to authenticate with server");
    }
    
    const userData = await response.json();
    
    if (userData.primaryColor) {
      if (!userData.isNewUser) {
        applyPrimaryColor(userData.primaryColor);
      }
      localStorage.setItem('lyfeos-primary-color', userData.primaryColor);
    }
    
    setUser(userData.user);
    localStorage.setItem("lyfeos_user", JSON.stringify(userData.user));
    
    if (userData.isNewUser || userData.onboardingCompleted === false) {
      console.log("New or incomplete onboarding user, redirecting to onboarding. isNewUser:", userData.isNewUser, "onboardingCompleted:", userData.onboardingCompleted);
      localStorage.setItem("lyfeos-pending-onboarding", "true");
      navigate("/onboarding", { replace: true });
    } else {
      console.log("Returning OAuth user, using standard login flow");
      const todayStr = getLocalDateString();
      queryClient.prefetchQuery({ queryKey: ["/api/profile"] });
      queryClient.prefetchQuery({
        queryKey: ['/api/users', userData.user.id, 'daily-logs', todayStr],
        queryFn: async () => {
          const response = await fetch(`/api/users/${userData.user.id}/daily-logs?date=${todayStr}`, {
            credentials: 'include'
          });
          if (!response.ok) return { _noData: true, _confirmed: true };
          const result = await response.json();
          return result.logs?.[0] || { _noData: true, _confirmed: true };
        },
      });
      queryClient.prefetchQuery({ queryKey: ["/api/users", userData.user.id, "profile"] });
      queryClient.prefetchQuery({ queryKey: ["/api/account"] });
      
      sessionStorage.setItem("login_success_username", userData.user.username || "");
      sessionStorage.setItem("login_success_new_user", "false");
      navigate("/login-success", { replace: true });
    }
  };

  // Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUserData) => {
      console.log("Firebase auth state changed:", firebaseUserData);
      setFirebaseUser(firebaseUserData);
      
      // If Firebase user exists but we don't have a server-side user yet,
      // we'll handle that later with loginWithGoogle
    });
    
    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Check if the user is logged in on initial load (server-side auth)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const cachedUser = localStorage.getItem("lyfeos_user");
        if (cachedUser) {
          try {
            const parsedUser = JSON.parse(cachedUser);
            if (parsedUser && parsedUser.id) {
              console.log("Using cached user data from localStorage:", parsedUser);
              setUser(parsedUser);
            }
          } catch (e) {
            console.error("Failed to parse cached user data:", e);
          }
        }
        
        const redirectPending = localStorage.getItem('lyfeos-oauth-redirect-pending');
        if (redirectPending) {
          console.log("Checking OAuth redirect result for:", redirectPending);
          try {
            const redirectResult = await checkRedirectResult();
            if (redirectResult && redirectResult.user) {
              console.log("OAuth redirect successful, processing result");
              await processOAuthResult(redirectResult);
              return;
            }
          } catch (err) {
            console.error("OAuth redirect processing failed:", err);
            localStorage.removeItem('lyfeos-oauth-redirect-pending');
          }
        }

        const response = await fetch("/api/auth/me", {
          credentials: "include"
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("Server auth check successful, user data:", data.user);
          setUser(data.user);
          localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
        } else {
          console.log("Not authenticated with server, clearing local user data");
          setUser(null);
          localStorage.removeItem("lyfeos_user");
        }
      } catch (error) {
        console.error("Failed to check authentication status:", error);
        if (!user) {
          localStorage.removeItem("lyfeos_user");
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (identifier: string, password: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting to login with:", identifier);
      localStorage.removeItem("lyfeos-primary-color");
      localStorage.removeItem("lyfeos-onboarding-answers");
      localStorage.removeItem("lyfeos-onboarding-resume");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      sessionStorage.removeItem("lyfeos-pending-registration");
      
      const trimmedIdentifier = identifier.trim();
      
      if (!trimmedIdentifier || !password) {
        throw new Error("Username, email, or phone number and password are required");
      }
      
      // Make the login request with identifier (username, email, or phone)
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          identifier: trimmedIdentifier, 
          password: password 
        }),
        credentials: "include" // Important for maintaining session cookies
      });
      
      console.log("Login response status:", response.status);
      
      // Get the response text first to handle JSON parsing errors
      const responseText = await response.text();
      
      // Log full response for debugging
      console.log("Login response body:", responseText);
      
      // Attempt to parse the JSON response
      let data;
      try {
        data = JSON.parse(responseText) as AuthResponse;
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        throw new Error("Invalid server response. Please try again.");
      }
      
      if (!response.ok) {
        throw new Error(data?.error || "Check your username and password");
      }
      
      if (!data || !data.user || !data.user.id) {
        throw new Error("Invalid user data received from server");
      }
      
      // Success path
      console.log("Login successful, user data:", data.user);
      
      // Apply the user's theme color BEFORE showing toast or navigating
      if (data.primaryColor) {
        applyPrimaryColor(data.primaryColor);
        localStorage.setItem('lyfeos-primary-color', data.primaryColor);
      }
      
      // Update application state
      setUser(data.user);
      localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
      localStorage.removeItem("lyfeos-pending-onboarding");
      
      // Wait for session cookie to be fully established before navigating
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify session is established
      try {
        const verifyResponse = await fetch("/api/auth/me", { credentials: "include" });
        if (verifyResponse.ok) {
          console.log("Session verified successfully");
        }
      } catch (e) {
        console.warn("Session verification failed, proceeding anyway");
      }

      // Prefetch key data so pages load instantly (keys must match destination page queryKeys)
      const todayStr = getLocalDateString();
      queryClient.prefetchQuery({ queryKey: ["/api/profile"] });
      queryClient.prefetchQuery({
        queryKey: ['/api/users', data.user.id, 'daily-logs', todayStr],
        queryFn: async () => {
          const response = await fetch(`/api/users/${data.user.id}/daily-logs?date=${todayStr}`, {
            credentials: 'include'
          });
          if (!response.ok) return { _noData: true, _confirmed: true };
          const result = await response.json();
          return result.logs?.[0] || { _noData: true, _confirmed: true };
        },
      });
      queryClient.prefetchQuery({ queryKey: ["/api/users", data.user.id, "profile"] });
      queryClient.prefetchQuery({ queryKey: ["/api/account"] });

      // Store username for the transition page toast
      sessionStorage.setItem("login_success_username", data.user.username || "");
      sessionStorage.setItem("login_success_new_user", data.isNewUser ? "true" : "false");
      
      // Navigate to transition page — toast shows there, then auto-redirects
      console.log("Navigating to login success transition...");
      navigate("/login-success", { replace: true });
    } catch (error: any) {
      console.error("Login error:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, extraData?: { avatarColor?: string }) => {
    try {
      setIsLoading(true);
      console.log("Attempting to register with email:", email);
      localStorage.removeItem("lyfeos-primary-color");
      localStorage.removeItem("lyfeos-onboarding-answers");
      localStorage.removeItem("lyfeos-onboarding-resume");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      sessionStorage.removeItem("lyfeos-pending-registration");
      
      const trimmedEmail = email.trim();
      
      if (!trimmedEmail || !password) {
        const error = new Error("Email and password are required");
        toast({
          title: "Registration Error",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }
      
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          email: trimmedEmail, 
          password: password,
          termsAccepted: true,
          ...(extraData || {}),
        }),
        credentials: "include"
      });
      
      console.log("Register response status:", response.status);
      
      // Get the response text first to handle JSON parsing errors
      const responseText = await response.text();
      
      // Log full response for debugging
      console.log("Register response body:", responseText);
      
      // Attempt to parse the JSON response
      let data;
      try {
        data = JSON.parse(responseText) as AuthResponse;
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        const error = new Error("Invalid server response. Please try again.");
        toast({
          title: "Registration Error",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }
      
      if (!response.ok) {
        const errorMessage = data?.error || "Registration failed. Please try again.";
        const error = new Error(errorMessage);
        toast({
          title: "Registration Failed",
          description: errorMessage,
          variant: "destructive",
        });
        throw error;
      }
      
      if (!data || !data.user || !data.user.id) {
        const error = new Error("Invalid user data received from server");
        toast({
          title: "Registration Error",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }
      
      // Success path
      console.log("Registration successful, user data:", data.user);
      
      // Update application state
      setUser(data.user);
      localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
      
      // CRITICAL FIX: Wait a moment to ensure the session cookie is properly set
      // This prevents the immediate redirect that's happening after registration
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify the session is properly established
      try {
        const verifyResponse = await fetch("/api/auth/me", {
          credentials: "include"
        });
        
        if (verifyResponse.ok) {
          console.log("Session verified successfully after registration");
        } else {
          console.warn("Session verification failed after registration - proceeding anyway");
        }
      } catch (verifyError) {
        console.error("Error verifying session after registration:", verifyError);
        // Continue despite error - user is already authenticated client-side
      }
      
      // Set loading to false BEFORE navigation so onboarding page renders immediately
      setIsLoading(false);
      
      // Clear widget states for new users so all widgets start open with their defaults
      localStorage.removeItem("lyfeos-widget-states");
      
      if (trimmedEmail && password) {
        firebaseSignInWithEmail(trimmedEmail, password).then((cred) => {
          if (cred) {
            sendVerificationEmail().catch((err) => {
              console.warn("Failed to send Firebase verification email:", err);
            });
          }
        }).catch((err) => {
          console.warn("Firebase sign-in after registration failed:", err);
        });
      }

      localStorage.setItem("lyfeos-pending-onboarding", "true");
      
      console.log("New user registered, redirecting to onboarding");
      navigate("/onboarding", { replace: true });
    } catch (error: any) {
      console.error("Registration error:", error);
      // If the error doesn't have a message property, show a generic error
      if (!error.message) {
        toast({
          title: "Registration Error",
          description: "Could not connect to server. Please try again.",
          variant: "destructive",
        });
      }
      setIsLoading(false);
      throw error;
    }
  };

  const completeRegistration = async (data: Record<string, any>): Promise<{ id: number; username: string } | null> => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/complete-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include"
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error("Invalid server response. Please try again.");
      }

      if (!response.ok) {
        throw new Error(result?.error || "Registration failed. Please try again.");
      }

      sessionStorage.removeItem("lyfeos-pending-registration");
      pendingPasswordRef.current = null;
      queryClient.removeQueries({ queryKey: ["/api/profile"] });
      setUser(result.user);
      localStorage.setItem("lyfeos_user", JSON.stringify(result.user));
      localStorage.removeItem("lyfeos-widget-states");
      return result.user;
    } catch (error: any) {
      console.error("Complete registration error:", error);
      toast({
        title: "Registration Failed",
        description: error.message || "Could not complete registration. Please try again.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      console.log("Logging out user...");
      
      // Call all pre-logout callbacks BEFORE clearing auth
      // This allows components to save their data while the session is still valid
      const callbacks = Array.from(preLogoutCallbacksRef.current);
      console.log(`Calling ${callbacks.length} pre-logout callbacks...`);
      for (let i = 0; i < callbacks.length; i++) {
        try {
          await callbacks[i]();
        } catch (error) {
          console.error("Pre-logout callback error:", error);
          // Continue with other callbacks even if one fails
        }
      }
      console.log("Pre-logout callbacks completed");
      
      // Now clear local state
      setUser(null);
      setFirebaseUser(null);
      queryClient.removeQueries({ queryKey: ["/api/profile"] });
      localStorage.removeItem("lyfeos_user");
      localStorage.removeItem("lyfeos-pending-onboarding");
      localStorage.removeItem("lyfeos-has-seen-dashboard");
      localStorage.removeItem("lyfeos-primary-color");
      localStorage.removeItem("lyfeos-onboarding-answers");
      localStorage.removeItem("lyfeos-onboarding-resume");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      
      // Sign out from Firebase
      try {
        await auth.signOut();
      } catch (error) {
        console.error("Firebase sign out error:", error);
        // Continue with logout process even if Firebase fails
      }
      
      // API call to server to logout - using await for better error handling
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include" // Important for session cookie handling
        });
        
        if (!response.ok) {
          console.error("Logout request failed with status:", response.status);
        } else {
          console.log("Server logout successful");
        }
      } catch (error) {
        console.error("Logout server request error:", error);
        // Continue with client-side logout even if server request fails
      }
      
      // Small delay to let the logout process complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Always navigate to login page
      console.log("Redirecting to login page after logout");
      navigate("/login", { replace: true });
      
    } catch (error) {
      console.error("Unexpected logout error:", error);
      // Always navigate to login as a fallback
      navigate("/login", { replace: true });
    }
  };
  
  const refreshUser = async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
      }
    } catch (error) {
      console.error("Failed to refresh user:", error);
    }
  };

  const loginWithGoogle = async () => {
    try {
      setIsLoading(true);
      localStorage.removeItem("lyfeos-primary-color");
      localStorage.removeItem("lyfeos-onboarding-answers");
      localStorage.removeItem("lyfeos-onboarding-resume");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      sessionStorage.removeItem("lyfeos-pending-registration");
      const result = await signInWithGoogle();
      await processOAuthResult(result);
    } catch (error: any) {
      console.error("Google login error:", error?.code, error?.message, error);
      const errorDetail = error?.code
        ? `${error.code}: ${error.message || 'Unknown'}`
        : error?.message || String(error);
      toast({
        title: "Login Error",
        description: `Google sign-in failed: ${errorDetail}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const loginWithApple = async () => {
    try {
      setIsLoading(true);
      localStorage.removeItem("lyfeos-primary-color");
      localStorage.removeItem("lyfeos-onboarding-answers");
      localStorage.removeItem("lyfeos-onboarding-resume");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      sessionStorage.removeItem("lyfeos-pending-registration");
      const result = await signInWithApple();
      await processOAuthResult(result);
    } catch (error: any) {
      console.error("Apple login error:", error?.code, error?.message, error);
      const errorDetail = error?.code
        ? `${error.code}: ${error.message || 'Unknown'}`
        : error?.message || String(error);
      toast({
        title: "Login Error",
        description: `Apple sign-in failed: ${errorDetail}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        completeRegistration,
        logout,
        loginWithGoogle,
        loginWithApple,
        registerPreLogoutCallback,
        unregisterPreLogoutCallback,
        setPendingPassword,
        getPendingPassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}