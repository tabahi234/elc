/**
 * Firestore resolves a write promise only once the server acknowledges it, so
 * with no signal the promise simply never settles, and a Save button awaiting
 * it sits on "Saving…" forever. The change is already in the local cache (and
 * on screen) the moment the call is made, and it syncs by itself on reconnect,
 * so after a short wait it is safe to call it saved.
 *
 * Resolves `{ queued: false }` once the server confirms, or `{ queued: true }`
 * if it has not answered in time. Rejects only if the server refuses the write
 * before then; a refusal that arrives later is logged rather than thrown into
 * a screen that has already moved on.
 */
export function settle(promise, ms = typeof navigator !== 'undefined' && navigator.onLine === false ? 300 : 4000) {
  let timer;
  let timedOut = false;
  const queued = new Promise((resolve) => {
    timer = setTimeout(() => { timedOut = true; resolve({ queued: true }); }, ms);
  });
  const acked = promise.then(
    () => ({ queued: false }),
    (error) => {
      if (!timedOut) throw error;
      console.error('A queued write was refused by the server:', error);
      return { queued: true };
    },
  );
  return Promise.race([acked, queued]).finally(() => clearTimeout(timer));
}
