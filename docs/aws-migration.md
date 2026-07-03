# AWS S3 Migration

This app uses S3 for listing photos and user avatars. Browser uploads now go through Firebase Cloud Functions:

1. The signed-in browser asks a callable function for a short-lived S3 upload URL.
2. The function validates the user and requested upload type.
3. The function signs a temporary S3 `PUT` URL with server-side AWS credentials.
4. The browser uploads the image directly to S3 with that temporary URL.

AWS credentials must stay out of `VITE_` variables because `VITE_` values are bundled into browser JavaScript.

## Browser App Variables

Set these in `.env` locally and in the production frontend environment:

```sh
VITE_AWS_REGION=us-east-2
VITE_S3_BUCKET_NAME=<bucket-name>
VITE_S3_PUBLIC_BASE_URL=
VITE_FIREBASE_FUNCTIONS_REGION=us-central1
```

If images are served through CloudFront or another public domain, set `VITE_S3_PUBLIC_BASE_URL` to that base URL:

```sh
VITE_S3_PUBLIC_BASE_URL=https://cdn.example.com
```

## Cloud Functions Runtime Variables

Set these in the Firebase Functions runtime environment, not the browser app:

```sh
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=<server-side-access-key>
AWS_SECRET_ACCESS_KEY=<server-side-secret-key>
S3_BUCKET_NAME=<bucket-name>
```

For local emulator testing, place those values in `functions/.env`. Do not commit that file.

## New Account Setup

1. Create a new S3 bucket in the target AWS account.
2. Configure CORS for the local and production app origins.
3. Allow public reads for uploaded objects, or put CloudFront in front of the bucket and set `VITE_S3_PUBLIC_BASE_URL`.
4. Create a narrowly scoped IAM user or role for the Cloud Function.
5. Set AWS credentials only in the Functions runtime environment.
6. Copy existing objects from the old bucket to the new bucket if current listings must keep their images.
7. Rotate or delete any AWS key that was previously exposed through `VITE_AWS_*`.

## Example CORS

Replace the origins with the real local and production URLs.

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD", "PUT", "DELETE"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://your-production-domain.example"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## Example IAM Policy

Replace `<bucket-name>` before attaching this to the upload identity.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<bucket-name>/*"
    }
  ]
}
```

For tighter production controls, scope the resource to `listings/*` and `avatars/*`.
