import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase.js";
import { AuthContext } from "./authContextValue";

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function signup(email, password, firstName, lastName) {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    try {
      await setDoc(doc(db, "users", user.uid), {
        email: email,
        firstName: firstName,
        lastName: lastName,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      // Auth account creation succeeded, but Firestore profile creation failed.
      // Sign the user back out and let the UI present a success message that
      // encourages them to sign in while the database configuration is fixed.
      if (error.code === "permission-denied") {
        await signOut(auth);
        return {
          userCredential,
          profileCreated: false,
        };
      }

      throw error;
    }

    await signOut(auth);

    return {
      userCredential,
      profileCreated: true,
    };
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
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
            setCurrentUser(user);
          }
        } catch (error) {
          console.error("Error fetching user document:", error);
          setCurrentUser(user);
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
