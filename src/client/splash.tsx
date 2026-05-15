import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export function Splash() {
  return (
    <main className="splash-shell">
      <section className="splash-card">
        <div className="splash-title">ModDesk OS v2.0</div>
        <p>Subreddit Operations Desk</p>
        <div className="splash-terminal">
          <span>user: {context.username ?? 'moderator'}</span>
          <span>mode: private mod utility</span>
          <span>status: ready for expanded workspace</span>
        </div>
        <button className="retro-button primary splash-launch" onClick={(event) => requestExpandedMode(event.nativeEvent, 'game')}>
          Boot Operations Desk
        </button>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
