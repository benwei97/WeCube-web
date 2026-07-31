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
- Browse, search, filter, and open listing details.
- Create a listing with photos.
- Message a seller.
- Mark a listing pending, available, and deleted.
- Submit listing, user, and conversation reports.
- Block and unblock a user.
- Save competitions and create a competition meetup listing.
- Edit profile name and avatar.
- Accept policies on a fresh account.
- Delete a test account.

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
- Re-test photo uploads against the target S3 bucket.
- Re-test Google/email auth against the target Firebase project.
- Re-test Firebase Functions calls for signed S3 upload/delete.

## App Store Review Notes

- Explain that WeCube is a marketplace for speedcubing puzzles.
- Explain that users arrange payment and fulfillment directly.
- Mention that WeCube does not process payments or provide escrow.
- Include a demo account if Apple review needs one.
