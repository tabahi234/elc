import { useEffect, useMemo } from 'react';
import { daysFromToday, todayIso, isEventType } from './validate';
import { describeChange } from './schedule';
import { upcomingExams } from './exams';

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

export function buildAlerts({ tasks = [], subjects = {}, timetable = [], changes = [], exams = [] }) {
  const alerts = [];
  // A deadline with no announced date cannot be urgent yet, so it is left out
  // of everything here rather than treated as due today.
  const pending = tasks.filter((t) => !t.completed && t.dueDate);
  // Exams are handled separately below. "3 deadlines due today", counting a
  // quiz somebody is about to walk into, is the wrong sentence about the wrong
  // thing, and the one part of it nobody can act on.
  const due = pending.filter((t) => !isEventType(t.type));
  const label = (t) => `${subjects[t.subject]?.short || t.subject}: ${t.title}`;

  const overdue = due.filter((t) => daysFromToday(t.dueDate) < 0);
  if (overdue.length) {
    alerts.push({
      id: 'overdue',
      severity: 'critical',
      to: '/tasks',
      title: `${overdue.length} overdue ${overdue.length === 1 ? 'deadline' : 'deadlines'}`,
      detail: overdue.slice(0, 3).map((t) => t.title).join(' · '),
    });
  }

  const dueToday = due.filter((t) => daysFromToday(t.dueDate) === 0);
  if (dueToday.length) {
    alerts.push({
      id: 'due-today',
      severity: 'critical',
      to: '/tasks',
      title: `${dueToday.length} due today`,
      detail: dueToday.map(label).join(' · '),
    });
  }

  const dueTomorrow = due.filter((t) => daysFromToday(t.dueDate) === 1);
  if (dueTomorrow.length) {
    alerts.push({
      id: 'due-tomorrow',
      severity: 'warning',
      to: '/tasks',
      title: `${dueTomorrow.length} due tomorrow`,
      detail: dueTomorrow.map(label).join(' · '),
    });
  }

  // Anything sat rather than handed in gets its own line and a longer horizon
  // than a deadline, because you cannot do one late and revising for one
  // starts well before the night before.
  for (const t of pending.filter((x) => isEventType(x.type))) {
    const d = daysFromToday(t.dueDate);
    if (d < 0 || d > 7) continue;
    alerts.push({
      id: `exam-${t.id}`,
      severity: d <= 1 ? 'critical' : 'warning',
      to: '/tasks',
      title: `${t.type}: ${subjects[t.subject]?.short || t.subject} ${whenText(d)}`,
      detail: t.title,
    });
  }

  // The published exam schedule is a different thing again: a room and a seat
  // at a fixed hour, so this alert carries where to go rather than what to do.
  for (const exam of upcomingExams(exams, 7)) {
    const d = daysFromToday(exam.date);
    alerts.push({
      id: `sitting-${exam.id}`,
      severity: d <= 1 ? 'critical' : 'warning',
      to: '/timetable',
      title: `${exam.kind}: ${subjects[exam.code]?.short || exam.code} ${whenText(d)}`,
      detail: `${exam.start} · ${exam.room}${exam.seat ? `, seat ${exam.seat}` : ''}`,
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

/** "today", "tomorrow", "in 4 days" — phrased the same way everywhere. */
const whenText = (days) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

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
const removeStore = (key) => { try { localStorage.removeItem(key); } catch { /* private mode */ } };

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
      // An exam is never "overdue", so the one word that would be wrong about
      // it is the one this has to avoid.
      const timing = isEventType(t.type)
        ? (d === 0 ? 'today' : 'tomorrow')
        : (d < 0 ? 'overdue' : d === 0 ? 'today' : 'tomorrow');
      return `${subjects[t.subject]?.short || t.subject}: ${t.title} (${timing})`;
    });
    if (urgent.length > 4) lines.push(`+${urgent.length - 4} more`);
    return { count: urgent.length, body: lines.join('\n') };
  }, [tasks, subjects]);

  useEffect(() => {
    if (!summary) return;
    if (notificationPermission() !== 'granted') return;
    const today = todayIso();
    if (readStore(LAST_NOTIFIED_KEY) === today) return;
    // Claimed before the async call so a second render cannot send a duplicate,
    // and handed back if nothing was shown, so a failure is not a lost day.
    writeStore(LAST_NOTIFIED_KEY, today);
    showNotification(`${summary.count} thing${summary.count === 1 ? '' : 's'} need you today`, {
      body: summary.body,
      tag: 'unihelper-deadlines',
      icon: '/icon-192.png',
    }).then((shown) => { if (!shown) removeStore(LAST_NOTIFIED_KEY); });
  }, [summary]);

  return summary;
}

/**
 * Android Chrome, and an iPhone home-screen app, refuse `new Notification()`
 * outright: a page there may only notify through its service worker. The old
 * code tried the constructor alone, swallowed the error, and had already marked
 * the day as notified, so the installed app never showed a single alert.
 */
async function showNotification(title, options) {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
  } catch (error) {
    console.error('Service worker notification failed:', error);
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
