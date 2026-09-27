import { useEffect, useMemo } from 'react';
import { daysFromToday, todayIso } from './validate';
import { ATTENDANCE_MIN, attendanceStats } from './progress';

/**
 * Turns the app's state into a ranked list of things the student has to act
 * on. One place, so the dashboard banner, the nav badge and the browser
 * notification can never disagree about what is urgent.
 */

const SEVERITY = { critical: 0, warning: 1, info: 2 };

/** Slots whose room was changed and where the notice has not expired yet. */
export function roomChanges(timetable) {
  const today = todayIso();
  return timetable.filter((s) => s.changeNote && (!s.changeUntil || s.changeUntil >= today));
}

export function buildAlerts({ tasks = [], subjects = {}, marks = {}, sessions = [], weeklySessions = {}, semesterWeeks = 16, timetable = [] }) {
  const alerts = [];
  const pending = tasks.filter((t) => !t.completed && t.dueDate);

  const overdue = pending.filter((t) => daysFromToday(t.dueDate) < 0);
  if (overdue.length) {
    alerts.push({
      id: 'overdue',
      severity: 'critical',
      to: '/tasks',
      title: `${overdue.length} overdue ${overdue.length === 1 ? 'deadline' : 'deadlines'}`,
      detail: overdue.slice(0, 3).map((t) => t.title).join(' · '),
    });
  }

  const dueToday = pending.filter((t) => daysFromToday(t.dueDate) === 0);
  if (dueToday.length) {
    alerts.push({
      id: 'due-today',
      severity: 'critical',
      to: '/tasks',
      title: `${dueToday.length} due today`,
      detail: dueToday.map((t) => `${subjects[t.subject]?.short || t.subject}: ${t.title}`).join(' · '),
    });
  }

  const dueTomorrow = pending.filter((t) => daysFromToday(t.dueDate) === 1);
  if (dueTomorrow.length) {
    alerts.push({
      id: 'due-tomorrow',
      severity: 'warning',
      to: '/tasks',
      title: `${dueTomorrow.length} due tomorrow`,
      detail: dueTomorrow.map((t) => `${subjects[t.subject]?.short || t.subject}: ${t.title}`).join(' · '),
    });
  }

  // Quizzes and sessionals get their own heads-up, because unlike an
  // assignment you cannot hand one in late.
  const exams = pending.filter((t) => ['Quiz', 'Sessional', 'Final'].includes(t.type));
  const examSoon = exams.filter((t) => { const d = daysFromToday(t.dueDate); return d >= 2 && d <= 5; });
  for (const t of examSoon) {
    alerts.push({
      id: `exam-${t.id}`,
      severity: 'warning',
      to: '/tasks',
      title: `${t.type}: ${subjects[t.subject]?.short || t.subject} in ${daysFromToday(t.dueDate)} days`,
      detail: t.title,
    });
  }

  for (const code of Object.keys(subjects)) {
    const stats = attendanceStats(marks, sessions, code, weeklySessions, semesterWeeks);
    // Nothing to say until the student has actually answered for a class.
    if (!stats.answered) continue;
    const name = subjects[code]?.short || code;
    if (stats.pct < ATTENDANCE_MIN) {
      alerts.push({
        id: `att-${code}`,
        severity: 'critical',
        to: '/grades',
        title: `${name} attendance is ${Math.round(stats.pct)}%`,
        detail: `${stats.present} of ${stats.answered} attended. Below the ${ATTENDANCE_MIN}% needed to sit the final.`,
      });
    } else if (stats.skipsLeft <= 1) {
      alerts.push({
        id: `att-${code}`,
        severity: 'warning',
        to: '/grades',
        title: `${name}: ${stats.skipsLeft > 0 ? '1 safe skip left' : 'no safe skips left'}`,
        detail: `${Math.round(stats.pct)}% attended so far.`,
      });
    }
  }

  for (const slot of roomChanges(timetable)) {
    alerts.push({
      id: `room-${slot.id}`,
      severity: 'info',
      to: '/timetable',
      title: `${subjects[slot.code]?.short || slot.code} moved to ${slot.room}`,
      detail: slot.changeNote,
    });
  }

  return alerts.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]);
}

export const alertTone = (severity) =>
  severity === 'critical' ? 'danger' : severity === 'warning' ? 'warning' : 'accent';

/* ── browser notifications ──────────────────────────────────────────────────
   Opt-in only, and at most one a day. A study app that pings constantly gets
   its permission revoked within a week.
*/
const LAST_NOTIFIED_KEY = 'unihelper:lastDeadlineNotice';

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  try { return await Notification.requestPermission(); }
  catch { return 'denied'; }
}

const readStore = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeStore = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

/**
 * Fires one summary notification per day when something is due today or
 * tomorrow. Runs on load rather than on a timer. A web page cannot reliably
 * wake itself up, and pretending otherwise would mean silently missed alerts.
 */
export function useDeadlineNotifications(tasks, subjects) {
  const summary = useMemo(() => {
    const pending = tasks.filter((t) => !t.completed && t.dueDate);
    const urgent = pending.filter((t) => {
      const d = daysFromToday(t.dueDate);
      return d !== null && d <= 1;
    });
    if (!urgent.length) return null;
    const lines = urgent.slice(0, 4).map((t) => {
      const d = daysFromToday(t.dueDate);
      const when = d < 0 ? 'overdue' : d === 0 ? 'today' : 'tomorrow';
      return `${subjects[t.subject]?.short || t.subject}: ${t.title} (${when})`;
    });
    if (urgent.length > 4) lines.push(`+${urgent.length - 4} more`);
    return { count: urgent.length, body: lines.join('\n') };
  }, [tasks, subjects]);

  useEffect(() => {
    if (!summary) return;
    if (notificationPermission() !== 'granted') return;
    const today = todayIso();
    if (readStore(LAST_NOTIFIED_KEY) === today) return;
    writeStore(LAST_NOTIFIED_KEY, today);
    try {
      new Notification(`${summary.count} deadline${summary.count === 1 ? '' : 's'} need you today`, {
        body: summary.body,
        tag: 'unihelper-deadlines',
        icon: '/pwa-192x192.png',
      });
    } catch { /* some browsers only allow this from a service worker */ }
  }, [summary]);

  return summary;
}
