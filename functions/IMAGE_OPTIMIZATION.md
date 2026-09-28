# Listing image optimization

## Behavior

- `generateListingThumbnail` runs after listing writes and creates a 640px, quality-78 WebP for the cover photo. It records `photos[0].thumbnailS3Key` only after S3 upload succeeds.
- Originals are retained, untouched, for detail views. New cover selections are processed automatically. Clients fall back to originals if a thumbnail fails to load.
- Thumbnail writes merge into the latest photo array in a transaction, preserving concurrent edits. Failed/corrupt images are logged rather than blocking publishing. The backfill can retry failures.
- Thumbnails have immutable one-year HTTP cache headers and a versioned filename. `deleteS3Objects` removes a photo's thumbnail along with its original.
- Web prioritizes the first four images and lazy-loads the rest. Both clients look ahead by at most four thumbnails; mobile uses `expo-image` disk/memory caching. No original photos are prefetched.
- Recommendation ranking, filtering, counts and the Firestore listing query are unchanged. Server-side feed pagination is deferred because merely limiting the existing collection query would produce incomplete recommendations, search and counts.

## Deploy

From the repo root:

```sh
firebase deploy --only functions:generateListingThumbnail,functions:deleteS3Objects --project wecube-ef14f
```

The thumbnail function uses the existing AWS secrets and `AWS_REGION`/`S3_BUCKET_NAME` Functions environment. Its IAM identity needs `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` for `listings/*`. Do not make the bucket writable publicly. Existing public image-read configuration must also cover the `.thumb-v1.webp` objects.

Deploy the web app normally. Build a new iOS binary: `expo-image` is a new native dependency, so an update to an older binary is not sufficient. No Firestore rules/index changes are required.

## Existing listings

The script is resumable: already-optimized covers are skipped. It reads documents in batches of 50 and processes images sequentially. Default mode is read-only. Use trusted local Google Application Default Credentials and an AWS profile with the permissions above. Do not put credentials in this repository.

```sh
cd functions
# If ADC is not already configured:
gcloud auth application-default login

export GOOGLE_CLOUD_PROJECT=wecube-ef14f
export AWS_REGION=us-east-2
export S3_BUCKET_NAME=wecube-media-us-east-2
# Select your configured AWS profile if needed:
# export AWS_PROFILE=wecube

node scripts/backfill-thumbnails.mjs
# Review the dry-run candidate count before writing:
node scripts/backfill-thumbnails.mjs --apply
```

After deployment/backfill, inspect a listing's `photos[0].thumbnailS3Key`, verify its public URL returns `200 image/webp`, and test image deletion. If generation fails, check Functions logs and AWS GetObject/PutObject permissions; browse continues using originals.

## Measured result (2026-09-28)

Eight public listing photos sampled from local Browse with production read-only data. The same original bytes and generated thumbnails were replayed through a local HTTP server into Chromium. Cold cache, 4 Mbps download, 80 ms latency; three alternating runs, all eight images fetched and decoded. This isolates image payload/decode cost, not Firestore, production CDN latency, native frame rate, or whole-page load time.

| Measure | Original | Thumbnail |
| --- | ---: | ---: |
| Total bytes | 18,677,244 | 172,162 |
| Run 1 | 37,522 ms | 444 ms |
| Run 2 | 37,526 ms | 441 ms |
| Run 3 | 37,518 ms | 442 ms |
| Median | 37,522 ms | 442 ms |

99.1% fewer bytes and 84.89x faster image-ready time in this controlled sample. Results vary with source photo size/network; these are not production end-to-end or on-device measurements. Production has not been modified by this benchmark.

Reproduce from the repo root with the local web server on port 5175:

```sh
node functions/scripts/benchmark-images.mjs
node --test functions/listingThumbnails.test.mjs
```

`BENCHMARK_URL` can override the source page. The script reads public photos only and does not upload or modify any listing.
