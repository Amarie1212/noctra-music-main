import { initMobileApiBridge } from './mockApi';

// Initialize the mobile API bridge immediately
initMobileApiBridge();

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/mobile-adjustments.css';
import { applyCachedThemeSnapshot } from './store';

console.log('Mobile Renderer: NOCTRA booting...');

window.onerror = (msg, _url, _line, _col, error) => {
  console.error('Mobile Error:', msg, error);
  document.getElementById('boot-splash')?.remove();
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="color: white; background: #1a0000; padding: 20px; font-family: sans-serif;">
      <h2>NOCTRA Startup Error</h2>
      <p>${msg}</p>
      <pre style="white-space: pre-wrap; font-size: 12px; color: #ff8888;">${error?.stack || ''}</pre>
    </div>`;
  }
};

async function bootstrap() {
  try {
    applyCachedThemeSnapshot();
    const rootEl = document.getElementById('root');
    if (rootEl) {
      ReactDOM.createRoot(rootEl).render(<App />);
    }
  } catch (e: any) {
    console.error('Mobile Bootstrap Error:', e);
    document.getElementById('boot-splash')?.remove();
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `<div style="color: white; background: #1a0000; padding: 20px; font-family: sans-serif;">
        <h2>NOCTRA Render Error</h2>
        <p>${e.message}</p>
        <pre style="white-space: pre-wrap; font-size: 12px; color: #ff8888;">${e.stack || ''}</pre>
      </div>`;
    }
  }
}

void bootstrap();
