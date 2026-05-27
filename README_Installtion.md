# MODPC

MODPC is a Reddit moderator desktop built with Devvit Web, React 19, Hono, and TypeScript. It is designed for real subreddit operations: queue triage, modmail, Automod, saved responses, consensus review, user controls, audit logging, Sentinel AI, Native Reddit Bridge, Developer Apps, and CommentCop anti-bot monitoring.

The app is live-first by default. Local development includes preview data, but the shipped product is built around moderator-gated Reddit operations and explicit confirmation before any live write.

## What It Does

MODPC gives moderators a single workspace for the day-to-day tasks that normally live across Reddit's native tools.

- Review and action the mod queue.
- Handle modmail replies and drafts.
- Edit Automod and other moderation settings.
- Manage saved responses with the Typewriter tool.
- Open consensus tickets for high-impact decisions.
- Inspect moderated users, logs, live triggers, and derived insights.
- Draft moderator-safe replies with Sentinel AI.
- Open Reddit-native pages through the bridge when iframe embedding is not possible.
- Monitor copied comments with CommentCop.

## Architecture

The project is split into a small number of clear surfaces:

- [src/client/game.tsx](src/client/game.tsx) is the expanded React workspace.
- [src/client/splash.tsx](src/client/splash.tsx) is the inline launch surface.
- [src/server/index.ts](src/server/index.ts) wires the Hono app.
- [src/server/routes/api.ts](src/server/routes/api.ts) serves the main moderator API.
- [src/server/routes/menu.ts](src/server/routes/menu.ts) handles subreddit and item menu actions.
- [src/server/routes/triggers.ts](src/server/routes/triggers.ts) handles Devvit triggers and CommentCop processing.
- [src/server/routes/scheduler.ts](src/server/routes/scheduler.ts) handles periodic and queued jobs.
- [src/shared/api.ts](src/shared/api.ts) is the shared type contract between client and server.

The client UI is organized into focused modules under [src/client/modules](src/client/modules). The main ones are QueueConsole, ModmailHub, AutomodPanel, ModLogConsole, UserControlRegistry, Typewriter, ConsensusDesk, InsightsPanel, CommentCopPanel, SentinelChat, NativeRedditBridge, DeveloperAppsPanel, RiskRadar, PersonalModPanel, OwnerAdminPanel, ShiftHandoff, TeamChat, ActionComposer, and SettingsPanel.

## Safety Model

Live writes are intentionally hard to reach. Actions such as approve, remove, ban, mute, Automod save, and modmail reply require all of the following:

- Authenticated Reddit session.
- Subreddit moderator status.
- Matching Reddit moderator permission.
- MODPC role permission.
- Live-write enablement.
- Explicit confirmation at the call site.

The app also separates live and training behavior through workspace mode. `live` is the default and shows real Reddit data only. `training` unlocks sandboxed learning flows and safe scenarios where supported. The UI does not fake unsupported Reddit-native capabilities as if they were real.

## Access Model

MODPC has two different permission layers:

1. Listing and install access. The app is publicly listed on the Reddit Developer Platform. Subreddit owners and admins install it to their community. Moderators can view the listing and use the app once their subreddit has installed it.
2. Runtime access. Once installed, the app only opens for authenticated Reddit moderators of that subreddit. Non-moderators see the access gate, read-only messaging, and no destructive controls.

The app is intended to be publicly listed on the Reddit Developer Platform while remaining moderator-only at runtime.

### Access Matrix

| Role | Can discover listing | Can install to subreddit | Can view workspace | Can use live actions |
| --- | --- | --- | --- | --- |
| Subreddit owner | Yes | Yes | Yes | Yes, if moderator permissions allow |
| Subreddit admin | Yes | Yes | Yes | Yes, if moderator permissions allow |
| Moderator | Yes | No | Yes | Yes, if moderator permissions allow |
| Public visitor | Yes | No | No | No |
| Non-moderator subreddit member | Yes | No | No | No |

## Runtime Surfaces

The app is registered in [devvit.json](devvit.json) with two post entrypoints:

- `default` loads the inline splash view.
- `game` loads the expanded workspace.

It also wires the following runtime integrations:

- Menu actions for opening MODPC, escalating to consensus, and drafting safe replies.
- Triggers for app install, post reports, comment reports, mod actions, and modmail.
- Scheduler jobs for a 5-minute live-stats heartbeat and queued moderation actions.

## CommentCop

CommentCop is the copied-comment similarity shield.

- It registers `onCommentCreate` in [devvit.json](devvit.json).
- It stores per-subreddit live state in Redis under the `moddesk-os:v1:{subreddit}:live:*` namespace.
- It uses a Jaccard token-overlap score to compare comments.
- It can log a match or remove a duplicate comment when live writes are allowed.
- It keeps a rolling per-post window so repeated trigger deliveries do not double-process the same comment.

The Jaccard score is:

```text
J(A, B) = |A intersection B| / |A union B|
```

The default threshold is `0.85`.

## Sentinel AI

Sentinel runs on the server only. The frontend never receives the API key.

- Groq chat completions endpoint: `https://api.groq.com/openai/v1/chat/completions`
- Required Devvit HTTP domain: `api.groq.com`
- Default model: `llama-3.3-70b-versatile`

If Groq is missing, blocked, rate-limited, or fails, Sentinel surfaces the real error instead of falling back to a fake offline response. The app can also respect a `GROQ_MODEL` environment override on the server.

## Native Reddit Bridge

When Reddit pages cannot be embedded because of browser, CSP, X-Frame-Options, or iframe restrictions, MODPC uses a controlled launcher rather than relying on `window.location`.

Bridge targets include:

- Native modqueue.
- Modmail.
- Mod Tools.
- Automod config.
- Wiki pages.
- Moderator list.
- Mod log.
- Reddit Developer Apps.
- Reddit Developer Docs.
- Browse Apps.

## Developer Apps

The Developer Apps panel provides direct links to Reddit's official developer surfaces, including:

- [Reddit Developer Apps](https://developers.reddit.com/apps)
- [Reddit Developer Docs](https://developers.reddit.com/docs)

Install and uninstall flows are handled by Reddit's public platform listing and subreddit install workflow; MODPC only reflects the install state after Reddit completes the action. The app itself does not fake install success or grant access to normal users.

If you want the listing to be public, set that at the Reddit Developer Platform level. This repo controls runtime behavior and access gates, not marketplace visibility settings.

## Platform Reality

- Public listing visibility is controlled on Reddit's Developer Platform, not by this repo.
- This repo controls what happens after install: moderator gating, live-write confirmation, and read-only access for everyone else.
- Each subreddit gets its own install; there is no shared cross-subreddit installation state in the runtime.

## Local Development

Install dependencies and run the local UI preview:

```bash
npm install
npm run preview:ui -- --port 5173
```

For Devvit playtest:

```bash
npm run login
npm run dev
```

For upload or deployment:

```bash
npm run deploy
npm run launch
```

## Verification

Run the full local verification set before shipping changes:

```bash
npm run type-check
npm run lint
npm test
npm run build
```

The current repo expects Node.js 22.2 or newer.

## Project Layout

```text
src/
	client/   React UI, desktop shell, panels, and shared client helpers
	server/   Hono server, Devvit routes, triggers, scheduler, and menu handlers
	shared/   Shared API and type definitions
public/     Wallpaper and icon assets
website/    Static marketing page
test/       Safety boundary tests
```

## Notes

- The webview is sandboxed, so external navigation should use Devvit client navigation rather than popup windows.
- The app stores subreddit-specific state in Redis using the `MODPC` namespace.
- Refer to Reddit and Devvit docs for the current source of truth on live API availability.
