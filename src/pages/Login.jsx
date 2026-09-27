import React, { useState } from 'react';
import { GraduationCap, AlertCircle } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { CONSENT_VERSION, LAST_UPDATED, PRIVACY, TERMS } from '../lib/legal';
import { LegalSheet } from '../components/Consent';

/**
 * Sign-in failures split into two kinds, and they need different words.
 *
 * Some are the student's to fix: no signal, a blocked popup, a stalled Google
 * window. Those get an instruction they can follow. The rest are setup
 * mistakes in the Firebase project, which a student can do exactly nothing
 * about; they get told to go to the person who runs the app, and the detail
 * goes to the console for whoever that is.
 */
const YOURS_TO_FIX = {
  'auth/network-request-failed': 'No internet connection. Reconnect and try again.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow popups for this site from the address bar, then try again.',
  'auth/timeout': 'Google never answered. Close any leftover Google window, reload the page and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute, then try again.',
  'auth/user-disabled': 'This account has been turned off. Ask whoever runs this app.',
};

const SETUP_PROBLEM = 'Sign-in is not set up correctly for this app yet. Nothing you can do from here, so tell your class representative.';

/**
 * Agreement is given here, before Google is ever opened, rather than on a
 * screen after it.
 *
 * The old order asked someone to hand over their Google account first and only
 * then told them what the app does with it, which is the wrong way round: by
 * the time they read the terms they had already agreed to the part that
 * mattered. It also meant a first run was three screens deep before anything
 * useful appeared.
 *
 * What is ticked here is reported up to the shell, which writes it to the
 * student's own settings the moment sign-in gives it a uid to file it under.
 */
export default function Login({ onConsent }) {
  const { signIn } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [reading, setReading] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!agreed) return;
    setBusy(true);
    setError(null);
    // Recorded before the popup opens. If sign-in succeeds the tick is already
    // in hand; if it fails nothing was written anywhere, and the box is still
    // ticked for the retry.
    onConsent?.({ version: CONSENT_VERSION, at: new Date().toISOString() });
    try { await signIn(); }
    catch (err) {
      console.error('Sign-in failed:', err);
      setError(YOURS_TO_FIX[err.code] ?? SETUP_PROBLEM);
    }
    setBusy(false);
  };

  return (
    <div className="auth">
      <div className="card auth-card animate-in">
        <div className="auth-mark"><GraduationCap size={28} aria-hidden="true" /></div>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>UniHelper</h1>
        <p className="muted small" style={{ margin: 'var(--s2) 0 var(--s5)' }}>
          Your timetable, deadlines and grades, synced across every device
          and shared with your class.
        </p>

        <div className="consent-row">
          <input
            id="consent-agree"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            aria-label="I have read and agree to the Privacy Policy and the Terms of Use"
          />
          <p className="small consent-text">
            {/* The label covers the plain words only. If it wrapped the two
                buttons as well, opening a document would also toggle the box. */}
            <label htmlFor="consent-agree">I have read and agree to the</label>{' '}
            <button type="button" className="link-button" onClick={() => setReading(PRIVACY)}>
              Privacy Policy
            </button>
            {' and the '}
            <button type="button" className="link-button" onClick={() => setReading(TERMS)}>
              Terms of Use
            </button>.
          </p>
        </div>

        <button className="btn btn-primary btn-block" onClick={go} disabled={busy || !agreed}>
          <GoogleLogo /> {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>

        {!agreed && (
          <p className="field-hint" style={{ marginTop: 'var(--s2)' }}>
            Tick the box to continue.
          </p>
        )}

        {error && (
          <p className="field-error" style={{ marginTop: 'var(--s4)', textAlign: 'left' }} role="alert">
            <AlertCircle size={14} aria-hidden="true" />{error}
          </p>
        )}

        <p className="field-hint" style={{ marginTop: 'var(--s5)' }}>
          Your grades and study log are private to your account. Nobody else can
          read them, not even the class representative.
        </p>
        <p className="field-hint" style={{ marginTop: 'var(--s2)' }}>
          Version {CONSENT_VERSION}, {LAST_UPDATED}
        </p>
      </div>

      {reading && <LegalSheet doc={reading} onClose={() => setReading(null)} />}
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
