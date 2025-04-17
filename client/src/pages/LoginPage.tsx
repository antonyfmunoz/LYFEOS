import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/authContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LogIn, UserPlus } from "lucide-react";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background bg-[radial-gradient(ellipse_at_top,rgba(0,224,255,0.05),transparent)]">
      <div className="text-center mb-10">
        <h1 className="text-5xl text-primary font-orbitron mb-2 tracking-wider">
          LYFE<span className="text-white">OS</span>
        </h1>
        <p className="text-[#7DAAB2] font-light tracking-wide">PERSONAL LIFE OPERATING SYSTEM</p>
      </div>
      
      <div className="w-full max-w-md rounded-xl p-8 border border-primary/30 shadow-[0_0_30px_rgba(0,224,255,0.15)] 
           backdrop-blur-md bg-black/20 relative">
        {/* Top neon line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_5px_rgba(0,224,255,0.7)]"></div>
        
        <h2 className="text-xl font-orbitron text-center mb-8 tracking-wider pt-2">SYSTEM ACCESS</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="username" className="block text-xs font-mono text-[#7DAAB2] font-medium uppercase tracking-wider">Username</label>
            <div className="relative">
              <Input 
                type="text" 
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black/30 border-primary/40 rounded-md p-3 pl-10 outline-none text-foreground focus-visible:ring-primary/50 focus-visible:border-primary/60 shadow-[0_0_10px_rgba(0,224,255,0.05)]"
                placeholder="Enter username"
                required
              />
              <div className="absolute left-3 top-3.5 text-primary/60">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="block text-xs font-mono text-[#7DAAB2] font-medium uppercase tracking-wider">Password</label>
            <div className="relative">
              <Input 
                type="password" 
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/30 border-primary/40 rounded-md p-3 pl-10 outline-none text-foreground focus-visible:ring-primary/50 focus-visible:border-primary/60 shadow-[0_0_10px_rgba(0,224,255,0.05)]"
                placeholder="Enter password"
                required
              />
              <div className="absolute left-3 top-3.5 text-primary/60">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
            </div>
          </div>
          
          <Button 
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground transition mt-4 font-medium tracking-wide shadow-[0_0_15px_rgba(0,224,255,0.3)] py-6"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AUTHENTICATING...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                AUTHENTICATE
              </>
            )}
          </Button>
        </form>
        
        <div className="mt-8 text-center">
          <p className="text-[#7DAAB2] text-sm">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:text-primary/80 transition flex items-center justify-center mt-2 gap-1.5">
              <UserPlus className="h-4 w-4" />
              Create New Account
            </Link>
          </p>
        </div>
        
        {/* Bottom neon line */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_5px_rgba(0,224,255,0.7)]"></div>
      </div>
    </div>
  );
}