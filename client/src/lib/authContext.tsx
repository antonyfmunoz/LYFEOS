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
        credentials: "include"
      });
      
      const responseText = await response.text();
      console.log("Login response status:", response.status);
      console.log("Login response text:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText) as AuthResponse;
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        throw new Error("Invalid server response");
      }
      
      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }
      
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
        description: "Invalid username or password",
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
      console.log("Register response text:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText) as AuthResponse;
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        throw new Error("Invalid server response");
      }
      
      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }
      
      if (data && data.user) {
        setUser(data.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
        toast({
          title: "Registration Successful",
          description: `Welcome to LYFEOS, ${data.user.username}!`,
          className: "bg-background border border-primary text-foreground",
        });
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration Failed",
        description: "Username may already be taken",
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
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Logout failed");
      }
      
      // Clear user state regardless of response
      setUser(null);
      localStorage.removeItem("lyfeos_user");
      
      toast({
        title: "Logged Out",
        description: "You have been logged out successfully",
        className: "bg-background border border-primary text-foreground",
      });
      
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
      // Still clear user state even if the request fails
      setUser(null);
      localStorage.removeItem("lyfeos_user");
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}