export type FlowIntensity = 'none' | 'spotting' | 'light' | 'medium' | 'heavy';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  cycleLength: number;
  periodDuration: number;
  lastPeriodDate: string;
  onboardingComplete: boolean;
  createdAt: string;
  language?: 'en' | 'es';
  dietaryRestrictions?: string;
  privacySettings?: {
    showCycleHistory: boolean;
    showNutritionGuide: boolean;
    showMoonCalendar: boolean;
    showLibidometer: boolean;
  };
}

export interface DailyLog {
  id?: string;
  uid: string;
  date: string;
  time?: string;
  flowIntensity: FlowIntensity;
  physicalSymptoms: string[];
  moods: string[];
  energyLevel: number;
  notes?: string;
  createdAt: string;
}

export interface CycleHistory {
  uid: string;
  startDate: string;
  endDate: string;
  duration: number;
  periodDuration: number;
}

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export interface CycleInfo {
  phase: CyclePhase;
  dayOfCycle: number;
  daysUntilNextPeriod: number;
  nextPeriodDate: string;
  fertileWindow: {
    start: string;
    end: string;
    isOpen: boolean;
  };
  moonPhase: {
    nameEn: string;
    nameEs: string;
    icon: string;
    illumination: number;
  };
}
