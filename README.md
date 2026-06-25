# WeCube

WeCube is a React/Vite marketplace app for buying and selling speedcubes and puzzle-related items. It uses Firebase for auth/data, S3 for images, Mapbox/OpenStreetMap for approximate meetup maps, and WCA competition data for competition meetup options.

## Current Stack

- React 19 + Vite
- Material UI
- Firebase Auth + Firestore
- AWS S3 for listing photos and avatars
- Mapbox GL with OSM fallback for approximate meetup maps
- WCA API utilities for US competition lookup

## Setup

Install dependencies:

```sh
npm install
```

Create `.env` from `.env.example` and fill in Firebase, AWS, and Mapbox values:

```sh
cp .env.example .env
```

Run locally:

```sh
npm run dev
```

Build:

```sh
npm run build
```

Lint:

```sh
npm run lint
```

Known lint note: full lint currently reports a Fast Refresh rule issue in `src/components/ListingStatusDecorators.jsx` because that file exports style constants/functions in addition to components. Several pages also have existing hook dependency warnings.

## Environment Variables

Firebase:

```sh
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

AWS/S3:

```sh
VITE_AWS_REGION=
VITE_AWS_ACCESS_KEY_ID=
VITE_AWS_SECRET_ACCESS_KEY=
VITE_S3_BUCKET_NAME=
VITE_S3_PUBLIC_BASE_URL=
```

Maps:

```sh
VITE_MAPBOX_ACCESS_TOKEN=
```

For AWS account migration notes, see [docs/aws-migration.md](docs/aws-migration.md).

Important: the current S3 implementation uses `VITE_AWS_*` variables in the browser bundle. That works for development but exposes credentials to users. A safer future design is a backend that returns short-lived presigned upload/delete URLs.

## Main Routes

- `/` - Browse listings
- `/sell` - Create a listing
- `/listing/:id` - Listing detail and seller controls
- `/messages` and `/messages/:conversationId` - Messaging and request management
- `/dashboard` - Account dashboard, listings, and purchases
- `/my-listings`, `/my-purchases`, `/my-reviews` - legacy redirects to `/dashboard`
- `/seller/:userId` and `/user/:userId` - Public seller profile
- `/competitions` - WCA competitions
- `/competitions/:competitionId/listings` - Listings available at a competition

## Listing Data Model

Listings are stored in Firestore `listings`.

Important fields:

- `status`: `"active"`, `"archived"`, or `"sold"`
- `archived` status is used as user-facing `Pending`
- `userId`: seller id
- `buyerId`: buyer id for attributed completed sale
- `soldAt`: sale timestamp
- `soldMethod`: sale attribution method
- `soldConversationId`: conversation tied to attributed sale
- `photos`: S3 photo metadata
- `shippingAvailable`, `shippingIncluded`, `shippingCost`
- `localMeetupAvailable`, `meetupLocationLabel`, `meetupLocation`
- `competitionMeetupAvailable`, `competitions`, `meetupCompetitionTags`

Status behavior:

- `active`: available for buyers to message
- `archived` / Pending: still visible on listing pages, but buyers cannot message through the listing
- `sold`: visible for a limited window, dimmed thumbnails and sold pill badge

When a sold listing is changed back to `active` or `archived`, sale attribution fields are cleared and transaction reviews for that listing are deleted. This handles premature sales that fall through.

## Fulfillment Display

Cards show one primary fulfillment line:

1. Local meetup location, if applicable
2. Competition name, if applicable
3. `Ships to you`, if shipping is the relevant option

With a location filter, shipped listings remain included; if the local/competition location is outside range, card text can fall back to `Ships to you`.

Key files:

- `src/components/ListingFulfillmentLine.jsx`
- `src/utils/listingUtils.js`
- `src/pages/Browse.jsx`

## Location and Competition Scope

The app is currently US-only.

- Location search filters Open-Meteo results to US city-like locations in `src/utils/locationSearch.js`
- WCA competition utilities filter competitions to USA in `src/utils/wcaApi.js`

## Selling and Editing Listings

Create listing:

- `src/pages/Sell.jsx`
- Required fields turn red after publish attempt
- Top-screen red snackbar appears for missing required fields
- Uploads listing photos to S3

Edit listing:

- `src/pages/ListingDetail.jsx`
- Edit dialog mirrors sell-page validation with red required fields
- Save failures use in-app snackbar instead of browser alerts
- Description preserves spaces and paragraphs via `whiteSpace: "pre-wrap"`

Listing detail seller actions:

- Main button: `Mark as Sold` or `Mark as Available`
- Three-dot menu: edit listing, mark pending/available, delete
- Marking sold asks the seller to select the buyer conversation that completed the sale
- Delete removes uploaded listing photos from S3 and deletes the Firestore listing

Dashboard marketplace management:

- `src/pages/Dashboard.jsx`
- Consolidates profile, selling summary, listings, and purchases
- Listing cards are directly clickable
- Listing three-dot action menu appears in the title row
- Listing action menu includes status actions and delete
- `Mark as Sold` opens the listing detail sold flow so the seller can pick the buyer
- Purchases are shown as a concise dashboard section instead of a separate primary page

## Messaging

Messaging utilities live in `src/utils/messaging.js`.

Current behavior:

- Buyers send message requests before a conversation is approved
- Sellers approve/reject pending requests
- Listing detail message request success/failure uses in-app snackbar
- Pending listings disable contact and show `Pending`
- Sold listing conversations remain open so users can keep chatting
- When a seller marks a listing sold, only the selected buyer/seller conversation receives a `Rate your experience` review prompt message

Sale review prompts:

- The selected buyer conversation is approved before the sold review prompt is posted
- Other conversations for the listing are left open and do not receive review prompts
- The prompt appears as an unread inbox notification for both buyer and seller
- Opening the conversation marks that review prompt notification as read
- The prompt appears in chat as a card with `Leave Review` and `No Thanks`
- Declining only hides/dismisses that prompt for the current user
- Normal chat remains available after the prompt
- Reverting a sold listing cancels active review prompts and posts a system message explaining that the review request was closed

## Reviews and Post-Sale Prompts

Review utilities live in `src/utils/reviews.js`.

Listing transaction review document id:

```js
`${listingId}_${reviewerId}`
```

Conversation experience review document id:

```js
`${conversationId}_${reviewerId}`
```

Current review model:

- Chat-based review prompts are created when a listing is marked sold
- Either participant in a prompted conversation can review the other participant
- Reviews are experience reviews, not strictly confirmed-purchase reviews
- The prompt stores per-user dismiss/submitted state locally in the browser to avoid mutating message documents
- Submitted reviews are written to `reviews`
- Reverting a sold listing removes stale review documents for that listing and disables active prompts

Pages/components:

- `src/pages/Dashboard.jsx` - account dashboard with profile, listings, and purchases
- `src/pages/Messages.jsx` - in-chat review prompt rendering and review dialog

When sold status is reverted, `deleteTransactionReviews(listingId)` removes stale review documents for that transaction.

## Images and S3

S3 utilities live in `src/utils/s3.js`.

Images:

- Listing photos upload to S3
- Avatars upload to S3
- URLs are generated by `getS3PublicUrl()`
- Supports optional `VITE_S3_PUBLIC_BASE_URL` for CloudFront/custom domains

Known security concern: frontend AWS credentials should be replaced by presigned backend uploads before production.

## Maps

Approximate meetup maps live in `src/components/ApproximateMeetupMap.jsx`.

Behavior:

- Uses Mapbox when `VITE_MAPBOX_ACCESS_TOKEN` exists
- Falls back to OSM embed when Mapbox is unavailable
- Shows an approximate radius around meetup area, not exact address

## UI Notes

- App primary color is defined in `src/theme.js` as `#646cff`
- Orange/warning UI has been removed from core listing workflows
- Pending is red
- Sold overlay is a pill badge, not a diagonal ribbon
- Sold thumbnails remain dimmed
- Cards should stay compact; management actions generally live in three-dot menus

## Key Files

- `src/App.jsx` - app shell/routes
- `src/pages/Browse.jsx` - browsing/filtering/listing cards
- `src/pages/Sell.jsx` - listing creation
- `src/pages/ListingDetail.jsx` - listing view/edit/seller actions/mark sold
- `src/pages/Dashboard.jsx` - profile, seller listing management, and purchases
- `src/pages/Messages.jsx` - messages, pending requests, and in-chat review prompts
- `src/components/ListingStatusDecorators.jsx` - card style constants and sold/pending badges
- `src/utils/listingUtils.js` - listing normalization, fulfillment display, sorting
- `src/utils/messaging.js` - conversations/message requests/sold review prompts
- `src/utils/reviews.js` - review CRUD/subscriptions/review cleanup
- `src/utils/s3.js` - S3 uploads/deletes/public URLs
- `src/utils/locationSearch.js` - US city search
- `src/utils/wcaApi.js` - WCA competition fetching/filtering

## Current Verification Baseline

Recent targeted checks have passed for edited files. Full production build has been passing:

```sh
npm run build
```

Known warnings:

- Vite warns that some chunks are larger than 500 kB.
- ESLint full-run can report Fast Refresh issues in `ListingStatusDecorators.jsx` because it exports non-component constants/functions.
- Some existing hook dependency warnings remain in page components.
