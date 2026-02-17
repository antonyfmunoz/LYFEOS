import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function RegisterPage() {
  usePageTitle('Register');
  
  const { loginWithGoogle, loginWithApple, setPendingPassword } = useAuth();
  const [, navigate] = useLocation();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const accent = null;
  
  
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

      setPendingPassword(trimmedPassword);
      sessionStorage.setItem("lyfeos-pending-registration", JSON.stringify({
        email: trimmedEmail,
        avatarColor: "#00e0ff",
      }));

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
    <div className="min-h-screen flex flex-col items-center p-4 text-white" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
      <div className="text-center pt-[env(safe-area-inset-top)] pb-4">
        <h1 className="text-4xl font-orbitron font-bold mb-2"><span className="text-white">LYFE</span><span style={{ color: accent?.color || 'white' }}>OS</span></h1>
        <p className="text-white">Your personal life operating system</p>
      </div>
      <div className="flex-1 flex items-center w-full justify-center">
      <div className="w-full max-w-md rounded-xl p-6 border backdrop-blur-md animate-fadeIn"
           style={{ backgroundColor: "hsla(0, 0%, 11%, 0.7)", boxShadow: `0 0 20px ${accent?.glow || 'rgba(255,255,255,0.08)'}`, borderColor: accent?.border20 || 'rgba(255,255,255,0.2)' }}>
        <h2 className="text-xl font-orbitron text-center mb-6" style={{ color: accent?.color || 'white' }}>Create Account</h2>
        
        <div className="space-y-2.5 mb-5">
          <button
            type="button"
            onClick={() => loginWithGoogle()}
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded border text-sm font-medium transition-colors hover:opacity-80"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: accent?.border30 || 'rgba(255,255,255,0.2)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign up with Google
          </button>
          <button
            type="button"
            onClick={() => loginWithApple()}
            className="w-full flex items-center justify-center gap-3 py-2.5 rounded border text-sm font-medium transition-colors hover:opacity-80"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: accent?.border30 || 'rgba(255,255,255,0.2)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="white">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-1.75 4.2-3.74 4.25z"/>
            </svg>
            Sign up with Apple
          </button>
        </div>
        
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px" style={{ backgroundColor: accent?.border20 || 'rgba(255,255,255,0.15)' }}></div>
          <span className="text-xs text-white/40 uppercase tracking-wider">or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: accent?.border20 || 'rgba(255,255,255,0.15)' }}></div>
        </div>

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
    </div>
  );
}