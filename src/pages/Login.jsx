import React, { useState } from 'react';
import { GraduationCap, AlertCircle } from 'lucide-react';
import { useAuth } from '../lib/authContext';

const FRIENDLY = {
  'auth/configuration-not-found': 'Google sign-in is not enabled yet. Firebase console → Authentication → Sign-in method → enable Google.',
  'auth/unauthorized-domain': 'This domain is not authorised. Firebase console → Authentication → Settings → Authorized domains.',
  'auth/network-request-failed': 'No internet connection.',
  'auth/popup-blocked': 'Your browser blocked the popup. Allow popups for this site from the address bar, then try again.',
  'auth/timeout': 'Google never answered. Close any leftover Google window, reload the page and try again.',
};

export default function Login() {
  const { signIn } = useAuth();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    setError(null);
    try { await signIn(); }
    catch (err) { setError(FRIENDLY[err.code] || err.message); }
    setBusy(false);
  };

  return (
    <div className="auth">
      <div className="card auth-card animate-in">
        <div className="auth-mark"><GraduationCap size={28} aria-hidden="true" /></div>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>UniHelper</h1>
        <p className="muted small" style={{ margin: 'var(--s2) 0 var(--s5)' }}>
          Your timetable, deadlines, grades and attendance, synced across every device
          and shared with your class.
        </p>

        <button className="btn btn-primary btn-block" onClick={go} disabled={busy}>
          <GoogleLogo /> {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>

        {error && (
          <p className="field-error" style={{ marginTop: 'var(--s4)', textAlign: 'left' }} role="alert">
            <AlertCircle size={14} aria-hidden="true" />{error}
          </p>
        )}

        <p className="field-hint" style={{ marginTop: 'var(--s5)' }}>
          Your grades, attendance and study log are private to your account.
          Nobody else can read them, not even the class representative.
        </p>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41 35.4 44 30.2 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}
