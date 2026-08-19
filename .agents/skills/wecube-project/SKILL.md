---
name: wecube-project
description: Use when working on the WeCube marketplace codebase, especially web/iOS parity, Firebase/S3 behavior, launch readiness, App Store/TestFlight preparation, marketplace safety, messaging, reviews, listings, policies, or project-specific design decisions.
---

# WeCube Project

Use this skill as the project handoff before making WeCube changes.

## First Reads

Read only what is relevant to the task:

- `README.md` for architecture, routes, data model, and current marketplace behavior.
- `docs/current-handoff.md` for the latest local working-memory context from the previous session.
- `docs/web-app-feature-flow-layout-reference.md` for web-to-iOS parity, feature flows, and current native iOS handoff notes.
- `mobile/IOS_RELEASE_CHECKLIST.md` for iOS build, TestFlight, App Store, auth, env, and manual QA.
- `docs/firebase-rules-functionality-map.md` before changing Firestore rules.
- `docs/content-guardrails-plan.md` before changing reporting, blocking, moderation, safety, account deletion, or policy flows.
- `docs/launch-plan.md` before changing launch-scope priorities.
- `docs/qa.md` before changing test coverage or release QA.

## Project Rules

- For every code change, provide a corresponding commit message.
- Preserve user changes in the working tree; never revert unrelated files.
- Keep `mobile/.env.local`, staging env files, Firebase secrets, and AWS keys uncommitted.
- Web and iOS share the same Firebase/S3 data contracts. Do not fork collection names or field semantics unless explicitly requested.
- Web is the source of truth for marketplace behavior. iOS may adapt layout natively, but auth, listing visibility, messaging, reports, reviews, saved items, and status transitions should match.
- Do not expose another user's email on public marketplace surfaces.

## High-Risk Areas

- Reviews are user-to-user: one reviewer can review one recipient once, regardless of how many listings were bought or sold.
- Listing status transitions have side effects for conversations, sold notices, review prompts, and availability.
- Firestore rules changes can easily break existing auth, messaging, reports, reviews, saved listings, and admin flows. Check the rules functionality map first.
- Firebase Auth provider changes must be aligned across Firebase Console, Google Cloud OAuth clients, Apple Developer, EAS env vars, and TestFlight builds.
- S3 upload changes involve Firebase Functions secrets, signed upload URLs, IAM policy, bucket CORS, and public read/bucket policy behavior.

## iOS Keyboard Note

The main iOS conversation thread should keep the stable chat keyboard implementation: a screen-level `KeyboardAvoidingView` around the thread and composer. If review/report typing is blocked by the keyboard, isolate the fix inside those modal inputs instead of adding custom keyboard spacer state to the conversation screen.
