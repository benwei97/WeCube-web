import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Use the Firestore emulator only.");
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
const apps = [];
function client(uid, admin = false) {
  const app = initializeApp({ projectId: "demo-wecube", apiKey: "demo" }, `feedback-${uid || "guest"}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), uid ? { mockUserToken: { sub: uid, admin } } : {});
  return db;
}
const owner = client("reporter");
const other = client("other");
const admin = client("admin", true);
const guest = client(null);
const id = `feedback-${Date.now()}`;
const data = {
  userId: "reporter", name: "Test User", category: "bug", subject: "Keyboard covers Send",
  details: "Open a listing and edit the first message.", platform: "ios", version: "1.0.0 (19)",
  status: "new", createdAt: serverTimestamp(),
};
const denied = (operation) => assert.rejects(operation, (error) => error.code === "permission-denied");
try {
  await setDoc(doc(owner, "feedback", id), data);
  assert.equal((await getDoc(doc(admin, "feedback", id))).data().subject, data.subject);
  await getDocs(collection(admin, "feedback"));
  for (const db of [owner, other, guest]) {
    await denied(getDoc(doc(db, "feedback", id)));
    await denied(getDocs(collection(db, "feedback")));
    await denied(updateDoc(doc(db, "feedback", id), { status: "resolved", reviewedBy: "reporter", updatedAt: serverTimestamp() }));
  }
  await denied(setDoc(doc(guest, "feedback", `${id}-guest`), data));
  await denied(setDoc(doc(other, "feedback", `${id}-spoof`), data));
  for (const change of [{ status: "resolved" }, { details: "" }, { details: "x".repeat(4001) }, { category: "invalid" }, { platform: "invalid" }, { createdAt: new Date(0) }, { unexpected: true }]) {
    await denied(setDoc(doc(owner, "feedback", `${id}-invalid`), { ...data, ...change }));
  }
  for (const status of ["in_progress", "resolved", "new"]) {
    await updateDoc(doc(admin, "feedback", id), { status, reviewedBy: "admin", updatedAt: serverTimestamp() });
    assert.equal((await getDoc(doc(admin, "feedback", id))).data().status, status);
  }
  await denied(updateDoc(doc(admin, "feedback", id), { details: "Changed user text" }));
  await denied(updateDoc(doc(admin, "feedback", id), { status: "invalid" }));
  await denied(deleteDoc(doc(owner, "feedback", id)));
  await denied(deleteDoc(doc(admin, "feedback", id)));
  console.log("Feedback rules passed: submission validation, private reads, admin triage, immutable content.");
} finally {
  await Promise.all(apps.map(deleteApp));
}
