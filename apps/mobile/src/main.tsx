import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/mobile-adjustments.css';
import { applyCachedThemeSnapshot } from './store';
import { initMobileApiBridge } from './mockApi';

// Initialize the mobile API bridge (providing window.api)
initMobileApiBridge();

console.log('Mobile Renderer: main.tsx starting');

window.onerror = (msg, url, line, col, error) => {
  document.getElementById('boot-splash')?.remove();
  document.body.innerHTML = `<div style="color: white; background: red; padding: 20px; font-family: sans-serif;">
    <h1>Fatal Error</h1>
    <p>${msg}</p>
    <pre>${error?.stack}</pre>
  </div>`;
};

async function bootstrap() {
  try {
    applyCachedThemeSnapshot();
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <App />
    );
  } catch (e: any) {
    document.getElementById('boot-splash')?.remove();
    document.body.innerHTML = `<div style="color: white; background: red; padding: 20px;">
      <h1>Render Error</h1>
      <p>${e.message}</p>
      <pre>${e.stack}</pre>
    </div>`;
  }
}

void bootstrap();
