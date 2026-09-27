import { format } from 'date-fns';
import { describeChange } from './schedule';

/**
 * Getting something out of this app and into wherever the class actually
 * talks, which is a WhatsApp group.
 *
 * A CR who has just typed a deadline in here should not have to retype it
 * there. `navigator.share` opens the phone's real share sheet, so it lands in
 * the group as text; on a desktop browser there is no share sheet, so it goes
 * to the clipboard instead and the caller says so.
 */

export const shareSupported = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * @returns 'shared' | 'copied' | 'cancelled' | 'failed'
 */
export async function shareText(text) {
  if (shareSupported()) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      // Backing out of the share sheet is not a failure and must not toast.
      if (error?.name === 'AbortError') return 'cancelled';
      // Some browsers advertise share and then refuse it: no target app, an
      // insecure context, or a permissions policy. Fall through to the
      // clipboard rather than telling the person it cannot be done.
      console.error('Share failed, falling back to clipboard:', error);
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (error) {
    console.error('Clipboard write failed:', error);
    return 'failed';
  }
}

const prettyDate = (iso) => format(new Date(`${iso}T00:00:00`), 'EEEE d MMMM');
const prettyTime = (hhmm) => format(new Date(`2000-01-01T${hhmm}`), 'h:mm a');

/**
 * Plain text, no markdown and no emoji. WhatsApp renders neither the way the
 * sender expects, and a deadline is not the place to find that out.
 */
export function deadlineShareText(task, subjects = {}) {
  const subject = subjects[task.subject];
  const lines = [
    task.title,
    `${subject?.short || task.subject} (${task.subject}) · ${task.type}`,
    task.dueDate
      ? `Due ${prettyDate(task.dueDate)}${task.dueTime ? `, ${prettyTime(task.dueTime)}` : ''}`
      : 'Due date not announced yet',
  ];
  if (task.note) lines.push('', task.note);
  return lines.join('\n');
}

export function announcementShareText(announcement) {
  const lines = [announcement.title];
  if (announcement.body) lines.push('', announcement.body);
  if (announcement.until) lines.push('', `Applies until ${prettyDate(announcement.until)}.`);
  return lines.join('\n');
}

export function changeShareText(change, subjects = {}, timetable = []) {
  const { headline, detail } = describeChange(change, subjects, timetable);
  const lines = [headline];
  if (detail) lines.push(detail);
  if (change.note) lines.push('', change.note);
  return lines.join('\n');
}
