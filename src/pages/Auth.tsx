import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

const Auth = () => {
  const { user, loading, roles, signOut } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();

  if (loading) return null;

  // Role-based routing
  if (user && roles) {
    if (roles.includes("admin")) return <Navigate to="/admin" replace />;
    if (roles.includes("manager")) return <Navigate to="/manager" replace />;
    if (roles.includes("assistant")) return <Navigate to="/assistant" replace />;
    if (roles.includes("photographer")) return <Navigate to="/app" replace />;

    // Fallback if they have NO roles assigned yet
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <h2 className="font-display italic text-2xl mb-4">Pending Approval</h2>
          <p className="font-mono text-xs text-muted-foreground mb-8">Your account has been created, but an Administrator has not yet assigned your role. Please contact management.</p>
          <button onClick={signOut} className="glass-card px-6 py-3 rounded-lg font-mono text-[11px] uppercase tracking-[0.2em] hover:bg-primary/10 transition-colors">Sign Out</button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setSubmitting(true);

    if (isLogin) {
      const result = await signIn(email, password);
      if (result.error) setError(result.error.message);
    } else {
      const result = await signUp(email, password, fullName);
      if (result.error) {
        setError(result.error.message);
      } else {
        setSuccessMsg("Success! Please check your email for a confirmation link to activate your account.");
        // Clear form
        setPassword("");
      }
    }
    setSubmitting(false);
  };

  const inputClass = "w-full bg-transparent border-b border-muted focus:border-primary py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-colors duration-500";

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-12">
          <img src="/logo-graphic.jpg" alt="Aaliyah Monogram" className="h-16 md:h-20 w-auto mx-auto mb-6 mix-blend-screen" />
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            Operations Portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && (
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Full Name</label>
              <input type="text" required={!isLogin} value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} placeholder="Your name" />
            </div>
          )}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@aaliyah.com" />
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="••••••••" />
          </div>

          {error && (
            <p className="text-destructive text-xs font-mono">{error}</p>
          )}

          {successMsg && (
            <p className="text-green-500 text-xs font-mono p-3 bg-green-500/10 rounded-lg border border-green-500/20">{successMsg}</p>
          )}

          <motion.button
            type="submit"
            disabled={submitting}
            whileTap={{ scale: 0.98 }}
            className="w-full glass-card py-4 rounded-lg font-mono text-[11px] uppercase tracking-[0.2em] text-primary hover:bg-primary/10 transition-all duration-500 pulse-glow disabled:opacity-50"
          >
            {submitting ? "Authenticating..." : isLogin ? "Enter" : "Create Account"}
          </motion.button>
        </form>

        <button
          onClick={() => { setIsLogin(!isLogin); setError(""); setSuccessMsg(""); }}
          className="w-full mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors text-center"
        >
          {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </motion.div>
    </div>
  );
};

export default Auth;
