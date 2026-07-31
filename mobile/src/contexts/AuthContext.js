import { createContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export const AuthContext = createContext(null);

function createAuthFlowError(code, message) {
  return Object.assign(new Error(message), { code });
}

function getNamePartsFromDisplayName(displayName = "") {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
  };
}

function getFallbackProfile(user, pendingProfile = {}) {
  const displayNameProfile = getNamePartsFromDisplayName(user.displayName || "");
  const emailName = user.email?.split("@")[0] || "WeCube";

  return {
    email: user.email || pendingProfile.email || "",
    firstName:
      pendingProfile.firstName ||
      displayNameProfile.firstName ||
      emailName,
    lastName:
      pendingProfile.lastName ||
      displayNameProfile.lastName ||
      "Member",
  };
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingProfiles, setPendingProfiles] = useState({});

  async function ensureVerifiedUserProfile(user, pendingProfile = {}) {
    await user.reload();

    if (!user.emailVerified) {
      throw createAuthFlowError(
        "auth/email-not-verified",
        "Verify your email before logging in."
      );
    }

    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      return {
        uid: user.uid,
        ...userDocSnap.data(),
      };
    }

    const profile = getFallbackProfile(user, pendingProfile);
    const createdAt = new Date().toISOString();

    await setDoc(userDocRef, {
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      createdAt,
    });

    return {
      uid: user.uid,
      ...profile,
      createdAt,
    };
  }

  async function signup(email, password, firstName, lastName) {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    await updateProfile(user, {
      displayName: `${firstName} ${lastName}`.trim(),
    });
    setPendingProfiles((prev) => ({
      ...prev,
      [user.uid]: { email, firstName, lastName },
    }));
    await sendEmailVerification(user);
    await signOut(auth);

    return { verificationSent: true };
  }

  async function login(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await user.reload();

    if (!user.emailVerified) {
      try {
        await sendEmailVerification(user);
      } finally {
        await signOut(auth);
      }

      throw createAuthFlowError(
        "auth/email-not-verified",
        "Verify your email before logging in."
      );
    }

    await ensureVerifiedUserProfile(user, pendingProfiles[user.uid]);
    return userCredential;
  }

  function logout() {
    return signOut(auth);
  }

  function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  useEffect(() => {
    let unsubscribeUserDoc = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (!user) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      try {
        await ensureVerifiedUserProfile(user, pendingProfiles[user.uid]);
        const userDocRef = doc(db, "users", user.uid);

        unsubscribeUserDoc = onSnapshot(
          userDocRef,
          (snapshot) => {
            if (snapshot.exists()) {
              setCurrentUser({
                uid: user.uid,
                ...snapshot.data(),
              });
            }
            setLoading(false);
          },
          (error) => {
            console.error("Error subscribing to user document:", error);
            setCurrentUser(null);
            setLoading(false);
          }
        );
      } catch (error) {
        console.error("Error loading signed-in user:", error);
        if (error.code === "auth/email-not-verified") {
          await signOut(auth);
        }
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
      unsubscribe();
    };
  }, [pendingProfiles]);

  const value = {
    currentUser,
    loading,
    signup,
    login,
    logout,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
