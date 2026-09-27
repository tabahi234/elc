/**
 * Every failure the app can hit, translated into something a student can act on.
 *
 * The rule here: never show a student a Firebase error code, a rule name, a
 * file path or a console instruction. Those are for whoever runs the app, and
 * they already have the browser console. A student reading "permission-denied
 * at /globalTasks" learns nothing and assumes they broke something.
 *
 * So the raw error still goes to console.error for the developer, and the
 * person gets one plain sentence that says what happened and what to do.
 */

const BY_CODE = {
  'permission-denied':   'That change was not allowed. Refresh the page and try again.',
  'unauthenticated':     'You have been signed out. Sign in again to carry on.',
  unavailable:           'No connection right now. Your change is saved on this device and will sync by itself.',
  'deadline-exceeded':   'The connection is too slow to finish that. Try again in a moment.',
  'not-found':           'That is not there any more. Somebody may have removed it.',
  'already-exists':      'That already exists.',
  'resource-exhausted':  'Too many changes at once. Wait a few seconds, then try again.',
  cancelled:             'That was cancelled before it finished. Try again.',
  aborted:               'Something else changed at the same time. Try again.',
  'failed-precondition': 'That cannot be done right now. Reload the page and try again.',
  internal:              'The server had a problem. Try again in a minute.',
};

/** True when the real cause is "this device has no working connection". */
export function looksOffline(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = error?.code;
  return code === 'unavailable' || code === 'auth/network-request-failed';
}

/**
 * One sentence, safe to put in front of anyone.
 *
 * @param error     whatever was thrown or rejected
 * @param fallback  what to say when the cause is not one we recognise
 */
export function friendlyError(error, fallback = 'That did not work. Try again in a moment.') {
  if (!error) return fallback;
  // The real thing stays where a developer can find it, and only there.
  console.error('Handled error:', error);
  if (looksOffline(error)) return BY_CODE.unavailable;
  return BY_CODE[error.code] ?? fallback;
}
