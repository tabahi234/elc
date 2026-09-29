import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import './index.css';
import App from './App.jsx';
import { authReady } from './firebase';

// Apply the saved theme before the first paint, so a light-mode user doesn't
// get a flash of the dark background on every load.
try {
  const theme = localStorage.getItem('unihelper:theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  }
} catch { /* private mode: fall back to the system preference */ }

// Render straight away. Nothing here waits on the network: auth and Firestore
// both answer from the device first and catch up with the server afterwards.
authReady.catch((error) => console.error('Sign-in persistence setup failed:', error));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
