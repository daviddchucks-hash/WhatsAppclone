// ==========================================================================
// chat.js
// Core one-to-one & group messaging engine: send/receive in real time,
// message status (sent/delivered/read), typing indicators, edit, delete,
// and reply-to-message.
// ==========================================================================

import { db, SERVER_TIMESTAMP } from "./firebase-config.js";
import { getPrivateChatId, uid as genUid } from "./utilities.js";
import { touchRecentChat, touchRecentGroupChat, incrementUnread } from "./contacts.js";

/**
 * Send a message into a chat (private or group).
 * @param {object} opts
 *  chatId, chatType ('private'|'group'), senderId, text, mediaUrl, mediaType,
 *  mediaName, mediaSize, duration (for audio/video), replyTo ({id,text,senderName}),
 *  recipientUid (private only), groupMemberUids (group only)
 */
export async function sendMessage(opts) {
  const {
    chatId,
    chatType,
    senderId,
    text = "",
    mediaUrl = null,
    mediaType = null,
    mediaName = null,
    mediaSize = null,
    duration = null,
    replyTo = null,
  } = opts;

  if (!text.trim() && !mediaUrl) return null;

  const msgRef = db.ref(`messages/${chatId}`).push();
  const message = {
    id: msgRef.key,
    senderId,
    text: text.trim(),
    type: mediaUrl ? (mediaType || "file") : "text",
    mediaUrl,
    mediaName,
    mediaSize,
    duration,
    replyTo,
    status: "sent",
    edited: false,
    deleted: false,
    timestamp: SERVER_TIMESTAMP,
  };

  await msgRef.set(message);

  const previewText = mediaUrl ? previewForType(mediaType) : text.trim();

  if (chatType === "private") {
    await touchRecentChat(senderId, opts.recipientUid, { text: previewText, type: message.type, senderId });
    await incrementUnread(opts.recipientUid, chatId);
    await db.ref(`messages/${chatId}/${msgRef.key}/status`).set("delivered");
  } else if (chatType === "group") {
    const others = (opts.groupMemberUids || []).filter((u) => u !== senderId);
    await touchRecentGroupChat(chatId, opts.groupMemberUids || [], { text: previewText, type: message.type, senderId });
    await Promise.all(others.map((u) => incrementUnread(u, chatId)));
  }

  return msgRef.key;
}

function previewForType(mediaType) {
  const map = { image: "📷 Photo", video: "🎥 Video", audio: "🎵 Voice note", document: "📄 Document" };
  return map[mediaType] || "📎 Attachment";
}

/** Subscribe to a chat's messages in real time, ordered by timestamp. */
export function watchMessages(chatId, callback) {
  const ref = db.ref(`messages/${chatId}`).orderByChild("timestamp");
  const listener = ref.on("value", (snap) => {
    const list = [];
    snap.forEach((child) => list.push(child.val()));
    callback(list);
  });
  return () => ref.off("value", listener);
}

/** Edit an existing message's text (only the sender should call this). */
export async function editMessage(chatId, messageId, newText) {
  if (!newText.trim()) throw new Error("Message can't be empty.");
  await db.ref(`messages/${chatId}/${messageId}`).update({
    text: newText.trim(),
    edited: true,
  });
}

/** Soft-delete a message (keeps the node so "This message was deleted" shows). */
export async function deleteMessage(chatId, messageId) {
  await db.ref(`messages/${chatId}/${messageId}`).update({
    deleted: true,
    text: "",
    mediaUrl: null,
  });
}

/** Mark all messages in a chat as read by the given user (updates status + per-message readBy). */
export async function markMessagesRead(chatId, readerUid) {
  const snap = await db.ref(`messages/${chatId}`).get();
  if (!snap.exists()) return;
  const updates = {};
  snap.forEach((child) => {
    const msg = child.val();
    if (msg.senderId !== readerUid && msg.status !== "read") {
      updates[`messages/${chatId}/${child.key}/status`] = "read";
      updates[`messages/${chatId}/${child.key}/readBy/${readerUid}`] = SERVER_TIMESTAMP;
    }
  });
  if (Object.keys(updates).length) await db.ref().update(updates);
}

/** Set the current user's typing state for a chat (auto-clears via TTL pattern). */
let typingTimeout = null;
export function setTyping(chatId, uid, isTyping) {
  const ref = db.ref(`typing/${chatId}/${uid}`);
  clearTimeout(typingTimeout);
  if (isTyping) {
    ref.set(true);
    ref.onDisconnect().remove();
    // Auto-clear after 4s of inactivity in case "stop typing" event is missed.
    typingTimeout = setTimeout(() => ref.remove(), 4000);
  } else {
    ref.remove();
  }
}

/** Watch who is typing in a chat (excluding the given uid). */
export function watchTyping(chatId, myUid, callback) {
  const ref = db.ref(`typing/${chatId}`);
  const listener = ref.on("value", (snap) => {
    const typers = [];
    snap.forEach((child) => {
      if (child.key !== myUid && child.val()) typers.push(child.key);
    });
    callback(typers);
  });
  return () => ref.off("value", listener);
}

/** Get (or lazily create) the private chat metadata node between two users. */
export async function ensurePrivateChat(uidA, uidB) {
  const chatId = getPrivateChatId(uidA, uidB);
  const ref = db.ref(`chats/${chatId}`);
  const snap = await ref.get();
  if (!snap.exists()) {
    await ref.set({
      id: chatId,
      type: "private",
      members: { [uidA]: true, [uidB]: true },
      createdAt: SERVER_TIMESTAMP,
    });
  }
  return chatId;
}

export { genUid };
