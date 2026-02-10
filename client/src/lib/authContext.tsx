import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "./queryClient";
import { auth } from "./firebase";
import { signInWithGoogle, handleRedirectResult } from "./firebaseAuth";
import { User as FirebaseUser, onAuthStateChanged, Auth } from "firebase/auth";
import { applyPrimaryColor } from "./applyPrimaryColor";
import { getLocalDateString } from "./utils";

interface User {
  id: number;
  username: string;
}

interface AuthResponse {
  user: {
    id: number;
    username: string;
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
  register: (username: string, password: string, extraData?: { firstName?: string; lastName?: string; email?: string; displayName?: string }) => Promise<void>;
  logout: () => void;
  loginWithGoogle: () => Promise<void>;
  handleOAuthRedirect: () => Promise<void>;
  registerPreLogoutCallback: (callback: () => Promise<void> | void) => void;
  unregisterPreLogoutCallback: (callback: () => Promise<void> | void) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();
  
  // Pre-logout callbacks - called BEFORE logout clears auth to allow saving data
  const preLogoutCallbacksRef = React.useRef<Set<() => Promise<void> | void>>(new Set());
  
  const registerPreLogoutCallback = React.useCallback((callback: () => Promise<void> | void) => {
    preLogoutCallbacksRef.current.add(callback);
  }, []);
  
  const unregisterPreLogoutCallback = React.useCallback((callback: () => Promise<void> | void) => {
    preLogoutCallbacksRef.current.delete(callback);
  }, []);

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
        // First try to get cached user from localStorage for immediate UI update
        const cachedUser = localStorage.getItem("lyfeos_user");
        if (cachedUser) {
          try {
            const parsedUser = JSON.parse(cachedUser);
            if (parsedUser && parsedUser.id) {
              console.log("Using cached user data from localStorage:", parsedUser);
              setUser(parsedUser);
              // Don't set isLoading to false yet - still verify with server
            }
          } catch (e) {
            console.error("Failed to parse cached user data:", e);
          }
        }
        
        // Then verify with server
        const response = await fetch("/api/auth/me", {
          credentials: "include" // Ensure cookies are sent with the request
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("Server auth check successful, user data:", data.user);
          setUser(data.user);
          // Update localStorage with latest data
          localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
        } else {
          console.log("Not authenticated with server, clearing local user data");
          // Clear any stored user data if not authenticated
          setUser(null);
          localStorage.removeItem("lyfeos_user");
        }
      } catch (error) {
        console.error("Failed to check authentication status:", error);
        // On error, keep the cached user if we have one, otherwise clear
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
      
      // Ensure identifier and password are properly trimmed
      const trimmedIdentifier = identifier.trim();
      const trimmedPassword = password.trim();
      
      if (!trimmedIdentifier || !trimmedPassword) {
        const error = new Error("Username, email, or phone number and password are required");
        toast({
          title: "Login Error",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }
      
      // Make the login request with identifier (username, email, or phone)
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          identifier: trimmedIdentifier, 
          password: trimmedPassword 
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
        const error = new Error("Invalid server response. Please try again.");
        toast({
          title: "Login Error",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }
      
      if (!response.ok) {
        const errorMessage = data?.error || "Check your username and password";
        const error = new Error(errorMessage);
        toast({
          title: "Login Failed",
          description: errorMessage,
          variant: "destructive",
        });
        throw error;
      }
      
      if (!data || !data.user || !data.user.id) {
        const error = new Error("Invalid user data received from server");
        toast({
          title: "Login Error",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }
      
      // Success path
      console.log("Login successful, user data:", data.user);
      
      // Apply the user's theme color BEFORE showing toast or navigating
      if (data.primaryColor) {
        applyPrimaryColor(data.primaryColor);
      }
      
      // Update application state
      setUser(data.user);
      localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
      
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
      queryClient.prefetchQuery({ queryKey: ['/api/users', data.user.id, 'daily-logs', todayStr] });
      queryClient.prefetchQuery({ queryKey: ["/api/users", data.user.id, "profile"] });
      queryClient.prefetchQuery({ queryKey: ["/api/account"] });

      // Navigate after session is confirmed, then show toast on destination page
      if (data.isNewUser) {
        console.log("New user detected, redirecting to onboarding");
        navigate("/onboarding", { replace: true });
      } else {
        console.log("Redirecting to dashboard...");
        navigate("/dashboard", { replace: true });
      }
      
      // Show toast after navigation so it renders on the new page
      setTimeout(() => {
        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.user.username}!`,
          variant: "default",
          duration: 1500,
        });
      }, 150);
    } catch (error: any) {
      console.error("Login error:", error);
      // If the error doesn't have a message property, show a generic error
      if (!error.message) {
        toast({
          title: "Login Error",
          description: "Could not connect to server. Please try again.",
          variant: "destructive",
        });
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (username: string, password: string, extraData?: { firstName?: string; lastName?: string; email?: string; displayName?: string }) => {
    try {
      setIsLoading(true);
      console.log("Attempting to register with:", username);
      
      const trimmedUsername = username.trim();
      const trimmedPassword = password.trim();
      
      if (!trimmedUsername || !trimmedPassword) {
        const error = new Error("Username and password are required");
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
          username: trimmedUsername, 
          password: trimmedPassword,
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
        const errorMessage = data?.error || "Username may already be taken";
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
      
      // Set a persistent flag so the Router always redirects to /onboarding
      // even if auth state changes trigger re-renders. Cleared when onboarding completes.
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
      localStorage.removeItem("lyfeos_user");
      localStorage.removeItem("lyfeos-pending-onboarding");
      
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
  
  // Handle Google login
  const loginWithGoogle = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      // The redirect happens automatically, and the result will be handled in handleOAuthRedirect
    } catch (error) {
      console.error("Google login error:", error);
      toast({
        title: "Login Error",
        description: "Could not sign in with Google. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };
  
  // Handle redirect result from OAuth providers
  const handleOAuthRedirect = async () => {
    try {
      setIsLoading(true);
      const result = await handleRedirectResult();
      
      if (result && result.user) {
        // Get user info from Firebase auth
        const { displayName, email, uid, photoURL } = result.user;
        
        console.log("Successfully signed in with Google:", { displayName, email, uid });
        
        // Register or login this Firebase user with our backend
        const response = await fetch("/api/auth/firebase", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            uid, 
            email, 
            displayName, 
            photoURL 
          }),
          credentials: "include" // Important for session cookie handling
        });
        
        if (!response.ok) {
          throw new Error("Failed to authenticate with server");
        }
        
        const userData = await response.json();
        
        // Apply the user's theme color BEFORE showing toast or navigating
        if (userData.primaryColor) {
          applyPrimaryColor(userData.primaryColor);
        }
        
        toast({
          title: "Google Sign-in Successful",
          description: `Welcome${displayName ? `, ${displayName}` : ''}!`,
        });
        
        setUser(userData.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(userData.user));
        
        if (userData.isNewUser) {
          console.log("New user detected, redirecting to onboarding");
          navigate("/onboarding");
        } else {
          navigate("/dashboard");
        }
      }
    } catch (error) {
      console.error("Error handling OAuth redirect:", error);
      toast({
        title: "Authentication Error",
        description: "There was a problem completing the authentication. Please try again.",
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
        logout,
        loginWithGoogle,
        handleOAuthRedirect,
        registerPreLogoutCallback,
        unregisterPreLogoutCallback,
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