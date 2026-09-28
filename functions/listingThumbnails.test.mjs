import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createThumbnail, ensureListingThumbnail, thumbnailKey } from "./listingThumbnails.js";

test("thumbnail fits 640px, preserves aspect ratio and never upscales", async () => {
  for (const [width, height] of [[2000, 1000], [1000, 2000], [120, 80]]) {
    const input = await sharp({ create: { width, height, channels: 3, background: "red" } }).jpeg().toBuffer();
    const output = await createThumbnail(input);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "webp");
    assert.ok(metadata.width <= 640 && metadata.height <= 640);
    assert.ok(metadata.width <= width && metadata.height <= height);
    assert.equal(metadata.width / metadata.height, width / height);
  }
});

test("thumbnail merge preserves concurrent edits and does not resurrect removed photos", async () => {
  const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "blue" } }).jpeg().toBuffer();
  const key = "listings/upload/photo.jpg";
  for (const removed of [false, true]) {
    const listing = { listingId: "upload", userId: "owner", photos: [{ s3Key: key, name: "original" }] };
    const current = { ...listing, title: "Edited title", photos: removed ? [] : [{ s3Key: key, name: "edited name" }] };
    let update;
    const commands = [];
    const s3 = { send: async (command) => {
      commands.push(command);
      return { ContentLength: original.length, Metadata: { "uploaded-by": "owner" }, Body: { transformToByteArray: async () => original } };
    } };
    const ref = { get: async () => ({ exists: true, data: () => listing }) };
    const firestore = { runTransaction: async (callback) => callback({ get: async () => ({ exists: true, data: () => current }), update: (_, value) => { update = value; } }) };
    await ensureListingThumbnail({ firestore, ref, s3, bucket: "test" });
    assert.equal(commands[1].input.Key, thumbnailKey(key));
    assert.equal(commands[1].input.CacheControl, "public, max-age=31536000, immutable");
    if (removed) assert.equal(update, undefined);
    else assert.deepEqual(update, { photos: [{ s3Key: key, name: "edited name", thumbnailS3Key: thumbnailKey(key) }] });
  }
});

test("completed thumbnails are idempotent and foreign photo namespaces are rejected", async () => {
  const key = "listings/upload/photo.jpg";
  const call = (listing) => ensureListingThumbnail({ ref: { get: async () => ({ exists: true, data: () => listing }) }, s3: { send: () => { throw new Error("Unexpected S3 call"); } } });
  assert.deepEqual(await call({ photos: [{ s3Key: key, thumbnailS3Key: thumbnailKey(key) }] }), { skipped: true });
  await assert.rejects(call({ listingId: "different", photos: [{ s3Key: key }] }), /namespace/);
});
