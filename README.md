# ModDesk OS

ModDesk OS is a private Reddit Devvit Web workspace for volunteer subreddit moderator teams. It brings queue triage, training, consensus governance, Automod editing, modmail handling, saved responses, user lists, audit logs, and Reddit Developer Platform links into one moderator-only operations surface.

The app is built for subreddit owners/top mods, senior moderators, active queue moderators, trainees, and read-only observers. Normal Reddit users must not see moderator queues, modmail, user registries, audit logs, or live-case training content.

## Modes

**Demo / Training Mode** is the default. It may preview real Reddit-derived content when an authenticated moderator has read access, but every action is simulated. Demo writes are stored under the demo namespace and never call Reddit write APIs. Buttons and audit entries label these actions as simulated.

**Live Reddit Mode** loads real Reddit moderation data and can perform Reddit writes only when all safety gates pass: authenticated Reddit user, subreddit moderator status, matching Reddit moderator permission, ModDesk role permission, owner/admin live-write enablement, and server-side `CONFIRM_LIVE_ACTION`.

## Owner Setup

1. Install ModDesk OS in a subreddit from Reddit Developer Platform.
2. Open ModDesk OS from the subreddit moderator menu.
3. Confirm the detected subreddit and Reddit identity.
4. Keep Demo / Training Mode enabled while onboarding.
5. Configure consensus thresholds, training requirements, audit retention, and live-write enablement.
6. Invite or approve moderators and trainees according to subreddit policy.

Live writes are locked by default. Enabling them is audited with actor, role, subreddit, mode, timestamp, and before/after settings.

## Access Model

ModDesk derives a safe default role from Reddit moderator context:

- **Owner**: top mod or moderator with `all` permission; can configure workspace settings and enable live writes.
- **Admin**: senior moderator with elevated permissions such as config, wiki, mail, access, or posts.
- **Moderator**: can read workspace tools and perform allowed live actions when granted and confirmed.
- **Trainee**: intended for Demo / Training Mode and shadow workflows.
- **Observer**: read-only posture.

Every backend route checks Reddit authentication and moderator status. Destructive routes additionally check workspace mode, ModDesk role, Reddit moderator permission, live-write enablement, and confirmation.

## Reddit Authentication

The server uses Devvit Web server context:

- `reddit.getCurrentUsername()`
- `context.subredditName`
- `reddit.getModerators()`
- subreddit, modqueue, rules, modlog, wiki, user-list, and modmail APIs where supported

If Reddit identity or moderator checks fail, the app defaults to access denied or read-only behavior. It does not allow live writes when auth state is unknown.

## Supported Actions

Implemented or wired through Devvit Reddit APIs where available:

- Fetch reports and modqueue-style queue items.
- Approve or remove posts/comments.
- Fetch subreddit rules.
- Fetch and update `config/automod` wiki with validation, confirmation, and audit gates.
- Fetch native moderation log.
- Fetch banned, muted, approved, and moderator lists.
- Ban/unban, mute/unmute, approve/unapprove users.
- Fetch modmail conversations.
- Reply to modmail, add internal notes, archive/unarchive conversations.
- Fetch post and user flair templates.

## Simulated Or Read-Only Areas

Some Reddit settings are not safely exposed as in-app Devvit management APIs. ModDesk does not fake unsupported install/delete/settings behavior. These areas are labeled read-only, simulated, or "Managed on Reddit Developer Platform" and deep-link to official Reddit pages when appropriate.

Flair template editing is currently stored locally and labeled as ModDesk-managed/simulated unless an official write API is added and audited.

## Reddit Developer Apps

The **Developer Apps** module includes official links:

- [Reddit Developer Apps](https://developers.reddit.com/apps)
- [Reddit Developer Docs](https://developers.reddit.com/docs)
- Subreddit app management deep link for the active subreddit

Install, uninstall, and version-management actions stay on Reddit Developer Platform unless Reddit exposes supported in-app APIs. Any future in-app implementation should be owner-only, confirmation-gated, and audited.

## Sentinel AI

Sentinel uses Groq from the server only when `GROQ_API_KEY` is configured or an owner/admin saves a server-side Groq key in Settings. The model is configurable through `GROQ_MODEL` or the owner/admin settings page and defaults to `llama-3.3-70b-versatile`.

There is no offline AI answer path. If Groq is missing, invalid, blocked by Devvit HTTP permissions, rate-limited, or unavailable, Sentinel shows the exact error and recovery step instead of pretending a local model worked. The Devvit app must allow and have Reddit approval for server-side HTTP fetches to `api.groq.com`; after changing `devvit.json`, run `npm run deploy` or `devvit upload` so the permission is registered for the app.

## Safety Tests

Run:

```bash
npm run type-check
npm run lint
npm test
npm run build
```

The test suite verifies that:

- Dead tRPC server imports are not mounted.
- Sentinel has no offline answer path pretending Groq worked.
- Sentinel uses Groq chat completions and never exposes the API key to the frontend.
- Live queue writes require mode, permission, and confirmation gates.
- Demo queue actions branch before Reddit write APIs.
- Automod and modmail live writes are confirmation-gated.
- Reddit Developer Platform links are present.

## Local Development

```bash
npm install
npm run preview:ui -- --port 5173
```

For Devvit playtest:

```bash
npm run login
npm run dev
```

Deploy/upload:

```bash
npm run deploy
```

## Current Limits

Reddit API support inside Devvit is the source of truth. Unsupported Reddit-native settings open in Reddit's official UI or are shown as read-only. Demo / Training Mode is intentionally isolated from Reddit writes, even when its scenarios come from real Reddit content.
