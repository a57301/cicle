/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './components/AuthContext';
import { Login } from './components/Login';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { motion, AnimatePresence } from 'motion/react';
import { Heart } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, profile, loading, isAuthReady } = useAuth();

  if (!isAuthReady || (user && loading)) {
    return (
      <div className="min-h-screen bg-bloom-pink-soft flex flex-col items-center justify-center gap-4">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-16 h-16 bg-bloom-pink rounded-2xl flex items-center justify-center text-white shadow-xl shadow-bloom-pink/30"
        >
          <Heart size={32} fill="currentColor" />
        </motion.div>
        <p className="text-bloom-pink font-black tracking-widest uppercase text-xs animate-pulse">Loading CycleBloom...</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!user ? (
        <motion.div 
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Login />
        </motion.div>
      ) : !profile ? (
        <motion.div 
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Onboarding />
        </motion.div>
      ) : (
        <motion.div 
          key={`dashboard-${user.uid}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Dashboard profile={profile} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

