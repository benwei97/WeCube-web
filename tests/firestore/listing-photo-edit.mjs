import assert from "node:assert/strict";
import { createRequire } from "node:module";

const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(host, "This test requires the Firestore emulator.");
const require = createRequire(new URL("../../functions/index.js", import.meta.url));
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "demo-wecube" });
await admin.firestore().collection("listings").doc("photo-edit").set({
  userId: "seller", listingId: "listing-photo-edit", title: "Cube", price: 10,
  description: "A cube", condition: "like-new", puzzleType: "3x3", status: "active",
  createdAt: admin.firestore.Timestamp.now(), soldAt: null,
  photos: [{ s3Key: "old.jpg" }], shippingAvailable: true, shippingIncluded: true,
  shippingCost: 0, localMeetupAvailable: false, competitionMeetupAvailable: false,
});
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
async function replace(uid, keys) {
  const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: uid, user_id: uid, aud: "demo-wecube", iss: "https://securetoken.google.com/demo-wecube",
    exp: Math.floor(Date.now() / 1000) + 3600, email_verified: true,
    firebase: { sign_in_provider: "google.com" },
  })}.`;
  return fetch(`http://${host}/v1/projects/demo-wecube/databases/(default)/documents/listings/photo-edit?updateMask.fieldPaths=photos`, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { photos: { arrayValue: { values: keys.map((key) => ({ mapValue: { fields: { s3Key: { stringValue: key } } } })) } } } }),
  });
}
let response = await replace("seller", ["new.jpg"]);
assert.equal(response.status, 200, await response.text());
for (const [user, keys] of [["other", ["other.jpg"]], ["seller", []], ["seller", Array(6).fill("extra.jpg")]]) {
  response = await replace(user, keys);
  assert.equal(response.status, 403);
}
console.log("Photo-edit rules passed: owner replacement allowed; other users and invalid photo counts rejected.");
await admin.app().delete();
