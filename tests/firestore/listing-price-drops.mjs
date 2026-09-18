import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { handleListingPriceChange, getListingPriceChange } from "../../functions/listingPriceDrops.js";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "This test requires the Firestore emulator.");
const require = createRequire(new URL("../../functions/index.js", import.meta.url));
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "demo-wecube" });
const db = admin.firestore();
const listing = db.collection("listings").doc("discount-test");
await db.collection("users").doc("seller").set({ firstName: "Ben" });
await listing.set({ price: 100, title: "GAN Cube", userId: "seller", status: "active" });
for (const [id, extra] of Object.entries({ active: {}, rejected: { status: "rejected" }, closed: { closedReason: "listing_deleted" }, blocked: { buyerId: "blocked-buyer" }, newer: { lastMessageAt: admin.firestore.Timestamp.fromDate(new Date("2099-01-01")), lastMessage: "Newer chat message" } })) {
  await db.collection("conversations").doc(id).set({
    listingId: listing.id, sellerId: "seller", buyerId: "buyer", status: "approved", ...extra,
  });
}
async function editPrice(price, eventId) {
  const before = await listing.get();
  await listing.update({ price });
  const after = await listing.get();
  return { id: eventId, params: { listingId: listing.id }, data: { before, after } };
}
const blocked = async (buyer) => buyer === "blocked-buyer";
const drop = await editPrice(80, "first-drop");
await handleListingPriceChange(db, drop, blocked);
await handleListingPriceChange(db, drop, blocked);
assert.equal((await listing.get()).data().previousPrice, 100);
let messages = await db.collection("messages").get();
assert.equal(messages.size, 2, "Retry must not duplicate notices; closed/rejected/blocked chats excluded.");
assert.ok(messages.docs.every((message) => message.data().text === 'Ben dropped the price of "GAN Cube" to $80.00.'));
assert.equal((await db.collection("conversations").doc("active").get()).data().lastMessageType, "system");
assert.equal((await db.collection("conversations").doc("newer").get()).data().lastMessage, "Newer chat message");
const secondDrop = await editPrice(70, "second-drop");
await handleListingPriceChange(db, secondDrop, blocked);
assert.equal((await listing.get()).data().previousPrice, 80);
const increase = await editPrice(90, "increase");
await handleListingPriceChange(db, increase, blocked);
assert.equal((await listing.get()).data().previousPrice, null);
messages = await db.collection("messages").get();
assert.equal(messages.size, 4, "Increase must not send a price-drop notice.");
assert.equal(getListingPriceChange({ price: 90 }, { price: 90 }), null);
assert.equal(getListingPriceChange({ price: undefined }, { price: 10 }), null);
assert.deepEqual(getListingPriceChange({ price: 10 }, { price: 0 }), { previousPrice: 10, dropped: true });
console.log("Price-drop tests passed: displays, repeat drops, increase/reset, retry idempotency, eligible chats, newer preview preservation, zero/unchanged/invalid prices.");
await admin.app().delete();
