import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider } from './lib/auth';
import { useAuth } from './lib/authContext';
import { ClassDataProvider } from './lib/classDataContext';
import { ToastProvider } from './lib/toast';
import { useUserDoc } from './lib/storage';
import { CONSENT_VERSION, PRIVACY, TERMS } from './lib/legal';
import { EmptyState } from './components/ui';
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

  if (roleLoading) {
    return <div className="app-shell"><p className="muted">Checking access…</p></div>;
  }
  if (!canManage) {
    return (
      <div className="app-shell">
        <div className="card">
          <EmptyState icon={ShieldAlert} title="Admin access only">
            This panel is for the class representative and course staff. Ask your CR
            if a deadline or a room is wrong.
          </EmptyState>
        </div>
      </div>
    );
  }
  return children;
}

/**
 * Gates the app behind agreeing to the terms, then shows the walkthrough once.
 *
 * Both flags live in the student's own Firestore settings document rather than
 * localStorage, so the tour does not reappear on their second device and the
 * consent record survives clearing browser data. The consent stores which
 * version was agreed to, because agreeing to an older text is not agreement to
 * a newer one.
 */
function Gated() {
  const [settings, setSettings, settingsLoaded] = useUserDoc('settings', {});

  // Rendering the consent screen before the first read lands would flash it at
  // someone who already agreed.
  if (!settingsLoaded) {
    return <div className="app-shell"><p className="muted">Loading…</p></div>;
  }

  const accepted = Number(settings.consentVersion) >= CONSENT_VERSION;
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
        <main className="app-shell">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/grades" element={<Grades />} />
            <Route path="/focus" element={<Focus />} />
            <Route path="/admin" element={<RequireManager><Admin /></RequireManager>} />
            <Route path="/privacy" element={<LegalDocument doc={PRIVACY} />} />
            <Route path="/terms" element={<LegalDocument doc={TERMS} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
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
  const { user } = useAuth();

  if (user === undefined) {
    return (
      <div className="auth">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!user) return <Login />;
  return <Gated />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ToastProvider>
  );
}
