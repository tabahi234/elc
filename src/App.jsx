import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router, Routes, Route, useLocation,
} from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/authContext';
import { ClassDataProvider } from './lib/classDataContext';
import { ToastProvider } from './lib/toast';
import { useUserDoc } from './lib/storage';
import { CONSENT_VERSION, PRIVACY, TERMS } from './lib/legal';
import { EmptyState } from './components/ui';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBar from './components/OfflineBar';
import Consent, { LegalDocument } from './components/Consent';
import Onboarding from './components/Onboarding';
import InstallPrompt from './components/InstallPrompt';
import Dashboard from './pages/Dashboard';
import Timetable from './pages/Timetable';
import Tasks from './pages/Tasks';
import Grades from './pages/Grades';
import Focus from './pages/Focus';
import Login from './pages/Login';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';
import BottomNav from './components/BottomNav';

/**
 * Client-side gate for the admin route.
 *
 * This hides the screen; it does not protect the data. Every write the admin
 * panel makes is independently authorised in firestore.rules against the same
 * role document, so pasting /admin into the URL bar gets you a form whose
 * every submission the server rejects.
 */
function RequireManager({ children }) {
  const { canManage, roleLoading } = useAuth();

  if (roleLoading) return <p className="muted">Checking access…</p>;
  if (!canManage) {
    return (
      <div className="card">
        <EmptyState icon={ShieldAlert} title="Admin access only">
          This panel is for the class representative and course staff. Ask your CR
          if a deadline or a room is wrong.
        </EmptyState>
      </div>
    );
  }
  return children;
}

/**
 * The routed part of the app.
 *
 * The error boundary sits inside the router and is keyed on the path, so a
 * crash on one screen is contained to that screen and clears itself the moment
 * the student navigates somewhere else.
 */
function Screens() {
  const { pathname } = useLocation();

  return (
    <ErrorBoundary key={pathname} fullPage={false}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/timetable" element={<Timetable />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/focus" element={<Focus />} />
        <Route path="/admin" element={<RequireManager><Admin /></RequireManager>} />
        <Route path="/privacy" element={<LegalDocument doc={PRIVACY} />} />
        <Route path="/terms" element={<LegalDocument doc={TERMS} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

/**
 * Files the agreement given at sign-in, then shows the walkthrough once.
 *
 * Both flags live in the student's own Firestore settings document rather than
 * localStorage, so the tour does not reappear on their second device and the
 * consent record survives clearing browser data. The consent stores which
 * version was agreed to, because agreeing to an older text is not agreement to
 * a newer one.
 *
 * `signInConsent` is the tick from the sign-in card. It is trusted for this
 * session immediately, so nobody who has just agreed is asked to agree again
 * while the write is in flight, and written to Firestore as soon as the first
 * read of the settings document lands.
 */
function Gated({ signInConsent }) {
  const [settings, setSettings, settingsLoaded] = useUserDoc('settings', {});

  const storedVersion = Number(settings.consentVersion);
  const agreedAtSignIn = Number(signInConsent?.version) >= CONSENT_VERSION;
  const needsWriting = settingsLoaded && agreedAtSignIn && !(storedVersion >= CONSENT_VERSION);

  useEffect(() => {
    if (!needsWriting) return;
    setSettings((current) => ({
      ...current,
      consentVersion: CONSENT_VERSION,
      consentAt: signInConsent.at,
    }));
  }, [needsWriting, signInConsent, setSettings]);

  // Rendering the re-consent screen before the first read lands would flash it
  // at someone who already agreed.
  if (!settingsLoaded) {
    return <div className="app-shell"><p className="muted">Loading…</p></div>;
  }

  // The wording changed under a session that never saw a sign-in screen to
  // tick. Everyone else agreed before Google was ever opened.
  const accepted = storedVersion >= CONSENT_VERSION || agreedAtSignIn;
  if (!accepted) {
    return (
      <Consent
        onAccept={() => setSettings({
          ...settings,
          consentVersion: CONSENT_VERSION,
          consentAt: new Date().toISOString(),
        })}
      />
    );
  }

  return (
    <ClassDataProvider>
      <Router>
        <OfflineBar />
        <main className="app-shell">
          <Screens />
        </main>
        <BottomNav />
        <InstallPrompt />
      </Router>

      {!settings.tourDoneAt && (
        <Onboarding
          onDone={() => setSettings({ ...settings, tourDoneAt: new Date().toISOString() })}
        />
      )}
    </ClassDataProvider>
  );
}

function Shell() {
  const { user, roleLoading, isMember, signOut } = useAuth();
  // Ticked on the sign-in card, before there is an account to file it under.
  // Held here because it has to outlive the Login screen it was given on.
  const [signInConsent, setSignInConsent] = useState(null);

  if (user === undefined) {
    return (
      <div className="auth">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!user) return <Login onConsent={setSignInConsent} />;
  if (roleLoading) return <div className="auth"><p className="muted">Checking access…</p></div>;
  if (!isMember) return (
    <div className="auth"><div className="card stack">
      <h1>Class approval needed</h1>
      <p>Ask your class administrator to approve your account. Share this user ID with them:</p>
      <code style={{ overflowWrap: 'anywhere' }}>{user.uid}</code>
      <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
    </div></div>
  );
  return <Gated key={user.uid} signInConsent={signInConsent} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
