import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { queryClient } from "./queryClient";
import { useUser, useAuth as useClerkAuth, useClerk, useSignIn, useSignUp } from "@clerk/clerk-react";
import { applyPrimaryColor } from "./applyPrimaryColor";
import { getLocalDateString } from "./utils";


interface User {
  id: number;
  displayName: string | null;
}

interface AuthResponse {
  user: {
    id: number;
    displayName: string | null;
  };
  isNewUser?: boolean;
  primaryColor?: string;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, password: string, extraData?: { avatarColor?: string }) => Promise<void>;
  completeRegistration: (data: Record<string, any>) => Promise<{ id: number; displayName: string } | null>;
  logout: () => void;
  loginWithGoogle: (mode?: 'login' | 'register') => Promise<void>;
  loginWithApple: (mode?: 'login' | 'register') => Promise<void>;
  registerPreLogoutCallback: (callback: () => Promise<void> | void) => void;
  unregisterPreLogoutCallback: (callback: () => Promise<void> | void) => void;
  setPendingPassword: (password: string) => void;
  getPendingPassword: () => string | null;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();

  const { user: clerkUser, isLoaded: clerkUserLoaded } = useUser();
  const { isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const pendingPasswordRef = React.useRef<string | null>(null);
  const setPendingPassword = (password: string) => { pendingPasswordRef.current = password; };
  const getPendingPassword = () => pendingPasswordRef.current;

  const preLogoutCallbacksRef = React.useRef<Set<() => Promise<void> | void>>(new Set());

  const registerPreLogoutCallback = useCallback((callback: () => Promise<void> | void) => {
    preLogoutCallbacksRef.current.add(callback);
  }, []);

  const unregisterPreLogoutCallback = useCallback((callback: () => Promise<void> | void) => {
    preLogoutCallbacksRef.current.delete(callback);
  }, []);

  // Sync Clerk auth state with server session
  useEffect(() => {
    if (!clerkUserLoaded) return;

    const syncAuth = async () => {
      try {
        const cachedUser = localStorage.getItem("lyfeos_user");
        if (cachedUser) {
          try {
            const parsedUser = JSON.parse(cachedUser);
            if (parsedUser && parsedUser.id) {
              setUser(parsedUser);
            }
          } catch (e) {
            console.error("Failed to parse cached user data:", e);
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
          if (data.primaryColor) {
            applyPrimaryColor(data.primaryColor);
          }
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

    syncAuth();
  }, [clerkUserLoaded, isSignedIn]);

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

      if (!signIn) throw new Error("Sign-in not available");

      const result = await signIn.create({
        identifier: trimmedIdentifier,
        password,
      });

      if (result.status !== "complete") {
        throw new Error("Sign-in requires additional steps");
      }

      // Sync with server
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmedIdentifier, password }),
        credentials: "include",
      });

      const responseText = await response.text();
      let data: AuthResponse;
      try {
        data = JSON.parse(responseText) as AuthResponse;
      } catch (e) {
        throw new Error("Invalid server response. Please try again.");
      }

      if (!response.ok) {
        throw new Error(data?.error || "Check your email and password");
      }

      if (!data || !data.user || !data.user.id) {
        throw new Error("Invalid user data received from server");
      }

      console.log("Login successful, user data:", data.user);

      if (data.primaryColor) {
        applyPrimaryColor(data.primaryColor);
      }

      setUser(data.user);
      localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
      localStorage.removeItem("lyfeos-pending-onboarding");

      await new Promise(resolve => setTimeout(resolve, 200));

      try {
        const verifyResponse = await fetch("/api/auth/me", { credentials: "include" });
        if (verifyResponse.ok) {
          console.log("Session verified successfully");
        }
      } catch (e) {
        console.warn("Session verification failed, proceeding anyway");
      }

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

      sessionStorage.setItem("login_success_username", data.user.displayName || "");
      sessionStorage.setItem("login_success_new_user", data.isNewUser ? "true" : "false");

      console.log("Navigating to login success transition...");
      navigate("/login-success", { replace: true });
    } catch (error: any) {
      console.error("Login error:", error);
      localStorage.removeItem("lyfeos_user");
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

      if (!signUp) throw new Error("Sign-up not available");

      await signUp.create({
        emailAddress: trimmedEmail,
        password,
      });

      // Sync with server
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          termsAccepted: true,
          ...(extraData || {}),
        }),
        credentials: "include",
      });

      const responseText = await response.text();
      let data: AuthResponse;
      try {
        data = JSON.parse(responseText) as AuthResponse;
      } catch (e) {
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

      console.log("Registration successful, user data:", data.user);

      setUser(data.user);
      localStorage.setItem("lyfeos_user", JSON.stringify(data.user));

      await new Promise(resolve => setTimeout(resolve, 300));

      try {
        const verifyResponse = await fetch("/api/auth/me", { credentials: "include" });
        if (verifyResponse.ok) {
          console.log("Session verified successfully after registration");
        } else {
          console.warn("Session verification failed after registration - proceeding anyway");
        }
      } catch (verifyError) {
        console.error("Error verifying session after registration:", verifyError);
      }

      setIsLoading(false);

      localStorage.removeItem("lyfeos-widget-states");
      localStorage.setItem("lyfeos-pending-onboarding", "true");

      console.log("New user registered, redirecting to onboarding");
      navigate("/onboarding", { replace: true });
    } catch (error: any) {
      console.error("Registration error:", error);
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

  const completeRegistration = async (data: Record<string, any>): Promise<{ id: number; displayName: string } | null> => {
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

      const callbacks = Array.from(preLogoutCallbacksRef.current);
      console.log(`Calling ${callbacks.length} pre-logout callbacks...`);
      for (let i = 0; i < callbacks.length; i++) {
        try {
          await callbacks[i]();
        } catch (error) {
          console.error("Pre-logout callback error:", error);
        }
      }
      console.log("Pre-logout callbacks completed");

      setUser(null);
      queryClient.removeQueries({ queryKey: ["/api/profile"] });
      localStorage.removeItem("lyfeos_user");
      localStorage.removeItem("lyfeos-pending-onboarding");
      localStorage.removeItem("lyfeos-has-seen-dashboard");
      localStorage.removeItem("lyfeos-primary-color");
      localStorage.removeItem("lyfeos-push-subscribed");
      localStorage.removeItem("lyfeos-onboarding-answers");
      localStorage.removeItem("lyfeos-onboarding-resume");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      localStorage.removeItem("lyfeos-widget-states");

      // Sign out from Clerk
      try {
        await signOut();
      } catch (error) {
        console.error("Clerk sign out error:", error);
      }

      // API call to server to logout
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (!response.ok) {
          console.error("Logout request failed with status:", response.status);
        } else {
          console.log("Server logout successful");
        }
      } catch (error) {
        console.error("Logout server request error:", error);
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      console.log("Redirecting to login page after logout");
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Unexpected logout error:", error);
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

  const loginWithGoogle = async (mode: 'login' | 'register' = 'login') => {
    try {
      setIsLoading(true);
      localStorage.removeItem("lyfeos-primary-color");
      localStorage.removeItem("lyfeos-onboarding-answers");
      localStorage.removeItem("lyfeos-onboarding-resume");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      sessionStorage.removeItem("lyfeos-pending-registration");

      if (!signIn) throw new Error("Sign-in not available");

      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: mode === 'register' ? "/onboarding" : "/login-success",
      });
    } catch (error: any) {
      console.error("Google login error:", error);
      toast({
        title: "Login Error",
        description: `Google sign-in failed: ${error?.message || String(error)}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithApple = async (mode: 'login' | 'register' = 'login') => {
    try {
      setIsLoading(true);
      localStorage.removeItem("lyfeos-primary-color");
      localStorage.removeItem("lyfeos-onboarding-answers");
      localStorage.removeItem("lyfeos-onboarding-resume");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      sessionStorage.removeItem("lyfeos-pending-registration");

      if (!signIn) throw new Error("Sign-in not available");

      await signIn.authenticateWithRedirect({
        strategy: "oauth_apple",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: mode === 'register' ? "/onboarding" : "/login-success",
      });
    } catch (error: any) {
      console.error("Apple login error:", error);
      toast({
        title: "Login Error",
        description: `Apple sign-in failed: ${error?.message || String(error)}`,
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
