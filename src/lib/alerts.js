import { useEffect, useMemo } from 'react';
import { daysFromToday, todayIso } from './validate';
import { describeChange } from './schedule';

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

export function buildAlerts({ tasks = [], subjects = {}, timetable = [], changes = [] }) {
  const alerts = [];
  // A deadline with no announced date cannot be urgent yet, so it is left out
  // of everything here rather than treated as due today.
  const pending = tasks.filter((t) => !t.completed && t.dueDate);
  const label = (t) => `${subjects[t.subject]?.short || t.subject}: ${t.title}`;

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
      detail: dueToday.map(label).join(' · '),
    });
  }

  const dueTomorrow = pending.filter((t) => daysFromToday(t.dueDate) === 1);
  if (dueTomorrow.length) {
    alerts.push({
      id: 'due-tomorrow',
      severity: 'warning',
      to: '/tasks',
      title: `${dueTomorrow.length} due tomorrow`,
      detail: dueTomorrow.map(label).join(' · '),
    });
  }

  // Quizzes and sessionals get their own heads-up, because unlike an
  // assignment you cannot hand one in late.
  const examSoon = pending.filter((t) => {
    if (!['Quiz', 'Sessional', 'Final'].includes(t.type)) return false;
    const d = daysFromToday(t.dueDate);
    return d >= 2 && d <= 5;
  });
  for (const t of examSoon) {
    alerts.push({
      id: `exam-${t.id}`,
      severity: 'warning',
      to: '/tasks',
      title: `${t.type}: ${subjects[t.subject]?.short || t.subject} in ${daysFromToday(t.dueDate)} days`,
      detail: t.title,
    });
  }

  // A class called off today or tomorrow is the single most useful thing this
  // panel can say: it is the difference between staying home and commuting in
  // for nothing. It outranks a standing room-change note, which is why it is
  // built first.
  for (const change of changes) {
    const away = daysFromToday(change.date);
    if (away == null || away < 0 || away > 1) continue;
    const { headline, detail } = describeChange(change, subjects, timetable);
    alerts.push({
      id: `change-${change.id}`,
      severity: change.status === 'cancelled' && away === 0 ? 'critical' : 'warning',
      to: '/timetable',
      title: headline,
      detail: change.note || detail,
    });
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
    const urgent = tasks.filter((t) => {
      if (t.completed || !t.dueDate) return false;
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
        icon: '/icon-192.png',
      });
    } catch { /* some browsers only allow this from a service worker */ }
  }, [summary]);

  return summary;
}
