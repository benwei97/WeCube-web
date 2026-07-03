# QA Suite

This project uses Playwright for repeatable browser checks.

## Commands

Install Playwright browsers once:

```sh
npx playwright install
```

Run all QA tests:

```sh
npm run qa
```

Run only public smoke tests. This is the fastest repeatable check and does not need Firebase test accounts:

```sh
npm run qa:smoke
```

Open the Playwright report:

```sh
npm run qa:report
```

## Test Accounts

Authenticated marketplace tests are skipped unless these environment variables are set:

```sh
E2E_SELLER_EMAIL=
E2E_SELLER_PASSWORD=
E2E_BUYER_EMAIL=
E2E_BUYER_PASSWORD=
```

Use throwaway Firebase test accounts. Do not use real user accounts.

Playwright loads these values from the project `.env` file through `playwright.config.js`, so they do not need to be exported manually in the terminal.

## S3 CORS For Local QA

The authenticated publish-listing test uploads a sample image through a short-lived signed S3 URL. The S3 bucket must allow local browser uploads from the Vite dev server origin.

In the AWS S3 bucket permissions, configure CORS with the local origins:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Add the production domain to `AllowedOrigins` before production launch.

## Current Coverage

- Public page smoke checks
- Navigation checks
- Legacy dashboard redirects
- Auth modal rendering
- Authenticated sell-page validation
- Authenticated shippable listing creation

The suite currently runs one worker at a time against desktop Chromium. That keeps Firebase/S3-backed flows deterministic and avoids multiple browser workers creating or reading shared test state at the same time. Mobile should be added as a separate project once the mobile navigation and layout-specific checks have dedicated selectors.

## Manual QA Still Needed

Some flows depend on real Firebase/S3 state and should still be manually checked:

- Buyer sends message to seller
- Seller marks listing sold in app
- Seller marks listing sold off app
- Sold notice appears in all buyer chats
- Review prompt and review submission
- Public profile review cards and full review dialog
- Location filtering with shippable fallback
- Competition listing pages
- Mobile responsive pass
