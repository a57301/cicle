import { 
  addDays, 
  differenceInDays, 
  format, 
  isAfter, 
  isBefore, 
  parseISO, 
  startOfDay,
  subDays
} from 'date-fns';
import { CycleInfo, CyclePhase } from '../types';

export function calculateCycleInfo(
  lastPeriodDateStr: string, 
  avgCycleLength: number, 
  avgPeriodDuration: number
): CycleInfo {
  const today = startOfDay(new Date());
  const lastPeriodDate = startOfDay(parseISO(lastPeriodDateStr));
  
  // Calculate days since last period started
  let daysSinceStart = differenceInDays(today, lastPeriodDate);
  
  // If today is before lastPeriodDate (shouldn't happen with valid data but for safety)
  if (daysSinceStart < 0) daysSinceStart = 0;

  // Day of cycle (1-indexed)
  const dayOfCycle = (daysSinceStart % avgCycleLength) + 1;
  
  // Current cycle start date
  const currentCycleStart = addDays(lastPeriodDate, Math.floor(daysSinceStart / avgCycleLength) * avgCycleLength);
  
  // Next period date
  const nextPeriodDate = addDays(currentCycleStart, avgCycleLength);
  const daysUntilNextPeriod = differenceInDays(nextPeriodDate, today);

  // Determine Phase
  let phase: CyclePhase = 'follicular';
  
  if (dayOfCycle <= avgPeriodDuration) {
    phase = 'menstrual';
  } else if (dayOfCycle <= 14) { // Simplified: Ovulation usually around day 14
    phase = 'follicular';
  } else if (dayOfCycle <= 16) {
    phase = 'ovulatory';
  } else {
    phase = 'luteal';
  }

  // Fertile Window (approximate: 5 days before ovulation to 1 day after)
  // Assuming ovulation is at cycleLength - 14
  const ovulationDay = avgCycleLength - 14;
  const fertileStart = addDays(currentCycleStart, ovulationDay - 5);
  const fertileEnd = addDays(currentCycleStart, ovulationDay + 1);
  
  const isOpen = (isAfter(today, fertileStart) || today.getTime() === fertileStart.getTime()) && 
                 (isBefore(today, fertileEnd) || today.getTime() === fertileEnd.getTime());

  // Moon Phase Calculation (Simplified)
  // New Moon on Jan 11, 2024
  const knownNewMoon = new Date(2024, 0, 11);
  const synodicMonth = 29.53058867;
  const daysSinceNewMoon = differenceInDays(today, knownNewMoon);
  const moonAge = daysSinceNewMoon % synodicMonth;
  
  let moonName = "New Moon";
  let moonIcon = "🌑";
  
  if (moonAge < 1.84) { moonName = "New Moon"; moonIcon = "🌑"; }
  else if (moonAge < 5.53) { moonName = "Waxing Crescent"; moonIcon = "🌒"; }
  else if (moonAge < 9.22) { moonName = "First Quarter"; moonIcon = "🌓"; }
  else if (moonAge < 12.91) { moonName = "Waxing Gibbous"; moonIcon = "🌔"; }
  else if (moonAge < 16.61) { moonName = "Full Moon"; moonIcon = "🌕"; }
  else if (moonAge < 20.30) { moonName = "Waning Gibbous"; moonIcon = "🌖"; }
  else if (moonAge < 23.99) { moonName = "Last Quarter"; moonIcon = "🌗"; }
  else if (moonAge < 27.68) { moonName = "Waning Crescent"; moonIcon = "🌘"; }
  else { moonName = "New Moon"; moonIcon = "🌑"; }

  const illumination = Math.abs(50 - (moonAge / synodicMonth) * 100) * 2; // Very rough approximation

  return {
    phase,
    dayOfCycle,
    daysUntilNextPeriod,
    nextPeriodDate: format(nextPeriodDate, 'yyyy-MM-dd'),
    fertileWindow: {
      start: format(fertileStart, 'yyyy-MM-dd'),
      end: format(fertileEnd, 'yyyy-MM-dd'),
      isOpen
    },
    moonPhase: getMoonPhaseData(today)
  };
}

export function getMoonPhaseData(date: Date) {
  const knownNewMoon = new Date(2024, 0, 11);
  const synodicMonth = 29.53058867;
  const daysSinceNewMoon = differenceInDays(date, knownNewMoon);
  const moonAge = daysSinceNewMoon % synodicMonth;
  
  let nameEn = "New Moon";
  let nameEs = "Luna Nueva";
  let icon = "🌑";
  
  if (moonAge < 1.84) { nameEn = "New Moon"; nameEs = "Luna Nueva"; icon = "🌑"; }
  else if (moonAge < 5.53) { nameEn = "Waxing Crescent"; nameEs = "Luna Creciente"; icon = "🌒"; }
  else if (moonAge < 9.22) { nameEn = "First Quarter"; nameEs = "Cuarto Creciente"; icon = "🌓"; }
  else if (moonAge < 12.91) { nameEn = "Waxing Gibbous"; nameEs = "Gibosa Creciente"; icon = "🌔"; }
  else if (moonAge < 16.61) { nameEn = "Full Moon"; nameEs = "Luna Llena"; icon = "🌕"; }
  else if (moonAge < 20.30) { nameEn = "Waning Gibbous"; nameEs = "Gibosa Menguante"; icon = "🌖"; }
  else if (moonAge < 23.99) { nameEn = "Last Quarter"; nameEs = "Cuarto Menguante"; icon = "🌗"; }
  else if (moonAge < 27.68) { nameEn = "Waning Crescent"; nameEs = "Luna Menguante"; icon = "🌘"; }
  else { nameEn = "New Moon"; nameEs = "Luna Nueva"; icon = "🌑"; }

  const illumination = Math.abs(50 - (moonAge / synodicMonth) * 100) * 2;

  return {
    nameEn,
    nameEs,
    icon,
    illumination: Math.round(illumination)
  };
}

export const MOON_CYCLE_ALIGNMENT = {
  menstrual: {
    moon: "Luna Nueva",
    desc: "Fase de descanso, introspección y renovación."
  },
  follicular: {
    moon: "Luna Creciente",
    desc: "Energía, creatividad y aumento de estrógenos."
  },
  ovulatory: {
    moon: "Luna Llena",
    desc: "Punto máximo de energía, fertilidad y sociabilidad."
  },
  luteal: {
    moon: "Luna Menguante",
    desc: "Reflexión, evaluación y preparación para el descanso."
  }
};

export const PHASE_COLORS = {
  menstrual: 'bg-rose-400',
  follicular: 'bg-emerald-400',
  ovulatory: 'bg-sky-400',
  luteal: 'bg-orange-400'
};

export const PHASE_LABELS = {
  menstrual: 'Fase Menstrual',
  follicular: 'Fase Folicular',
  ovulatory: 'Fase Ovulatoria',
  luteal: 'Fase Lútea'
};
