import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/authContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center mb-8">
        <h1 className="text-4xl text-primary font-orbitron mb-2">LYFE<span className="text-white">OS</span></h1>
        <p className="text-[#7DAAB2]">Your personal life operating system</p>
      </div>
      
      <div className="w-full max-w-md glassmorphic rounded-xl p-6 border border-primary/40 shadow-lg"
           style={{ boxShadow: "0 0 20px rgba(34, 211, 238, 0.1)" }}>
        <h2 className="text-xl font-orbitron text-center mb-6">Login to LYFEOS</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm text-[#7DAAB2]">USERNAME</label>
            <Input 
              type="text" 
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-transparent border-primary/30 rounded-lg p-3 outline-none text-foreground focus-visible:ring-primary/30"
              placeholder="Enter your username"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm text-[#7DAAB2]">PASSWORD</label>
            <Input 
              type="password" 
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border-primary/30 rounded-lg p-3 outline-none text-foreground focus-visible:ring-primary/30"
              placeholder="Enter your password"
              required
            />
          </div>
          
          <Button 
            type="submit"
            className="w-full bg-primary hover:bg-primary/80 text-primary-foreground transition mt-4"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Logging in...
              </>
            ) : (
              "Login"
            )}
          </Button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-[#7DAAB2]">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:text-primary/80 transition">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}