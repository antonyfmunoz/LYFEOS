import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/themeContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { 
  SiGoogle, 
  SiApple, 
  SiFacebook 
} from "react-icons/si";
import { toast } from "@/hooks/use-toast";

// Avatar color options
const avatarColors = [
  "#00e0ff", // Default cyan
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#ef4444", // Red
  "#06b6d4", // Cyan
  "#ecc94b", // Yellow
  "#14b8a6"  // Teal
];

export default function RegisterPage() {
  // Set the page title
  usePageTitle('Register');
  
  const { register, loginWithGoogle } = useAuth();
  const { primaryColor } = useTheme();
  const [, navigate] = useLocation();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [selectedColor, setSelectedColor] = useState("#00e0ff");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Force apply theme when component mounts
  useEffect(() => {
    if (primaryColor) {
      console.log("Applying primary color on register page:", primaryColor);
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
  
  // Handle OAuth signin with Firebase
  const handleOAuthSignin = async (provider: string) => {
    try {
      if (provider === "Google") {
        toast({
          title: "Google Sign Up",
          description: "Redirecting to Google authentication...",
        });
        
        // Use our Firebase Google auth integration
        await loginWithGoogle();
        // The redirect and result handling will be managed by Firebase auth
      } else {
        toast({
          title: `${provider} Sign Up`,
          description: `${provider} authentication will be available soon. Please use email signup or Google for now.`,
        });
      }
    } catch (error) {
      console.error(`${provider} sign-in error:`, error);
      toast({
        title: "Authentication Error",
        description: `An error occurred during ${provider} authentication. Please try again.`,
        variant: "destructive"
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    
    // Enhanced validation with trimmed values
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    const trimmedDisplayName = displayName.trim();
    
    if (!trimmedUsername) {
      setError("Username is required");
      setIsLoading(false);
      return;
    }
    
    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters");
      setIsLoading(false);
      return;
    }
    
    if (!trimmedPassword) {
      setError("Password is required");
      setIsLoading(false);
      return;
    }
    
    if (trimmedPassword.length < 6) {
      setError("Password must be at least 6 characters");
      setIsLoading(false);
      return;
    }
    
    if (trimmedPassword !== trimmedConfirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }
    
    if (!termsAccepted) {
      setError("You must accept the Terms of Service and Privacy Policy");
      setIsLoading(false);
      return;
    }
    
    try {
      console.log("Saving onboarding data to localStorage");
      // Store additional registration data for onboarding
      localStorage.setItem("onboarding_data", JSON.stringify({
        displayName: trimmedDisplayName || trimmedUsername,
        avatarColor: selectedColor,
        step: 1 // Indicates to start with step 1 of onboarding
      }));
      
      console.log("Registering user with username:", trimmedUsername);
      // Register with username and password
      await register(trimmedUsername, trimmedPassword);
      
      console.log("Registration successful, redirecting to onboarding");
      // The redirection should happen in the authContext, but as a fallback:
      setTimeout(() => {
        navigate("/onboarding");
      }, 500);
      
      // Navigation to onboarding happens in the authContext after successful registration
    } catch (err: any) {
      console.error("Registration error:", err);
      
      // Ensure we display a meaningful error message
      if (!err?.message) {
        setError("Registration failed. Please try again with a different username.");
      } else {
        setError(err.message);
      }
      
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center mb-8">
        <h1 className="text-4xl text-primary font-orbitron mb-2">LYFE<span className="text-foreground">OS</span></h1>
        <p className="text-muted-foreground">Your personal life operating system</p>
      </div>
      
      <div className="w-full max-w-md glassmorphic rounded-xl p-6 border border-primary/40 animate-fadeIn"
           style={{ boxShadow: "0 0 20px var(--primary-glow-light)" }}>
        <h2 className="text-xl font-orbitron text-center mb-6 text-foreground">Create Your LYFEOS Account</h2>
        
        {/* OAuth Sign-in Buttons */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <Button 
            variant="outline" 
            className="flex items-center justify-center space-x-2 py-5 border-primary/30 hover:bg-primary/10"
            onClick={() => handleOAuthSignin("Google")}
          >
            <SiGoogle className="h-5 w-5" />
          </Button>
          <Button 
            variant="outline" 
            className="flex items-center justify-center space-x-2 py-5 border-primary/30 hover:bg-primary/10"
            onClick={() => handleOAuthSignin("Apple")}
          >
            <SiApple className="h-5 w-5" />
          </Button>
          <Button 
            variant="outline" 
            className="flex items-center justify-center space-x-2 py-5 border-primary/30 hover:bg-primary/10"
            onClick={() => handleOAuthSignin("Facebook")}
          >
            <SiFacebook className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="relative mb-6">
          <Separator className="my-2" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="bg-background px-2 text-xs text-muted-foreground">OR</span>
          </div>
        </div>
        
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
            <label htmlFor="displayName" className="block text-sm text-muted-foreground">DISPLAY NAME (OPTIONAL)</label>
            <Input 
              type="text" 
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-transparent border-primary/30 rounded-lg p-3 outline-none text-foreground focus-visible:ring-primary/30"
              placeholder="Your name or alias"
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
          
          {/* Avatar Color Selection */}
          <div className="space-y-2">
            <label className="block text-sm text-muted-foreground">CHOOSE YOUR COLOR</label>
            <div className="flex flex-wrap gap-2 justify-center">
              {avatarColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${selectedColor === color ? 'ring-2 ring-foreground scale-110' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                >
                  {selectedColor === color && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
          </div>
          
          {/* Terms and Privacy Policy */}
          <div className="flex items-start space-x-2 mt-4">
            <Checkbox 
              id="terms" 
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              className="mt-1 border-primary/50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
            />
            <label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
              I agree to the <Link href="/terms" className="text-primary hover:text-primary/80">Terms of Service</Link> and <Link href="/privacy" className="text-primary hover:text-primary/80">Privacy Policy</Link>. 
              Your journey is protected, and your data remains under your control.
            </label>
          </div>
          
          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
              {error}
            </div>
          )}
          
          <Button 
            type="submit"
            className="w-full mt-4 transition-all hover:shadow-glow"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Initializing...
              </>
            ) : (
              "Create Account"
            )}
          </Button>
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