import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { DynamicColorButton } from "@/components/ui/dynamic-color-button";

export default function RegisterPage() {
  // Set the page title
  usePageTitle('Register');
  
  const { register, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    await register(username, password);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center mb-8">
        <h1 className="text-4xl text-primary font-orbitron mb-2">LYFE<span className="text-foreground">OS</span></h1>
        <p className="text-muted-foreground">Your personal life operating system</p>
      </div>
      
      <div className="w-full max-w-md glassmorphic rounded-xl p-6 border border-primary/40"
           style={{ boxShadow: "0 0 20px var(--primary-glow-light)" }}>
        <h2 className="text-xl font-orbitron text-center mb-6 text-foreground">Create Your LYFEOS Account</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm text-muted-foreground">USERNAME</label>
            <Input 
              type="text" 
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-transparent border-primary/30 rounded-lg p-3 outline-none text-foreground focus-visible:ring-primary/30"
              placeholder="Choose a username"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm text-muted-foreground">PASSWORD</label>
            <Input 
              type="password" 
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border-primary/30 rounded-lg p-3 outline-none text-foreground focus-visible:ring-primary/30"
              placeholder="Create a password"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm text-muted-foreground">CONFIRM PASSWORD</label>
            <Input 
              type="password" 
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent border-primary/30 rounded-lg p-3 outline-none text-foreground focus-visible:ring-primary/30"
              placeholder="Confirm your password"
              required
            />
          </div>
          
          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
              {error}
            </div>
          )}
          
          <DynamicColorButton 
            type="submit"
            className="w-full mt-4"
            style={{
              backgroundColor: "var(--primary-color)",
              border: "none",
              color: "#222"
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registering...
              </>
            ) : (
              "Create Account"
            )}
          </DynamicColorButton>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:text-primary/80 transition">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}