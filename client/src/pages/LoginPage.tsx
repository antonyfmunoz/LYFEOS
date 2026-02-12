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
  
  const { login } = useAuth();
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-white" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-orbitron mb-2"><span className="text-white">LYFE</span><span style={{ color: accent?.color || 'white' }}>OS</span></h1>
        <p className="text-white">Your personal life operating system</p>
      </div>
      <div className="w-full max-w-md rounded-xl p-6 border backdrop-blur-md"
           style={{ backgroundColor: "rgba(38, 38, 42, 0.85)", boxShadow: `0 0 20px ${accent?.glow || 'rgba(255,255,255,0.08)'}`, borderColor: accent?.border20 || 'rgba(255,255,255,0.2)' }}>
        <h2 className="text-xl font-orbitron text-center mb-6" style={{ color: accent?.color || 'white' }}>Login to LYFEOS</h2>
        
        
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
  );
}