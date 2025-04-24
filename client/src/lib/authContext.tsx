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
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();

  // Check if the user is logged in on initial load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me");
        
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          // Clear any stored user data if not authenticated
          localStorage.removeItem("lyfeos_user");
        }
      } catch (error) {
        console.error("Failed to check authentication status:", error);
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
      
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
        credentials: "include" // Important for maintaining session cookies
      });
      
      const responseText = await response.text();
      console.log("Login response status:", response.status);
      
      let data;
      try {
        data = JSON.parse(responseText) as AuthResponse;
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        toast({
          title: "Login Error",
          description: "Invalid server response. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      if (!response.ok) {
        toast({
          title: "Login Failed",
          description: data.error || "Check your username and password",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      if (data && data.user) {
        setUser(data.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.user.username}!`,
          variant: "default",
        });
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: "Login Error",
        description: "Could not connect to server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting to register with:", username);
      
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
        credentials: "include"
      });
      
      const responseText = await response.text();
      console.log("Register response status:", response.status);
      
      let data;
      try {
        data = JSON.parse(responseText) as AuthResponse;
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        toast({
          title: "Registration Error",
          description: "Invalid server response. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      if (!response.ok) {
        toast({
          title: "Registration Failed",
          description: data.error || "Username may already be taken",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      if (data && data.user) {
        setUser(data.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
        toast({
          title: "Registration Successful",
          description: `Welcome to LYFEOS, ${data.user.username}!`,
          variant: "default",
        });
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration Error",
        description: "Could not connect to server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include" // Important for session cookie handling
      });
      
      // Clear user state regardless of response
      setUser(null);
      localStorage.removeItem("lyfeos_user");
      
      if (!response.ok) {
        console.error("Logout request failed with status:", response.status);
        // Still proceed with local logout
      } else {
        toast({
          title: "Logged Out",
          description: "You have been successfully logged out",
          variant: "default",
        });
      }
      
      // Redirect to login page after a brief delay
      setTimeout(() => {
        navigate("/login");
      }, 500);
    } catch (error) {
      console.error("Logout error:", error);
      // Still clear user state even if the request fails
      toast({
        title: "Logout Issue",
        description: "You've been logged out, but there was a server connection issue",
        variant: "default",
      });
      // Redirect to login page
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