import sharp from "sharp";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export const THUMBNAIL_SUFFIX = ".thumb-v1.webp";
export const thumbnailKey = (key) => `${key}${THUMBNAIL_SUFFIX}`;

export async function createThumbnail(bytes) {
  return sharp(bytes, { limitInputPixels: 60_000_000, animated: false })
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}

// Always merge against the latest document: photo edits can race image processing.
export async function ensureListingThumbnail({ firestore, ref, s3, bucket }) {
  const snapshot = await ref.get();
  if (!snapshot.exists) return { skipped: true };
  const listing = snapshot.data();
  const photo = listing.photos?.[0];
  if (!photo?.s3Key || photo.s3Key.endsWith(THUMBNAIL_SUFFIX)) return { skipped: true };
  const key = thumbnailKey(photo.s3Key);
  if (photo.thumbnailS3Key === key) return { skipped: true };
  if (!listing.listingId || !photo.s3Key.startsWith(`listings/${listing.listingId}/`) || photo.s3Key.includes("..")) {
    throw new Error("Photo is outside this listing's upload namespace.");
  }
  const original = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: photo.s3Key }));
  if (original.ContentLength > 10 * 1024 * 1024) throw new Error("Photo exceeds upload limit.");
  if (original.Metadata?.["uploaded-by"] && original.Metadata["uploaded-by"] !== listing.userId) {
    throw new Error("Photo owner does not match listing owner.");
  }
  const bytes = await original.Body.transformToByteArray();
  const thumbnail = await createThumbnail(bytes);
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: thumbnail, ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
    Metadata: { "source-key": photo.s3Key },
  }));
  await firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) return;
    const photos = current.data().photos || [];
    if (!photos.some((entry) => entry.s3Key === photo.s3Key && entry.thumbnailS3Key !== key)) return;
    transaction.update(ref, { photos: photos.map((entry) => entry.s3Key === photo.s3Key
      ? { ...entry, thumbnailS3Key: key } : entry) });
  });
  return { originalBytes: bytes.byteLength, thumbnailBytes: thumbnail.byteLength };
}
