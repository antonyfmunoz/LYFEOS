import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  usePageTitle('Login');
  
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!identifier.trim() || !password.trim()) {
      setError("Please enter your username, email, or phone number and password");
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="text-center mb-8">
        <h1 className="text-4xl text-white font-orbitron mb-2">LYFEOS</h1>
        <p className="text-muted-foreground">Your personal life operating system</p>
      </div>
      
      <div className="w-full max-w-md glassmorphic rounded-xl p-6 border border-white/40"
           style={{ boxShadow: "0 0 20px rgba(255, 255, 255, 0.15)" }}>
        <h2 className="text-xl font-orbitron text-center mb-6 text-white">Login to LYFEOS</h2>
        
        
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
              className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
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
              className="w-full bg-transparent border-white/30 rounded-lg p-3 outline-none text-white focus-visible:ring-white/30"
              placeholder="Enter your password"
              required
            />
          </div>
          
          <button 
            type="submit"
            className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-white/20 border-white/50 text-white hover:bg-white/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
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
        
        <div className="mt-4 text-center text-white auth-link">
          <Link href="/forgot-password" className="hover:opacity-80 text-sm transition">
            Forgot your password?
          </Link>
        </div>
        <div className="mt-3 text-center">
          <p className="text-muted-foreground">
            Don't have an account?{" "}
            <span className="text-white auth-link"><Link href="/register" className="hover:opacity-80 transition">
              Register
            </Link></span>
          </p>
        </div>
      </div>
    </div>
  );
}