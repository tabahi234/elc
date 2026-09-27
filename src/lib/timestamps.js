// Support both historical ISO strings and server-issued Firestore timestamps.
export function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return typeof value === 'string' ? Date.parse(value) || 0 : 0;
}
