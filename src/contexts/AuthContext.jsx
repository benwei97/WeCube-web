import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase.js";
import { AuthContext } from "./authContextValue";

const PENDING_PROFILE_STORAGE_KEY = "wecubePendingProfiles";

function createAuthFlowError(code, message) {
  return Object.assign(new Error(message), { code });
}

function readPendingProfiles() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_PROFILE_STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("Error reading pending signup profile:", error);
    return {};
  }
}

function writePendingProfile(uid, profile) {
  try {
    const profiles = readPendingProfiles();
    profiles[uid] = profile;
    localStorage.setItem(PENDING_PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  } catch (error) {
    console.error("Error storing pending signup profile:", error);
  }
}

function clearPendingProfile(uid) {
  try {
    const profiles = readPendingProfiles();
    delete profiles[uid];
    localStorage.setItem(PENDING_PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  } catch (error) {
    console.error("Error clearing pending signup profile:", error);
  }
}

function getNamePartsFromDisplayName(displayName = "") {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || "",
  };
}

function getFallbackProfile(user) {
  const pendingProfile = readPendingProfiles()[user.uid] || {};
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

  async function ensureVerifiedUserProfile(user) {
    await user.reload();

    if (!user.emailVerified) {
      throw createAuthFlowError(
        "auth/email-not-verified",
        "Verify your email before logging in."
      );
    }

    await user.getIdToken(true);

    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      clearPendingProfile(user.uid);
      return {
        uid: user.uid,
        ...userDocSnap.data(),
      };
    }

    const profile = getFallbackProfile(user);
    await setDoc(userDocRef, {
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      createdAt: new Date().toISOString(),
    });
    clearPendingProfile(user.uid);

    return {
      uid: user.uid,
      ...profile,
      createdAt: new Date().toISOString(),
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
    writePendingProfile(user.uid, {
      email,
      firstName,
      lastName,
    });
    await sendEmailVerification(user);
    await signOut(auth);

    return {
      userCredential,
      verificationSent: true,
    };
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

    await ensureVerifiedUserProfile(user);
    return userCredential;
  }

  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    let unsubscribeUserDoc = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (user) {
        try {
          await ensureVerifiedUserProfile(user);
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            setCurrentUser({
              uid: user.uid,
              ...userDocSnap.data(),
            });

            unsubscribeUserDoc = onSnapshot(
              userDocRef,
              (snapshot) => {
                if (snapshot.exists()) {
                  setCurrentUser({
                    uid: user.uid,
                    ...snapshot.data(),
                  });
                }
              },
              (error) => {
                console.error("Error subscribing to user document:", error);
              }
            );
          } else {
            console.warn("User document not found in Firestore");
            setCurrentUser(null);
          }
        } catch (error) {
          console.error("Error fetching user document:", error);
          if (error.code === "auth/email-not-verified") {
            await signOut(auth);
          }
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
      unsubscribe();
    };
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
