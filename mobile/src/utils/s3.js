/* global process */
export function getS3PublicUrl(s3Key) {
  if (!s3Key) return null;

  const publicBaseUrl = process.env.EXPO_PUBLIC_S3_PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, "")}/${s3Key}`;
  }

  const bucketName = process.env.EXPO_PUBLIC_S3_BUCKET_NAME;
  const region = process.env.EXPO_PUBLIC_AWS_REGION;
  return `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
}
