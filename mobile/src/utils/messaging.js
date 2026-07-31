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

export function subscribeToConversationMessages(conversationId, onNext, onError) {
  const messagesQuery = query(
    collection(db, "messages"),
    where("conversationId", "==", conversationId),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      onNext(snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() })));
    },
    onError
  );
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
