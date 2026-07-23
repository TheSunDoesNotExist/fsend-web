import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

const visualViewport = window.visualViewport;

function syncViewport() {
  const height = Math.round(visualViewport?.height || window.innerHeight);
  const top = Math.round(visualViewport?.offsetTop || 0);
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  document.documentElement.style.setProperty('--app-top', `${top}px`);
}

syncViewport();
window.addEventListener('resize', syncViewport);
visualViewport?.addEventListener('resize', syncViewport);
visualViewport?.addEventListener('scroll', syncViewport);

document.addEventListener('focusin', (event) => {
  if (!event.target.matches('input, textarea, select')) return;
  setTimeout(() => {
    syncViewport();
    if (!event.target.isConnected) return;
    const inAuth = event.target.closest('.auth-primary');
    event.target.scrollIntoView({
      block: inAuth ? 'center' : 'nearest',
      inline: 'nearest',
    });
  }, 300);
});
document.addEventListener('focusout', () => setTimeout(syncViewport, 100));

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
