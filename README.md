# ModDesk OS

**A retro command center for modern subreddit governance.**

ModDesk OS is a private moderator-only Reddit Devvit Web app. It wraps real moderation utility in a polished 1990s desktop shell: boot screen, desktop icons, beveled windows, taskbar, status tray, audit ticker, and compact modules for training, consensus decisions, response templates, queue triage, and community settings.

## What Is Included

- **Retro OS shell:** expanded Devvit Web workspace, splash launcher, boot animation, taskbar, windows, desktop icons, system toasts, and high-risk confirmation dialog.
- **ModAcademy Simulator:** seeded training scenarios, action/rule decisions, confidence slider, XP scoring, ranks, streaks, missed concepts, and Redis-persisted profile progress.
- **Consensus Voting Desk:** ticket creation, evidence notes, one vote per moderator per ticket, vote updates before closure, threshold progress, approved/rejected/expired states, and MVP-safe manual execution marking.
- **Typewriter Canned Response Editor:** mobile-safe markdown toolbar, macro buttons, template list, rendered preview, save/version/archive flow, and Redis persistence.
- **Live Queue Console:** seeded queue packets, severity scoring, sorted review list, simulated approve/remove/review actions, escalation to consensus, and safe productivity stats.
- **Control Panel:** threshold mode, high-impact actions, required training level, theme mode, mobile compact flag, template approval flag, anonymous vote flag, and demo reset.
- **Audit Log:** important training, vote, ticket, template, queue, settings, and reset actions create audit events.

## Devvit Web Architecture

The app follows the current Devvit Web split:

- Client code lives in `src/client`.
- Server endpoints live under `/api/` in `src/server/routes/api.ts`.
- Shared contracts live in `src/shared/api.ts`.
- Moderator menu entry is configured in `devvit.json`.
- Redis is the only durable MVP data store.

No external database, webhook, LLM, or client-side third-party HTTP dependency is required.

## Data Stored In Redis

All keys are namespaced under `moddesk-os:v1`. The app stores:

- App settings
- Moderator profiles
- Training scenarios and attempts
- Consensus tickets and vote hashes
- Response templates
- Demo queue packets
- Audit events

The app avoids key scanning by maintaining explicit index lists for each entity group.

## Permissions And Privacy

ModDesk OS is intended to be opened from the subreddit moderator menu. The menu item is configured with `forUserType: "moderator"`, and API endpoints verify moderator context where possible by comparing the current user to the subreddit moderator listing.

If moderator verification fails, the client degrades to an access-check failure instead of rendering operational data.

This MVP does **not** automatically execute live permanent bans, mutes, removals, or locks. Approved consensus tickets require a manual execution confirmation record.

## Local Development

```bash
npm install
npm run type-check
npm run lint
npm run build
```

Local UI-only preview with seeded development data:

```bash
npm run preview:ui -- --port 5173
```

For a Devvit playtest:

```bash
npm run login
npm run dev
```

Deploy/upload:

```bash
npm run deploy
```

Publish after review:

```bash
npm run launch
```

## Moderator Setup Guide

1. Install the app in a test subreddit.
2. Open the subreddit moderator menu and choose **Open ModDesk OS**.
3. Use **Control Panel** to set consensus mode, high-impact action gates, training level, and theme.
4. Use **Reset Demo Data** while testing to reseed training scenarios, templates, queue items, and sample tickets.
5. Use **Consensus Voting Desk** for high-impact actions. Treat approved tickets as a team decision record, then manually perform any live Reddit action outside the MVP.

## Known Limitations

- Queue items are seeded demo packets for MVP reliability.
- Consensus approvals are recorded but not automatically dispatched to live Reddit enforcement endpoints.
- Template editing is stored locally in Redis and is not yet synced to subreddit removal reasons.
- Moderator role granularity is not implemented beyond moderator-only access.
- Real-time collaboration is represented through refresh-after-action, not websockets or streaming.

## Safety Notes

Gamification rewards training accuracy, reviewed work, appropriate escalation, and consistency. It does not award extra points for removals, bans, or punitive action volume.

Dangerous actions are blocked behind consensus and explicit manual confirmation language. The README and UI intentionally avoid claiming unsupported live enforcement.
