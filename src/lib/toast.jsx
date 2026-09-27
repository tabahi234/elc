import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { ToastContext } from './toastContext';

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const DURATION = { success: 3000, info: 3500, warning: 5500, error: 7000 };
// An undo has to outlive the moment of "wait, that was wrong", which takes a
// beat longer than reading a confirmation does.
const WITH_ACTION = 8000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  // A toast whose timer is still pending when the tree unmounts would fire
  // setState on nothing.
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);

  /**
   * @param options.action { label, onClick } — one optional button, used for
   *        undo. Pressing it runs the callback and closes the toast.
   */
  const push = useCallback((tone, message, options = {}) => {
    const id = nextId.current++;
    const action = options.action ?? null;
    setToasts((list) => [...list.slice(-2), { id, tone, message: String(message), action }]);
    const ms = action ? WITH_ACTION : (DURATION[tone] ?? 4000);
    timers.current.set(id, setTimeout(() => dismiss(id), ms));
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m, o) => push('success', m, o),
    error:   (m, o) => push('error', m, o),
    warning: (m, o) => push('warning', m, o),
    info:    (m, o) => push('info', m, o),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Errors interrupt; everything else waits for a pause in speech. */}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(({ id, tone, message, action }) => {
          const Icon = ICONS[tone];
          return (
            <div key={id} className={`toast toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
              <Icon size={17} aria-hidden="true" />
              <div className="toast-text">{message}</div>
              {action && (
                <button
                  className="btn btn-sm btn-secondary toast-action"
                  onClick={() => { dismiss(id); action.onClick(); }}
                >
                  {action.label}
                </button>
              )}
              <button className="btn-icon btn-icon-sm" onClick={() => dismiss(id)} aria-label="Dismiss">
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
