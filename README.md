# ModDesk OS

ModDesk OS is a live Reddit moderator desktop built with Devvit Web, React, Hono, and tRPC. It is designed for real subreddit operations: queue triage, modmail, Automod, saved responses, consensus decisions, user lists, audit logs, Sentinel AI, Native Reddit Bridge, Developer Apps, and CommentCop anti-bot monitoring.

There is no user-facing demo or training workspace in the current product. The visible app is a live Reddit console. Any action that can change Reddit is permission-gated, confirmation-gated, and audited.

## Live Safety

Live writes are locked by default. Approve, remove, ban, mute, Automod save, and modmail reply flows require:

- Authenticated Reddit user.
- Subreddit moderator status.
- Matching Reddit moderator permission.
- ModDesk role permission.
- Owner/admin live-write enablement.
- Explicit confirmation at the call site.

Unsupported Reddit-native settings are not faked. ModDesk uses official Devvit APIs where available and opens official Reddit pages through Native Reddit Bridge where in-app APIs or iframe embedding are not supported.

## CommentCop

CommentCop is the anti-bot similarity shield for copied comments.

- Registers `onCommentCreate` in `devvit.json`.
- Uses Redis `hSetNX` locks so duplicate Devvit trigger deliveries do not double-process the same comment.
- Stores a rolling per-post comment index under `moddesk-os:v1:{subreddit}:live:commentcop:*`.
- Computes Jaccard token-overlap similarity:

```text
J(A, B) = |A intersection B| / |A union B|
```

- Flags copied comments when the configured threshold is met, defaulting to `0.85`.
- Can log only or remove duplicate comments on Reddit when live writes and app permissions allow it.
- Can optionally call a Supabase Edge Function for historical vector verification, but Devvit HTTP fetch requires the exact Supabase HTTPS host to be allow-listed in `devvit.json`.

Required optional env vars for Supabase verification:

```bash
SUPABASE_COMMENTCOP_URL=https://your-project.supabase.co
SUPABASE_COMMENTCOP_KEY=...
```

Because Devvit HTTP domains must be exact hosts, replace or add the real Supabase host in `devvit.json` before upload. The app does not pretend Supabase verification is active when the URL is missing.

## Sentinel AI

Sentinel uses Groq chat completions from the server only. The frontend never receives the API key.

- URL: `https://api.groq.com/openai/v1/chat/completions`
- Required Devvit HTTP domain: `api.groq.com`
- Default model: `llama-3.3-70b-versatile`

If the key is missing, invalid, blocked by Devvit HTTP permissions, rate-limited, or the model fails, Sentinel shows the real error. There is no fake offline AI fallback.

If you see `2 UNKNOWN: grpc invocation failed with status 7; HTTP request to domain: api.groq.com is not allowed`, the code path is working but Devvit has blocked the external fetch. Keep `api.groq.com` in `permissions.http.domains`, then run `devvit playtest` or `devvit upload` and check Developer Settings for the app-specific domain approval. Current Devvit rules list approved LLM services separately, so Groq may require Reddit approval before it can be used from a Devvit app.

## Native Reddit Bridge

Reddit pages are opened with Devvit navigation behavior, not `window.location`. If a Reddit page cannot be embedded because of browser, Reddit, CSP, X-Frame-Options, or Devvit iframe limits, ModDesk shows a controlled launcher with:

- Open in Reddit
- Copy link
- Return to ModDesk

Bridge targets include native modqueue, modmail, Mod Tools, Automod config, wiki, moderator list, mod log, Reddit Developer Apps, Developer Docs, and Browse Apps.

## Developer Apps

Developer Apps provides official links to:

- [Reddit Developer Apps](https://developers.reddit.com/apps)
- [Reddit Developer Docs](https://developers.reddit.com/docs)
- Browse Apps and install/manage pages where Reddit supports them

Install/uninstall is not faked inside ModDesk unless Reddit exposes a supported Devvit API for it.

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

## Verification Commands

```bash
npm run type-check
npm run lint
npm test
npm run build
```

Use Reddit/Devvit docs as the source of truth for live API availability:

- [Devvit Docs](https://developers.reddit.com/docs)
- [Devvit Apps](https://developers.reddit.com/apps)
