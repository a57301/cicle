import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { DailyLog, UserProfile, CycleInfo, FlowIntensity, CycleHistory } from '../types';
import { calculateCycleInfo, PHASE_COLORS, PHASE_LABELS } from '../lib/cycleLogic';
import { 
  getCycleInsights, 
  getDailyDietPlan, 
  checkCalories, 
  generateRecipes,
  getLunarRecommendations 
} from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  ChevronRight, 
  Clock, 
  Droplets, 
  Heart, 
  Info, 
  LayoutDashboard, 
  LineChart, 
  LogOut, 
  Moon, 
  Plus, 
  Settings, 
  Sparkles, 
  Utensils, 
  Zap,
  Bell,
  User as UserIcon,
  Globe,
  CheckCircle2,
  AlertCircle,
  ChefHat,
  Scale,
  Thermometer,
  Eye,
  EyeOff,
  Camera,
  ChevronLeft,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { cn } from '../lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getMoonPhaseData, MOON_CYCLE_ALIGNMENT } from '../lib/cycleLogic';

interface DashboardProps {
  profile: UserProfile;
}

export const Dashboard: React.FC<DashboardProps> = ({ profile }) => {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
  const [insights, setInsights] = useState<any>(null);
  const [dietPlan, setDietPlan] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loadingDiet, setLoadingDiet] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showNutritionModal, setShowNutritionModal] = useState<'eat' | 'avoid' | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [history, setHistory] = useState<CycleHistory[]>([]);

  // Libidometer calculation
  const calculateLibido = () => {
    if (!cycleInfo) return 50;
    let base = 50;
    // Phase impact
    if (cycleInfo.phase === 'ovulatory') base += 30;
    if (cycleInfo.phase === 'follicular') base += 15;
    if (cycleInfo.phase === 'menstrual') base -= 20;
    if (cycleInfo.phase === 'luteal') base -= 10;

    // Recent logs impact
    if (logs.length > 0) {
      const latest = logs[0];
      if (latest.energyLevel > 3) base += 10;
      if (latest.energyLevel < 3) base -= 10;
      if (latest.moods.includes('Happy') || latest.moods.includes('Feliz')) base += 10;
      if (latest.moods.includes('Tired') || latest.moods.includes('Cansada')) base -= 15;
    }

    return Math.min(100, Math.max(0, base));
  };

  const libidoLevel = calculateLibido();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('Good morning', 'Buenos días');
    if (hour < 18) return t('Good afternoon', 'Buenas tardes');
    return t('Good evening', 'Buenas noches');
  };

  // Auto-hide success toast
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  // Calorie Checker State
  const [foodInput, setFoodInput] = useState('');
  const [calInput, setCalInput] = useState('');
  const [calResult, setCalResult] = useState<any>(null);
  const [checkingCal, setCheckingCal] = useState(false);

  // Recipe Generator State
  const [ingredientsInput, setIngredientsInput] = useState('');
  const [recipeResult, setRecipeResult] = useState<any>(null);
  const [generatingRecipes, setGeneratingRecipes] = useState(false);

  const [logToDelete, setLogToDelete] = useState<DailyLog | null>(null);

  const handleDeleteLog = async () => {
    if (!logToDelete || !profile.uid) return;
    try {
      await deleteDoc(doc(db, 'users', profile.uid, 'daily_logs', logToDelete.id!));
      setLogToDelete(null);
    } catch (e) {
      console.error(e);
    }
  };

  // Settings State
  const [settingsData, setSettingsData] = useState({
    displayName: profile.displayName,
    cycleLength: profile.cycleLength,
    periodDuration: profile.periodDuration,
    lastPeriodDate: profile.lastPeriodDate,
    language: 'es',
    dietaryRestrictions: profile.dietaryRestrictions || '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [editingLog, setEditingLog] = useState<DailyLog | null>(null);
  const [lunarRecs, setLunarRecs] = useState<any>(null);
  const [loadingLunar, setLoadingLunar] = useState(false);

  const t = (en: string, es: string) => es;

  useEffect(() => {
    const info = calculateCycleInfo(profile.lastPeriodDate, profile.cycleLength, profile.periodDuration);
    setCycleInfo(info);

    // Logs for chart and today's check
    const qLogs = query(
      collection(db, 'users', profile.uid, 'daily_logs'),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DailyLog));
      setLogs(newLogs);
    });

    // Real history
    const qHistory = query(
      collection(db, 'users', profile.uid, 'cycles'),
      orderBy('startDate', 'desc'),
      limit(5)
    );

    const unsubscribeHistory = onSnapshot(qHistory, (snapshot) => {
      const newHistory = snapshot.docs.map(doc => doc.data() as CycleHistory);
      setHistory(newHistory);
    });

    return () => {
      unsubscribeLogs();
      unsubscribeHistory();
    };
  }, [profile]);

  // Transform logs for chart
  const chartData = [...logs].reverse().map(log => ({
    name: format(parseISO(log.date), 'MMM d'),
    value: log.energyLevel,
    symptoms: log.physicalSymptoms.length
  })).slice(-7);

  const finalChartData = chartData.length > 0 ? chartData : [
    { name: 'No data', value: 0, symptoms: 0 }
  ];

  useEffect(() => {
    // Clear state when user changes to avoid showing stale data
    setInsights(null);
    setLunarRecs(null);
    setDietPlan(null);

    const today = format(new Date(), 'yyyy-MM-dd');
    const fetchAllDailyContent = async () => {
      if (!cycleInfo || !profile.uid) {
        console.warn("Missing cycleInfo or profile.uid, skipping daily content fetch");
        return;
      }
      
      // Basic validation of profile data needed for AI
      if (!profile.cycleLength || !profile.periodDuration || !profile.lastPeriodDate) {
        console.warn("Incomplete profile data for AI generation:", profile);
        return;
      }
      
      const docRef = doc(db, 'users', profile.uid, 'daily_content', today);
      try {
        const docSnap = await getDoc(docRef);
        let currentContent = docSnap.exists() ? docSnap.data() : { date: today };
        let updated = false;

        // Insights
        if (!currentContent.insights) {
          setLoadingInsights(true);
          try {
            console.log("Generating insights for user:", profile.uid);
            const data = await getCycleInsights(profile, logs, cycleInfo.phase);
            if (data) {
              currentContent.insights = data;
              setInsights(data);
              updated = true;
            } else {
              console.error("Gemini returned null insights");
            }
          } catch (e) {
            console.error("Error in fetchAllDailyContent (insights):", e);
          }
          setLoadingInsights(false);
        } else {
          setInsights(currentContent.insights);
        }

        // Lunar Recs
        if (!currentContent.lunarRecs && cycleInfo.moonPhase) {
          setLoadingLunar(true);
          try {
            const data = await getLunarRecommendations(cycleInfo.moonPhase.nameEn, 'es');
            if (data) {
              currentContent.lunarRecs = data;
              setLunarRecs(data);
              updated = true;
            }
          } catch (e) {
            console.error("Error in fetchAllDailyContent (lunar):", e);
          }
          setLoadingLunar(false);
        } else if (currentContent.lunarRecs) {
          setLunarRecs(currentContent.lunarRecs);
        }

        // Diet Plan
        if (!currentContent.dietPlan) {
          setLoadingDiet(true);
          try {
            const data = await getDailyDietPlan(profile, cycleInfo.phase);
            if (data) {
              currentContent.dietPlan = data;
              setDietPlan(data);
              updated = true;
            }
          } catch (e) {
            console.error("Error in fetchAllDailyContent (diet):", e);
          }
          setLoadingDiet(false);
        } else {
          setDietPlan(currentContent.dietPlan);
        }

        if (updated) {
          await setDoc(docRef, currentContent);
        }
      } catch (error) {
        console.error("Error fetching daily content:", error);
      }
    };

    if (cycleInfo && profile.uid) {
      fetchAllDailyContent();
    }
  }, [cycleInfo?.phase, profile.uid, logs.length]);

  const handleLogout = () => auth.signOut();

  const resetInsights = async () => {
    if (!cycleInfo || !profile.uid) return;
    setLoadingInsights(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const data = await getCycleInsights(profile, logs, cycleInfo.phase);
    setInsights(data);
    const docRef = doc(db, 'users', profile.uid, 'daily_content', today);
    await setDoc(docRef, { insights: data }, { merge: true });
    setLoadingInsights(false);
  };

  const resetLunarRecs = async () => {
    if (!cycleInfo?.moonPhase || !profile.uid) return;
    setLoadingLunar(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const data = await getLunarRecommendations(cycleInfo.moonPhase.nameEn, 'es');
    setLunarRecs(data);
    const docRef = doc(db, 'users', profile.uid, 'daily_content', today);
    await setDoc(docRef, { lunarRecs: data }, { merge: true });
    setLoadingLunar(false);
  };

  const resetDietPlan = async () => {
    if (!cycleInfo || !profile.uid) return;
    setLoadingDiet(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const data = await getDailyDietPlan(profile, cycleInfo.phase);
    setDietPlan(data);
    const docRef = doc(db, 'users', profile.uid, 'daily_content', today);
    await setDoc(docRef, { dietPlan: data }, { merge: true });
    setLoadingDiet(false);
  };

  const handleSaveSettings = async (newData?: any) => {
    setSavingSettings(true);
    try {
      await setDoc(doc(db, 'users', profile.uid), {
        ...profile,
        ...settingsData,
        ...newData
      });
      setSaveSuccess(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCheckCalories = async () => {
    if (!foodInput || !cycleInfo) return;
    setCheckingCal(true);
    const result = await checkCalories(foodInput, profile, cycleInfo.phase);
    setCalResult(result);
    setCheckingCal(false);
  };

  const handleGenerateRecipes = async () => {
    if (!ingredientsInput || !cycleInfo) return;
    setGeneratingRecipes(true);
    const result = await generateRecipes(ingredientsInput, profile, cycleInfo.phase);
    setRecipeResult(result);
    setGeneratingRecipes(false);
  };

  return (
    <div className="min-h-screen bg-[#FDFCFD] flex flex-col pb-20 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-bloom-pink rounded-lg flex items-center justify-center text-white">
              <Heart size={18} fill="currentColor" />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900">CycleBloom</span>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-slate-100/50 p-1 rounded-xl">
            {[
              { id: 'dashboard', label: t('Dashboard', 'Panel'), icon: LayoutDashboard },
              { id: 'log', label: t('Log Today', 'Registrar'), icon: Plus, visible: profile.privacySettings?.showCycleHistory ?? true },
              { id: 'insights', label: t('Insights', 'Análisis'), icon: Sparkles },
              { id: 'nutrition', label: t('Nutrition', 'Nutrición'), icon: Utensils, visible: profile.privacySettings?.showNutritionGuide ?? true },
              { id: 'settings', label: t('Settings', 'Ajustes'), icon: Settings },
            ].filter(tab => tab.visible !== false).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === tab.id 
                    ? "bg-white text-bloom-pink shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                )}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="md:hidden">
              <button 
                onClick={() => setActiveTab('settings')}
                className={cn(
                  "p-2 rounded-xl transition-all",
                  activeTab === 'settings' ? "bg-bloom-pink/10 text-bloom-pink" : "text-slate-400"
                )}
              >
                <Settings size={22} />
              </button>
            </div>
            <button 
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2 pl-2 md:pl-4 border-l border-slate-100 hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 bg-bloom-purple rounded-full flex items-center justify-center text-white font-bold text-xs overflow-hidden">
                {profile.photoURL ? (
                  <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  profile.displayName[0]
                )}
              </div>
              <span className="text-sm font-semibold text-slate-700 hidden sm:block">{profile.displayName}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-t border-slate-100 px-6 py-3 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        {[
          { id: 'dashboard', label: t('Panel', 'Panel'), icon: LayoutDashboard },
          { id: 'log', label: t('Log', 'Registrar'), icon: Plus, visible: profile.privacySettings?.showCycleHistory ?? true },
          { id: 'insights', label: t('Insights', 'Análisis'), icon: Sparkles },
          { id: 'nutrition', label: t('Nutrition', 'Nutrición'), icon: Utensils, visible: profile.privacySettings?.showNutritionGuide ?? true },
        ].filter(tab => tab.visible !== false).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === tab.id ? "text-bloom-pink" : "text-slate-400"
            )}
          >
            <div className={cn(
              "p-2 rounded-xl transition-all",
              activeTab === tab.id ? "bg-bloom-pink/10" : ""
            )}>
              <tab.icon size={20} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Welcome Section */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">{getGreeting()}, {profile.displayName} 🌸</h1>
                  <p className="text-slate-500 mt-1">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')} • {t(`Cycle Day ${cycleInfo?.dayOfCycle || '--'}`, `Día del Ciclo ${cycleInfo?.dayOfCycle || '--'}`)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {cycleInfo?.moonPhase && (
                    <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full text-xs font-bold text-slate-600">
                      <span className="text-lg">{cycleInfo.moonPhase.icon}</span>
                      <span>{t(cycleInfo.moonPhase.nameEn, cycleInfo.moonPhase.nameEs)}</span>
                      <span className="opacity-50">• {cycleInfo.moonPhase.illumination}%</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full text-xs font-medium">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                    {t('Data synced', 'Datos sincronizados')}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex flex-col items-center text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">{t('Current Phase', 'Fase Actual')}</span>
                  <div className="relative w-24 h-24 mb-4">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="48" cy="48" r="42" fill="none" stroke="#F1F5F9" strokeWidth="6" />
                      <circle
                        cx="48" cy="48" r="42" fill="none" stroke="url(#gradient)" strokeWidth="6"
                        strokeDasharray={264}
                        strokeDashoffset={264 - (264 * (cycleInfo?.dayOfCycle || 0)) / profile.cycleLength}
                        strokeLinecap="round"
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#FF8A9B" />
                          <stop offset="100%" stopColor="#FFB347" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-slate-900">{cycleInfo?.dayOfCycle}</span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase">Día</span>
                    </div>
                  </div>
                  <div className={cn("px-3 py-1 rounded-full text-[9px] font-black text-white shadow-sm uppercase tracking-wider", cycleInfo ? PHASE_COLORS[cycleInfo.phase] : 'bg-slate-200')}>
                    {cycleInfo ? t(PHASE_LABELS[cycleInfo.phase], PHASE_LABELS[cycleInfo.phase]) : 'Cargando...'}
                  </div>
                </div>

                <StatCard 
                  icon={Calendar} 
                  label={t("Next Period In", "Próximo Periodo")} 
                  value={`${cycleInfo?.daysUntilNextPeriod} ${t('days', 'días')}`} 
                  subValue={cycleInfo ? format(parseISO(cycleInfo.nextPeriodDate), 'MMM d') : ""}
                  color="bg-rose-50 text-rose-500"
                />
                <StatCard 
                  icon={Zap} 
                  label={t("Fertile Window", "Ventana Fértil")} 
                  value={cycleInfo?.fertileWindow.isOpen ? t("Open", "Abierta") : t("Closed", "Cerrada")} 
                  subValue={cycleInfo ? `${format(parseISO(cycleInfo.fertileWindow.start), 'MMM d')}-${format(parseISO(cycleInfo.fertileWindow.end), 'MMM d')}` : ""}
                  color="bg-emerald-50 text-emerald-500"
                />
                <StatCard 
                  icon={LineChart} 
                  label={t("Avg Cycle Length", "Ciclo Promedio")} 
                  value={`${profile.cycleLength} ${t('days', 'días')}`} 
                  subValue={t("Consistent", "Consistente")}
                  color="bg-bloom-purple-soft text-bloom-purple"
                />
                <StatCard 
                  icon={Droplets} 
                  label={t("Period Duration", "Duración Periodo")} 
                  value={`${profile.periodDuration} ${t('days', 'días')}`} 
                  subValue={t("Consistent", "Consistente")}
                  color="bg-rose-50 text-rose-400"
                />
              </div>

              {/* Bento Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                {/* Main Column: Lunar Calendar & Libidometer */}
                <div className="md:col-span-12 space-y-8">
                  {/* Moon Calendar Card */}
                  {(profile.privacySettings?.showMoonCalendar ?? true) && (
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-xl shadow-slate-200 overflow-hidden relative group">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-bloom-pink/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                      
                      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                              <div className="p-2 bg-white/10 rounded-xl">
                                <Moon size={20} className="text-bloom-pink" />
                              </div>
                              <span className="text-xs font-bold uppercase tracking-widest opacity-70">{t('Lunar Calendar', 'Calendario Lunar')}</span>
                            </div>
                            <span className="text-xs font-bold opacity-50">{format(new Date(), 'MMMM yyyy')}</span>
                          </div>
                          
                          <div className="grid grid-cols-7 gap-1 mb-6">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                              <div key={`${d}-${i}`} className="text-[10px] font-bold text-center opacity-40">{d}</div>
                            ))}
                            {(() => {
                              const start = startOfMonth(new Date());
                              const end = endOfMonth(new Date());
                              const days = eachDayOfInterval({ start, end });
                              const padding = Array(start.getDay()).fill(null);
                              
                              return [...padding, ...days].map((day, i) => {
                                if (!day) return <div key={`pad-${i}`} />;
                                const moon = getMoonPhaseData(day);
                                const isToday = isSameDay(day, new Date());
                                
                                return (
                                  <div 
                                    key={day.toString()} 
                                    className={cn(
                                      "flex flex-col items-center p-1 rounded-lg transition-all",
                                      isToday ? "bg-white/10 ring-1 ring-white/20" : "hover:bg-white/5"
                                    )}
                                  >
                                    <span className={cn("text-[10px] mb-1", isToday ? "font-bold text-bloom-pink" : "opacity-60")}>
                                      {format(day, 'd')}
                                    </span>
                                    <span className="text-xs">{moon.icon}</span>
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-2xl">{cycleInfo?.moonPhase.icon}</span>
                              <div>
                                <div className="text-xs font-bold text-bloom-pink uppercase tracking-tighter">
                                  {cycleInfo ? t(MOON_CYCLE_ALIGNMENT[cycleInfo.phase].moon, MOON_CYCLE_ALIGNMENT[cycleInfo.phase].moon) : ''}
                                </div>
                                <div className="text-sm font-black">
                                  {cycleInfo ? cycleInfo.moonPhase.nameEs : ''}
                                </div>
                              </div>
                            </div>
                            <p className="text-[11px] opacity-70 leading-relaxed italic">
                              {cycleInfo ? t(MOON_CYCLE_ALIGNMENT[cycleInfo.phase].desc, MOON_CYCLE_ALIGNMENT[cycleInfo.phase].desc) : ''}
                            </p>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-black uppercase tracking-widest text-bloom-pink flex items-center gap-2">
                              <Sparkles size={14} />
                              {t('Lunar Recommendations', 'Recomendaciones Lunares')}
                            </h3>
                            <div className="flex items-center gap-3">
                              <span className="hidden sm:block text-[9px] font-bold text-white/40 uppercase tracking-tight">
                                {t('Reset for a new recommendation', 'reestablecer para una nueva recomendacion')}
                              </span>
                              <button 
                                onClick={resetLunarRecs}
                                disabled={loadingLunar}
                                className="p-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                                title={t('Reset Recommendations', 'Reiniciar Recomendaciones')}
                              >
                                <RotateCcw size={14} className={loadingLunar ? "animate-spin" : ""} />
                              </button>
                            </div>
                          </div>
                          <div className="space-y-3">
                            {loadingLunar ? (
                              Array(4).fill(0).map((_, i) => (
                                <div key={i} className="h-16 bg-white/5 rounded-2xl animate-pulse" />
                              ))
                            ) : lunarRecs?.recommendations ? (
                              lunarRecs.recommendations.map((rec: any, i: number) => (
                                <div key={i} className="p-3 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                                  <div className="text-[11px] font-bold text-white mb-0.5">{rec.activity}</div>
                                  <div className="text-[10px] opacity-60 leading-tight">{rec.explanation}</div>
                                </div>
                              ))
                            ) : (
                              <p className="text-[10px] opacity-40 italic">{t('No recommendations available.', 'No hay recomendaciones disponibles.')}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Libidometer Card */}
                  {(profile.privacySettings?.showLibidometer ?? true) && (
                    <div className="bg-slate-950 rounded-[2.5rem] p-10 text-white shadow-2xl overflow-hidden relative">
                      {/* Background Glows */}
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-64 bg-rose-500/20 blur-[100px] rounded-full" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-indigo-500/5 blur-[120px] rounded-full" />

                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-10">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
                              <Zap size={24} className="text-rose-400" />
                            </div>
                            <div>
                              <h2 className="text-xl font-black tracking-tight">{t('Energetic Wave', 'Onda Energética')}</h2>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{t('Libidometer', 'Libidómetro')}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-black text-rose-400">{libidoLevel}%</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                              {libidoLevel > 70 ? t('Peak Energy', 'Energía Pico') : libidoLevel > 40 ? t('Stable', 'Estable') : t('Resting', 'Descanso')}
                            </div>
                          </div>
                        </div>

                        <div className="h-48 w-full relative">
                          <svg viewBox="0 0 800 200" className="w-full h-full overflow-visible">
                            <defs>
                              <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
                                <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0" />
                              </linearGradient>
                              <filter id="glow">
                                <feGaussianBlur stdDeviation="4" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                              </filter>
                            </defs>

                            {/* Background layers */}
                            <motion.path
                              d={`M 0 150 Q 100 ${150 - libidoLevel * 0.8} 200 150 T 400 150 T 600 150 T 800 150 V 200 H 0 Z`}
                              fill="url(#waveGradient)"
                              opacity="0.2"
                              animate={{
                                d: [
                                  `M 0 150 Q 100 ${150 - libidoLevel * 0.8} 200 150 T 400 150 T 600 150 T 800 150 V 200 H 0 Z`,
                                  `M 0 150 Q 100 ${150 - libidoLevel * 0.4} 200 150 T 400 150 T 600 150 T 800 150 V 200 H 0 Z`,
                                  `M 0 150 Q 100 ${150 - libidoLevel * 0.8} 200 150 T 400 150 T 600 150 T 800 150 V 200 H 0 Z`
                                ]
                              }}
                              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                            />

                            {/* Main Wave */}
                            <motion.path
                              d={`M 0 150 C 100 ${150 - libidoLevel * 1.2} 150 ${150 - libidoLevel * 1.5} 200 150 S 300 ${150 - libidoLevel * 0.5} 400 150 S 500 ${150 - libidoLevel * 1.8} 600 150 S 700 ${150 - libidoLevel * 0.8} 800 150 V 200 H 0 Z`}
                              fill="url(#waveGradient)"
                              filter="url(#glow)"
                              animate={{
                                d: [
                                  `M 0 150 C 100 ${150 - libidoLevel * 1.2} 150 ${150 - libidoLevel * 1.5} 200 150 S 300 ${150 - libidoLevel * 0.5} 400 150 S 500 ${150 - libidoLevel * 1.8} 600 150 S 700 ${150 - libidoLevel * 0.8} 800 150 V 200 H 0 Z`,
                                  `M 0 150 C 100 ${150 - libidoLevel * 1.0} 150 ${150 - libidoLevel * 1.3} 200 150 S 300 ${150 - libidoLevel * 0.7} 400 150 S 500 ${150 - libidoLevel * 1.6} 600 150 S 700 ${150 - libidoLevel * 1.0} 800 150 V 200 H 0 Z`,
                                  `M 0 150 C 100 ${150 - libidoLevel * 1.2} 150 ${150 - libidoLevel * 1.5} 200 150 S 300 ${150 - libidoLevel * 0.5} 400 150 S 500 ${150 - libidoLevel * 1.8} 600 150 S 700 ${150 - libidoLevel * 0.8} 800 150 V 200 H 0 Z`
                                ]
                              }}
                              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            />

                            {/* Top Line */}
                            <motion.path
                              d={`M 0 150 C 100 ${150 - libidoLevel * 1.2} 150 ${150 - libidoLevel * 1.5} 200 150 S 300 ${150 - libidoLevel * 0.5} 400 150 S 500 ${150 - libidoLevel * 1.8} 600 150 S 700 ${150 - libidoLevel * 0.8} 800 150`}
                              fill="none"
                              stroke="#f43f5e"
                              strokeWidth="3"
                              strokeLinecap="round"
                              filter="url(#glow)"
                              animate={{
                                d: [
                                  `M 0 150 C 100 ${150 - libidoLevel * 1.2} 150 ${150 - libidoLevel * 1.5} 200 150 S 300 ${150 - libidoLevel * 0.5} 400 150 S 500 ${150 - libidoLevel * 1.8} 600 150 S 700 ${150 - libidoLevel * 0.8} 800 150`,
                                  `M 0 150 C 100 ${150 - libidoLevel * 1.0} 150 ${150 - libidoLevel * 1.3} 200 150 S 300 ${150 - libidoLevel * 0.7} 400 150 S 500 ${150 - libidoLevel * 1.6} 600 150 S 700 ${150 - libidoLevel * 1.0} 800 150`,
                                  `M 0 150 C 100 ${150 - libidoLevel * 1.2} 150 ${150 - libidoLevel * 1.5} 200 150 S 300 ${150 - libidoLevel * 0.5} 400 150 S 500 ${150 - libidoLevel * 1.8} 600 150 S 700 ${150 - libidoLevel * 0.8} 800 150`
                                ]
                              }}
                              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            />
                          </svg>
                        </div>

                        <div className="mt-8 p-6 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md">
                          <p className="text-xs text-white/60 leading-relaxed text-center italic">
                            {t(
                              "Your energetic wave is calculated based on your current cycle phase and recent energy logs. This represents your internal vitality peaks.",
                              "Tu onda energética se calcula basándose en tu fase actual del ciclo y tus registros recientes. Representa tus picos de vitalidad interna."
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Today's Log Section */}
                <div className="lg:col-span-2 space-y-8">
                  {(profile.privacySettings?.showNutritionGuide ?? true) && (
                    <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900">{t("Today's Log", "Registro de Hoy")}</h2>
                          <p className="text-sm text-slate-400">{format(new Date(), 'EEE, MMMM d')} • {t(`Cycle Day ${cycleInfo?.dayOfCycle}`, `Día del Ciclo ${cycleInfo?.dayOfCycle}`)}</p>
                        </div>
                        <button onClick={() => setActiveTab('log')} className="text-bloom-pink font-bold text-sm hover:underline">{t('View History', 'Ver Historial')}</button>
                      </div>

                      <LogForm 
                        uid={profile.uid} 
                        initialData={editingLog} 
                        onCancel={() => setEditingLog(null)}
                        onSave={() => {
                          setSaveSuccess(true);
                          setEditingLog(null);
                          // Auto hide success message after 3 seconds
                          setTimeout(() => setSaveSuccess(false), 3000);
                        }} 
                        language={profile.language} 
                      />
                    </div>
                  )}

                  {(profile.privacySettings?.showCycleHistory ?? true) && (
                    <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900">{t('Energy & Symptom Trends', 'Tendencias de Energía y Síntomas')}</h2>
                          <p className="text-xs text-slate-400 mt-1">{t('Last 7 entries', 'Últimos 7 registros')}</p>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-orange-400" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{t('Energy', 'Energía')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-bloom-purple" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{t('Symptoms', 'Síntomas')}</span>
                          </div>
                        </div>
                      </div>

                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={finalChartData}>
                            <defs>
                              <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#FFB347" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#FFB347" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="colorSymptoms" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#9D8DF1" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#9D8DF1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 600 }}
                              dy={10}
                            />
                            <YAxis hide />
                            <Tooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                              labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                            />
                            <Area type="monotone" dataKey="value" name={t("Energy", "Energía")} stroke="#FFB347" strokeWidth={3} fillOpacity={1} fill="url(#colorEnergy)" />
                            <Area type="monotone" dataKey="symptoms" name={t("Symptoms", "Síntomas")} stroke="#9D8DF1" strokeWidth={3} fillOpacity={1} fill="url(#colorSymptoms)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mt-8">
                        <TrendStat label={t("Day 3", "Día 3")} sub={t("Peak day", "Día pico")} desc={t("Highest cramps logged", "Más cólicos registrados")} color="bg-rose-50 text-rose-500" />
                        <TrendStat label={`${(logs.reduce((acc, l) => acc + l.energyLevel, 0) / (logs.length || 1)).toFixed(1)}/5`} sub={t("Avg Energy", "Energía Prom.")} desc={t("This cycle", "Este ciclo")} color="bg-bloom-purple-soft text-bloom-purple" />
                        <TrendStat label={t("Day 13", "Día 13")} sub={t("Best mood", "Mejor ánimo")} desc={t("Energy peak", "Pico de energía")} color="bg-orange-50 text-orange-500" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Sidebar Section */}
                <div className="space-y-8">
                  {/* Nutrition Guide */}
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-slate-900">{t('Nutrition Guide', 'Guía Nutricional')}</h2>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white",
                        cycleInfo ? PHASE_COLORS[cycleInfo.phase] : 'bg-slate-200'
                      )}>
                        {cycleInfo?.phase}
                      </div>
                    </div>
                    
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                      {insights?.nutrition?.tip || t("Your body craves warmth and complex carbs. Focus on magnesium-rich foods.", "Tu cuerpo pide calor y carbohidratos complejos. Enfócate en alimentos ricos en magnesio.")}
                    </p>

                    <div className="space-y-3">
                      <button 
                        onClick={() => setShowNutritionModal('eat')}
                        className="w-full flex items-center justify-between p-4 bg-emerald-50 rounded-2xl group hover:bg-emerald-100 transition-colors"
                      >
                        <span className="text-sm font-bold text-emerald-700">{t('EAT MORE OF THESE', 'COME MÁS DE ESTOS')}</span>
                        <ChevronRight size={18} className="text-emerald-400 group-hover:translate-x-1 transition-transform" />
                      </button>
                      <button 
                        onClick={() => setShowNutritionModal('avoid')}
                        className="w-full flex items-center justify-between p-4 bg-rose-50 rounded-2xl group hover:bg-rose-100 transition-colors"
                      >
                        <span className="text-sm font-bold text-rose-700">{t('LIMIT THESE', 'LIMITA ESTOS')}</span>
                        <ChevronRight size={18} className="text-rose-400 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>

                    <div className="mt-6 p-4 bg-sky-50 rounded-2xl flex gap-3">
                      <Droplets size={20} className="text-sky-500 shrink-0" />
                      <div>
                        <h4 className="text-sm font-bold text-sky-900">{t('Hydration tip', 'Consejo de hidratación')}</h4>
                        <p className="text-xs text-sky-700 mt-1">{t('Aim for 2.5L today — bloating can mask dehydration.', 'Apunta a 2.5L hoy — la hinchazón puede ocultar la deshidratación.')}</p>
                      </div>
                    </div>
                  </div>

                  {/* Cycle History */}
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-slate-900">{t('Cycle History', 'Historial de Ciclos')}</h2>
                      <span className="text-xs font-bold text-bloom-purple bg-bloom-purple-soft px-2 py-1 rounded-md">{t('Avg', 'Promedio')} {profile.cycleLength}d</span>
                    </div>

                    <div className="space-y-6">
                      {history.length > 0 ? (
                        history.map((h, i) => (
                          <HistoryItem 
                            key={i}
                            date={format(parseISO(h.startDate), 'MMM d')} 
                            duration={`${h.duration} ${t('days', 'días')}`} 
                            period={`${h.periodDuration}d ${t('period', 'periodo')}`} 
                          />
                        ))
                      ) : (
                        <>
                          <HistoryItem date={t("Current", "Actual")} status={t("In progress", "En curso")} duration={`${cycleInfo?.dayOfCycle} ${t('days', 'días')}`} active />
                          <p className="text-xs text-slate-400 text-center py-4 italic">{t('Complete your first cycle to see history here.', 'Completa tu primer ciclo para ver el historial aquí.')}</p>
                        </>
                      )}
                    </div>

                    <div className="mt-8 p-4 bg-emerald-50 rounded-2xl flex gap-3">
                      <div className="w-5 h-5 bg-emerald-500 rounded flex items-center justify-center text-white shrink-0">
                        <Heart size={12} fill="currentColor" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-emerald-900">{t('Tracking active', 'Seguimiento activo')}</h4>
                        <p className="text-xs text-emerald-700 mt-1">{t('Consistency helps Gemini give better insights.', 'La consistencia ayuda a Gemini a dar mejores análisis.')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'log' && (
            <motion.div 
              key="log-tab"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8"
            >
              <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('Daily Log', 'Registro Diario')}</h2>
                <p className="text-slate-500 mb-8">{t('Record your symptoms and mood for today.', 'Registra tus síntomas y estado de ánimo para hoy.')}</p>
                <LogForm 
                  uid={profile.uid} 
                  onSave={() => { 
                    setSaveSuccess(true); 
                    setEditingLog(null);
                    setActiveTab('dashboard'); 
                  }} 
                  onCancel={() => setEditingLog(null)}
                  language={profile.language} 
                  initialData={editingLog}
                />
              </div>

              <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                <h2 className="text-2xl font-bold text-slate-900 mb-6">{t('Recent Logs', 'Registros Recientes')}</h2>
                <div className="space-y-4">
                  {logs.length > 0 ? logs.map((log, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 group relative">
                      <div className="absolute top-10 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setEditingLog(log);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="p-2 bg-white rounded-xl shadow-sm text-slate-400 hover:text-bloom-pink"
                        >
                          <Settings size={14} />
                        </button>
                        <button 
                          onClick={() => setLogToDelete(log)}
                          className="p-2 bg-white rounded-xl shadow-sm text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">{format(parseISO(log.date), 'MMMM d, yyyy')}</span>
                          {log.time && <span className="text-[10px] text-slate-400 font-medium">{log.time}</span>}
                        </div>
                        <span className="text-xs font-medium text-bloom-pink bg-bloom-pink-soft px-2 py-1 rounded-lg capitalize">
                          {log.flowIntensity === 'none' ? t('None', 'Ninguno') : 
                           log.flowIntensity === 'spotting' ? t('Spotting', 'Manchado') : 
                           log.flowIntensity === 'light' ? t('Light', 'Ligero') : 
                           log.flowIntensity === 'medium' ? t('Medium', 'Medio') : 
                           t('Heavy', 'Fuerte')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {log.physicalSymptoms.map((s, si) => (
                          <span key={si} className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-100 text-slate-500">{s}</span>
                        ))}
                      </div>
                      {log.notes && <p className="text-xs text-slate-400 italic">"{log.notes}"</p>}
                    </div>
                  )) : (
                    <p className="text-sm text-slate-400 text-center py-12 italic">{t('No logs recorded yet.', 'Aún no hay registros guardados.')}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div 
              key="insights-tab"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-3xl mx-auto space-y-8"
            >
              <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 text-center">
                <div className="flex justify-end items-center gap-3 mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    {t('Reset for a new recommendation', 'reestablecer para una nueva recomendacion')}
                  </span>
                  <button 
                    onClick={resetInsights}
                    disabled={loadingInsights}
                    className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-bloom-purple transition-colors disabled:opacity-50"
                    title={t('Reset Insights', 'Reiniciar Análisis')}
                  >
                    <RotateCcw size={16} className={loadingInsights ? "animate-spin" : ""} />
                  </button>
                </div>
                <div className="w-16 h-16 bg-bloom-purple-soft text-bloom-purple rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Sparkles size={32} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4">{t('AI Cycle Insights', 'Análisis de Ciclo IA')}</h2>
                {loadingInsights ? (
                  <div className="py-12 space-y-4">
                    <div className="w-full h-4 bg-slate-100 rounded-full animate-pulse"></div>
                    <div className="w-3/4 h-4 bg-slate-100 rounded-full animate-pulse mx-auto"></div>
                    <p className="text-sm text-slate-400">{t('Gemini is analyzing your patterns...', 'Gemini está analizando tus patrones...')}</p>
                  </div>
                ) : insights ? (
                  <div className="text-left space-y-8">
                    <div className="bg-bloom-purple-soft p-6 rounded-2xl">
                      <h3 className="font-bold text-bloom-purple mb-2">{t("What's happening now", "Qué está pasando ahora")}</h3>
                      <p className="text-slate-700 leading-relaxed">{insights?.insight}</p>
                    </div>
                    
                    <div>
                      <h3 className="font-bold text-slate-900 mb-4">{t('Personalized Tips', 'Consejos Personalizados')}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {insights?.tips?.map((tip: string, i: number) => (
                          <div key={i} className="p-4 bg-slate-50 rounded-2xl text-sm text-slate-600 border border-slate-100">
                            {tip}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 space-y-6">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                      <AlertCircle size={32} className="text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto">
                      {t('No insights generated for today. Make sure your profile is complete.', 'No se generaron análisis para hoy. Asegúrate de que tu perfil esté completo.')}
                    </p>
                    <button 
                      onClick={resetInsights}
                      className="px-6 py-2 bg-bloom-pink text-white rounded-xl text-sm font-bold shadow-lg shadow-bloom-pink/20 hover:scale-105 transition-transform"
                    >
                      {t('Generate Now', 'Generar Ahora')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'nutrition' && (
            <motion.div 
              key="nutrition-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Daily Diet Plan */}
                <div className="lg:col-span-2 space-y-8">
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-8">
                      <h2 className="text-2xl font-bold text-slate-900">{t('Daily Diet Plan', 'Plan de Dieta Diario')}</h2>
                      <div className="flex items-center gap-4">
                        <span className="hidden sm:block text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                          {t('Reset for a new recommendation', 'reestablecer para una nueva recomendacion')}
                        </span>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={resetDietPlan}
                            disabled={loadingDiet}
                            className="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-bloom-pink transition-colors disabled:opacity-50"
                            title={t('Reset Diet Plan', 'Reiniciar Plan de Dieta')}
                          >
                            <RotateCcw size={16} className={loadingDiet ? "animate-spin" : ""} />
                          </button>
                          <div className="px-4 py-1 bg-bloom-pink-soft text-bloom-pink rounded-full text-xs font-bold uppercase">
                            {cycleInfo?.phase}
                          </div>
                        </div>
                      </div>
                    </div>

                    {loadingDiet ? (
                      <div className="space-y-4 py-8">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-50 rounded-2xl animate-pulse"></div>)}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <MealCard icon={Clock} label={t("Breakfast", "Desayuno")} value={dietPlan?.breakfast} />
                        <MealCard icon={Clock} label={t("Lunch", "Almuerzo")} value={dietPlan?.lunch} />
                        <MealCard icon={Clock} label={t("Dinner", "Cena")} value={dietPlan?.dinner} />
                        <MealCard icon={Clock} label={t("Snacks", "Snacks")} value={dietPlan?.snacks?.join(', ')} />
                      </div>
                    )}
                  </div>

                  {/* Recipe Generator */}
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-3 bg-bloom-purple-soft text-bloom-purple rounded-2xl">
                        <ChefHat size={24} />
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900">{t('Recipe Generator', 'Generador de Recetas')}</h2>
                    </div>
                    <p className="text-sm text-slate-500 mb-6">{t('Enter ingredients you have at home:', 'Ingresa los ingredientes que tienes en casa:')}</p>
                    <div className="flex gap-2 mb-8">
                      <input 
                        type="text" 
                        placeholder={t("e.g., eggs, spinach, avocado", "ej: huevos, espinaca, palta")}
                        className="flex-1 rounded-xl border-slate-100 bg-slate-50 px-4 py-3 text-sm"
                        value={ingredientsInput}
                        onChange={(e) => setIngredientsInput(e.target.value)}
                      />
                      <button 
                        onClick={handleGenerateRecipes}
                        disabled={generatingRecipes || !ingredientsInput}
                        className="bg-bloom-purple text-white px-6 py-3 rounded-xl font-bold text-sm disabled:opacity-50"
                      >
                        {generatingRecipes ? t('Generating...', 'Generando...') : t('Get Recipes', 'Ver Recetas')}
                      </button>
                    </div>

                    {recipeResult && (
                      <div className="space-y-6">
                        {recipeResult.recipes.map((r: any, i: number) => (
                          <div key={i} className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                            <h4 className="font-bold text-slate-900 mb-2">{r.name}</h4>
                            <p className="text-xs text-slate-500 mb-4">{r.ingredients.join(', ')}</p>
                            <p className="text-sm text-slate-600 leading-relaxed">{r.instructions}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sidebar: Calorie Checker & Restrictions */}
                <div className="space-y-8">
                  {/* Calorie Checker */}
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-3 bg-rose-50 text-rose-500 rounded-2xl">
                        <Scale size={24} />
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">{t('Calorie Checker', 'Verificador de Calorías')}</h2>
                    </div>
                    <div className="space-y-4">
                      <textarea 
                        placeholder={t("Describe your meal (e.g., 2 spoons of rice, 1 plate of salad)", "Describe tu comida (ej: 2 cucharas de arroz, 1 plato de ensalada)")}
                        className="w-full rounded-xl border-slate-100 bg-slate-50 px-4 py-3 text-sm h-24 resize-none"
                        value={foodInput}
                        onChange={(e) => setFoodInput(e.target.value)}
                      />
                      <button 
                        onClick={handleCheckCalories}
                        disabled={checkingCal || !foodInput}
                        className="w-full bg-rose-400 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50"
                      >
                        {checkingCal ? t('Checking...', 'Verificando...') : t('Check Now', 'Verificar Ahora')}
                      </button>
                    </div>

                    {calResult && (
                      <div className={cn(
                        "mt-6 p-4 rounded-2xl flex gap-3",
                        calResult.isRecommended ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      )}>
                        {calResult.isRecommended ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                        <div>
                          <h4 className="text-sm font-bold">{calResult.isRecommended ? t('Recommended', 'Recomendado') : t('Not Recommended', 'No Recomendado')}</h4>
                          <p className="text-xs font-bold text-slate-600 mb-1">{t('Est. Calories:', 'Cal. Estimadas:')} {calResult.estimatedCalories}</p>
                          <p className="text-xs mt-1">{calResult.reason}</p>
                          {calResult.alternative && <p className="text-xs mt-2 font-bold italic">{t('Try:', 'Prueba:')} {calResult.alternative}</p>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Restrictions Display */}
                  <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">{t('Dietary Restrictions', 'Restricciones Alimentarias')}</h3>
                    <div className="p-4 bg-slate-50 rounded-2xl text-sm text-slate-600 italic">
                      {profile.dietaryRestrictions || t("No restrictions set. Update in settings.", "Sin restricciones. Actualiza en ajustes.")}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings-tab"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100">
                <h2 className="text-2xl font-bold text-slate-900 mb-8">{t('Settings', 'Ajustes')}</h2>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">{t('Display Name', 'Nombre de Usuario')}</span>
                      <input 
                        type="text" 
                        className="mt-1 block w-full rounded-xl border-slate-100 bg-slate-50 px-4 py-3"
                        value={settingsData.displayName}
                        onChange={(e) => setSettingsData({ ...settingsData, displayName: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">{t('Cycle Length (days)', 'Duración Ciclo (días)')}</span>
                      <input 
                        type="number" 
                        className="mt-1 block w-full rounded-xl border-slate-100 bg-slate-50 px-4 py-3"
                        value={settingsData.cycleLength}
                        onChange={(e) => setSettingsData({ ...settingsData, cycleLength: parseInt(e.target.value) })}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">{t('Period Duration (days)', 'Duración Periodo (días)')}</span>
                      <input 
                        type="number" 
                        className="mt-1 block w-full rounded-xl border-slate-100 bg-slate-50 px-4 py-3"
                        value={settingsData.periodDuration}
                        onChange={(e) => setSettingsData({ ...settingsData, periodDuration: parseInt(e.target.value) })}
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t('Last Period Start Date', 'Fecha Inicio Último Periodo')}</span>
                    <input 
                      type="date" 
                      className="mt-1 block w-full rounded-xl border-slate-100 bg-slate-50 px-4 py-3"
                      value={settingsData.lastPeriodDate}
                      onChange={(e) => setSettingsData({ ...settingsData, lastPeriodDate: e.target.value })}
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{t('Dietary Restrictions / Allergies', 'Restricciones / Alergias')}</span>
                    <textarea 
                      className="mt-1 block w-full rounded-xl border-slate-100 bg-slate-50 px-4 py-3 h-24 resize-none"
                      placeholder={t("e.g., Vegan, Nut allergy, No spicy food", "ej: Vegano, Alergia a nueces, No picante")}
                      value={settingsData.dietaryRestrictions}
                      onChange={(e) => setSettingsData({ ...settingsData, dietaryRestrictions: e.target.value })}
                    />
                  </label>

                  <button 
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-slate-800 transition-all disabled:opacity-50"
                  >
                    {savingSettings ? t('Saving...', 'Guardando...') : t('Save Changes', 'Guardar Cambios')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Nutrition Modal */}
      <AnimatePresence>
        {showNutritionModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNutritionModal(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl"
            >
              <h3 className={cn(
                "text-2xl font-bold mb-6",
                showNutritionModal === 'eat' ? "text-emerald-600" : "text-rose-600"
              )}>
                {showNutritionModal === 'eat' ? t("Recommended Foods", "Alimentos Recomendados") : t("Foods to Limit", "Alimentos a Limitar")}
              </h3>
              <div className="space-y-3">
                {(showNutritionModal === 'eat' ? insights?.nutrition?.eat : insights?.nutrition?.avoid)?.map((item: string, i: number) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-2xl font-medium text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
              <button 
                onClick={() => setShowNutritionModal(null)}
                className="w-full mt-8 py-4 bg-slate-900 text-white font-bold rounded-2xl"
              >
                {t('Close', 'Cerrar')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="relative bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <button onClick={() => setShowProfileModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <ChevronLeft size={24} />
                </button>
                <h3 className="text-xl font-black text-slate-900">{t('Profile', 'Perfil')}</h3>
                <div className="w-10" />
              </div>

                  <div className="flex flex-col items-center mb-10">
                <div className="relative group">
                  <div className="w-32 h-32 bg-bloom-purple rounded-full flex items-center justify-center text-white font-black text-4xl overflow-hidden shadow-xl">
                    {profile.photoURL ? (
                      <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      profile.displayName[0]
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 p-3 bg-white rounded-full shadow-lg text-slate-600 hover:text-bloom-pink transition-colors border border-slate-100 cursor-pointer">
                    <Camera size={20} />
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            handleSaveSettings({ photoURL: reader.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
                <h4 className="mt-6 text-2xl font-black text-slate-900">{profile.displayName}</h4>
                <p className="text-sm text-slate-400">{profile.email}</p>
              </div>

              <div className="space-y-8">
                <div>
                  <h5 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{t('Privacy Settings', 'Configuración de Privacidad')}</h5>
                  <div className="space-y-4">
                    {[
                      { key: 'showCycleHistory', label: t('Show Cycle History', 'Mostrar Historial de Ciclos'), icon: Calendar },
                      { key: 'showNutritionGuide', label: t('Show Nutrition Guide', 'Mostrar Guía Nutricional'), icon: Utensils },
                      { key: 'showMoonCalendar', label: t('Show Moon Calendar', 'Mostrar Calendario Lunar'), icon: Moon },
                      { key: 'showLibidometer', label: t('Show Libidometer', 'Mostrar Libidómetro'), icon: Thermometer },
                    ].map(item => (
                      <div key={item.key} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-xl text-slate-400">
                            <item.icon size={18} />
                          </div>
                          <span className="text-sm font-bold text-slate-700">{item.label}</span>
                        </div>
                        <button 
                          onClick={() => {
                            const current = profile.privacySettings || { showCycleHistory: true, showNutritionGuide: true, showMoonCalendar: true, showLibidometer: true };
                            const updated = { ...current, [item.key]: !current[item.key as keyof typeof current] };
                            handleSaveSettings({ privacySettings: updated });
                          }}
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            (profile.privacySettings?.[item.key as keyof typeof profile.privacySettings] ?? true) ? "text-emerald-500 bg-emerald-50" : "text-slate-300 bg-slate-100"
                          )}
                        >
                          {(profile.privacySettings?.[item.key as keyof typeof profile.privacySettings] ?? true) ? <Eye size={20} /> : <EyeOff size={20} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-3 py-4 text-rose-500 font-black hover:bg-rose-50 rounded-2xl transition-colors"
                  >
                    <LogOut size={20} />
                    {t('Sign Out', 'Cerrar Sesión')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 font-bold"
          >
            <Heart size={18} fill="currentColor" />
            {t('Log saved successfully!', '¡Registro guardado con éxito!')}
            <button onClick={() => setSaveSuccess(false)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {logToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLogToDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 text-center mb-2">{t('Delete Log?', '¿Eliminar Registro?')}</h3>
              <p className="text-sm text-slate-500 text-center mb-8">
                {t('This action cannot be undone. Are you sure you want to delete this log?', 'Esta acción no se puede deshacer. ¿Estás segura de que quieres eliminar este registro?')}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setLogToDelete(null)}
                  className="py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-colors"
                >
                  {t('Cancel', 'Cancelar')}
                </button>
                <button 
                  onClick={handleDeleteLog}
                  className="py-4 bg-rose-500 text-white font-black rounded-2xl shadow-lg shadow-rose-200 hover:bg-rose-600 transition-colors"
                >
                  {t('Delete', 'Eliminar')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const MealCard = ({ icon: Icon, label, value }: any) => (
  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
    <div className="flex items-center gap-2 text-slate-400 mb-2">
      <Icon size={16} />
      <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-sm font-medium text-slate-700">{value || '---'}</p>
  </div>
);

const StatCard = ({ icon: Icon, label, value, subValue, color, badge }: any) => (
  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col h-full">
    <div className="flex justify-between items-start mb-4">
      <div className={cn("p-2 rounded-xl", color)}>
        <Icon size={20} />
      </div>
      {badge && (
        <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 px-2 py-1 rounded-md">
          {badge}
        </span>
      )}
    </div>
    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</span>
    <span className="text-2xl font-black text-slate-900 mb-2">{value}</span>
    <span className="text-[11px] text-slate-400 leading-tight">{subValue}</span>
  </div>
);

const TrendStat = ({ label, sub, desc, color }: any) => (
  <div className={cn("p-4 rounded-2xl text-center", color)}>
    <div className="text-lg font-black">{label}</div>
    <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{sub}</div>
    <div className="text-[10px] mt-1 opacity-60">{desc}</div>
  </div>
);

const HistoryItem = ({ date, status, duration, period, active }: any) => (
  <div className="flex items-center justify-between group cursor-pointer">
    <div className="flex items-center gap-3">
      <div className={cn("w-2 h-2 rounded-full", active ? "bg-bloom-orange animate-pulse" : "bg-rose-300")} />
      <div>
        <div className="text-sm font-bold text-slate-900">{date}</div>
        {status && <div className="text-[10px] font-bold text-bloom-orange uppercase">{status}</div>}
      </div>
    </div>
    <div className="text-right">
      <div className="text-sm font-black text-slate-900">{duration}</div>
      {period && <div className="text-[10px] text-slate-400">{period}</div>}
    </div>
  </div>
);

const LogForm = ({ uid, onSave, onCancel, language, initialData }: { uid: string, onSave?: () => void, onCancel?: () => void, language?: 'en' | 'es', initialData?: DailyLog | null }) => {
  const [flow, setFlow] = useState<FlowIntensity>('none');
  const [energy, setEnergy] = useState(3);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [saving, setSaving] = useState(false);

  const t = (en: string, es: string) => es;

  useEffect(() => {
    if (initialData) {
      setFlow(initialData.flowIntensity);
      setEnergy(initialData.energyLevel);
      setSelectedSymptoms(initialData.physicalSymptoms);
      setSelectedMoods(initialData.moods);
      setNotes(initialData.notes || '');
      setTime(initialData.time || format(new Date(), 'HH:mm'));
    } else {
      setFlow('none');
      setEnergy(3);
      setSelectedSymptoms([]);
      setSelectedMoods([]);
      setNotes('');
      setTime(format(new Date(), 'HH:mm'));
    }
  }, [initialData]);

  const symptoms = [
    t('Cramps', 'Cólicos'), 
    t('Bloating', 'Hinchazón'), 
    t('Headache', 'Dolor de cabeza'), 
    t('Back pain', 'Dolor de espalda'), 
    t('Tender breasts', 'Senos sensibles'), 
    t('Fatigue', 'Fatiga'), 
    t('Nausea', 'Náuseas'), 
    t('Acne', 'Acné')
  ];
  const moods = [
    t('Happy', 'Feliz'), 
    t('Calm', 'Tranquila'), 
    t('Anxious', 'Ansiosa'), 
    t('Irritable', 'Irritable'), 
    t('Sad', 'Triste'), 
    t('Energetic', 'Enérgica'), 
    t('Tired', 'Cansada'), 
    t('Focused', 'Enfocada')
  ];

  const toggleItem = (list: string[], setList: any, item: string) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const date = initialData ? initialData.date : format(new Date(), 'yyyy-MM-dd');
    const logId = initialData?.id || `${date}_${time.replace(':', '-')}_${Date.now()}`;
    
    const log: DailyLog = {
      uid,
      date,
      time,
      flowIntensity: flow,
      physicalSymptoms: selectedSymptoms,
      moods: selectedMoods,
      energyLevel: energy,
      notes,
      createdAt: initialData ? initialData.createdAt : new Date().toISOString()
    };
    
    try {
      await setDoc(doc(db, 'users', uid, 'daily_logs', logId), log);
      onSave?.();
      if (!initialData) {
        // Reset form only if not editing
        setFlow('none');
        setEnergy(3);
        setSelectedSymptoms([]);
        setSelectedMoods([]);
        setNotes('');
        setTime(format(new Date(), 'HH:mm'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {initialData && (
        <div className="p-4 bg-bloom-pink-soft rounded-2xl flex items-center justify-between border border-bloom-pink/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl text-bloom-pink">
              <Plus className="rotate-45" size={18} />
            </div>
            <div>
              <div className="text-xs font-black text-bloom-pink uppercase tracking-widest">Modo Edición</div>
              <div className="text-[10px] text-bloom-pink/70 font-bold">
                Editando registro del {initialData.date} {initialData.time ? `a las ${initialData.time}` : ''}
              </div>
            </div>
          </div>
          <button 
            onClick={onCancel}
            className="px-4 py-2 bg-white text-bloom-pink text-[10px] font-black uppercase rounded-xl shadow-sm hover:shadow-md transition-all"
          >
            Cancelar
          </button>
        </div>
      )}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{t('Time', 'Hora')}</h3>
        <input 
          type="time" 
          className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-bloom-pink/20"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>

      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{t('Flow Intensity', 'Intensidad del Flujo')}</h3>
        <div className="grid grid-cols-5 gap-3">
          {(['none', 'spotting', 'light', 'medium', 'heavy'] as FlowIntensity[]).map(f => (
            <button
              key={f}
              onClick={() => setFlow(f)}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                flow === f ? "border-bloom-pink bg-bloom-pink-soft text-bloom-pink" : "border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200"
              )}
            >
              <div className={cn("w-2 h-2 rounded-full", flow === f ? "bg-bloom-pink" : "bg-slate-300")} />
              <span className="text-[10px] font-bold capitalize">
                {f === 'none' ? t('None', 'Ninguno') : 
                 f === 'spotting' ? t('Spotting', 'Manchado') : 
                 f === 'light' ? t('Light', 'Ligero') : 
                 f === 'medium' ? t('Medium', 'Medio') : 
                 t('Heavy', 'Fuerte')}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{t('Physical Symptoms', 'Síntomas Físicos')}</h3>
        <div className="flex flex-wrap gap-2">
          {symptoms.map(s => (
            <button
              key={s}
              onClick={() => toggleItem(selectedSymptoms, setSelectedSymptoms, s)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                selectedSymptoms.includes(s) ? "bg-rose-400 text-white shadow-md shadow-rose-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{t('Mood & Emotions', 'Estado de Ánimo')}</h3>
        <div className="flex flex-wrap gap-2">
          {moods.map(m => (
            <button
              key={m}
              onClick={() => toggleItem(selectedMoods, setSelectedMoods, m)}
              className={cn(
                "px-4 py-2 rounded-full text-xs font-bold transition-all",
                selectedMoods.includes(m) ? "bg-bloom-purple text-white shadow-md shadow-bloom-purple/20" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">{t('Energy Level', 'Nivel de Energía')} — <span className="text-bloom-purple">{energy === 1 ? t('Low', 'Bajo') : energy === 5 ? t('High', 'Alto') : t('Medium', 'Medio')}</span></h3>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map(v => (
            <button
              key={v}
              onClick={() => setEnergy(v)}
              className={cn(
                "py-3 rounded-xl font-black text-sm transition-all",
                energy === v ? "bg-bloom-purple text-white shadow-lg shadow-bloom-purple/30" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{t('Notes (Optional)', 'Notas (Opcional)')}</h3>
        <textarea
          placeholder={t("How are you feeling today? Any other observations...", "¿Cómo te sientes hoy? Otras observaciones...")}
          className="w-full h-24 bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-bloom-pink/20 resize-none"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button 
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-bloom-pink text-white font-black py-4 rounded-2xl shadow-xl shadow-bloom-pink/30 hover:bg-bloom-pink/90 transition-all active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? t('Saving...', 'Guardando...') : t('Save Today\'s Log', 'Guardar Registro')}
      </button>
    </div>
  );
};

const mockChartData = [
  { name: 'Day 1', value: 2 },
  { name: 'Day 5', value: 3 },
  { name: 'Day 10', value: 2 },
  { name: 'Day 16', value: 1 },
  { name: 'Day 20', value: 2 },
  { name: 'Day 22', value: 3 },
];
