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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, navigate] = useLocation();

  // Check if the user is logged in on initial load
  useEffect(() => {
    const checkAuth = async () => {
      const storedUser = localStorage.getItem("lyfeos_user");
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          setUser(userData);
        } catch (error) {
          console.error("Failed to parse stored user data:", error);
          localStorage.removeItem("lyfeos_user");
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }) as AuthResponse;

      if (response && response.user) {
        setUser(response.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(response.user));
        toast({
          title: "Login Successful",
          description: `Welcome back, ${response.user.username}!`,
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
      const response = await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }) as AuthResponse;

      if (response && response.user) {
        setUser(response.user);
        localStorage.setItem("lyfeos_user", JSON.stringify(response.user));
        toast({
          title: "Registration Successful",
          description: `Welcome to LYFEOS, ${response.user.username}!`,
          className: "bg-background border border-primary text-foreground",
        });
        navigate("/onboarding");
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

  const logout = () => {
    setUser(null);
    localStorage.removeItem("lyfeos_user");
    toast({
      title: "Logged Out",
      description: "You have been logged out successfully",
      className: "bg-background border border-primary text-foreground",
    });
    navigate("/login");
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