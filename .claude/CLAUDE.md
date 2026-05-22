# CLAUDE.md

# ModDesk OS — project context

Project-specific notes for this codebase. Merges with the general behavioral guide in `~/.claude/CLAUDE.md`.

## What this project is

**ModDesk OS** is a moderator workspace built with **Devvit Web** (Reddit's app platform).
Submission target: **Mod Tools Migration** category on [Reddit Hackathon](https://mod-tools-migration.devpost.com/).

## Tech stack

| Layer | Tech |
| --- | --- |
| Devvit version | `@devvit/web` 0.12.x (per-subreddit install model) |
| Client | React 19 + TypeScript + Vite, single bundle in `dist/client` |
| Server | Hono on Devvit's Node runtime, bundled to `dist/server/index.cjs` |
| Storage | Redis via `@devvit/web/server` — namespace `moddesk-os:v1:{subredditName}:*` |
| Live data | `reddit.*` from `@devvit/reddit` (RedditAPIClient) — moderator scope |
| Schedule | `scheduler.runJob()` + cron tasks declared in `devvit.json` |
| Triggers | `onAppInstall`, `onPostReport`, `onCommentReport`, `onModAction`, `onModMail` |

## Hard constraints (don't violate)

1. **Devvit installs are per-subreddit.** There is no `getModeratedSubreddits()` API. To "switch subreddits" we deep-link via `navigateTo()` and remember which subs the moderator has opened in a Redis hash `moddesk-os:v1:installs:{username}`.
2. **The webview runs in a sandboxed iframe without `allow-popups`.** `window.open()` is blocked. To open URLs use `navigateTo()` from `@devvit/web/client`. For URLs the moderator must paste elsewhere, use the inline-copy pattern (clipboard API with `execCommand` fallback). **Never** apologise with "the webview can't open new tabs" — just present the URL and a copy button.
3. **Workspace mode toggle lives in Settings, not the top nav.** Two modes:
   - **`live`** (default): every queue/modmail/modlog/users panel must show real Reddit data only. The `seedQueue`/`seedScenarios` server fallbacks are filtered out client-side (queue items namespaced `live:` are real; others are demo). When in doubt: no fake data should ever appear in live mode.
   - **`training`**: unlocks Mod Academy + sandbox scenarios. Destructive actions still require the `CONFIRM_LIVE_ACTION` token server-side, but training scenarios are deliberately fake.
4. **Moderator gate is authoritative.** `requireModerator()` in `src/server/routes/api.ts` verifies via `reddit.getModerators()`. When `session.isModerator === false`, hide every destructive UI and show the read-only banner.
5. **Devvit-unsupported APIs — don't pretend.** The Devvit Reddit API does NOT expose: `removed`/`edited`/`unmoderated` queue filters, post `.lock()`/`.distinguish()`, subscriber-growth/traffic stats, modmail `delete`. Label these gaps in UI; do not invent placeholder data.

## Architecture map

```
src/
├── client/
│   ├── components/
│   │   ├── DesktopShell.tsx        # OS shell — windows record, menubar, identity chip, live workbench
│   │   ├── RetroWindow.tsx         # Window wrapper — 8-direction resize, drag, min/max/close
│   │   ├── IdentityChip.tsx        # Top-nav identity + subreddit picker
│   │   ├── UserDossier.tsx         # Reusable participant profile card (karma, age, flags)
│   │   ├── NotificationDot.tsx     # Single shared notification badge
│   │   ├── BootScreen.tsx          # Initial boot animation
│   │   └── SystemToast.tsx         # Toast notifications
│   ├── modules/
│   │   ├── QueueConsole.tsx        # Needs Review — getModQueue + getReports
│   │   ├── ModmailHub.tsx          # Mod Mail — reddit.modMail.* (uses UserDossier)
│   │   ├── AutomodPanel.tsx        # wiki/config/automoderator editor
│   │   ├── ModLogConsole.tsx       # reddit.getModerationLog
│   │   ├── UserControlRegistry.tsx # banned / muted / approved / moderators
│   │   ├── Typewriter.tsx          # Saved responses (Redis-stored)
│   │   ├── InsightsPanel.tsx       # Derived stats only (no traffic API)
│   │   ├── ModAcademy.tsx          # Training scenarios (training mode only)
│   │   ├── ConsensusDesk.tsx       # Team voting on high-impact actions
│   │   └── SettingsPanel.tsx       # Includes workspace-mode toggle
│   ├── utils/api.ts                # All client fetch helpers
│   ├── types.ts                    # Client-local types
│   ├── game.tsx                    # Entry point
│   └── index.css                   # All styles (single file, theme variables)
├── server/
│   ├── index.ts                    # Hono app wiring (/api, /internal)
│   ├── routes/
│   │   ├── api.ts                  # All /api/* endpoints — requireModerator gate
│   │   ├── triggers.ts             # Devvit trigger handlers → Redis live-events ring
│   │   ├── scheduler.ts            # Cron + one-shot job handlers
│   │   └── menu.ts                 # Subreddit menu item handler
│   └── core/post.ts                # createPost helper for app-install
└── shared/api.ts                   # Types shared client+server (single source of truth)
```

## CSS / theme

- Single `index.css` file. Theme variables on `:root,[data-theme="posthog"]` (default cream) and `[data-theme="dark"]`.
- Window control glyphs are inline SVG inside `.window-ctrl-dot` buttons — close (×), minimize (−), maximize (▢).
- Desktop icons live in `.ph-desktop-icons.left` as a 2-column grid (no scroll on standard heights).
- Don't add a third theme without first auditing every `var(--...)` reference.

## Live data contract

When `settings.workspaceMode === 'live'`:
- Home workbench's "Top live reports" lists only items where `itemId.startsWith('live:')`.
- `UserDossier` calls `reddit.getUserByUsername()` for the selected participant.
- Trigger events stream into the home "Live triggers" panel from Redis `moddesk-os:v1:{sub}:live-events:*`.

When `settings.workspaceMode === 'training'`:
- A yellow "Training" pill appears in the top nav.
- Mod Academy is the primary destination; queue items can be seeded scenarios.

## Common pitfalls (learned the hard way)

- `position: fixed` inside the Devvit webview iframe can break if any ancestor has a `transform` — prefer `position: absolute` inside the OS shell when in doubt.
- The boot screen's `color: '#ffffff'` was invisible on the cream background — always use `var(--ink)` / `var(--muted)` tokens, never hardcoded colors.
- `RetroWindow` should NEVER include a fake "SECURE TECHNICAL SUBPROCESS" footer or `SYS_CORE.ACTIVE // TRU` ticker — that mock chrome makes the app feel less trustworthy. Real Reddit data only.
- Don't write apologetic "AI-style" explainer paragraphs (e.g. "The Devvit webview can't open new tabs…"). Show the affordance and let it stand on its own.

## Verification before shipping

```bash
npx tsc --noEmit   # type-check
npm run lint       # eslint
npm run build      # vite build
```

All three must pass with exit 0. The vite warnings about `sourcemapFileNames` and `inlineDynamicImports` are expected (Devvit's vite config).



Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
