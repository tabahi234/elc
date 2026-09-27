import React, { useEffect, useState } from 'react';
import { Download, Share, Plus, X, Smartphone } from 'lucide-react';

/**
 * Offer to install the app to the home screen.
 *
 * Two different worlds:
 *  - Chrome and Edge fire `beforeinstallprompt`, which can be replayed later to
 *    show the real browser install dialog. One tap.
 *  - iOS Safari fires nothing and has no API. The only route is Share then Add
 *    to Home Screen, so it gets instructions instead of a button that lies.
 *
 * Dismissal is remembered in localStorage rather than Firestore, because it is
 * a property of this device and browser, not of the person.
 */
const DISMISSED_KEY = 'unihelper:installDismissed';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS 13+ reports as a Mac, but a Mac has no touch points.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export default function InstallPrompt() {
  const [event, setEvent] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone() || read(DISMISSED_KEY)) return;

    const onPrompt = (e) => {
      // Keep the event so the real dialog can be opened from our own button.
      e.preventDefault();
      setEvent(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS never fires that event, so offer the manual route after a moment
    // rather than never mentioning it.
    let timer;
    if (isIos()) timer = setTimeout(() => setShow(true), 2500);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => { write(DISMISSED_KEY, '1'); setShow(false); };

  const install = async () => {
    if (!event) return;
    event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') setShow(false);
    // A dismissal is not a refusal forever, but the event cannot be reused.
    setEvent(null);
    if (outcome === 'dismissed') dismiss();
  };

  if (!show) return null;

  return (
    <div className="install-card animate-in" role="complementary" aria-label="Install this app">
      <div className="install-icon"><Smartphone size={19} aria-hidden="true" /></div>

      <div className="grow" style={{ minWidth: 0 }}>
        <p style={{ fontWeight: 560, fontSize: 'var(--fs-sm)' }}>Put this on your home screen</p>

        {event ? (
          <>
            <p className="muted tiny" style={{ marginTop: 2 }}>
              It opens like a normal app, full screen, and works without signal.
            </p>
            <button className="btn btn-sm btn-primary" style={{ marginTop: 'var(--s2)' }} onClick={install}>
              <Download size={14} aria-hidden="true" /> Install
            </button>
          </>
        ) : (
          <ol className="muted tiny install-steps">
            <li>
              Tap <Share size={11} aria-hidden="true" className="install-glyph" />
              <strong> Share</strong> in the Safari toolbar
            </li>
            <li>
              Choose <Plus size={11} aria-hidden="true" className="install-glyph" />
              <strong> Add to Home Screen</strong>
            </li>
            <li>Tap <strong>Add</strong></li>
          </ol>
        )}
      </div>

      <button className="btn-icon btn-icon-sm" onClick={dismiss} aria-label="Not now">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
