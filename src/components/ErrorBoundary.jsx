import React from 'react';
import { RefreshCw, Home, TriangleAlert } from 'lucide-react';

/**
 * Catches a crash in the tree below it so a single broken screen does not take
 * the whole app down to a blank white page.
 *
 * Deliberately does NOT print the exception. A stack trace tells a student
 * nothing and reads like the app is accusing them of something; it goes to the
 * console, where whoever maintains the app can see it. What the student gets is
 * the two things that actually help: reload, or go back to a screen that works.
 *
 * The caller keys this on the current path, so React throws the failed
 * instance away on navigation and a broken screen fixes itself the moment the
 * student taps another tab. `fullPage` is for the outermost boundary, which
 * has no padded shell around it because the shell is one of the things that
 * may have failed to render.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Screen crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const card = (
      <div className="card recover">
        <div className="recover-icon"><TriangleAlert size={22} aria-hidden="true" /></div>
        <h2 className="recover-title">This screen stopped working</h2>
        <p className="recover-text">
          Nothing you saved has been lost. Reloading almost always fixes it.
        </p>
        <div className="recover-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} aria-hidden="true" /> Reload
          </button>
          <a className="btn btn-secondary" href="/">
            <Home size={16} aria-hidden="true" /> Back to home
          </a>
        </div>
      </div>
    );

    return this.props.fullPage === false ? card : <div className="recover-wrap">{card}</div>;
  }
}
