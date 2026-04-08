import React from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously 
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Mail, Lock, ArrowRight, Sparkles } from 'lucide-react';

export const Login: React.FC = () => {
  const [isSignUp, setIsSignUp] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
      setError("Failed to login with Google");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (err: any) {
      console.error("Guest login error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError("Guest login is not enabled in Firebase Console. Please enable 'Anonymous' provider.");
      } else {
        setError("Guest login failed: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bloom-pink-soft flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[3rem] p-10 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-bloom-pink/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        
        <div className="relative z-10 text-center">
          <div className="w-16 h-16 bg-bloom-pink rounded-2xl flex items-center justify-center text-white mx-auto mb-6 rotate-6 shadow-lg shadow-bloom-pink/30">
            <Heart size={32} fill="currentColor" />
          </div>
          
          <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">CycleBloom</h1>
          <p className="text-slate-500 mb-8 text-sm font-medium">Your intelligent companion for a balanced cycle.</p>

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="email" 
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border-2 border-transparent focus:border-bloom-pink/20 focus:bg-white rounded-2xl py-4 pl-12 pr-4 text-sm font-medium transition-all outline-none"
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="password" 
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border-2 border-transparent focus:border-bloom-pink/20 focus:bg-white rounded-2xl py-4 pl-12 pr-4 text-sm font-medium transition-all outline-none"
                required
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-xs text-rose-500 font-bold"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-bloom-pink text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-bloom-pink/90 transition-all shadow-lg shadow-bloom-pink/20 disabled:opacity-50"
            >
              {isSignUp ? 'Create Account' : 'Sign In'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">or continue with</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <button 
              onClick={handleGoogleLogin}
              className="bg-white border-2 border-slate-100 text-slate-700 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-50 transition-all text-xs"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
              Google
            </button>
            <button 
              onClick={handleGuestLogin}
              className="bg-slate-900 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-all text-xs"
            >
              <Sparkles size={14} className="text-bloom-pink" />
              Guest
            </button>
          </div>

          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm font-bold text-slate-400 hover:text-bloom-pink transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
          
          <p className="mt-8 text-[10px] text-slate-300 px-8 leading-relaxed">
            By continuing, you agree to our <span className="underline">Terms of Service</span> and <span className="underline">Privacy Policy</span>.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
