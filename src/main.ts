import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

const fallback = document.createElement('div');
fallback.id = 'app-bootstrap-fallback';
fallback.style.cssText = 'padding: 2rem; font-family: sans-serif; color: #1f2937;';
fallback.innerHTML = `
  <h2>Gallery failed to start</h2>
  <p>The app could not bootstrap. Please refresh the page or review the browser console for details.</p>
`;

const root = document.getElementById('app') ?? document.body;
if (root) {
  root.appendChild(fallback);
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => {
    console.error('Bootstrap error:', err);
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    fallback.innerHTML = `
      <h2>Gallery failed to start</h2>
      <p>We hit a startup error while loading the app.</p>
      <pre style="white-space: pre-wrap; word-break: break-word;">${message}</pre>
    `;
  });
