import React, { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';

/** Whether the browser currently thinks it has a network. */
export function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}

/**
 * A single line at the top of the app while there is no signal.
 *
 * Campus wifi drops constantly, and everything the student writes is cached
 * locally and synced later anyway. Without this the app looks broken, or worse,
 * looks fine and quietly shows yesterday's deadlines. One honest line is enough.
 */
export default function OfflineBar() {
  const online = useOnline();
  if (online) return null;

  return (
    <div className="offline-bar" role="status">
      <CloudOff size={14} aria-hidden="true" />
      <span>Offline. You can still read everything, and changes save when you reconnect.</span>
    </div>
  );
}
