import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "./queryClient";

interface User {
  id: number;
  username: string;
}

interface AuthResponse {
  user: {
    id: number;
    username: string;
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();

  // Function to check authentication status that can be called anywhere
  const refreshAuth = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/me", {
        // Add cache-busting parameter to prevent caching
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        // Add timestamp to force fresh request
        cache: 'no-store'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
          // Update localStorage to match server state
          localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
          return;
        }
      } 
      
      // Clear localStorage if not authenticated
      localStorage.removeItem("lyfeos_user");
      setUser(null);
      
    } catch (error) {
      console.error("Failed to check authentication status:", error);
      // Don't clear user on network errors, as that could cause unnecessary logouts
    } finally {
      setIsLoading(false);
    }
  };

  // Check if the user is logged in on initial load
  useEffect(() => {
    // First try to restore from localStorage for immediate UI feedback
    const storedUser = localStorage.getItem("lyfeos_user");
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
      } catch (error) {
        localStorage.removeItem("lyfeos_user");
      }
    }
    
    // Then verify with server
    refreshAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Login failed" }));
        throw new Error(errorData.error || "Login failed");
      }
      
      const data = await response.json() as AuthResponse;
      
      if (data && data.user) {
        setUser(data.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.user.username}!`,
          className: "bg-background border border-primary text-foreground",
        });
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Invalid username or password",
        variant: "destructive",
        className: "bg-background border border-destructive text-foreground",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Registration failed" }));
        throw new Error(errorData.error || "Registration failed");
      }
      
      const data = await response.json() as AuthResponse;
      
      if (data && data.user) {
        setUser(data.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
        toast({
          title: "Registration Successful",
          description: `Welcome to LYFEOS, ${data.user.username}!`,
          className: "bg-background border border-primary text-foreground",
        });
        navigate("/onboarding");
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration Failed",
        description: error instanceof Error ? error.message : "Username may already be taken",
        variant: "destructive",
        className: "bg-background border border-destructive text-foreground",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      // Clear client state first for immediate UI feedback
      setUser(null);
      localStorage.removeItem("lyfeos_user");
      
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          'Cache-Control': 'no-cache',
        },
      });
      
      if (!response.ok) {
        console.error("Logout API failed but proceeding with client-side logout");
      }
      
      navigate("/login");
      toast({
        title: "Logged Out",
        description: "You have been logged out successfully",
        className: "bg-background border border-primary text-foreground",
      });
    } catch (error) {
      console.error("Logout error:", error);
      // Already cleared the state above
      navigate("/login");
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
        logout,
        refreshAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}