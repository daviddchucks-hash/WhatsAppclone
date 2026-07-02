// ==========================================================================
// contacts.js
// Manages the current user's contact list and their "recent chats" list
// (the left sidebar in chat.html).
// ==========================================================================

import { db, SERVER_TIMESTAMP } from "./firebase-config.js";
import { getPrivateChatId } from "./utilities.js";

/** Add another user to the current user's contact list (mutual, one-way write). */
export async function addContact(myUid, otherUid) {
  if (myUid === otherUid) throw new Error("You can't add yourself as a contact.");
  await db.ref(`contacts/${myUid}/${otherUid}`).set({ addedAt: SERVER_TIMESTAMP });
}

/** Remove a contact. */
export async function removeContact(myUid, otherUid) {
  await db.ref(`contacts/${myUid}/${otherUid}`).remove();
}

/** Fetch the current user's contact list as an array of profile objects. */
export async function getContacts(myUid) {
  const snap = await db.ref(`contacts/${myUid}`).get();
  if (!snap.exists()) return [];
  const uids = Object.keys(snap.val());
  const profiles = await Promise.all(
    uids.map(async (uid) => {
      const uSnap = await db.ref(`users/${uid}`).get();
      return uSnap.exists() ? uSnap.val() : null;
    })
  );
  return profiles.filter(Boolean);
}

/** Watch the contact list live (returns unsubscribe function). */
export function watchContacts(myUid, callback) {
  const ref = db.ref(`contacts/${myUid}`);
  const listener = ref.on("value", async (snap) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const uids = Object.keys(snap.val());
    const profiles = await Promise.all(
      uids.map(async (uid) => {
        const uSnap = await db.ref(`users/${uid}`).get();
        return uSnap.exists() ? uSnap.val() : null;
      })
    );
    callback(profiles.filter(Boolean));
  });
  return () => ref.off("value", listener);
}

/**
 * Ensure a "recent chat" entry exists for both participants of a private
 * chat. Called whenever a message is sent. Stores minimal metadata used to
 * render the sidebar without needing to read the full chat/messages tree.
 */
export async function touchRecentChat(myUid, otherUid, lastMessage) {
  const chatId = getPrivateChatId(myUid, otherUid);
  const updates = {};
  updates[`recentChats/${myUid}/${chatId}`] = {
    chatId,
    type: "private",
    otherUid,
    lastMessage: lastMessage.text || "",
    lastMessageType: lastMessage.type || "text",
    lastSenderId: lastMessage.senderId,
    timestamp: SERVER_TIMESTAMP,
  };
  updates[`recentChats/${otherUid}/${chatId}`] = {
    chatId,
    type: "private",
    otherUid: myUid,
    lastMessage: lastMessage.text || "",
    lastMessageType: lastMessage.type || "text",
    lastSenderId: lastMessage.senderId,
    timestamp: SERVER_TIMESTAMP,
  };
  await db.ref().update(updates);
}

/** Update the recent-chat preview for a group after a new message. */
export async function touchRecentGroupChat(groupId, memberUids, lastMessage) {
  const updates = {};
  memberUids.forEach((uid) => {
    updates[`recentChats/${uid}/${groupId}`] = {
      chatId: groupId,
      type: "group",
      groupId,
      lastMessage: lastMessage.text || "",
      lastMessageType: lastMessage.type || "text",
      lastSenderId: lastMessage.senderId,
      timestamp: SERVER_TIMESTAMP,
    };
  });
  await db.ref().update(updates);
}

/** Watch the recent chats list live, sorted newest first. */
export function watchRecentChats(myUid, callback) {
  const ref = db.ref(`recentChats/${myUid}`).orderByChild("timestamp");
  const listener = ref.on("value", (snap) => {
    const list = [];
    snap.forEach((child) => list.push(child.val()));
    list.reverse(); // newest first
    callback(list);
  });
  return () => ref.off("value", listener);
}

/** Increment the unread counter for a chat for a specific user. */
export async function incrementUnread(uid, chatId) {
  const ref = db.ref(`unreadCounts/${uid}/${chatId}`);
  await ref.transaction((current) => (current || 0) + 1);
}

/** Reset the unread counter for a chat (called when the chat is opened). */
export async function resetUnread(uid, chatId) {
  await db.ref(`unreadCounts/${uid}/${chatId}`).set(0);
}

/** Watch unread counters for all chats of a user. */
export function watchUnreadCounts(uid, callback) {
  const ref = db.ref(`unreadCounts/${uid}`);
  const listener = ref.on("value", (snap) => callback(snap.val() || {}));
  return () => ref.off("value", listener);
}
