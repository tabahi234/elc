import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import './index.css';
import App from './App.jsx';

// Apply the saved theme before the first paint, so a light-mode user doesn't
// get a flash of the dark background on every load.
try {
  const theme = localStorage.getItem('unihelper:theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  }
} catch { /* private mode: fall back to the system preference */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
