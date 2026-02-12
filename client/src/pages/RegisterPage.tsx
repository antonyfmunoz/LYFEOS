import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
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

const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export default function RegisterPage() {
  usePageTitle('Register');
  
  const { primaryColor, setPrimaryColor: setThemePrimaryColor } = useTheme();
  const [, navigate] = useLocation();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [selectedColor, setSelectedColor] = useState(() => localStorage.getItem('lyfeos-primary-color') || primaryColor || "#00e0ff");
  const [hasUserSelectedColor, setHasUserSelectedColor] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const savedColor = localStorage.getItem('lyfeos-primary-color');
  const accent = useMemo(() => {
    if (!savedColor) return null;
    return {
      color: savedColor,
      border20: hexToRgba(savedColor, 0.2),
      border30: hexToRgba(savedColor, 0.3),
      border50: hexToRgba(savedColor, 0.5),
      bg20: hexToRgba(savedColor, 0.2),
      bg30: hexToRgba(savedColor, 0.3),
      glow: hexToRgba(savedColor, 0.08),
    };
  }, [savedColor]);
  
  useEffect(() => {
    if (hasUserSelectedColor) {
      setThemePrimaryColor(selectedColor);
    }
  }, [selectedColor, hasUserSelectedColor]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    
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
      const checkResponse = await fetch(`/api/auth/check-email?email=${encodeURIComponent(trimmedEmail)}`);
      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        if (!checkData.available) {
          setError("An account with this email already exists");
          setIsLoading(false);
          return;
        }
      }

      sessionStorage.setItem("lyfeos-pending-registration", JSON.stringify({
        email: trimmedEmail,
        password: trimmedPassword,
        avatarColor: selectedColor,
      }));

      localStorage.setItem("lyfeos-primary-color", selectedColor);
      localStorage.setItem("lyfeos-pending-onboarding", "true");

      navigate("/onboarding", { replace: true });
    } catch (err: any) {
      console.error("Registration error:", err);
      
      if (!err?.message) {
        setError("Registration failed. Please try again.");
      } else {
        setError(err.message);
      }
      
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-white" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-orbitron mb-2"><span className="text-white">LYFE</span><span style={{ color: accent?.color || 'white' }}>OS</span></h1>
        <p className="text-white">Your personal life operating system</p>
      </div>
      <div className="w-full max-w-md rounded-xl p-6 border backdrop-blur-md animate-fadeIn"
           style={{ backgroundColor: "rgba(38, 38, 42, 0.85)", boxShadow: `0 0 20px ${accent?.glow || 'rgba(255,255,255,0.08)'}`, borderColor: accent?.border20 || 'rgba(255,255,255,0.2)' }}>
        <h2 className="text-xl font-orbitron text-center mb-6" style={{ color: accent?.color || 'white' }}>Create Your LYFEOS Account</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm text-white">EMAIL</label>
            <Input 
              type="email" 
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent rounded-lg p-3 outline-none text-white"
              placeholder="Enter your email"
              required
              style={{ borderColor: accent?.border30 || 'rgba(255,255,255,0.3)', '--tw-ring-color': accent?.border30 || 'rgba(255,255,255,0.3)' } as any}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm text-white">PASSWORD</label>
            <Input 
              type="password" 
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent rounded-lg p-3 outline-none text-white"
              placeholder="Create a password"
              required
              style={{ borderColor: accent?.border30 || 'rgba(255,255,255,0.3)', '--tw-ring-color': accent?.border30 || 'rgba(255,255,255,0.3)' } as any}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm text-white">CONFIRM PASSWORD</label>
            <Input 
              type="password" 
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent rounded-lg p-3 outline-none text-white"
              placeholder="Confirm your password"
              required
              style={{ borderColor: accent?.border30 || 'rgba(255,255,255,0.3)', '--tw-ring-color': accent?.border30 || 'rgba(255,255,255,0.3)' } as any}
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm text-white">CHOOSE YOUR THEME COLOR</label>
            <div className="flex justify-center gap-2">
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
                    setHasUserSelectedColor(true);
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
              I agree to the <span className="auth-link" style={{ color: accent?.color || 'white' }}><Link href="/terms" className="hover:opacity-80" style={{ color: accent?.color || 'white' }}>Terms of Service</Link></span> and <span className="auth-link" style={{ color: accent?.color || 'white' }}><Link href="/privacy" className="hover:opacity-80" style={{ color: accent?.color || 'white' }}>Privacy Policy</Link></span>. 
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
            className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border hover:opacity-80 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
            disabled={isLoading}
            style={{ backgroundColor: accent?.bg20 || 'rgba(255,255,255,0.2)', borderColor: accent?.border50 || 'rgba(255,255,255,0.5)', color: accent?.color || 'white' }}
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
            <span className="auth-link" style={{ color: accent?.color || 'white' }}><Link href="/login" className="hover:opacity-80 transition" style={{ color: accent?.color || 'white' }}>
              Login
            </Link></span>
          </p>
        </div>
      </div>
    </div>
  );
}