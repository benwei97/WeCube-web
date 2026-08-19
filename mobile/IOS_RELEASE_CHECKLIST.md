# WeCube iOS Release Checklist

## One-Time Setup

- Create an Apple Developer account.
- In Firebase, add an iOS app for the same Firebase project you want this build to use.
- Use the bundle identifier from `app.json`: `app.wecube.ios`.
- Download the iOS Firebase config if you later move to native Firebase SDKs. The current Expo app uses the existing web Firebase JS config through `EXPO_PUBLIC_*` env vars.
- Install and sign in to EAS CLI:
  ```sh
  npm install --global eas-cli
  eas login
  ```
- Run EAS project setup from the `mobile` folder:
  ```sh
  eas init
  ```

## Environment

- Keep `mobile/.env.local` uncommitted.
- For staging builds, use staging Firebase and staging S3 values in `mobile/.env.local`.
- For production/TestFlight builds, use production Firebase and production S3 values.
- Confirm `EXPO_PUBLIC_DONATION_URL` is set if the Donate button should open Ko-fi.
- EAS production builds only receive the values present in the build environment at build time. After changing env vars, create a new EAS build.
- Firebase production auth must allow the iOS OAuth client ids used by the mobile env vars.
- Sign in with Apple must be configured in Apple Developer and Firebase Auth before App Store review if third-party social sign-in remains enabled.

## Local QA

Run from the repo root:
```sh
npm run lint
```

Run from `mobile`:
```sh
npm run export:ios
npm run ios:lan
```

Smoke test:
- Sign up, verify email, sign in, sign out.
- Sign in with Google.
- Sign in with Apple.
- Reset password from the dedicated reset-password flow.
- Browse, search, filter, and open listing details.
- Create a listing with photos.
- After posting a listing, confirm the app navigates directly to the new listing.
- Message a seller and confirm unread chat badges clear when opening the conversation.
- Confirm the active conversation does not keep showing an unread badge while you are already in that chat.
- Mark a listing pending, available, sold in-app, sold off-app, and deleted.
- Confirm sold in-app requires selecting a buyer and confirming before status changes.
- Submit listing, user, and conversation reports.
- Block and unblock a user.
- Save competitions and create a competition meetup listing.
- Edit a listing as the owner.
- Save and unsave listings.
- Submit a review from the in-chat review prompt.
- Edit profile name and avatar.
- Accept policies on a fresh account.
- Delete a test account.

Keyboard and layout checks:
- In a conversation, opening the composer should use the standard chat keyboard behavior and should not create a delayed spacer or jumpy input.
- In report/review modals, multiline text inputs should let the user dismiss the keyboard with Done or tapping outside.
- The conversation implementation intentionally keeps the main thread on a screen-level `KeyboardAvoidingView`; review/report keyboard fixes should stay inside those modals.
- Scrollable screens should end at the bottom tab bar without an extra white barrier covering content.

## TestFlight

Build an internal preview:
```sh
npm run build:ios:preview
```

Build production for App Store Connect/TestFlight:
```sh
npm run build:ios:production
```

After upload:
- Add the build to TestFlight.
- Test on at least one real iPhone.
- If iPad support remains enabled, test iPad layout and provide iPad screenshots in App Store Connect.
- Re-test photo uploads against the target S3 bucket.
- Re-test Google/email auth against the target Firebase project.
- Re-test Sign in with Apple against the target Firebase project.
- Re-test Firebase Functions calls for signed S3 upload/delete.

## App Store Review Notes

- Explain that WeCube is a marketplace for speedcubing puzzles.
- Explain that users arrange payment and fulfillment directly.
- Mention that WeCube does not process payments or provide escrow.
- Include a demo account if Apple review needs one.
- App privacy should disclose account identity, user content, messages, photos, listings, location/search/product interaction as applicable to the shipped build.
