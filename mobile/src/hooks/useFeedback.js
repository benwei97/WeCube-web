import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export const FEEDBACK_CATEGORIES = { bug: "Report a bug", feedback: "General feedback" };
export const FEEDBACK_STATUSES = { new: "New", in_progress: "In progress", resolved: "Resolved" };

export function useFeedbackForm(user, platform, version = "") {
  const [category, setCategory] = useState("bug");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const pending = useRef(false);
  const canSubmit = Boolean(user?.uid && subject.trim() && details.trim() && !busy);
  async function submit() {
    if (!canSubmit || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await setDoc(doc(collection(db, "feedback")), {
        userId: user.uid,
        name: (`${user.firstName || ""} ${user.lastName || ""}`.trim() || "WeCube user").slice(0, 120),
        category, subject: subject.trim().slice(0, 120), details: details.trim().slice(0, 4000),
        platform, version: version.slice(0, 80), status: "new", createdAt: serverTimestamp(),
      });
      setSent(true);
      setSubject("");
      setDetails("");
    } catch (failure) {
      console.error("Feedback submission failed:", failure);
      setError("Couldn't send your feedback. Your text is still here. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { category, setCategory, subject, setSubject, details, setDetails, busy, error, sent, setSent, canSubmit, submit };
}

export function useFeedbackInbox(isAdmin, userId) {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(50);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!isAdmin) { setItems([]); setLoading(false); return undefined; }
    setLoading(true);
    setError("");
    return onSnapshot(query(collection(db, "feedback"), orderBy("createdAt", "desc"), limit(count)), (snapshot) => {
      setItems(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      setLoading(false);
    }, (failure) => {
      console.error("Feedback inbox failed:", failure);
      setError("Unable to load feedback. Check that the feedback rules are deployed, then retry.");
      setLoading(false);
    });
  }, [isAdmin, userId, count, attempt]);
  const updateStatus = useCallback(async (id, status) => {
    setSaving(id);
    setError("");
    try {
      await updateDoc(doc(db, "feedback", id), { status, reviewedBy: userId, updatedAt: serverTimestamp() });
    } catch (failure) {
      console.error("Feedback update failed:", failure);
      setError("Couldn't update this submission. Please try again.");
    } finally { setSaving(""); }
  }, [userId]);
  return {
    items: items.filter((item) => filter === "all" || item.status === filter),
    filter, setFilter, loading, error, saving, updateStatus,
    hasMore: items.length === count,
    loadMore: () => setCount((value) => value + 50),
    retry: () => setAttempt((value) => value + 1),
  };
}

export function feedbackDate(value) {
  return value?.toDate ? value.toDate().toLocaleString() : "Just now";
}
