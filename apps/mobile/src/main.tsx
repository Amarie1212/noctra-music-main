import { initMobileApiBridge } from './mockApi';

// MUST initialize window.api before any stores or components are imported/executed
initMobileApiBridge();

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/mobile-adjustments.css';
import { applyCachedThemeSnapshot } from './store';

console.log('Mobile Renderer: main.tsx starting');

window.onerror = (msg, url, line, col, error) => {
  console.error('Mobile Fatal Error:', msg, error);
  document.getElementById('boot-splash')?.remove();
  document.body.innerHTML = `<div style="color: white; background: #1a0000; padding: 20px; font-family: sans-serif;">
    <h2>NOCTRA Startup Error</h2>
    <p>${msg}</p>
    <pre style="white-space: pre-wrap; font-size: 12px; color: #ff8888;">${error?.stack || ''}</pre>
  </div>`;
};

async function bootstrap() {
  try {
    applyCachedThemeSnapshot();
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <App />
    );
  } catch (e: any) {
    console.error('Mobile Render Error:', e);
    document.getElementById('boot-splash')?.remove();
    document.body.innerHTML = `<div style="color: white; background: #1a0000; padding: 20px; font-family: sans-serif;">
      <h2>NOCTRA Render Error</h2>
      <p>${e.message}</p>
      <pre style="white-space: pre-wrap; font-size: 12px; color: #ff8888;">${e.stack || ''}</pre>
    </div>`;
  }
}

void bootstrap();
