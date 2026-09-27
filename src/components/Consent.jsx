import React, { useState } from 'react';
import { ShieldCheck, Check } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { CONSENT_VERSION, LAST_UPDATED, PRIVACY, TERMS } from '../lib/legal';

/**
 * Sits between signing in and using the app. Nothing else renders until the
 * person has agreed, and the record stores which version they saw, so changing
 * the text later does not silently inherit an old consent.
 *
 * Both documents are short enough to read in place. Hiding them behind a link
 * would be the standard move and also the one nobody ever clicks.
 */
export default function Consent({ onAccept }) {
  const { user, signOut } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    setSaving(true);
    await onAccept();
    setSaving(false);
  };

  return (
    <div className="app-shell animate-in">
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        <div className="auth-mark" style={{ margin: '0 0 var(--s4)' }}>
          <ShieldCheck size={24} aria-hidden="true" />
        </div>

        <h1 className="page-title">Before you start</h1>
        <p className="muted small" style={{ margin: 'var(--s2) 0 var(--s5)' }}>
          Signed in as {user.email}. Worth thirty seconds.
        </p>

        <div className="stack">
          <PointList doc={PRIVACY} />
          <PointList doc={TERMS} />
        </div>

        <label
          className="card row"
          style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start', margin: 'var(--s4) 0' }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ width: 20, height: 20, minHeight: 0, marginTop: 1, flexShrink: 0, accentColor: 'var(--accent)' }}
          />
          <span className="small">I have read and agree to both.</span>
        </label>

        <button className="btn btn-primary btn-block" disabled={!agreed || saving} onClick={accept}>
          <Check size={17} aria-hidden="true" />
          {saving ? 'Saving…' : 'Agree and continue'}
        </button>

        <button className="btn btn-ghost btn-block" onClick={signOut} style={{ marginTop: 'var(--s2)' }}>
          Sign out instead
        </button>

        <p className="field-hint center" style={{ marginTop: 'var(--s4)' }}>
          Version {CONSENT_VERSION}, {LAST_UPDATED}
        </p>
      </div>
    </div>
  );
}

export function PointList({ doc }) {
  return (
    <section className="card">
      <h2 className="section-title" style={{ marginBottom: 'var(--s3)' }}>{doc.title}</h2>
      <ul className="point-list">
        {doc.points.map((point) => <li key={point}>{point}</li>)}
      </ul>
    </section>
  );
}

/** Standalone page for the /privacy and /terms routes. */
export function LegalDocument({ doc }) {
  return (
    <article>
      <h1 className="page-title" style={{ marginBottom: 'var(--s4)' }}>{doc.title}</h1>
      <ul className="point-list">
        {doc.points.map((point) => <li key={point}>{point}</li>)}
      </ul>
      <p className="field-hint" style={{ marginTop: 'var(--s5)' }}>
        Version {CONSENT_VERSION}, {LAST_UPDATED}
      </p>
    </article>
  );
}
