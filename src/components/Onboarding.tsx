import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { motion } from 'motion/react';
import { Heart, Calendar, Clock, ChevronRight } from 'lucide-react';

export const Onboarding: React.FC = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    cycleLength: 28,
    periodDuration: 5,
    lastPeriodDate: new Date().toISOString().split('T')[0],
  });

  const handleNext = async () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      setLoading(true);
      const user = auth.currentUser;
      if (user) {
        try {
          const profile: UserProfile = {
            uid: user.uid,
            displayName: formData.displayName || (user.isAnonymous ? 'Invitada' : (user.displayName || 'Usuario')),
            email: user.email || '',
            cycleLength: formData.cycleLength,
            periodDuration: formData.periodDuration,
            lastPeriodDate: formData.lastPeriodDate,
            onboardingComplete: true,
            createdAt: new Date().toISOString(),
            language: 'es',
            privacySettings: {
              showCycleHistory: true,
              showNutritionGuide: true,
              showMoonCalendar: true,
              showLibidometer: true
            }
          };
          // Usamos setDoc para crear el perfil del usuario
          await setDoc(doc(db, 'users', user.uid), profile);
          // No necesitamos hacer nada más, AuthContext detectará el cambio en Firestore
          // y actualizará el estado global, lo que mostrará el Dashboard.
        } catch (error) {
          console.error("Error saving profile:", error);
          setLoading(false);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-bloom-pink-soft flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-xl"
      >
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-bloom-pink rounded-full flex items-center justify-center text-white shadow-lg shadow-bloom-pink/20">
            <Heart size={24} fill="currentColor" />
          </div>
        </div>

        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-2xl font-black text-slate-900 text-center mb-2">Bienvenida a CycleBloom</h2>
            <p className="text-slate-500 text-center mb-8">Queremos conocerte mejor para personalizar tu experiencia.</p>
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-700 ml-1">¿Cómo te llamas?</span>
                <input 
                  type="text" 
                  className="mt-2 block w-full rounded-2xl border-transparent bg-slate-50 px-5 py-4 focus:bg-white focus:ring-2 focus:ring-bloom-pink/20 transition-all outline-none font-medium"
                  placeholder="Tu nombre o apodo"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                />
              </label>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-2xl font-black text-slate-900 text-center mb-2">Tu Ciclo</h2>
            <p className="text-slate-500 text-center mb-8">Esto nos ayuda a predecir tu próximo periodo con precisión.</p>
            <div className="space-y-8">
              <label className="block">
                <span className="text-sm font-bold text-slate-700 flex items-center gap-2 ml-1">
                  <Clock size={16} className="text-bloom-pink" /> Duración media del ciclo
                </span>
                <input 
                  type="range" min="20" max="45" 
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-bloom-pink mt-6"
                  value={formData.cycleLength}
                  onChange={(e) => setFormData({ ...formData, cycleLength: parseInt(e.target.value) })}
                />
                <div className="text-center font-black text-bloom-pink mt-4 text-xl">{formData.cycleLength} días</div>
              </label>
              
              <label className="block">
                <span className="text-sm font-bold text-slate-700 flex items-center gap-2 ml-1">
                  <Calendar size={16} className="text-bloom-pink" /> Duración del periodo
                </span>
                <input 
                  type="range" min="1" max="10" 
                  className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-bloom-pink mt-6"
                  value={formData.periodDuration}
                  onChange={(e) => setFormData({ ...formData, periodDuration: parseInt(e.target.value) })}
                />
                <div className="text-center font-black text-bloom-pink mt-4 text-xl">{formData.periodDuration} días</div>
              </label>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-2xl font-black text-slate-900 text-center mb-2">Último Periodo</h2>
            <p className="text-slate-500 text-center mb-8">¿Cuándo comenzó tu última menstruación?</p>
            <input 
              type="date" 
              className="w-full rounded-2xl border-transparent bg-slate-50 px-5 py-4 focus:bg-white focus:ring-2 focus:ring-bloom-pink/20 transition-all outline-none font-medium"
              value={formData.lastPeriodDate}
              onChange={(e) => setFormData({ ...formData, lastPeriodDate: e.target.value })}
            />
          </motion.div>
        )}

        {step === 4 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h2 className="text-2xl font-black text-slate-900 text-center mb-2">¿Lista para florecer?</h2>
            <p className="text-slate-500 text-center mb-8">Hemos configurado tu rastreador personalizado. Puedes ajustar esto cuando quieras.</p>
            <div className="bg-bloom-pink-soft/50 p-6 rounded-[2rem] space-y-4 border border-bloom-pink/10">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm font-medium">Duración del Ciclo</span>
                <span className="font-black text-bloom-pink">{formData.cycleLength} días</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm font-medium">Duración del Periodo</span>
                <span className="font-black text-bloom-pink">{formData.periodDuration} días</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm font-medium">Último Inicio</span>
                <span className="font-black text-bloom-pink">{formData.lastPeriodDate}</span>
              </div>
            </div>
          </motion.div>
        )}

        <button 
          onClick={handleNext}
          disabled={loading || (step === 1 && !formData.displayName)}
          className="w-full mt-10 bg-bloom-pink text-white font-black py-4 rounded-2xl shadow-lg shadow-bloom-pink/30 flex items-center justify-center gap-2 hover:bg-bloom-pink/90 transition-all disabled:opacity-50"
        >
          {loading ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              {step === 4 ? 'Comenzar' : 'Continuar'} <ChevronRight size={20} />
            </>
          )}
        </button>

        <div className="flex justify-center gap-2 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <div 
              key={i} 
              className={`h-1.5 rounded-full transition-all duration-300 ${step === i ? 'w-8 bg-bloom-pink' : 'w-2 bg-slate-200'}`} 
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};
