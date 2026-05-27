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
  audience: 'all_mods' | 'owner_admin';
  buildUrl: (subreddit: string) => string;
};

const buildSubLinks = (): BridgeLink[] => [
  {
    id: 'modqueue',
    label: 'Mod Queue',
    hint: 'Native Reddit queue for reported, removed, edited, and unmoderated items.',
    audience: 'all_mods',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/modqueue`,
  },
  {
    id: 'modmail',
    label: 'Mod Mail',
    hint: 'Official modmail inbox, folders, archive, mute, and internal notes.',
    audience: 'all_mods',
    buildUrl: (s) => `https://mod.reddit.com/mail/all?subreddit=${s}`,
  },
  {
    id: 'automod',
    label: 'Automod Config',
    hint: 'Native wiki/config/automoderator page.',
    audience: 'owner_admin',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/wiki/config/automoderator`,
  },
  {
    id: 'rules',
    label: 'Rules',
    hint: 'Subreddit rules and removal reasons settings.',
    audience: 'owner_admin',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/rules`,
  },
  {
    id: 'banned',
    label: 'Banned Users',
    hint: 'Native banned-users mod tool.',
    audience: 'all_mods',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/banned`,
  },
  {
    id: 'moderators',
    label: 'Moderators',
    hint: 'Roster and permissions. Changes are controlled by Reddit.',
    audience: 'owner_admin',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/moderators`,
  },
  {
    id: 'modlog',
    label: 'Mod Log',
    hint: 'Native modlog with filters by action type and moderator.',
    audience: 'all_mods',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/log`,
  },
  {
    id: 'reports',
    label: 'Reports',
    hint: 'Reported items only.',
    audience: 'all_mods',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/reports`,
  },
  {
    id: 'unmoderated',
    label: 'Unmoderated',
    hint: 'Items with no moderator action yet.',
    audience: 'all_mods',
    buildUrl: (s) => `https://www.reddit.com/r/${s}/about/unmoderated`,
  },
];

const platformLinks: BridgeLink[] = [
  {
    id: 'devapps',
    label: 'Reddit Developer Apps',
    hint: 'Manage app versions, allowed domains, installs, and publishing.',
    audience: 'owner_admin',
    buildUrl: () => 'https://developers.reddit.com/apps',
  },
  {
    id: 'devdocs',
    label: 'Developer Docs',
    hint: 'Devvit API reference, capabilities, and tutorials.',
    audience: 'all_mods',
    buildUrl: () => 'https://developers.reddit.com/docs',
  },
  {
    id: 'modhelp',
    label: 'Mod Help Center',
    hint: 'Reddit-published moderation policy reference.',
    audience: 'all_mods',
    buildUrl: () => 'https://support.reddithelp.com/hc/en-us/categories/200073949-Moderating-on-Reddit',
  },
  {
    id: 'modcoc',
    label: 'Mod Code of Conduct',
    hint: 'Required policy reference for moderator teams.',
    audience: 'all_mods',
    buildUrl: () => 'https://support.reddithelp.com/hc/en-us/articles/15484584408340',
  },
];

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
  const canManage = session?.modDeskRole === 'owner' || session?.modDeskRole === 'admin';
  const [copied, setCopied] = useState<string | null>(null);
  const visibleSubLinks = buildSubLinks().filter((link) => link.audience === 'all_mods' || canManage);
  const visiblePlatformLinks = platformLinks.filter((link) => link.audience === 'all_mods' || canManage);

  const open = (link: BridgeLink) => {
    navigateTo(link.buildUrl(subreddit));
  };

  const copy = async (url: string, id: string) => {
    await copyUrl(url);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const renderRow = (link: BridgeLink) => {
    const url = link.buildUrl(subreddit);
    return (
      <li key={link.id} className="bridge-row">
        <div className="bridge-row-meta">
          <strong>{link.label}</strong>
          <span>{link.hint}</span>
          <code>{url}</code>
        </div>
        <div className="bridge-row-actions">
          <button type="button" className="glass-btn primary" onClick={() => open(link)}>
            Open with Reddit
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
          <h2>Open official Reddit mod surfaces</h2>
          <p>
            Reddit mod tools and Developer Platform pages are opened with Devvit <code>navigateTo()</code>. This panel
            does not iframe Reddit pages because Reddit, browser CSP, and X-Frame-Options rules control where those pages
            may render.
          </p>
        </div>
      </header>

      <section className="bridge-browser bridge-launcher">
        <strong>Current workspace: r/{subreddit}</strong>
        <p>
          If Reddit opens a destination in a new tab or external surface, that behavior is controlled by Reddit and the
          user agent. Use Copy link when you need an exact URL.
        </p>
      </section>

      <section className="bridge-section">
        <h3>r/{subreddit} mod surfaces</h3>
        <ul className="bridge-list">{visibleSubLinks.map(renderRow)}</ul>
      </section>

      <section className="bridge-section">
        <h3>Reddit platform links</h3>
        <ul className="bridge-list">{visiblePlatformLinks.map(renderRow)}</ul>
      </section>

      <footer className="bridge-footer">
        App navigation uses <code>navigateTo()</code> from <code>@devvit/web/client</code>. No code in this app can
        override Reddit navigation, iframe, CSP, or browser tab behavior.
      </footer>
    </div>
  );
};
