// Uses Google Application Default Credentials and the standard AWS credential chain.
// Dry run by default. Run with --apply only after reviewing the candidate count.
import admin from "firebase-admin";
import { S3Client } from "@aws-sdk/client-s3";
import { ensureListingThumbnail, thumbnailKey } from "../listingThumbnails.js";

const projectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) throw new Error("Set GOOGLE_CLOUD_PROJECT explicitly.");
const apply = process.argv.includes("--apply");
if (apply && (!process.env.S3_BUCKET_NAME || !process.env.AWS_REGION)) throw new Error("Set S3_BUCKET_NAME and AWS_REGION.");
admin.initializeApp({ projectId });
const firestore = admin.firestore();
const s3 = new S3Client({ region: process.env.AWS_REGION });
let cursor;
let candidates = 0;
let processed = 0;
let failures = 0;
do {
  let query = firestore.collection("listings").orderBy(admin.firestore.FieldPath.documentId()).limit(50);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  for (const doc of page.docs) {
    const photo = doc.data().photos?.[0];
    if (!photo?.s3Key || photo.thumbnailS3Key === thumbnailKey(photo.s3Key)) continue;
    candidates++;
    if (!apply) continue;
    try {
      await ensureListingThumbnail({ firestore, ref: doc.ref, s3, bucket: process.env.S3_BUCKET_NAME });
      processed++;
    } catch (error) { failures++; console.error(doc.id, error.message); }
  }
  cursor = page.docs.at(-1);
  console.log({ mode: apply ? "apply" : "dry-run", candidates, processed, failures });
} while (cursor);
await admin.app().delete();
if (failures) process.exitCode = 1;
