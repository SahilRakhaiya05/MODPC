import React, { useState, useEffect } from 'react';

interface BootScreenProps {
  onComplete: () => void;
  subredditName: string;
}

type LineKind = 'ok' | 'info' | 'warn';

type BootLine = { text: string; kind: LineKind };

export const BootScreen: React.FC<BootScreenProps> = ({ onComplete, subredditName }) => {
  const [lines, setLines] = useState<BootLine[]>([]);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const linesToPrint: BootLine[] = [
      { text: 'Devvit gateway · connected', kind: 'ok' },
      { text: `Community bound · r/${subredditName || 'mody_os_dev'}`, kind: 'info' },
      { text: 'Moderator session · verified', kind: 'ok' },
      { text: 'Reddit API · redditAPI + redis online', kind: 'ok' },
      { text: 'Loading subreddit rules + flair templates', kind: 'info' },
      { text: 'Hydrating saved response templates', kind: 'info' },
      { text: 'Polling /api/dashboard for live queue', kind: 'info' },
      { text: 'Workspace ready', kind: 'ok' },
    ];

    let lineIdx = 0;
    const lineInterval = setInterval(() => {
      if (lineIdx < linesToPrint.length) {
        const next = linesToPrint[lineIdx];
        if (next) setLines((prev) => [...prev, next]);
        lineIdx++;
      } else {
        clearInterval(lineInterval);
      }
    }, 160);

    const progressInterval = setInterval(() => {
      setPercent((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          setTimeout(onComplete, 320);
          return 100;
        }
        return prev + 8;
      });
    }, 180);

    return () => {
      clearInterval(lineInterval);
      clearInterval(progressInterval);
    };
  }, [subredditName, onComplete]);

  return (
    <div className="boot-screen" role="status" aria-live="polite">
      <div className="boot-screen-card">
        <header>
          <div className="boot-screen-logo" aria-hidden="true">MD</div>
          <div>
            <h1>ModDesk OS</h1>
            <p>Reddit moderator workspace · r/{subredditName || 'mody_os_dev'}</p>
          </div>
        </header>

        <div className="boot-screen-log" aria-label="Boot log">
          {lines.map((line, idx) => (
            <div key={idx} className={`boot-screen-line tone-${line.kind}`}>
              <span aria-hidden="true">{line.kind === 'ok' ? '✓' : line.kind === 'warn' ? '!' : '›'}</span>
              <span>{line.text}</span>
            </div>
          ))}
          {lines.length < 8 && <div className="boot-screen-line tone-pending"><span aria-hidden="true">…</span><span>Loading…</span></div>}
        </div>

        <footer>
          <div className="boot-screen-progress">
            <div className="boot-screen-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="boot-screen-progress-row">
            <span>Boot sequence</span>
            <span>{percent}%</span>
          </div>
          <button type="button" className="boot-screen-skip" onClick={onComplete}>
            Skip intro
          </button>
        </footer>
      </div>
    </div>
  );
};
