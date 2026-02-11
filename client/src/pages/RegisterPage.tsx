import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { Input } from "@/components/ui/input";
import { Loader2, Check } from "lucide-react";
import { useTheme } from "@/lib/themeContext";
import { Checkbox } from "@/components/ui/checkbox";

const avatarColors = [
  "#00e0ff",
  "#f56565",
  "#ed8936",
  "#ecc94b",
  "#48bb78",
  "#9f7aea",
];

export default function RegisterPage() {
  usePageTitle('Register');
  
  const { register } = useAuth();
  const { primaryColor } = useTheme();
  const [, navigate] = useLocation();
  
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [selectedColor, setSelectedColor] = useState("#00e0ff");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    const colorToApply = selectedColor || localStorage.getItem('lyfeos-primary-color') || primaryColor;
    if (colorToApply) {
      const savedColor = colorToApply;
      
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
      
      const hsl = hexToHSL(savedColor);
      document.documentElement.style.setProperty('--primary', hsl);
      document.documentElement.style.setProperty('--primary-hsl', hsl);
      document.documentElement.style.setProperty('--primary-foreground', '210 40% 98%');
      document.documentElement.style.setProperty('--primary-hex', savedColor);
      document.documentElement.style.setProperty('--primary-color', savedColor);
      
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
  }, [primaryColor, selectedColor]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedDisplayName = [trimmedFirstName, trimmedLastName].filter(Boolean).join(" ");
    
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
    
    if (!trimmedEmail) {
      setError("Email is required");
      setIsLoading(false);
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address");
      setIsLoading(false);
      return;
    }
    
    if (!trimmedPhone) {
      setError("Phone number is required");
      setIsLoading(false);
      return;
    }
    
    if (!trimmedFirstName) {
      setError("First name is required");
      setIsLoading(false);
      return;
    }
    
    if (!trimmedLastName) {
      setError("Last name is required");
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
      localStorage.setItem("onboarding_data", JSON.stringify({
        displayName: trimmedDisplayName || trimmedUsername,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: trimmedEmail,
        phone: trimmedPhone,
        avatarColor: selectedColor,
        step: 1
      }));
      
      localStorage.setItem("lyfeos-primary-color", selectedColor);
      
      console.log("Registering user with username:", trimmedUsername);
      await register(trimmedUsername, trimmedPassword, {
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        email: trimmedEmail,
        displayName: trimmedDisplayName || trimmedUsername,
      });
      
      console.log("Registration successful, authContext handles redirect to onboarding");
    } catch (err: any) {
      console.error("Registration error:", err);
      
      if (!err?.message) {
        setError("Registration failed. Please try again with a different username.");
      } else {
        setError(err.message);
      }
      
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-white" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
      <div className="text-center mb-8">
        <h1 className="text-4xl text-white font-orbitron mb-2">LYFEOS</h1>
        <p className="text-white">Your life operating system</p>
      </div>
      <div className="w-full max-w-md rounded-xl p-6 border border-white/20 backdrop-blur-md animate-fadeIn"
           style={{ backgroundColor: "rgba(38, 38, 42, 0.85)", boxShadow: "0 0 20px rgba(255, 255, 255, 0.08)" }}>
        <h2 className="text-xl font-orbitron text-center mb-6 text-white">Create Your LYFEOS Account</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm text-white">USERNAME (DISPLAY NAME)</label>
            <Input 
              type="text" 
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
              placeholder="Choose a username"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm text-white">EMAIL</label>
            <Input 
              type="email" 
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
              placeholder="Enter your email"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="phone" className="block text-sm text-white">PHONE NUMBER</label>
            <Input 
              type="tel" 
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
              placeholder="Enter your phone number"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="firstName" className="block text-sm text-white">FIRST NAME</label>
              <Input 
                type="text" 
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
                placeholder="First name"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="lastName" className="block text-sm text-white">LAST NAME</label>
              <Input 
                type="text" 
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
                placeholder="Last name"
                required
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm text-white">PASSWORD</label>
            <Input 
              type="password" 
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
              placeholder="Create a password"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm text-white">CONFIRM PASSWORD</label>
            <Input 
              type="password" 
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
              placeholder="Confirm your password"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm text-white">CHOOSE YOUR THEME COLOR</label>
            <div className="grid grid-cols-3 gap-2 justify-center">
              {avatarColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-md transition-all ${
                    selectedColor === color 
                      ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' 
                      : 'ring-1 ring-primary/20 hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    setSelectedColor(color);
                    localStorage.setItem('lyfeos-primary-color', color);
                  }}
                >
                  {selectedColor === color && (
                    <span className="flex items-center justify-center text-white text-xs">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-start space-x-2 mt-4">
            <Checkbox 
              id="terms" 
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              className="mt-1 border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-black"
            />
            <label htmlFor="terms" className="text-sm text-white cursor-pointer">
              I agree to the <span className="text-white auth-link"><Link href="/terms" className="hover:opacity-80">Terms of Service</Link></span> and <span className="text-white auth-link"><Link href="/privacy" className="hover:opacity-80">Privacy Policy</Link></span>. 
              Your journey is protected, and your data remains under your control.
            </label>
          </div>
          
          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
              {error}
            </div>
          )}
          
          <button 
            type="submit"
            className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-white/20 border-white/50 text-white hover:bg-white/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Initializing...
              </>
            ) : (
              "Create Account"
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-white">
            Already have an account?{" "}
            <span className="text-white auth-link"><Link href="/login" className="hover:opacity-80 transition">
              Login
            </Link></span>
          </p>
        </div>
      </div>
    </div>
  );
}