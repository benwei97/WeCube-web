import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
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
 *   initialMessage: string
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
 * Create a new conversation request
 */
export async function createConversationRequest(
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
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: initialMessage,
      lastMessageAt: serverTimestamp(),
      initialMessage,
    });

    await addDoc(collection(db, "messages"), {
      conversationId: conversationRef.id,
      senderId: buyerId,
      text: initialMessage,
      type: "message",
      createdAt: serverTimestamp(),
    });

    console.log("Conversation request created:", conversationRef.id);
    return conversationRef.id;
  } catch (error) {
    console.error("Error creating conversation request:", error);
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

/**
 * Get conversations for a user (both as buyer and seller) - excludes pending requests
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

    // Filter out pending conversations (only show approved/rejected)
    const conversations = allConversations.filter(conv => conv.status !== "pending");

    // Sort by last message time
    conversations.sort((a, b) => {
      const aTime = a.lastMessageAt?.toMillis() || 0;
      const bTime = b.lastMessageAt?.toMillis() || 0;
      return bTime - aTime;
    });

    console.log("User conversations (excluding pending):", conversations);
    return conversations;
  } catch (error) {
    console.error("Error getting user conversations:", error);
    throw error;
  }
}

/**
 * Approve or reject a conversation request
 */
export async function updateConversationStatus(
  conversationId,
  status,
  sellerId
) {
  try {
    const conversationRef = doc(db, "conversations", conversationId);

    // Verify the seller owns this conversation
    const conversationDoc = await getDoc(conversationRef);
    if (
      !conversationDoc.exists() ||
      conversationDoc.data().sellerId !== sellerId
    ) {
      throw new Error("Unauthorized to update this conversation");
    }

    if (status === "approved") {
      // Update to approved status
      await updateDoc(conversationRef, {
        status,
        updatedAt: serverTimestamp(),
      });

      // Add system message about approval
      await addMessage(
        conversationId,
        sellerId,
        "Conversation approved. You can now message freely!",
        "system"
      );

      console.log(`Conversation ${conversationId} approved`);
    } else if (status === "rejected") {
      // Delete the conversation completely for rejections
      await deleteDoc(conversationRef);
      console.log(`Conversation ${conversationId} deleted (rejected)`);
    }
  } catch (error) {
    console.error("Error updating conversation status:", error);
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
    // Verify conversation exists and is approved (unless it's a system message)
    const conversationRef = doc(db, "conversations", conversationId);
    const conversationDoc = await getDoc(conversationRef);

    if (!conversationDoc.exists()) {
      throw new Error("Conversation not found");
    }

    const conversation = conversationDoc.data();
    if (type === "message" && conversation.status !== "approved") {
      throw new Error("Conversation must be approved before sending messages");
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
  // Listen to conversations where user is buyer
  const buyerQuery = query(
    collection(db, "conversations"),
    where("buyerId", "==", userId)
  );

  // Listen to conversations where user is seller
  const sellerQuery = query(
    collection(db, "conversations"),
    where("sellerId", "==", userId)
  );

  const unsubscribeBuyer = onSnapshot(buyerQuery, () => {
    // Fetch updated conversations when changes occur
    getUserConversations(userId).then(callback);
  });

  const unsubscribeSeller = onSnapshot(sellerQuery, () => {
    // Fetch updated conversations when changes occur
    getUserConversations(userId).then(callback);
  });

  // Return function to unsubscribe from both listeners
  return () => {
    unsubscribeBuyer();
    unsubscribeSeller();
  };
}

/**
 * Get pending conversation requests for a seller
 */
export async function getPendingRequests(sellerId) {
  try {
    console.log("Getting pending requests for sellerId:", sellerId);

    // Try the ideal query first. This may require a composite Firestore index.
    const pendingQuery = query(
      collection(db, "conversations"),
      where("sellerId", "==", sellerId),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    try {
      const snapshot = await getDocs(pendingQuery);
      const results = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      console.log("Pending requests found (with orderBy):", results);
      return results;
    } catch (indexError) {
      console.warn("Index not found, trying without orderBy:", indexError);

      const fallbackQuery = query(
        collection(db, "conversations"),
        where("sellerId", "==", sellerId),
        where("status", "==", "pending")
      );
      const fallbackSnapshot = await getDocs(fallbackQuery);
      const fallbackResults = fallbackSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

      console.log("Pending requests found (fallback query):", fallbackResults);
      return fallbackResults;
    }
  } catch (error) {
    console.error("Error getting pending requests:", error);
    throw error;
  }
}
