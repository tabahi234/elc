import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

/**
 * Replaces every window.alert() in the app. alert() blocks the main thread,
 * cannot be styled, and on mobile reads as a browser error rather than a
 * confirmation.
 */
export const useToast = () => useContext(ToastContext);
