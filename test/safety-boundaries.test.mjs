import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const apiSource = readFileSync(new URL('../src/server/routes/api.ts', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8');
const devvitConfig = readFileSync(new URL('../devvit.json', import.meta.url), 'utf8');

test('server uses REST routes and does not mount dead tRPC imports', () => {
  assert.equal(indexSource.includes("from './context'"), false);
  assert.equal(indexSource.includes("from './routers'"), false);
  assert.equal(indexSource.includes("'/trpc/*'"), false);
});

test('Sentinel has no offline answer path pretending Groq worked', () => {
  assert.equal(apiSource.includes('moderationFallbackReply'), false);
  assert.equal(apiSource.includes('buildStructuredFallbackReply'), false);
  assert.equal(apiSource.includes('Offline fallback response'), false);
});

test('Sentinel uses Groq chat completions and exposes owner settings without frontend key storage', () => {
  assert.match(apiSource, /\/openai\/v1\/chat\/completions/);
  assert.match(apiSource, /api\.get\('\/ai\/settings'/);
  assert.match(apiSource, /api\.post\('\/ai\/settings'/);
  assert.match(apiSource, /api\.post\('\/ai\/test'/);
  assert.match(devvitConfig, /api\.groq\.com/);
  const settingsPanel = readFileSync(new URL('../src/client/modules/SettingsPanel.tsx', import.meta.url), 'utf8');
  assert.equal(/localStorage|sessionStorage/.test(settingsPanel), false);
});

test('Sentinel does not silently use fallback when Groq is missing or failing', () => {
  assert.match(apiSource, /Sentinel AI is not configured/);
  assert.equal(apiSource.includes('fallbackAvailable'), false);
  assert.equal(apiSource.includes('offlineFallbackEnabled'), false);
  assert.match(apiSource, /Sentinel AI could not reach Groq/);
  assert.match(apiSource, /groqFailureCauseForStatus/);
});

test('Sentinel greeting is moderation-specific, not generic chat', () => {
  assert.match(apiSource, /I'm Sentinel, your Reddit moderation assistant/);
  assert.match(apiSource, /triage reports/);
  assert.match(apiSource, /draft modmail replies/);
});

test('live queue writes require mode, permission, and confirmation gate', () => {
  assert.match(apiSource, /function requireLiveConfirmation/);
  assert.match(apiSource, /async function requireLiveWrite/);
  assert.match(apiSource, /confirmation !== 'CONFIRM_LIVE_ACTION'/);
  assert.match(apiSource, /workspaceMode !== 'live'/);
  assert.match(apiSource, /liveWritesEnabled/);
  assert.match(apiSource, /api\.post\('\/live\/queue\/action'/);
  const liveQueueRoute = apiSource.slice(apiSource.indexOf("api.post('/live/queue/action'"));
  assert.ok(liveQueueRoute.indexOf('requireLiveWrite') < liveQueueRoute.indexOf('reddit.approve'));
  assert.ok(liveQueueRoute.indexOf('requireLiveWrite') < liveQueueRoute.indexOf('reddit.remove'));
});

test('demo queue route is physically separated from Reddit write APIs', () => {
  assert.match(apiSource, /function assertNeverLiveWriteInDemo/);
  assert.match(apiSource, /api\.post\('\/demo\/queue\/action'/);
  const demoQueueRoute = apiSource.slice(
    apiSource.indexOf("api.post('/demo/queue/action'"),
    apiSource.indexOf("api.post('/live/queue/action'")
  );
  assert.match(demoQueueRoute, /result: 'simulated'/);
  assert.equal(demoQueueRoute.includes('reddit.approve'), false);
  assert.equal(demoQueueRoute.includes('reddit.remove'), false);
  assert.equal(demoQueueRoute.includes('reddit.updateWikiPage'), false);
});

test('automod and modmail live writes are confirmation-gated', () => {
  const automodRoute = apiSource.slice(apiSource.indexOf("api.post('/live/automod'"));
  assert.ok(automodRoute.indexOf("requireLiveWrite(modContext, confirmation, 'wiki')") < automodRoute.indexOf('reddit.updateWikiPage'));
  const demoAutomodRoute = apiSource.slice(
    apiSource.indexOf("api.post('/demo/automod'"),
    apiSource.indexOf("api.get('/live/automod'")
  );
  assert.equal(demoAutomodRoute.includes('reddit.updateWikiPage'), false);

  const modmailRoute = apiSource.slice(apiSource.indexOf("api.post('/live/modmail/reply'"));
  assert.ok(modmailRoute.indexOf("settings.workspaceMode === 'live'") < modmailRoute.indexOf('reddit.modMail.reply'));
  assert.ok(modmailRoute.includes("requireLiveWrite(modContext, confirmation, 'mail')"));
  const demoModmailRoute = apiSource.slice(
    apiSource.indexOf("api.post('/demo/modmail/reply'"),
    apiSource.indexOf("api.post('/queue/action'")
  );
  assert.equal(demoModmailRoute.includes('reddit.modMail.reply'), false);
});

test('Reddit Developer Platform links are present in the UI module', () => {
  const developerApps = readFileSync(new URL('../src/client/modules/DeveloperAppsPanel.tsx', import.meta.url), 'utf8');
  assert.match(developerApps, /https:\/\/developers\.reddit\.com\/apps/);
  assert.match(developerApps, /https:\/\/developers\.reddit\.com\/docs/);
  assert.match(developerApps, /Managed on Reddit Developer Platform/);
});
