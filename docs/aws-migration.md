# AWS S3 Migration

This app currently uses S3 for listing photos and user avatars. The active bucket/account is selected by Vite environment variables, so moving AWS accounts should not require code changes after setup.

## Required App Variables

Set these in `.env` locally and in the production deploy environment:

```sh
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=<new-account-access-key>
VITE_AWS_SECRET_ACCESS_KEY=<new-account-secret-key>
VITE_S3_BUCKET_NAME=<new-bucket-name>
VITE_S3_PUBLIC_BASE_URL=
```

If images are served through CloudFront or another public domain, set `VITE_S3_PUBLIC_BASE_URL` to that base URL, for example:

```sh
VITE_S3_PUBLIC_BASE_URL=https://cdn.example.com
```

## New Account Setup

1. Create a new S3 bucket in the target AWS account.
2. Configure CORS for the local and production app origins.
3. Allow public reads for uploaded objects, or put CloudFront in front of the bucket and set `VITE_S3_PUBLIC_BASE_URL`.
4. Create a narrowly scoped IAM user or role for uploads and deletes.
5. Replace the local and production AWS env vars with credentials from the new account.
6. Copy existing objects from the old bucket to the new bucket if current listings must keep their images.
7. Rotate or delete the old browser-exposed AWS access key after the new bucket is verified.

## Example CORS

Replace the origins with the real local and production URLs.

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD", "PUT", "DELETE"],
    "AllowedOrigins": [
      "http://localhost:5173",
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

## Important Security Note

Because this is a browser app, any `VITE_AWS_*` secret is visible to users in the built JavaScript. The safer long-term design is to remove static AWS credentials from the frontend and upload through short-lived presigned URLs from a trusted backend.
