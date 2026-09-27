import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { ToastContext } from './toastContext';

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const DURATION = { success: 3000, info: 3500, warning: 5500, error: 7000 };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((tone, message) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, tone, message: String(message) }]);
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION[tone] ?? 4000));
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m) => push('success', m),
    error:   (m) => push('error', m),
    warning: (m) => push('warning', m),
    info:    (m) => push('info', m),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Errors interrupt; everything else waits for a pause in speech. */}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(({ id, tone, message }) => {
          const Icon = ICONS[tone];
          return (
            <div key={id} className={`toast toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
              <Icon size={17} aria-hidden="true" />
              <div className="toast-text">{message}</div>
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
