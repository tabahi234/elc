import { todayIso } from './validate';
import { timestampMillis } from './timestamps';

/**
 * Notices from the CR that are not deadlines: bring a calculator, the lab
 * report format changed, Monday's class is in the other block.
 *
 * Each one carries its own expiry date. That is the whole trick: a notice
 * board nobody clears turns into wallpaper within a fortnight, and then the
 * one that matters gets read as wallpaper too.
 */

/** Still worth showing today. No expiry date means it stays until removed. */
export const isLive = (announcement) =>
  !announcement.until || announcement.until >= todayIso();

/** Live notices, newest first. */
export function liveAnnouncements(announcements = []) {
  return announcements
    .filter(isLive)
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
}
