import { useUserDoc } from './storage';
import { startOfWeek, isAfter, format } from 'date-fns';

export function useStudyLog() {
  return useUserDoc('studylog', []); // [{ subject, minutes, at }]
}

export function weekMinutes(log) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const totals = {};
  let all = 0;
  for (const s of log) {
    if (!isAfter(new Date(s.at), weekStart)) continue;
    totals[s.subject] = (totals[s.subject] || 0) + s.minutes;
    all += s.minutes;
  }
  return { totals, all };
}

export function streakDays(log) {
  const days = new Set(log.map(s => s.at.slice(0, 10)));
  let streak = 0;
  const d = new Date();
  // today counts if studied, otherwise start from yesterday
  if (!days.has(format(d, 'yyyy-MM-dd'))) d.setDate(d.getDate() - 1);
  while (days.has(format(d, 'yyyy-MM-dd'))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
