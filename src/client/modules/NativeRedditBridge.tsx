import React, { useState } from 'react';
import { navigateTo } from '@devvit/web/client';
import type { SessionResponse } from '../../shared/api';

type Props = {
  session?: SessionResponse | undefined;
};

type BridgeLink = {
  id: string;
  label: string;
  hint: string;
  buildUrl: (subreddit: string) => string;
};

const buildSubLinks = (): BridgeLink[] => [
  {
    id: 'modqueue',
    label: 'Mod Queue',
    hint: 'Native Reddit modqueue with Needs Review, Reported, Removed, Edited, and Unmoderated tabs.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/modqueue`,
  },
  {
    id: 'modmail',
    label: 'Mod Mail',
    hint: 'Native modmail with folders, archive, mute, and internal notes.',
    buildUrl: (s) => `https://mod.reddit.com/mail/all?subreddit=${s}`,
  },
  {
    id: 'modtools',
    label: 'Mod Tools Home',
    hint: 'Top-level Reddit mod tools landing page.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/moderators`,
  },
  {
    id: 'automod',
    label: 'Automod Config',
    hint: 'The wiki/config/automoderator page that ModDesk reads and writes through the API.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/wiki/config/automoderator`,
  },
  {
    id: 'rules',
    label: 'Subreddit Rules',
    hint: 'Native rules and removal reasons settings.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/rules`,
  },
  {
    id: 'wiki',
    label: 'Wiki',
    hint: 'Full subreddit wiki. ModDesk only writes the Automod config page.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/wiki/index`,
  },
  {
    id: 'banned',
    label: 'Banned Users',
    hint: 'Native banned-users page. ModDesk mirrors supported user lists through the API.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/banned`,
  },
  {
    id: 'moderators',
    label: 'Moderators',
    hint: 'Roster and permissions. Permission changes must be made on Reddit.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/moderators`,
  },
  {
    id: 'modlog',
    label: 'Mod Log',
    hint: 'Native modlog with filters by action type and moderator.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/log`,
  },
  {
    id: 'reports',
    label: 'Reports',
    hint: 'Reported items only, separate from the full modqueue view.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/reports`,
  },
  {
    id: 'edited',
    label: 'Edited',
    hint: 'Native edited-items filter.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/edited`,
  },
  {
    id: 'unmoderated',
    label: 'Unmoderated',
    hint: 'Items with no moderator action yet.',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/unmoderated`,
  },
];

const platformLinks: BridgeLink[] = [
  {
    id: 'devapps',
    label: 'Reddit Developer Apps',
    hint: 'Manage your Devvit apps, versions, domain exceptions, and installs.',
    buildUrl: () => 'https://developers.reddit.com/apps',
  },
  {
    id: 'devdocs',
    label: 'Developer Docs',
    hint: 'Devvit API reference, capabilities, and tutorials.',
    buildUrl: () => 'https://developers.reddit.com/docs',
  },
  {
    id: 'browse',
    label: 'Browse Apps Directory',
    hint: 'Find installable Devvit apps for subreddits you moderate.',
    buildUrl: () => 'https://developers.reddit.com/apps',
  },
  {
    id: 'modhelp',
    label: 'Mod Help Center',
    hint: 'Reddit-published moderation policy reference.',
    buildUrl: () => 'https://support.reddithelp.com/hc/en-us/categories/200073949-Moderating-on-Reddit',
  },
  {
    id: 'modcoc',
    label: 'Mod Code of Conduct',
    hint: 'Required policy reference for moderator teams.',
    buildUrl: () => 'https://support.reddithelp.com/hc/en-us/articles/15484584408340',
  },
];

const fallbackBridgeLink: BridgeLink = {
  id: 'modqueue',
  label: 'Mod Queue',
  hint: 'Native Reddit modqueue.',
  buildUrl: (s) => `https://www.reddit.com/r/${s}/about/modqueue`,
};

const copyUrl = async (url: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const tmp = document.createElement('input');
  tmp.value = url;
  document.body.appendChild(tmp);
  tmp.select();
  document.execCommand('copy');
  document.body.removeChild(tmp);
};

export const NativeRedditBridge: React.FC<Props> = ({ session }) => {
  const subreddit = (session?.subredditName ?? 'mod').replace(/^r\//i, '');
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('modqueue');
  const subLinks = buildSubLinks();
  const allLinks = [...subLinks, ...platformLinks];
  const selectedLink = allLinks.find((link) => link.id === selectedId) ?? fallbackBridgeLink;
  const selectedUrl = selectedLink.buildUrl(subreddit);

  const open = (link: BridgeLink) => {
    navigateTo(link.buildUrl(subreddit));
  };

  const copy = async (url: string, id: string) => {
    await copyUrl(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const renderRow = (link: BridgeLink) => {
    const url = link.buildUrl(subreddit);
    return (
      <li key={link.id} className={`bridge-row ${selectedId === link.id ? 'selected' : ''}`}>
        <button type="button" className="bridge-row-meta" onClick={() => setSelectedId(link.id)}>
          <strong>{link.label}</strong>
          <span>{link.hint}</span>
          <code>{url}</code>
        </button>
        <div className="bridge-row-actions">
          <button type="button" className="glass-btn primary" onClick={() => open(link)}>
            Open in Reddit
          </button>
          <button type="button" className="glass-btn" onClick={() => copy(url, link.id)}>
            {copied === link.id ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="bridge-panel">
      <header className="bridge-header">
        <div>
          <span className="module-eyebrow">Native Reddit Bridge</span>
          <h2>Control real Reddit mod surfaces</h2>
          <p>
            Select a native Reddit page, copy the exact URL, or open it with Devvit navigation. When Reddit blocks
            iframe embedding with browser security headers, the preview panel falls back to a controlled launcher
            instead of showing a fake page. Current workspace: <strong>r/{subreddit}</strong>.
          </p>
        </div>
      </header>

      <section className="bridge-browser">
        <div className="bridge-urlbar">
          <button type="button" className="glass-btn primary" onClick={() => open(selectedLink)}>
            Open selected
          </button>
          <code>{selectedUrl}</code>
          <button type="button" className="glass-btn" onClick={() => copy(selectedUrl, selectedLink.id)}>
            {copied === selectedLink.id ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="bridge-frame-shell">
          <iframe
            key={selectedUrl}
            title={`${selectedLink.label} preview`}
            src={selectedUrl}
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
          />
          <div className="bridge-frame-fallback">
            <strong>{selectedLink.label}</strong>
            <span>{selectedLink.hint}</span>
            <p>
              If the frame is blank, Reddit blocked embedding for this destination. Use Open selected to continue
              in the official Reddit surface.
            </p>
          </div>
        </div>
      </section>

      <section className="bridge-section">
        <h3>r/{subreddit} mod surfaces</h3>
        <ul className="bridge-list">{subLinks.map(renderRow)}</ul>
      </section>

      <section className="bridge-section">
        <h3>Reddit Developer Platform</h3>
        <ul className="bridge-list">{platformLinks.map(renderRow)}</ul>
      </section>

      <footer className="bridge-footer">
        Links open via <code>navigateTo()</code> from <code>@devvit/web/client</code>. Devvit webviews cannot
        override Reddit, browser, CSP, or X-Frame-Options iframe rules.
      </footer>
    </div>
  );
};
