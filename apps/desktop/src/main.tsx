import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { applyCachedThemeSnapshot } from './store';

console.log('Renderer: main.tsx starting');

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
    const isFirstRun = await window.api.window.consumeFirstRun();
    if (isFirstRun) {
      window.localStorage.removeItem('music.settings.cache');
      window.localStorage.removeItem('music.library.scroll-positions');
      window.localStorage.removeItem('music.perf-debug');
    }

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
