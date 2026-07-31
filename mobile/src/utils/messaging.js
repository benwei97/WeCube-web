import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";

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
