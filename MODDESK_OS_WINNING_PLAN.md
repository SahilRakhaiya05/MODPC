# ModDesk OS Winning Plan

## Executive Summary

**ModDesk OS** should be positioned as a private Devvit Web operations desk for moderator teams that need faster queue triage, safer high-impact decisions, easier onboarding, reusable response writing, and transparent audit trails.

The strongest version is not "a retro dashboard." It is:

> A moderator team workspace that reduces queue chaos, prevents risky solo decisions, trains new mods, standardizes responses, and records every important moderation decision.

This plan turns the current app into a polished **Best New Mod Tool** submission for the Reddit Mod Tools and Migrated Apps Hackathon.

## Target Category

Submit under:

**Best New Mod Tool**

Do **not** submit as a ported app unless there is a real pre-March 2026 Reddit Data API bot that this replaces and you own or have permission to port.

## Product Positioning

### App Name

**ModDesk OS**

### Short Tagline

Consensus, training, queue triage, and audit logs for Reddit mod teams.

### One-Line Pitch

ModDesk OS is a private Devvit Web moderation workspace that helps teams prioritize reported content, coordinate high-impact decisions, train new moderators, reuse safer response templates, and keep a Redis-backed audit trail.

### Longer Pitch

Moderators often work across time zones, experience levels, and shifting community norms. The native modqueue is essential, but it does not solve every team workflow problem: deciding which reports matter first, onboarding new moderators, standardizing user-facing replies, coordinating risky decisions, and preserving context for later review.

ModDesk OS gives moderators one lightweight workspace for the work around moderation: triage, consensus, training, templates, and accountability.

## Internet-Backed Moderator Pain Points

These are the pain points the submission should explicitly address.

### 1. Queue Overload And Prioritization

Reddit describes the moderation queue as the central place where content needing review appears. In practice, queue items are not all equally urgent. A self-harm report, brigading spike, spam wave, and duplicate post should not all compete as flat queue rows.

**Product response:** Live Queue Console ranks items by severity, report reasons, age, and risk keywords, then lets moderators clear, snooze, or escalate an item to consensus.

Source: [Reddit Help: Moderation Queue](https://support.reddithelp.com/hc/en-us/articles/15484440494356-Moderation-Queue)

### 2. Repetitive Moderation Work

Reddit's developer documentation explicitly frames Devvit mod tools around automating repetitive moderation tasks, improving community safety, and streamlining mod workflows.

**Product response:** ModDesk OS standardizes repeated workflows: queue review, ticket creation, response templates, audit log generation, and onboarding scenarios.

Source: [Reddit for Developers: Mod Tools on Reddit](https://developers.reddit.com/docs/introduction/intro-mod-tools)

### 3. New Moderator Onboarding

Moderator teams often need new volunteers to learn community rules, judgment calls, escalation paths, and safety cases without immediately making irreversible public mistakes.

**Product response:** ModAcademy provides realistic training scenarios with rule choice, action choice, confidence, scoring, feedback, XP, missed concepts, and readiness level.

### 4. Risky Solo Decisions

Some decisions are too important for one moderator to make alone: permanent bans, long mutes, thread locks during sensitive events, crisis/safety escalation, or emergency rule announcements.

**Product response:** Consensus Desk creates one-ticket-per-case records with evidence, vote notes, thresholds, approval/rejection states, and manual execution confirmation.

### 5. Moderator Disagreement And Gray Areas

Recent research on Reddit moderation highlights that disputed or "gray area" moderation decisions are meaningfully different from straightforward cases and benefit from expert human oversight.

**Product response:** ModDesk OS treats ambiguity as a first-class workflow. It routes gray-area items to structured consensus instead of encouraging instant punitive action.

Source: [The Gray Area: Characterizing Moderator Disagreement on Reddit](https://arxiv.org/abs/2601.01620)

### 6. Trust, Transparency, And Skepticism Around New Tools

Recent Reddit developer/community discussion shows that moderators can be skeptical of Devvit apps unless they are easy to understand, reliable, transparent, and clearly useful.

**Product response:** ModDesk OS should avoid overclaiming, clearly label manual vs. automated actions, show audit logs, keep setup simple, and explain safety boundaries.

Source: [r/ModSupport discussion on Devvit apps](https://www.reddit.com/r/ModSupport/comments/1thrhjl/what_devvit_apps_does_your_mod_team_use_and_why/)

### 7. Audit Logging And Failure Transparency

Recent Devvit moderation-app builders emphasize audit logging and error-path testing because production mod tools cannot fail silently.

**Product response:** Every important action creates an audit event. The app should also show clear error messages and never hide failed Reddit/API operations.

Source: [r/Devvit TrustSignal architecture discussion](https://www.reddit.com/r/Devvit/comments/1t5qcyg/built_a_production_moderation_app_with_devvit/)

## Judging Criteria Mapping

### Community Impact

ModDesk OS saves moderator time by:

- Prioritizing the queue instead of treating all reports equally.
- Turning high-risk decisions into structured vote records.
- Reducing repeated response writing with templates.
- Training new moderators before they handle live edge cases.
- Creating audit summaries for team handoff.

### Polish

The app must feel launch-ready:

- No corrupted text or emoji.
- Clear labels.
- Smooth demo path.
- Responsive layout.
- Honest MVP boundaries.
- No fake features presented as real.

### Reliable UX

The app should be easy for moderators to install and understand:

- Moderator menu opens the app.
- First-run setup checklist explains the workflow.
- Each module has obvious actions.
- Dangerous actions require confirmation.
- Non-moderators see a clean access-denied state.

### Ecosystem Impact

ModDesk OS is valuable because it combines multiple missing team workflows:

- Queue triage
- Consensus governance
- Training simulator
- Response templates
- Audit trail

The combination is the differentiator. Many tools focus on a single automation. ModDesk OS focuses on the human operating system around moderation.

## Current Strengths

The project already has a strong foundation:

- Devvit Web structure with `src/client`, `src/server`, and `src/shared`.
- Moderator menu item in `devvit.json`.
- Redis persistence.
- Server-side moderator checks.
- Live queue ingestion attempt.
- Training scenarios.
- Consensus voting.
- Response template editor.
- Queue triage UI.
- Settings/control panel.
- Audit events.
- Passing type-check, lint, and build.

## Current Gaps

These gaps should be fixed before submission.

### Critical

- Corrupted icon/text rendering appears throughout the UI.
- Some UI copy overclaims live execution.
- Simulated telemetry may make the app feel less trustworthy.
- The strongest demo flow needs to be tested end to end.

### High

- Queue actions should be honest: mark reviewed, snooze, escalate, copy response, or open permalink.
- Consensus should clearly say approved tickets still require manual execution unless live Reddit actions are implemented safely.
- Setup guidance should be built into the app or documented clearly.
- Submission materials need screenshots or a short demo GIF/video.

### Medium

- Training scenarios should cover more realistic moderator cases.
- Template editor should support clipboard copy with toast confirmation.
- Audit log should support copying a markdown summary.
- Impact metrics should estimate time saved.

## Final Product Scope

### 1. Home Dashboard

Purpose: Give moderators a fast operational overview.

Required elements:

- Current subreddit
- Current moderator
- Queue items needing review
- Critical queue count
- Pending consensus cases
- Training level/progress
- Templates count
- Recent audit events
- Estimated time saved

Suggested metric formulas:

- Queue item triaged: `1 minute saved`
- Template copied: `2 minutes saved`
- Consensus case completed: `5 minutes coordination saved`
- Training scenario completed: `3 minutes onboarding saved`

### 2. Live Queue Console

Purpose: Help moderators decide what to look at first.

Required elements:

- Sorted queue list
- Severity score
- Report reasons
- Report count
- Age
- Author
- Content excerpt
- Content type
- Suggested rules
- Permalink when available

Actions:

- Mark reviewed
- Snooze
- Escalate to consensus
- Copy response template
- Open Reddit permalink

Avoid unsafe claim:

- Do not say "removed" or "approved" unless the app actually executes Reddit moderation actions.

Better labels:

- "Mark Reviewed"
- "Escalate Case"
- "Copy Reply"
- "Open on Reddit"

### 3. Consensus Desk

Purpose: Prevent risky solo decisions and preserve team reasoning.

Required elements:

- Create ticket
- Target type
- Target display
- Proposed action
- Severity
- Reason
- Evidence links
- Vote threshold
- Approve/reject/needs-info vote
- Vote notes
- Status: pending, approved, rejected, expired, executed
- Manual execution confirmation
- Audit trail

High-impact actions:

- Permanent ban
- Long mute
- Thread lock
- Sticky announcement
- Emergency rule update
- Crisis/safety escalation
- Mass removal

Best safety copy:

> ModDesk OS records the team decision. The moderator still performs the final Reddit action manually unless the app is configured for a supported live action.

### 4. ModAcademy

Purpose: Train new moderators and reduce inconsistent decisions.

Scenario categories:

- Spam/self-promotion
- Harassment/civility
- Duplicate/megathread
- Brigading/raid risk
- Self-harm or safety escalation
- Political flamebait
- Modmail abuse
- New-account suspicious behavior
- Rule edge case
- Appeal handling

Required elements:

- Scenario title
- Content excerpt
- Reports
- Choose action
- Choose rule
- Confidence slider
- Score
- XP
- Feedback
- Missed concepts
- Training level

Important safety rule:

Do not reward removal volume. Reward correct judgment, escalation, and consistency.

### 5. Typewriter Templates

Purpose: Reduce repeated writing and make user-facing moderation more consistent.

Template categories:

- Civility warning
- Spam removal
- Duplicate redirect
- Appeal instructions
- Temporary lock explanation
- Safety escalation note
- Modmail abuse boundary
- Rule clarification

Required features:

- Template list
- Markdown editor
- Preview
- Macro insertion
- Copy to clipboard
- Save version
- Archive template

Macros:

- `{username}`
- `{post_title}`
- `{rule_link}`
- `{modmail_link}`
- `{subreddit_name}`
- `{removal_reason}`

### 6. Audit Log

Purpose: Build trust and make handoffs easier.

Events to log:

- Settings updated
- Training attempt
- Queue item reviewed
- Queue item escalated
- Consensus ticket created
- Vote recorded
- Vote updated
- Ticket approved/rejected
- Ticket marked executed
- Template created/updated/archived
- Demo data reset

Required features:

- Recent audit feed
- Actor
- Event type
- Entity
- Summary
- Timestamp
- Copy markdown summary

### 7. First-Run Setup Checklist

Purpose: Improve install experience.

Checklist:

- Confirm subreddit context
- Set consensus threshold
- Choose high-impact actions
- Review default templates
- Run one training scenario
- Escalate one sample queue item
- Copy audit summary

This should appear as a modal or dashboard panel until complete.

## Implementation Priority

### Priority 0: Submission Blockers

- Fix mojibake/corrupted emoji text.
- Remove or label simulated telemetry.
- Make the app copy honest about manual execution.
- Verify queue -> consensus -> vote -> execute -> audit flow.

### Priority 1: Winner Demo Flow

Create one flawless path:

1. Open app from moderator menu.
2. Show dashboard.
3. Open Live Queue.
4. Select a high-risk item.
5. Escalate it to Consensus.
6. Open Consensus Desk.
7. Cast a vote with a note.
8. Show threshold progress.
9. Mark approved case as manually executed.
10. Open Audit Logs.
11. Copy audit summary.
12. Open Typewriter and copy a response.
13. Open ModAcademy and complete one scenario.

### Priority 2: Practical Utility

- Add permalinks to queue items.
- Add copy-to-clipboard for templates.
- Add copy-to-clipboard for audit summaries.
- Add setup checklist.
- Add time-saved metrics.

### Priority 3: Extra Polish

- Add screenshots.
- Add short demo GIF/video.
- Tighten README.
- Add Devpost-ready copy.
- Add known limitations.
- Add roadmap.

## UI Copy Improvements

Replace unclear or overdramatic labels.

| Current Style | Better Style |
| --- | --- |
| Execute Decision Directive | Mark Decision Executed |
| Security Escalation | Escalate to Consensus |
| System Factory Reset | Reset Demo Data |
| Lock Case Proposal | Create Consensus Case |
| Inject Evidence | Add Evidence |
| Priority Queue Console | Queue Triage |
| Subreddit Copilot | Helper Notes |

Keep the retro aesthetic, but make moderation actions plain and trustworthy.

## Safety Principles

ModDesk OS should follow these safety rules:

- Never reward punitive volume.
- Never hide whether an action is manual or live.
- Never execute irreversible actions without confirmation.
- Never let a non-moderator access operational data.
- Never treat AI/simulated suggestions as authoritative.
- Always preserve audit context for high-impact decisions.

## Devpost Submission Draft

### Project Title

ModDesk OS: Consensus, Training, and Queue Triage for Mod Teams

### Elevator Pitch

ModDesk OS is a private Devvit Web workspace that helps Reddit moderator teams prioritize reports, coordinate high-impact decisions, train new moderators, reuse response templates, and keep a transparent audit trail.

### What It Does

ModDesk OS brings five moderator workflows into one installable Devvit app:

- **Queue Triage:** ranks reported content by severity, reports, age, and risk signals.
- **Consensus Desk:** lets moderators create evidence-backed tickets and vote before high-impact actions.
- **ModAcademy:** trains new moderators with realistic rule scenarios and feedback.
- **Typewriter Templates:** stores reusable moderation replies with macros and markdown preview.
- **Audit Log:** records important actions for transparency and team handoff.

### Inspiration

Moderation is not only about clicking approve or remove. Many of the hardest moderation problems happen around the queue: deciding what matters first, making consistent edge-case calls, training new moderators, writing clear user-facing explanations, and coordinating risky decisions across a volunteer team.

ModDesk OS was built to support that team workflow.

### How We Built It

- Devvit Web
- React 19
- Tailwind CSS 4
- Vite
- Hono server routes
- Redis-backed persistence through Devvit
- Reddit context and moderator checks through `@devvit/web/server`

### Challenges

- Designing useful moderation workflows without over-automating risky enforcement.
- Keeping the app honest about manual vs. live actions.
- Building a polished multi-window interface inside Devvit Web.
- Mapping live queue data into a safe triage model.
- Preserving auditability while keeping the UX fast.

### Accomplishments

- Built a full private moderator workspace.
- Added Redis persistence for settings, tickets, templates, training progress, queue state, and audit events.
- Created a consensus workflow for high-impact moderation decisions.
- Added training scenarios that reward careful judgment instead of removal volume.
- Built an audit trail so teams can review what happened and why.

### What We Learned

The most useful mod tools are not always the ones that automate the most. For high-risk moderation, the best tool can be the one that slows the team down just enough to make a better decision, while speeding up repetitive work everywhere else.

### What's Next

- Optional live Reddit actions for supported low-risk workflows.
- Better integration with subreddit removal reasons.
- More training scenario packs.
- Team analytics by rule category.
- More granular moderator role settings.
- Shadow-mode recommendations before enabling live actions.

## Project Impact Draft

Communities that would benefit:

1. **High-volume news or current-events communities**
   - Benefit: faster triage during breaking events, better handling of brigading and flamebait, structured consensus before locks or sticky announcements.

2. **Large gaming, fandom, or entertainment communities**
   - Benefit: spam waves, duplicate posts, and harassment reports can be prioritized and routed through standard templates.

3. **Support/help communities**
   - Benefit: new moderators can train on common cases, preserve tone consistency, and escalate sensitive safety reports instead of improvising.

Expected moderator benefits:

- Less time scanning flat queues.
- Fewer inconsistent high-impact decisions.
- Faster onboarding for new moderators.
- More consistent user-facing explanations.
- Better handoff between moderators in different time zones.

## Honest MVP Limitations

Use these limitations in the README or submission. They make the project look responsible.

- ModDesk OS currently records consensus decisions and manual execution confirmation instead of automatically performing permanent bans, mutes, or locks.
- Queue triage can ingest live queue data where Devvit APIs are available, but seeded demo data remains available for reliable testing.
- Template editing is Redis-backed and not yet synced to subreddit removal reasons.
- Real-time collaboration is refresh-based rather than websocket-based.
- The app is designed as a moderator workspace, not an autonomous enforcement bot.

## Launch-Ready Checklist

- [ ] Fix all corrupted emoji/text.
- [ ] Replace unclear button labels.
- [ ] Label simulated telemetry or remove it.
- [ ] Verify moderator-only access.
- [ ] Verify dashboard loads in Devvit playtest.
- [ ] Verify queue loads.
- [ ] Verify queue item can escalate to consensus.
- [ ] Verify ticket creation works.
- [ ] Verify voting works.
- [ ] Verify threshold status updates.
- [ ] Verify approved ticket can be marked executed.
- [ ] Verify audit events appear.
- [ ] Verify templates can be saved.
- [ ] Verify templates can be copied.
- [ ] Verify training scenario can be completed.
- [ ] Verify settings can be updated.
- [ ] Verify reset requires confirmation.
- [ ] Capture screenshots.
- [ ] Capture a short demo video or GIF.
- [ ] Update README.
- [ ] Publish app listing.
- [ ] Submit Devpost with clear impact story.

## Recommended Screenshots

1. Splash screen / launch state.
2. Main desktop dashboard.
3. Queue item selected with severity and suggested rules.
4. Consensus ticket with evidence and votes.
5. ModAcademy scenario and feedback.
6. Typewriter template editor and preview.
7. Audit log after the demo flow.
8. Settings/setup checklist.

## Final Judge Narrative

The demo should tell this story:

> A high-risk report appears in the queue. Instead of one moderator making a rushed decision, ModDesk OS prioritizes the item, lets the moderator escalate it, collects evidence, gathers team votes, records the outcome, provides a reusable user-facing response, and writes the whole process to an audit log. Meanwhile, new moderators can train on similar scenarios before they handle real cases.

That is the winning argument:

**ModDesk OS saves time where moderation is repetitive and adds structure where moderation is risky.**

## Sources

- [Reddit for Developers: Mod Tools on Reddit](https://developers.reddit.com/docs/introduction/intro-mod-tools)
- [Reddit for Developers: Mod Tool Quickstart](https://developers.reddit.com/docs/quickstart/quickstart-mod-tool)
- [Reddit Help: Moderation Queue](https://support.reddithelp.com/hc/en-us/articles/15484440494356-Moderation-Queue)
- [r/ModSupport: Devvit apps for moderation list](https://www.reddit.com/r/ModSupport/comments/1k6szsj/devvit_apps_for_moderation_a_list/)
- [r/ModSupport: What Devvit apps does your mod team use and why?](https://www.reddit.com/r/ModSupport/comments/1thrhjl/what_devvit_apps_does_your_mod_team_use_and_why/)
- [r/Devvit: TrustSignal architecture walkthrough](https://www.reddit.com/r/Devvit/comments/1t5qcyg/built_a_production_moderation_app_with_devvit/)
- [r/Devvit: Devvit 0.12.21 filter functionality](https://www.reddit.com/r/Devvit/comments/1sxhw5z/devvit_01221_filter_functionality_and/)
- [The Gray Area: Characterizing Moderator Disagreement on Reddit](https://arxiv.org/abs/2601.01620)
- [In the Queue: Understanding How Reddit Moderators Use the Modqueue](https://arxiv.org/abs/2509.07314)
