import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, X } from 'lucide-react';

/* ── Field ────────────────────────────────────────────────────────────────────
   Wraps any control with a label, error and hint, and wires up the aria that
   makes a screen reader announce the error when the field gets focus. Doing
   this once here is the only realistic way to get it right on every form.
*/
export function Field({ label, error, hint, warning, required, children, counter }) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error && errorId, (hint || warning) && hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
          {required && <span className="req" aria-hidden="true">*</span>}
        </label>
      )}
      {React.cloneElement(children, {
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })}
      {counter != null && (
        <div className={`char-count ${counter.value > counter.max * 0.9 ? 'near' : ''}`}>
          {counter.value}/{counter.max}
        </div>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          <AlertCircle size={13} aria-hidden="true" />{error}
        </p>
      )}
      {!error && warning && (
        <p className="field-warn" id={hintId}>
          <AlertTriangle size={13} aria-hidden="true" />{warning}
        </p>
      )}
      {!error && !warning && hint && <p className="field-hint" id={hintId}>{hint}</p>}
    </div>
  );
}

/* ── Sheet ────────────────────────────────────────────────────────────────────
   A bottom sheet on phones, a centred dialog on wide screens. Traps focus,
   closes on Escape and on a backdrop click, restores focus to whatever opened
   it, and locks background scroll.
*/
export function Sheet({ open, onClose, title, subtitle, children, footer, labelledBy }) {
  const panel = useRef(null);
  const restoreTo = useRef(null);
  const headingId = useId();
  // Every caller passes an inline arrow, so onClose is a new function on each
  // render. Kept in a ref so the effect below runs once per opening: with it
  // as a dependency, any re-render of the screen behind (a live Firestore
  // update, the dashboard clock) tore the effect down and yanked focus back to
  // the first field while someone was typing in another.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Move focus in so the keyboard and screen reader follow the dialog.
    const first = panel.current?.querySelector(
      'input, select, textarea, button:not([data-close]), [href]'
    );
    (first ?? panel.current)?.focus?.();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const focusable = panel.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  // Rendered into document.body: a modal must not be trapped inside an
  // ancestor's stacking context, or the fixed bottom nav paints over it.
  return createPortal(
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? headingId}
        ref={panel}
        tabIndex={-1}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div className="grow">
            <h2 id={headingId} style={{ fontSize: 'var(--fs-h1)' }}>{title}</h2>
            {subtitle && <p className="muted small" style={{ marginTop: 2 }}>{subtitle}</p>}
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close" data-close>
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ── ConfirmButton ────────────────────────────────────────────────────────────
   Two-step delete. The first press arms it, the second commits; it disarms
   itself after four seconds or on blur. Cheaper than a modal for a row action,
   and it still makes destruction deliberate.
*/
export function ConfirmButton({ onConfirm, label = 'Delete', confirmLabel = 'Sure?', children, className = 'btn-icon btn-icon-sm btn-icon-danger' }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const disarm = () => { clearTimeout(timer.current); setArmed(false); };

  const click = () => {
    if (armed) { disarm(); onConfirm(); return; }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 4000);
  };

  return armed ? (
    <button className="btn btn-sm btn-danger" onClick={click} onBlur={disarm} aria-label={`${confirmLabel} ${label}`}>
      {confirmLabel}
    </button>
  ) : (
    <button className={className} onClick={click} aria-label={label} title={label}>
      {children}
    </button>
  );
}

/* ── EmptyState ─────────────────────────────────────────────────────────────── */
export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={21} aria-hidden="true" /></div>}
      {title && <p className="empty-title">{title}</p>}
      {children && <p className="empty-text">{children}</p>}
    </div>
  );
}

/* ── Skeleton ───────────────────────────────────────────────────────────────── */
export function Skeleton({ h = 16, w = '100%', r }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function CardSkeleton({ rows = 3 }) {
  return (
    <div className="card stack" aria-busy="true" aria-label="Loading">
      <Skeleton h={18} w="55%" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={13} w={`${90 - i * 14}%`} />)}
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────────── */
export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          role="tab"
          type="button"
          aria-selected={value === v}
          onClick={() => onChange(v)}
        >
          {Icon && <Icon size={14} aria-hidden="true" />}{label}
        </button>
      ))}
    </div>
  );
}
