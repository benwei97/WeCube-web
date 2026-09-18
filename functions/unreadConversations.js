// Keep this predicate aligned with mobile/src/utils/messaging.js.
export function isConversationUnread(conversation, userId) {
  if (!conversation || conversation.status === "rejected") return false;
  if (!conversation.lastMessageAt || !conversation.lastMessageSenderId) return false;
  if (conversation.lastMessageSenderId === userId && !conversation.lastMessageReviewPrompt) {
    return false;
  }
  const lastReadAt = conversation.buyerId === userId
    ? conversation.buyerLastReadAt
    : conversation.sellerId === userId
      ? conversation.sellerLastReadAt
      : null;
  if (!lastReadAt) return true;
  return (conversation.lastMessageAt.toMillis?.() || 0) > (lastReadAt.toMillis?.() || 0);
}
