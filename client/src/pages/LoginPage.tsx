import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/lib/themeContext";

export default function LoginPage() {
  // Set the page title
  usePageTitle('Login');
  
  const { login } = useAuth();
  const { primaryColor } = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Force apply theme when component mounts
  useEffect(() => {
    if (primaryColor) {
      console.log("Applying primary color on login page:", primaryColor);
      // Get the saved color from localStorage if it exists
      const savedColor = localStorage.getItem('lyfeos-primary-color') || primaryColor;
      
      // Apply the color with all necessary CSS variables
      const hexToHSL = (hex: string): string => {
        hex = hex.replace(/^#/, '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h /= 6;
        }
        
        h = Math.round(h * 360);
        s = Math.round(s * 100);
        l = Math.round(l * 100);
        
        return `${h} ${s}% ${l}%`;
      };
      
      const hexToRGB = (hex: string): { r: number, g: number, b: number } | null => {
        hex = hex.replace(/^#/, '');
        if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
          return null;
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return { r, g, b };
      };
      
      // Apply the color
      const hsl = hexToHSL(savedColor);
      document.documentElement.style.setProperty('--primary', hsl);
      document.documentElement.style.setProperty('--primary-hsl', hsl);
      document.documentElement.style.setProperty('--primary-foreground', '210 40% 98%');
      document.documentElement.style.setProperty('--primary-hex', savedColor);
      document.documentElement.style.setProperty('--primary-color', savedColor);
      
      // Add RGB variables
      const rgbValues = hexToRGB(savedColor);
      if (rgbValues) {
        const { r, g, b } = rgbValues;
        document.documentElement.style.setProperty('--primary-rgb', `${r}, ${g}, ${b}`);
        document.documentElement.style.setProperty('--primary-glow-light', `rgba(${r}, ${g}, ${b}, 0.3)`);
        document.documentElement.style.setProperty('--primary-glow-medium', `rgba(${r}, ${g}, ${b}, 0.5)`);
        document.documentElement.style.setProperty('--primary-glow-strong', `rgba(${r}, ${g}, ${b}, 0.7)`);
        document.documentElement.style.setProperty('--primary-bg-subtle', `rgba(${r}, ${g}, ${b}, 0.1)`);
        document.documentElement.style.setProperty('--primary-bg-light', `rgba(${r}, ${g}, ${b}, 0.2)`);
        document.documentElement.style.setProperty('--primary-border', `rgba(${r}, ${g}, ${b}, 0.4)`);
        document.documentElement.style.setProperty('--primary-border-subtle', `rgba(${r}, ${g}, ${b}, 0.2)`);
        document.documentElement.style.setProperty('--primary-shadow', `rgba(${r}, ${g}, ${b}, 0.7)`);
      }
    }
  }, [primaryColor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    // Client-side validation
    if (!identifier.trim() || !password.trim()) {
      setError("Please enter your username, email, or phone number and password");
      return;
    }
    
    try {
      // Show loading state immediately
      setIsSubmitting(true);
      
      // Pass the identifier and password to the login function
      console.log("Submitting login form with identifier:", identifier);
      await login(identifier, password);
      
      // Login function will handle navigation to dashboard if successful
    } catch (err: any) {
      console.error("Login error:", err);
      
      // If err is defined but doesn't have a message property or the message is empty
      if (!err?.message) {
        setError("Login failed. Please check your credentials and try again.");
      } else {
        // Display the error message from the caught error
        setError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center mb-8">
        <h1 className="text-4xl text-primary font-orbitron mb-2">LYFE<span className="text-foreground">OS</span></h1>
        <p className="text-muted-foreground">Your personal life operating system</p>
      </div>
      
      <div className="w-full max-w-md glassmorphic rounded-xl p-6 border border-primary/40"
           style={{ boxShadow: "0 0 20px var(--primary-glow-light)" }}>
        <h2 className="text-xl font-orbitron text-center mb-6 text-foreground">Login to LYFEOS</h2>
        
        
        {error && (
          <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-sm mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="identifier" className="block text-sm text-muted-foreground">USERNAME, EMAIL, OR PHONE</label>
            <Input 
              type="text" 
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-transparent border-primary/30 rounded-lg p-3 outline-none text-foreground focus-visible:ring-primary/30"
              placeholder="Enter username, email, or phone number"
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
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button 
            type="submit"
            className="w-full mt-4 text-sm font-bold font-mono px-4 py-2.5 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Logging in...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-muted-foreground">
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