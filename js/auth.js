// ==========================================================================
// auth.js
// Handles registration, login, logout, password reset, persistent login,
// and route guards. Also creates/maintains the user's profile record in
// Realtime Database whenever they sign up or sign in.
// ==========================================================================

import { auth, db, SERVER_TIMESTAMP } from "./firebase-config.js";
import {
  isValidEmail,
  isValidUsername,
  generateAvatar,
  showToast,
  setLoading,
} from "./utilities.js";

/**
 * Register a new user with email + password, create their Realtime Database
 * profile, and set a unique lowercase username for search purposes.
 */
export async function registerUser({ email, password, displayName, username }) {
  if (!isValidEmail(email)) throw new Error("Please enter a valid email address.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (!displayName || displayName.trim().length < 2)
    throw new Error("Please enter a display name (at least 2 characters).");
  if (!isValidUsername(username))
    throw new Error("Username must be 3-20 characters: letters, numbers, underscore only.");

  const usernameKey = username.toLowerCase();

  // Ensure the username is not already taken before creating the account.
  const usernameSnap = await db.ref(`usernames/${usernameKey}`).get();
  if (usernameSnap.exists()) {
    throw new Error("That username is already taken. Please choose another.");
  }

  const credential = await auth.createUserWithEmailAndPassword(email, password);
  const user = credential.user;

  await user.updateProfile({ displayName: displayName.trim() });

  const photoURL = generateAvatar(displayName);

  const profile = {
    uid: user.uid,
    email,
    displayName: displayName.trim(),
    username: usernameKey,
    photoURL,
    about: "Hey there! I am using ChatApp.",
    isOnline: true,
    lastSeen: SERVER_TIMESTAMP,
    createdAt: SERVER_TIMESTAMP,
  };

  // Write profile + reserve the username atomically via a multi-path update.
  const updates = {};
  updates[`users/${user.uid}`] = profile;
  updates[`usernames/${usernameKey}`] = user.uid;
  await db.ref().update(updates);

  await auth.currentUser.sendEmailVerification().catch(() => {
    // Non-fatal: verification email failures shouldn't block registration.
  });

  return user;
}

/** Log in an existing user with email + password. */
export async function loginUser(email, password) {
  if (!isValidEmail(email)) throw new Error("Please enter a valid email address.");
  if (!password) throw new Error("Please enter your password.");
  const credential = await auth.signInWithEmailAndPassword(email, password);
  return credential.user;
}

/** Log the current user out, marking them offline first. */
export async function logoutUser() {
  const user = auth.currentUser;
  if (user) {
    await db.ref(`users/${user.uid}`).update({
      isOnline: false,
      lastSeen: SERVER_TIMESTAMP,
    });
  }
  await auth.signOut();
}

/** Send a password-reset email. */
export async function resetPassword(email) {
  if (!isValidEmail(email)) throw new Error("Please enter a valid email address.");
  await auth.sendPasswordResetEmail(email);
}

/**
 * Auth guard for pages that REQUIRE a logged-in user (chat, profile, settings).
 * Redirects to login.html if no user is signed in. Resolves with the user
 * once confirmed.
 */
export function requireAuth() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      if (!user) {
        window.location.href = "login.html";
      } else {
        resolve(user);
      }
    });
  });
}

/**
 * Guard for pages that require the user to be LOGGED OUT (login, register).
 * Redirects to chat.html if a session already exists.
 */
export function redirectIfAuthenticated() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      if (user) {
        window.location.href = "chat.html";
      } else {
        resolve(null);
      }
    });
  });
}

/** Wire up online/offline presence tracking for the current session. */
export function initPresence(uid) {
  const userStatusRef = db.ref(`users/${uid}`);
  const connectedRef = db.ref(".info/connected");

  connectedRef.on("value", (snap) => {
    if (snap.val() === false) return;
    // When this client disconnects (closes tab, loses network), Firebase
    // will automatically set isOnline to false and record lastSeen.
    userStatusRef
      .onDisconnect()
      .update({ isOnline: false, lastSeen: firebase.database.ServerValue.TIMESTAMP })
      .then(() => {
        userStatusRef.update({ isOnline: true, lastSeen: SERVER_TIMESTAMP });
      });
  });

  window.addEventListener("beforeunload", () => {
    userStatusRef.update({ isOnline: false, lastSeen: Date.now() });
  });
}

/** Friendly error messages for common Firebase Auth error codes. */
export function friendlyAuthError(error) {
  const map = {
    "auth/email-already-in-use": "That email is already registered. Try logging in instead.",
    "auth/invalid-email": "That email address doesn't look valid.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/weak-password": "Password is too weak. Use at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "auth/invalid-credential": "Incorrect email or password.",
  };
  return map[error.code] || error.message || "Something went wrong. Please try again.";
}

/** Wire a form's submit handler with shared try/catch/loading/toast logic. */
export function bindAuthForm(formEl, handler) {
  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = formEl.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    setLoading(true, "Please wait...");
    try {
      await handler();
    } catch (err) {
      showToast(friendlyAuthError(err));
    } finally {
      setLoading(false);
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
