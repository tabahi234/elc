import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router, Routes, Route, useLocation,
} from 'react-router-dom';
import { ShieldAlert, UserX, WifiOff } from 'lucide-react';
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

/**
 * What a signed-in account gets before it has a working membership.
 *
 * There used to be a third state here: approval. A student signed in, was shown
 * their Firebase user ID in a code block, and had to copy it into a message to
 * the admin, who pasted it into a form. Nothing was decided by that round trip
 * — anyone who could sign in was going to be approved — so it has gone. Signing
 * in makes you a student; see the role listener in lib/auth.jsx. That leaves
 * two real states, and they read very differently to the person in front of
 * them, so they get different screens.
 */
function NoAccess({ blocked, onSignOut, email }) {
  return (
    <div className="auth">
      <div className="card stack" style={{ maxWidth: 380 }}>
        <div className="auth-mark" style={{ margin: 0 }}>
          {blocked ? <UserX size={24} aria-hidden="true" /> : <WifiOff size={24} aria-hidden="true" />}
        </div>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>
          {blocked ? 'Access removed' : 'Could not set up your account'}
        </h1>
        <p className="muted small">
          {blocked
            ? `${email} has been taken off this class by an admin. If that is a mistake, ask them to put it back.`
            : 'Signing you up needs a connection, and this one did not get through. Reload the page once you are back online.'}
        </p>
        {!blocked && (
          <button className="btn btn-primary btn-block" onClick={() => window.location.reload()}>
            Try again
          </button>
        )}
        <button className="btn btn-secondary btn-block" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}

function Shell() {
  const { user, roleLoading, isMember, isBlocked, signOut } = useAuth();
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
  if (roleLoading) return <div className="auth"><p className="muted">Setting up your account…</p></div>;
  if (!isMember) return <NoAccess blocked={isBlocked} email={user.email} onSignOut={signOut} />;
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
