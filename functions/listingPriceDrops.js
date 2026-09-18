import { createHash } from "node:crypto";

export function getListingPriceChange(before, after) {
  if (!Number.isFinite(before?.price) || !Number.isFinite(after?.price)
    || before.price === after.price) return null;
  return { previousPrice: after.price < before.price ? before.price : null, dropped: after.price < before.price };
}

export async function handleListingPriceChange(firestore, event, isBlockedBetween) {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const change = getListingPriceChange(before, after);
  if (!change || !after.userId) return;
  const listingRef = event.data.after.ref;
  const changedAt = event.data.after.updateTime;
  await firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(listingRef);
    if (!current.exists || current.data().price !== after.price) return;
    if ((current.data().priceChangedAt?.toMillis() || 0) >= changedAt.toMillis()) return;
    transaction.update(listingRef, { previousPrice: change.previousPrice, priceChangedAt: changedAt });
  });
  if (!change.dropped || after.status !== "active") return;

  const [seller, conversations] = await Promise.all([
    firestore.collection("users").doc(after.userId).get(),
    firestore.collection("conversations").where("listingId", "==", event.params.listingId).get(),
  ]);
  const name = seller.data()?.firstName || seller.data()?.displayName || "The seller";
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(after.price);
  const text = `${name} dropped the price of "${after.title}" to ${price}.`;
  const eventKey = createHash("sha256").update(event.id).digest("hex").slice(0, 32);
  for (const conversationDoc of conversations.docs) {
    const conversation = conversationDoc.data();
    if (conversation.sellerId !== after.userId || conversation.status !== "approved"
      || conversation.closedReason) continue;
    if (await isBlockedBetween(conversation.buyerId, conversation.sellerId)) continue;
    const messageRef = firestore.collection("messages").doc(`price_drop_${eventKey}_${conversationDoc.id}`);
    await firestore.runTransaction(async (transaction) => {
      const [existing, current] = await Promise.all([
        transaction.get(messageRef), transaction.get(conversationDoc.ref),
      ]);
      if (existing.exists || !current.exists || current.data().status !== "approved" || current.data().closedReason) return;
      transaction.create(messageRef, {
        conversationId: conversationDoc.id, senderId: after.userId,
        text, type: "system", createdAt: changedAt,
      });
      // A delayed trigger must not replace a newer chat preview.
      if ((current.data().lastMessageAt?.toMillis() || 0) <= changedAt.toMillis()) {
        transaction.update(conversationDoc.ref, {
          lastMessage: text, lastMessageType: "system", lastMessageReviewPrompt: false,
          lastMessageAt: changedAt, lastMessageSenderId: after.userId, updatedAt: changedAt,
        });
      }
    });
  }
}
