// ==========================================================================
// notifications.js
// Browser desktop notifications for new messages + unread counter badge
// on the document title / favicon area.
// ==========================================================================

import { requestNotificationPermission, generateAvatar } from "./utilities.js";

let notificationsEnabled = localStorage.getItem("notificationsEnabled") !== "false";

/** Turn notifications on/off (persisted in localStorage). */
export function setNotificationsEnabled(enabled) {
  notificationsEnabled = enabled;
  localStorage.setItem("notificationsEnabled", String(enabled));
}

export function getNotificationsEnabled() {
  return notificationsEnabled;
}

/** Ask the browser for permission (call from a user gesture, e.g. settings toggle). */
export async function enableNotifications() {
  const granted = await requestNotificationPermission();
  setNotificationsEnabled(granted);
  return granted;
}

/**
 * Show a desktop notification for an incoming message, unless the tab is
 * already focused and the chat is open (to avoid redundant pop-ups).
 */
export function notifyNewMessage({ senderName, senderPhoto, text, isTabFocused, isChatOpen }) {
  if (!notificationsEnabled) return;
  if (isTabFocused && isChatOpen) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const notification = new Notification(senderName || "New message", {
    body: text || "Sent an attachment",
    icon: senderPhoto || generateAvatar(senderName || "?"),
    tag: "chat-message",
    silent: false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  setTimeout(() => notification.close(), 6000);
}

/** Update the document title with a total unread count badge, e.g. "(3) Drexy". */
export function updateTitleBadge(totalUnread, baseTitle = "Drexy") {
  document.title = totalUnread > 0 ? `(${totalUnread}) ${baseTitle}` : baseTitle;
}

/** Sum all values in an unread-counts object. */
export function sumUnread(unreadObj = {}) {
  return Object.values(unreadObj).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/** Play a short notification sound using the Web Audio API (no external asset needed). */
export function playNotificationSound() {
  if (!notificationsEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    // Audio context may be blocked before user interaction — safe to ignore.
  }
}
