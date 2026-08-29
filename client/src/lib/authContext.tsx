import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { queryClient } from "./queryClient";
import { REGISTRATION_DISCLOSURE_VERSION } from "@shared/registration-disclosure";
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
  const { signIn, setActive: setSignInActive } = useSignIn();
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
  const authSyncGenerationRef = React.useRef(0);
  useEffect(() => {
    const generation = ++authSyncGenerationRef.current;
    const controller = new AbortController();
    const syncAuth = async () => {
      let hasCachedUser = false;
      try {
        const cachedUser = localStorage.getItem("lyfeos_user");
        if (cachedUser) {
          try {
            const parsedUser = JSON.parse(cachedUser);
            if (parsedUser && parsedUser.id) {
              hasCachedUser = true;
              setUser(parsedUser);
              // A previously server-verified identity can render while its
              // cookie is revalidated. Protected APIs remain server-enforced.
              setIsLoading(false);
            }
          } catch (e) {
            console.error("Failed to parse cached user data:", e);
          }
        }

        const fetchSession = async () => {
          const timeout = window.setTimeout(() => controller.abort(), 8_000);
          try {
            return await fetch("/api/auth/me", {
              credentials: "include",
              cache: "no-store",
              signal: controller.signal,
            });
          } finally {
            window.clearTimeout(timeout);
          }
        };

        let response = await fetchSession();
        if (response.status === 401 && hasCachedUser && generation === authSyncGenerationRef.current) {
          // Clerk initialization and a freshly established local cookie can
          // overlap on a reload. Confirm once before revoking the local identity.
          await new Promise((resolve) => window.setTimeout(resolve, 150));
          response = await fetchSession();
        }
        if (generation !== authSyncGenerationRef.current) return;

        if (response.ok) {
          const data = await response.json();
          if (generation !== authSyncGenerationRef.current) return;
          console.log("Server auth check successful, user data:", data.user);
          setUser(data.user);
          localStorage.removeItem("lyfeos-oauth-mode");
          localStorage.removeItem("lyfeos-oauth-redirect-pending");
          localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
          if (data.primaryColor) {
            applyPrimaryColor(data.primaryColor);
          }
        } else if (response.status === 401) {
          console.log("Server session is no longer authenticated, clearing local user data");
          setUser(null);
          localStorage.removeItem("lyfeos_user");
        } else {
          // A temporary rate limit or server/provider failure does not revoke a
          // session. Preserve the last verified local identity and retry on the
          // next auth sync instead of sending a signed-in user to /login.
          console.warn(`Server auth check temporarily unavailable (${response.status}); preserving the verified local session.`);
        }
      } catch (error) {
        if (generation !== authSyncGenerationRef.current) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          console.warn("Server auth check timed out; preserving the verified local session.");
          return;
        }
        console.error("Failed to check authentication status:", error);
        // Network and provider failures are not proof that the server session
        // ended. Keep a verified cached identity until a confirmed 401.
      } finally {
        if (generation === authSyncGenerationRef.current) setIsLoading(false);
      }
    };

    void syncAuth();
    return () => {
      if (generation === authSyncGenerationRef.current) authSyncGenerationRef.current += 1;
      controller.abort();
    };
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

      let response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmedIdentifier, password }),
        credentials: "include",
      });

      // Local email/password accounts do not require an email verification
      // detour. Fall back to Clerk only for accounts that live there.
      if (!response.ok) {
        if (!signIn) throw new Error("Sign-in not available");
        const result = await signIn.create({ identifier: trimmedIdentifier, password });
        if (result.status !== "complete" || !setSignInActive || !result.createdSessionId) {
          throw new Error("Check your email and password");
        }
        await setSignInActive({ session: result.createdSessionId });
        response = await fetch("/api/auth/me", { credentials: "include" });
      }

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

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password, registrationDisclosureVersion: REGISTRATION_DISCLOSURE_VERSION, ...(extraData || {}) }),
        credentials: "include",
      });
      const data = await response.json() as AuthResponse;
      if (!response.ok || !data?.user?.id) {
        throw new Error(data?.error || "Registration failed. Please try again.");
      }
      setUser(data.user);
      localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
      localStorage.removeItem("lyfeos-widget-states");
      localStorage.setItem("lyfeos-pending-onboarding", "true");
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

      localStorage.setItem("lyfeos-oauth-mode", mode);
      localStorage.setItem("lyfeos-oauth-redirect-pending", "true");
      if (mode === "register") {
        if (!signUp) throw new Error("Sign-up not available");
        const response = await fetch("/api/auth/oauth-registration-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ registrationDisclosureVersion: REGISTRATION_DISCLOSURE_VERSION }),
        });
        const intent = await response.json();
        if (!response.ok || !intent?.intentId) throw new Error(intent?.error || "Could not start registration");
        await signUp.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/onboarding",
          unsafeMetadata: {
            lyfeosRegistrationIntentId: intent.intentId,
            lyfeosRegistrationDisclosureVersion: intent.registrationDisclosureVersion,
          },
        });
      } else {
        if (!signIn) throw new Error("Sign-in not available");
        await signIn.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/login-success",
        });
      }
    } catch (error: any) {
      localStorage.removeItem("lyfeos-oauth-mode");
      localStorage.removeItem("lyfeos-oauth-redirect-pending");
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

      localStorage.setItem("lyfeos-oauth-mode", mode);
      localStorage.setItem("lyfeos-oauth-redirect-pending", "true");
      if (mode === "register") {
        if (!signUp) throw new Error("Sign-up not available");
        const response = await fetch("/api/auth/oauth-registration-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ registrationDisclosureVersion: REGISTRATION_DISCLOSURE_VERSION }),
        });
        const intent = await response.json();
        if (!response.ok || !intent?.intentId) throw new Error(intent?.error || "Could not start registration");
        await signUp.authenticateWithRedirect({
          strategy: "oauth_apple",
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/onboarding",
          unsafeMetadata: {
            lyfeosRegistrationIntentId: intent.intentId,
            lyfeosRegistrationDisclosureVersion: intent.registrationDisclosureVersion,
          },
        });
      } else {
        if (!signIn) throw new Error("Sign-in not available");
        await signIn.authenticateWithRedirect({
          strategy: "oauth_apple",
          redirectUrl: "/sso-callback",
          redirectUrlComplete: "/login-success",
        });
      }
    } catch (error: any) {
      localStorage.removeItem("lyfeos-oauth-mode");
      localStorage.removeItem("lyfeos-oauth-redirect-pending");
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
