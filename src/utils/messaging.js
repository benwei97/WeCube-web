import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Firestore Collections Schema:
 *
 * conversations: {
 *   id: auto-generated,
 *   listingId: string,
 *   sellerId: string,
 *   buyerId: string,
 *   status: 'pending' | 'approved' | 'rejected',
 *   createdAt: timestamp,
 *   updatedAt: timestamp,
 *   lastMessage: string,
 *   lastMessageAt: timestamp,
 *   initialMessage: string,
 *   buyerLastReadAt: timestamp,
 *   sellerLastReadAt: timestamp
 * }
 *
 * messages: {
 *   id: auto-generated,
 *   conversationId: string,
 *   senderId: string,
 *   text: string,
 *   createdAt: timestamp,
 *   type: 'message' | 'system'
 * }
 */

/**
 * Create a new conversation
 */
export async function createConversation(
  listingId,
  sellerId,
  buyerId,
  initialMessage
) {
  try {
    // Check if conversation already exists
    const existingConversation = await getExistingConversation(
      listingId,
      buyerId
    );
    if (existingConversation) {
      throw new Error("You already have a conversation for this listing");
    }

    // Create new conversation
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

    console.log("Conversation created:", conversationRef.id);
    return conversationRef.id;
  } catch (error) {
    console.error("Error creating conversation:", error);
    throw error;
  }
}

/**
 * Check if conversation exists between buyer and seller for a listing
 */
export async function getExistingConversation(listingId, buyerId) {
  try {
    const conversationsQuery = query(
      collection(db, "conversations"),
      where("listingId", "==", listingId),
      where("buyerId", "==", buyerId)
    );

    const snapshot = await getDocs(conversationsQuery);
    return snapshot.empty
      ? null
      : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  } catch (error) {
    console.error("Error checking existing conversation:", error);
    return null;
  }
}

export async function getListingBuyerOptions(listingId, sellerId) {
  try {
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
          console.error("Error fetching buyer profile:", error);
        }

        const buyerName =
          `${buyerData?.firstName || ""} ${buyerData?.lastName || ""}`.trim() ||
          buyerData?.displayName ||
          buyerData?.email ||
          "Buyer";

        return {
          buyerId: conversation.buyerId,
          buyerName,
          buyerEmail: buyerData?.email || "",
          buyerAvatarUrl: buyerData?.avatarUrl || "",
          conversationId: conversation.id,
          status: conversation.status,
          lastMessage: conversation.lastMessage || "",
          lastMessageAt: conversation.lastMessageAt || null,
        };
      })
    );
  } catch (error) {
    console.error("Error getting listing buyer options:", error);
    throw error;
  }
}

/**
 * Get conversations for a user (both as buyer and seller)
 */
export async function getUserConversations(userId) {
  try {
    // Get conversations where user is buyer
    const buyerQuery = query(
      collection(db, "conversations"),
      where("buyerId", "==", userId)
    );

    // Get conversations where user is seller
    const sellerQuery = query(
      collection(db, "conversations"),
      where("sellerId", "==", userId)
    );

    const [buyerSnapshot, sellerSnapshot] = await Promise.all([
      getDocs(buyerQuery),
      getDocs(sellerQuery),
    ]);

    const allConversations = [
      ...buyerSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        userRole: "buyer",
      })),
      ...sellerSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        userRole: "seller",
      })),
    ];

    const conversations = allConversations.filter(
      (conv) => conv.status !== "rejected"
    );

    // Sort by last message time
    conversations.sort((a, b) => {
      const aTime = a.lastMessageAt?.toMillis() || 0;
      const bTime = b.lastMessageAt?.toMillis() || 0;
      return bTime - aTime;
    });

    console.log("User conversations:", conversations);
    return conversations;
  } catch (error) {
    console.error("Error getting user conversations:", error);
    throw error;
  }
}

/**
 * Add a message to a conversation
 */
export async function addMessage(
  conversationId,
  senderId,
  text,
  type = "message"
) {
  try {
    // Verify conversation exists and is not rejected (unless it's a system message)
    const conversationRef = doc(db, "conversations", conversationId);
    const conversationDoc = await getDoc(conversationRef);

    if (!conversationDoc.exists()) {
      throw new Error("Conversation not found");
    }

    const conversation = conversationDoc.data();
    if (type === "message" && conversation.status === "rejected") {
      throw new Error("Conversation is no longer available");
    }

    // Add message
    await addDoc(collection(db, "messages"), {
      conversationId,
      senderId,
      text,
      type,
      createdAt: serverTimestamp(),
    });

    // Update conversation's last message info
    await updateDoc(conversationRef, {
      lastMessage: text,
      lastMessageType: type,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: senderId,
      updatedAt: serverTimestamp(),
    });

    console.log("Message added to conversation:", conversationId);
  } catch (error) {
    console.error("Error adding message:", error);
    throw error;
  }
}

export async function closeListingConversationsForSold(
  listingId,
  sellerId,
  sellerFirstName,
  listingTitle,
  saleEventId = null,
  soldConversationId = null
) {
  try {
    if (!soldConversationId) {
      return;
    }

    const soldMessage = `${sellerFirstName || "Seller"} marked ${listingTitle} as sold. Rate your experience?`;
    const conversationsQuery = query(
      collection(db, "conversations"),
      where("listingId", "==", listingId),
      where("sellerId", "==", sellerId)
    );

    const snapshot = await getDocs(conversationsQuery);

    for (const conversationDoc of snapshot.docs) {
      const conversationRef = doc(db, "conversations", conversationDoc.id);
      const conversation = conversationDoc.data();

      if (
        conversation.status === "rejected" ||
        conversationDoc.id !== soldConversationId
      ) {
        continue;
      }

      if (conversation.status === "pending") {
        await updateDoc(conversationRef, {
          status: "approved",
          updatedAt: serverTimestamp(),
        });
      }

      let buyerName = "Buyer";
      try {
        const buyerDoc = await getDoc(doc(db, "users", conversation.buyerId));
        if (buyerDoc.exists()) {
          const buyerData = buyerDoc.data();
          buyerName =
            `${buyerData?.firstName || ""} ${buyerData?.lastName || ""}`.trim() ||
            buyerData?.displayName ||
            buyerData?.email ||
            "Buyer";
        }
      } catch (error) {
        console.error("Error fetching buyer profile for review prompt:", error);
      }

      await addDoc(collection(db, "messages"), {
        conversationId: conversationDoc.id,
        senderId: sellerId,
        text: soldMessage,
        type: "system",
        reviewPrompt: true,
        saleEventId,
        listingTitle,
        sellerName: sellerFirstName || "Seller",
        buyerName,
        reviewResponses: {},
        createdAt: serverTimestamp(),
      });

      await updateDoc(conversationRef, {
        lastMessage: "Rate your experience?",
        lastMessageType: "system",
        lastMessageReviewPrompt: true,
        lastMessageListingTitle: listingTitle,
        lastMessageSellerName: sellerFirstName || "Seller",
        lastMessageBuyerName: buyerName,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: sellerId,
        activeSaleEventId: saleEventId,
        closedAt: null,
        closedReason: null,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("Error closing listing conversations after sale:", error);
    throw error;
  }
}

export async function cancelListingReviewPrompts(listingId, sellerId) {
  try {
    const conversationsQuery = query(
      collection(db, "conversations"),
      where("listingId", "==", listingId),
      where("sellerId", "==", sellerId)
    );
    const snapshot = await getDocs(conversationsQuery);

    for (const conversationDoc of snapshot.docs) {
      const conversationRef = doc(db, "conversations", conversationDoc.id);
      const conversation = conversationDoc.data();

      if (!conversation.activeSaleEventId) {
        continue;
      }

      await addDoc(collection(db, "messages"), {
        conversationId: conversationDoc.id,
        senderId: sellerId,
        text: "The seller marked this listing as available again. The review request was closed.",
        type: "system",
        createdAt: serverTimestamp(),
      });

      await updateDoc(conversationRef, {
        activeSaleEventId: null,
        lastMessage: "The review request was closed.",
        lastMessageType: "system",
        lastMessageReviewPrompt: false,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: sellerId,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("Error cancelling listing review prompts:", error);
    throw error;
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

/**
 * Mark a conversation as read for the current participant
 */
export async function markConversationAsRead(conversationId, userId) {
  try {
    const conversationRef = doc(db, "conversations", conversationId);
    const conversationDoc = await getDoc(conversationRef);

    if (!conversationDoc.exists()) {
      throw new Error("Conversation not found");
    }

    const conversation = conversationDoc.data();
    const updates = {};

    if (conversation.buyerId === userId) {
      updates.buyerLastReadAt = serverTimestamp();
    } else if (conversation.sellerId === userId) {
      updates.sellerLastReadAt = serverTimestamp();
    } else {
      throw new Error("Unauthorized to mark this conversation as read");
    }

    await updateDoc(conversationRef, updates);
  } catch (error) {
    console.error("Error marking conversation as read:", error);
    throw error;
  }
}

/**
 * Return true when the latest approved-chat message has not been read by the user
 */
export function isConversationUnread(conversation, userId) {
  if (!conversation || conversation.status === "rejected") {
    return false;
  }

  if (!conversation.lastMessageAt || !conversation.lastMessageSenderId) {
    return false;
  }

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

  if (!lastReadAt) {
    return true;
  }

  const lastMessageTime = conversation.lastMessageAt?.toMillis?.() || 0;
  const lastReadTime = lastReadAt?.toMillis?.() || 0;
  return lastMessageTime > lastReadTime;
}

/**
 * Count unread approved conversations for a user
 */
export function countUnreadConversations(conversations, userId) {
  return conversations.filter((conversation) =>
    isConversationUnread(conversation, userId)
  ).length;
}

/**
 * Get messages for a conversation
 */
export async function getConversationMessages(conversationId) {
  try {
    const messagesQuery = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId),
      orderBy("createdAt", "asc")
    );

    const snapshot = await getDocs(messagesQuery);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting messages:", error);
    throw error;
  }
}

/**
 * Listen to real-time messages for a conversation
 */
export function subscribeToMessages(conversationId, callback) {
  const messagesQuery = query(
    collection(db, "messages"),
    where("conversationId", "==", conversationId),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(messagesQuery, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(messages);
  });
}

/**
 * Listen to real-time conversations for a user
 */
export function subscribeToUserConversations(userId, callback) {
  const buyerQuery = query(
    collection(db, "conversations"),
    where("buyerId", "==", userId)
  );

  const sellerQuery = query(
    collection(db, "conversations"),
    where("sellerId", "==", userId)
  );

  let buyerConversations = [];
  let sellerConversations = [];

  const emitConversations = () => {
    const mergedConversations = [
      ...buyerConversations.map((conversation) => ({
        ...conversation,
        userRole: "buyer",
      })),
      ...sellerConversations.map((conversation) => ({
        ...conversation,
        userRole: "seller",
      })),
    ]
      .filter((conversation) => conversation.status !== "rejected")
      .sort((a, b) => {
        const aTime = a.lastMessageAt?.toMillis?.() || 0;
        const bTime = b.lastMessageAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

    callback(mergedConversations);
  };

  const unsubscribeBuyer = onSnapshot(buyerQuery, (snapshot) => {
    buyerConversations = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    emitConversations();
  });

  const unsubscribeSeller = onSnapshot(sellerQuery, (snapshot) => {
    sellerConversations = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    emitConversations();
  });

  return () => {
    unsubscribeBuyer();
    unsubscribeSeller();
  };
}
