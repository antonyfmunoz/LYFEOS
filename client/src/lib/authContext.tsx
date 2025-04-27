import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "./queryClient";
import { auth } from "./firebase";
import { signInWithGoogle, handleRedirectResult } from "./firebaseAuth";
import { User as FirebaseUser, onAuthStateChanged, Auth } from "firebase/auth";

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
  error?: string;
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loginWithGoogle: () => Promise<void>;
  handleOAuthRedirect: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();

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

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting to login with:", username);
      
      // Ensure username and password are properly trimmed
      const trimmedUsername = username.trim();
      const trimmedPassword = password.trim();
      
      if (!trimmedUsername || !trimmedPassword) {
        const error = new Error("Username and password are required");
        toast({
          title: "Login Error",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }
      
      // Make the login request
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          username: trimmedUsername, 
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
      
      // Update application state
      setUser(data.user);
      localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
      
      // Show success message
      toast({
        title: "Login Successful",
        description: `Welcome back, ${data.user.username}!`,
        variant: "default",
      });
      
      // Handle redirection based on isNewUser flag
      if (data.isNewUser) {
        console.log("New user detected, redirecting to onboarding");
        navigate("/onboarding");
      } else {
        navigate("/dashboard");
      }
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

  const register = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting to register with:", username);
      
      // Ensure username and password are properly trimmed
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
      
      // Make the registration request
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          username: trimmedUsername, 
          password: trimmedPassword,
          termsAccepted: true // This is required by the backend
        }),
        credentials: "include" // Important for maintaining session cookies
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
      
      // Show success message
      toast({
        title: "Registration Successful",
        description: `Welcome to LYFEOS, ${data.user.username}!`,
        variant: "default",
      });
      
      // Handle redirection based on isNewUser flag (should always be true for registration)
      if (data.isNewUser) {
        console.log("New user detected, redirecting to onboarding");
        navigate("/onboarding");
      } else {
        // Fallback if for some reason isNewUser is false (shouldn't happen)
        navigate("/dashboard");
      }
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
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    try {
      console.log("Logging out user...");
      
      // First clear local state
      setUser(null);
      setFirebaseUser(null);
      localStorage.removeItem("lyfeos_user");
      
      // Sign out from Firebase
      auth.signOut().catch((error: Error) => {
        console.error("Firebase sign out error:", error);
      });
      
      // API call to server to logout
      fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include" // Important for session cookie handling
      }).then(response => {
        if (!response.ok) {
          console.error("Logout request failed with status:", response.status);
        }
        
        // Navigate to login page using wouter's navigate
        navigate("/login");
      }).catch(error => {
        console.error("Logout error:", error);
        
        // Navigate even on error
        navigate("/login");
      });
    } catch (error) {
      console.error("Unexpected logout error:", error);
      navigate("/login");
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
        
        toast({
          title: "Google Sign-in Successful",
          description: `Welcome${displayName ? `, ${displayName}` : ''}!`,
        });
        
        setUser(userData.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(userData.user));
        
        // Check if this is a new user (just created) and direct to onboarding
        // or dashboard based on profile status
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