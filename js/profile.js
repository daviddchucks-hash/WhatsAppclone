// ==========================================================================
// profile.js
// User profile: fetch, edit (display name, username, about, avatar),
// and helpers to watch another user's online/last-seen status.
// ==========================================================================

import { auth, db } from "./firebase-config.js";
import { uploadProfilePicture } from "./storage.js";
import { isValidUsername } from "./utilities.js";

/** Fetch a single user's profile once. */
export async function getUserProfile(uid) {
  const snap = await db.ref(`users/${uid}`).get();
  return snap.exists() ? snap.val() : null;
}

/** Subscribe to live updates of a user's profile (returns unsubscribe fn). */
export function watchUserProfile(uid, callback) {
  const ref = db.ref(`users/${uid}`);
  const listener = ref.on("value", (snap) => callback(snap.val()));
  return () => ref.off("value", listener);
}

/** Update the current user's display name and/or about text. */
export async function updateProfileText(uid, { displayName, about }) {
  const updates = {};
  if (displayName !== undefined) {
    if (!displayName || displayName.trim().length < 2) {
      throw new Error("Display name must be at least 2 characters.");
    }
    updates.displayName = displayName.trim();
    if (auth.currentUser) await auth.currentUser.updateProfile({ displayName: displayName.trim() });
  }
  if (about !== undefined) {
    updates.about = about.trim().slice(0, 200);
  }
  await db.ref(`users/${uid}`).update(updates);
}

/** Change the current user's username (must be unique). */
export async function updateUsername(uid, currentUsername, newUsername) {
  if (!isValidUsername(newUsername)) {
    throw new Error("Username must be 3-20 characters: letters, numbers, underscore only.");
  }
  const newKey = newUsername.toLowerCase();
  if (newKey === currentUsername) return;

  const snap = await db.ref(`usernames/${newKey}`).get();
  if (snap.exists()) throw new Error("That username is already taken.");

  const updates = {};
  updates[`usernames/${currentUsername}`] = null;
  updates[`usernames/${newKey}`] = uid;
  updates[`users/${uid}/username`] = newKey;
  await db.ref().update(updates);
}

/** Upload and set a new profile picture. */
export async function changeProfilePicture(uid, file, onProgress) {
  const result = await uploadProfilePicture(uid, file, onProgress);
  await db.ref(`users/${uid}`).update({ photoURL: result.url });
  if (auth.currentUser) await auth.currentUser.updateProfile({ photoURL: result.url });
  return result.url;
}

/** Search users by username or display name prefix (client-side filter). */
export async function searchUsers(queryText, currentUid) {
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  const snap = await db.ref("users").get();
  if (!snap.exists()) return [];
  const results = [];
  snap.forEach((child) => {
    const u = child.val();
    if (u.uid === currentUid) return;
    if (
      (u.username && u.username.includes(q)) ||
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    ) {
      results.push(u);
    }
  });
  return results.slice(0, 30);
}
