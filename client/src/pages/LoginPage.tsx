import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export default function LoginPage() {
  usePageTitle('Login');
  
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!identifier.trim() || !password.trim()) {
      setError("Please enter your username or email and password");
      return;
    }
    
    try {
      setIsSubmitting(true);
      console.log("Submitting login form with identifier:", identifier);
      await login(identifier, password);
    } catch (err: any) {
      console.error("Login error:", err);
      if (!err?.message) {
        setError("Login failed. Please check your credentials and try again.");
      } else {
        setError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 text-white" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
      <div className="text-center pt-[env(safe-area-inset-top)] pb-4">
        <h1 className="text-4xl font-orbitron font-bold mb-2"><span className="text-white">LYFE</span><span style={{ color: accent?.color || 'white' }}>OS</span></h1>
        <p className="text-white">Your personal life operating system</p>
      </div>
      <div className="flex-1 flex items-center w-full justify-center">
      <div className="w-full max-w-md rounded-xl p-6 border backdrop-blur-md"
           style={{ backgroundColor: "hsla(0, 0%, 11%, 0.7)", boxShadow: `0 0 20px ${accent?.glow || 'rgba(255,255,255,0.08)'}`, borderColor: accent?.border20 || 'rgba(255,255,255,0.2)' }}>
        <h2 className="text-xl font-orbitron text-center mb-6" style={{ color: accent?.color || 'white' }}>Login to LYFEOS</h2>
        
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
            Continue with Google
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
            Continue with Apple
          </button>
        </div>
        
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px" style={{ backgroundColor: accent?.border20 || 'rgba(255,255,255,0.15)' }}></div>
          <span className="text-xs text-white/40 uppercase tracking-wider">or</span>
          <div className="flex-1 h-px" style={{ backgroundColor: accent?.border20 || 'rgba(255,255,255,0.15)' }}></div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-500 text-sm mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="identifier" className="block text-sm text-white">USERNAME OR EMAIL</label>
            <Input 
              type="text" 
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-transparent rounded-lg p-3 outline-none text-white"
              placeholder="Enter username or email"
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
              placeholder="Enter your password"
              required
              style={{ borderColor: accent?.border30 || 'rgba(255,255,255,0.3)', '--tw-ring-color': accent?.border30 || 'rgba(255,255,255,0.3)' } as any}
            />
          </div>
          
          <button 
            type="submit"
            className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border hover:opacity-80 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
            disabled={isSubmitting}
            style={{ backgroundColor: accent?.bg20 || 'rgba(255,255,255,0.2)', borderColor: accent?.border50 || 'rgba(255,255,255,0.5)', color: accent?.color || 'white' }}
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
        
        <div className="mt-4 text-center auth-link">
          <Link href="/forgot-password" className="hover:opacity-80 text-sm transition" style={{ color: accent?.color || 'white' }}>
            Forgot your password?
          </Link>
        </div>
        <div className="mt-3 text-center">
          <p className="text-white">
            Don't have an account?{" "}
            <span className="auth-link" style={{ color: accent?.color || 'white' }}><Link href="/register" className="hover:opacity-80 transition" style={{ color: accent?.color || 'white' }}>
              Register
            </Link></span>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}