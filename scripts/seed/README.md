# Seed Listing Workflow

This workflow creates temporary seller accounts and realistic cube listings for testing WeCube with marketplace inventory.

The script:

- Reads Firebase config from `.env` by default.
- Creates or signs in test seller accounts.
- Creates matching Firestore user profiles for newly created sellers.
- Generates simple cube-style PNG images locally.
- Uploads those generated images through the existing Firebase Function/S3 signed upload flow.
- Creates active listings through the normal client Firestore permissions.
- Uses deterministic `listingId` values so rerunning the script skips listings it already created.

## Requirements

Before running with `--write`:

1. Firebase Functions must be deployed.
2. Firestore rules must be deployed.
3. Firebase Functions secrets/config for S3 must be set.
4. Root `.env` must contain the public Vite Firebase/S3 values.
5. Set a temporary seed user password.

Do not use a real personal password for seed users.

## Dry Run

Preview what would be created without writing anything:

```bash
npm run seed:listings
```

## Create Seed Data

Create 5 sellers with 5 listings each:

```bash
SEED_USER_PASSWORD='Use-A-Temporary-Password-Here' npm run seed:listings -- --write
```

The default test seller emails are:

```text
seller1@wecube-seed.test
seller2@wecube-seed.test
seller3@wecube-seed.test
seller4@wecube-seed.test
seller5@wecube-seed.test
```

You can use a different email domain:

```bash
SEED_USER_PASSWORD='Use-A-Temporary-Password-Here' npm run seed:listings -- --write --email-domain example.com
```

You can change how many listings are created per seller:

```bash
SEED_USER_PASSWORD='Use-A-Temporary-Password-Here' npm run seed:listings -- --write --listings-per-seller 3
```

## Optional Video

The script can attach one local video file to some listings. Provide a small WebM file:

```bash
SEED_USER_PASSWORD='Use-A-Temporary-Password-Here' npm run seed:listings -- --write --video scripts/seed/media/demo.webm
```

Keep the file small. The backend limit is 100 MB, but seed uploads should be lightweight.

## Different Env File

Use a different env file:

```bash
SEED_USER_PASSWORD='Use-A-Temporary-Password-Here' npm run seed:listings -- --write --env .env.production.local
```

## Cleanup

This script intentionally does not delete seed data. Cleanup should be done manually from Firebase Console or with a separate cleanup script after confirming what should be removed.

The deterministic `listingId` values are shaped like:

```text
seed_1_1
seed_1_2
seed_2_1
```

That makes seed listings easy to find in Firestore.
