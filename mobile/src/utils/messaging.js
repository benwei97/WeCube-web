import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getDateTime } from "./listingUtils";

function getUserBlockId(blockerId, blockedUserId) {
  return `${blockerId}_${blockedUserId}`;
}

export async function blockUser(blockerId, blockedUserId) {
  if (!blockerId || !blockedUserId || blockerId === blockedUserId) {
    throw new Error("Invalid user block");
  }

  await setDoc(doc(db, "userBlocks", getUserBlockId(blockerId, blockedUserId)), {
    blockerId,
    blockedUserId,
    createdAt: serverTimestamp(),
  });
}

export async function unblockUser(blockerId, blockedUserId) {
  if (!blockerId || !blockedUserId || blockerId === blockedUserId) {
    throw new Error("Invalid user unblock");
  }

  await deleteDoc(doc(db, "userBlocks", getUserBlockId(blockerId, blockedUserId)));
}

export function subscribeToUserBlock(blockerId, blockedUserId, onNext, onError) {
  if (!blockerId || !blockedUserId) {
    return () => {};
  }

  return onSnapshot(
    doc(db, "userBlocks", getUserBlockId(blockerId, blockedUserId)),
    (snapshot) => onNext(snapshot.exists()),
    onError
  );
}

export async function isUserBlockedBetween(firstUserId, secondUserId) {
  if (!firstUserId || !secondUserId) {
    return false;
  }

  const [firstBlocksSecond, secondBlocksFirst] = await Promise.all([
    getDoc(doc(db, "userBlocks", getUserBlockId(firstUserId, secondUserId))),
    getDoc(doc(db, "userBlocks", getUserBlockId(secondUserId, firstUserId))),
  ]);

  return firstBlocksSecond.exists() || secondBlocksFirst.exists();
}

export async function getExistingConversation(listingId, buyerId) {
  const conversationsQuery = query(
    collection(db, "conversations"),
    where("listingId", "==", listingId),
    where("buyerId", "==", buyerId)
  );

  const snapshot = await getDocs(conversationsQuery);
  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

export async function createConversation({ listingId, sellerId, buyerId, initialMessage }) {
  const existingConversation = await getExistingConversation(listingId, buyerId);
  if (existingConversation) {
    return existingConversation.id;
  }

  if (await isUserBlockedBetween(buyerId, sellerId)) {
    throw new Error("Messaging is not available between these accounts.");
  }

  const conversationRef = await addDoc(collection(db, "conversations"), {
    listingId,
    sellerId,
    buyerId,
    status: "approved",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: initialMessage,
    lastMessageType: "message",
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: buyerId,
    initialMessage,
    buyerLastReadAt: serverTimestamp(),
    sellerLastReadAt: null,
  });

  await addDoc(collection(db, "messages"), {
    conversationId: conversationRef.id,
    senderId: buyerId,
    text: initialMessage,
    type: "message",
    createdAt: serverTimestamp(),
  });

  return conversationRef.id;
}

export async function sendMessage(conversationId, senderId, text) {
  const trimmedText = text.trim();
  if (!trimmedText) return;

  const conversationRef = doc(db, "conversations", conversationId);
  const conversationDoc = await getDoc(conversationRef);

  if (!conversationDoc.exists()) {
    throw new Error("Conversation not found.");
  }

  const conversation = conversationDoc.data();
  if (conversation.status === "rejected") {
    throw new Error("Conversation is no longer available.");
  }
  if (conversation.closedReason === "listing_deleted") {
    throw new Error("This listing was deleted, so the conversation is closed.");
  }
  if (await isUserBlockedBetween(conversation.buyerId, conversation.sellerId)) {
    throw new Error("Messaging is not available between these accounts.");
  }

  await addDoc(collection(db, "messages"), {
    conversationId,
    senderId,
    text: trimmedText,
    type: "message",
    createdAt: serverTimestamp(),
  });

  await updateDoc(conversationRef, {
    lastMessage: trimmedText,
    lastMessageType: "message",
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: senderId,
    updatedAt: serverTimestamp(),
  });
}

export async function markConversationAsRead(conversationId, userId) {
  const conversationRef = doc(db, "conversations", conversationId);
  const conversationDoc = await getDoc(conversationRef);

  if (!conversationDoc.exists()) {
    throw new Error("Conversation not found.");
  }

  const conversation = conversationDoc.data();
  const updates = {};

  if (conversation.buyerId === userId) {
    updates.buyerLastReadAt = serverTimestamp();
  } else if (conversation.sellerId === userId) {
    updates.sellerLastReadAt = serverTimestamp();
  } else {
    throw new Error("Unauthorized to mark this conversation as read.");
  }

  await updateDoc(conversationRef, updates);
}

export function isConversationUnread(conversation, userId) {
  if (!conversation || conversation.status === "rejected") return false;
  if (!conversation.lastMessageAt || !conversation.lastMessageSenderId) return false;

  if (
    conversation.lastMessageSenderId === userId &&
    !conversation.lastMessageReviewPrompt
  ) {
    return false;
  }

  const lastReadAt =
    conversation.buyerId === userId
      ? conversation.buyerLastReadAt
      : conversation.sellerId === userId
        ? conversation.sellerLastReadAt
        : null;

  if (!lastReadAt) return true;

  const lastMessageTime = conversation.lastMessageAt?.toMillis?.() || 0;
  const lastReadTime = lastReadAt?.toMillis?.() || 0;
  return lastMessageTime > lastReadTime;
}

export async function getListingBuyerOptions(listingId, sellerId) {
  const conversationsQuery = query(
    collection(db, "conversations"),
    where("listingId", "==", listingId),
    where("sellerId", "==", sellerId)
  );

  const snapshot = await getDocs(conversationsQuery);
  const conversations = snapshot.docs
    .map((conversationDoc) => ({
      id: conversationDoc.id,
      ...conversationDoc.data(),
    }))
    .filter(
      (conversation) =>
        conversation.status === "approved" || conversation.status === "pending"
    )
    .sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "approved" ? -1 : 1;
      }
      const aTime = a.lastMessageAt?.toMillis?.() || 0;
      const bTime = b.lastMessageAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

  return Promise.all(
    conversations.map(async (conversation) => {
      let buyerData = null;
      try {
        const buyerDoc = await getDoc(doc(db, "users", conversation.buyerId));
        buyerData = buyerDoc.exists() ? buyerDoc.data() : null;
      } catch (error) {
        console.error("Error loading mobile buyer option:", error);
      }

      return {
        buyerId: conversation.buyerId,
        buyerName:
          `${buyerData?.firstName || ""} ${buyerData?.lastName || ""}`.trim() ||
          buyerData?.displayName ||
          buyerData?.email ||
          "Buyer",
        buyerEmail: buyerData?.email || "",
        buyerAvatarUrl: buyerData?.avatarUrl || "",
        conversationId: conversation.id,
        status: conversation.status,
        lastMessage: conversation.lastMessage || "",
        lastMessageAt: conversation.lastMessageAt || null,
      };
    })
  );
}

export async function closeListingConversationsForSold({
  listingId,
  sellerId,
  sellerFirstName = "Seller",
  listingTitle = "this listing",
  saleEventId = null,
  soldConversationId = null,
  buyerId = null,
}) {
  const conversationsQuery = query(
    collection(db, "conversations"),
    where("listingId", "==", listingId),
    where("sellerId", "==", sellerId)
  );
  const snapshot = await getDocs(conversationsQuery);
  const sellerName = sellerFirstName || "Seller";
  const soldNoticeMessage = `${sellerName} marked "${listingTitle}" as sold.`;
  const reviewPromptMessage = `${sellerName} marked "${listingTitle}" as sold. Rate your experience?`;

  for (const conversationDoc of snapshot.docs) {
    const conversation = conversationDoc.data();
    if (conversation.status === "rejected") continue;

    const isSoldBuyerConversation =
      conversationDoc.id === soldConversationId ||
      (buyerId && conversation.buyerId === buyerId);

    if (conversation.status === "pending") {
      await updateDoc(doc(db, "conversations", conversationDoc.id), {
        status: "approved",
        updatedAt: serverTimestamp(),
      });
    }

    if (!isSoldBuyerConversation) {
      await addDoc(collection(db, "messages"), {
        conversationId: conversationDoc.id,
        senderId: sellerId,
        text: soldNoticeMessage,
        type: "system",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "conversations", conversationDoc.id), {
        lastMessage: soldNoticeMessage,
        lastMessageType: "system",
        lastMessageReviewPrompt: false,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: sellerId,
        updatedAt: serverTimestamp(),
      });
      continue;
    }

    await addDoc(collection(db, "messages"), {
      conversationId: conversationDoc.id,
      senderId: sellerId,
      text: reviewPromptMessage,
      type: "system",
      reviewPrompt: true,
      saleEventId,
      listingTitle,
      sellerName,
      buyerName: "Buyer",
      reviewResponses: {},
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "conversations", conversationDoc.id), {
      lastMessage: "Rate your experience?",
      lastMessageType: "system",
      lastMessageReviewPrompt: true,
      lastMessageListingTitle: listingTitle,
      lastMessageSellerName: sellerName,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: sellerId,
      activeSaleEventId: saleEventId,
      closedAt: null,
      closedReason: null,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function cancelListingReviewPrompts(
  listingId,
  sellerId,
  sellerFirstName = "Seller",
  listingTitle = "this listing"
) {
  const conversationsQuery = query(
    collection(db, "conversations"),
    where("listingId", "==", listingId),
    where("sellerId", "==", sellerId)
  );
  const snapshot = await getDocs(conversationsQuery);
  const availableAgainMessage = `${sellerFirstName || "Seller"} marked "${listingTitle}" as available.`;

  for (const conversationDoc of snapshot.docs) {
    const conversation = conversationDoc.data();
    if (conversation.status === "rejected") continue;

    await addDoc(collection(db, "messages"), {
      conversationId: conversationDoc.id,
      senderId: sellerId,
      text: availableAgainMessage,
      type: "system",
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "conversations", conversationDoc.id), {
      activeSaleEventId: null,
      lastMessage: availableAgainMessage,
      lastMessageType: "system",
      lastMessageReviewPrompt: false,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: sellerId,
      updatedAt: serverTimestamp(),
    });
  }
}

export function subscribeToConversationMessages(conversationId, onNext, onError) {
  const emitMessages = (snapshot) => {
    onNext(
      snapshot.docs
        .map((messageDoc) => {
          const message = messageDoc.data();
          return {
            id: messageDoc.id,
            ...message,
            createdAt:
              message.createdAt ||
              (messageDoc.metadata.hasPendingWrites ? new Date() : message.createdAt),
          };
        })
        .sort((firstMessage, secondMessage) =>
          getDateTime(firstMessage.createdAt) - getDateTime(secondMessage.createdAt)
        )
    );
  };

  const orderedMessagesQuery = query(
    collection(db, "messages"),
    where("conversationId", "==", conversationId),
    orderBy("createdAt", "asc")
  );

  let fallbackUnsubscribe = null;

  const orderedUnsubscribe = onSnapshot(orderedMessagesQuery, emitMessages, (error) => {
    if (error?.code !== "failed-precondition") {
      onError?.(error);
      return;
    }

    console.warn("Falling back to unordered mobile messages query:", error);
    const unorderedMessagesQuery = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId)
    );

    fallbackUnsubscribe = onSnapshot(unorderedMessagesQuery, emitMessages, onError);
  });

  return () => {
    orderedUnsubscribe();
    fallbackUnsubscribe?.();
  };
}

export async function getUserProfile(userId) {
  if (!userId) return null;
  const userDoc = await getDoc(doc(db, "users", userId));
  return userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null;
}

export async function getListing(listingId) {
  if (!listingId) return null;
  const listingDoc = await getDoc(doc(db, "listings", listingId));
  return listingDoc.exists() ? { id: listingDoc.id, ...listingDoc.data() } : null;
}

export async function closeListingConversationsForDeletedListing(
  listingId,
  sellerId,
  listingTitle = "this listing"
) {
  const conversationsQuery = query(
    collection(db, "conversations"),
    where("listingId", "==", listingId),
    where("sellerId", "==", sellerId)
  );
  const snapshot = await getDocs(conversationsQuery);
  const deletedMessage = `The seller deleted "${listingTitle}".`;

  for (const conversationDoc of snapshot.docs) {
    const conversation = conversationDoc.data();
    if (conversation.status === "rejected") continue;

    await addDoc(collection(db, "messages"), {
      conversationId: conversationDoc.id,
      senderId: sellerId,
      text: deletedMessage,
      type: "system",
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "conversations", conversationDoc.id), {
      closedAt: serverTimestamp(),
      closedReason: "listing_deleted",
      lastMessage: deletedMessage,
      lastMessageType: "system",
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: sellerId,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function updateReviewPromptResponse(messageId, userId, response) {
  if (!messageId || !userId) {
    throw new Error("Missing review prompt context");
  }

  await updateDoc(doc(db, "messages", messageId), {
    [`reviewResponses.${userId}`]: response,
    updatedAt: serverTimestamp(),
  });
}
