// ==========================================================================
// utilities.js
// Small, dependency-free helper functions shared across the whole app.
// ==========================================================================

/** Escape HTML special characters to prevent XSS when injecting user text. */
export function escapeHtml(str = "") {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Turn plain text with URLs into text with clickable <a> links (safely). */
export function linkify(text) {
  const escaped = escapeHtml(text);
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return escaped.replace(
    urlRegex,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

/** Deterministic 1-to-1 chat ID: same two UIDs always produce the same ID. */
export function getPrivateChatId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

/** Format a millisecond timestamp as a short time string, e.g. "14:05". */
export function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Format a timestamp as a friendly date label for chat separators. */
export function formatDateLabel(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

/** Format "last seen" text for a user profile. */
export function formatLastSeen(ts, isOnline) {
  if (isOnline) return "online";
  if (!ts) return "offline";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "last seen just now";
  if (diffMins < 60) return `last seen ${diffMins} min ago`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);
  if (diffDays === 0) return `last seen today at ${formatTime(ts)}`;
  if (diffDays === 1) return `last seen yesterday at ${formatTime(ts)}`;
  return `last seen ${d.toLocaleDateString([], { day: "2-digit", month: "short" })}`;
}

/** Debounce: delay calling `fn` until `wait` ms after the last call. */
export function debounce(fn, wait = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

/** Throttle: ensure `fn` runs at most once every `limit` ms. */
export function throttle(fn, limit = 1000) {
  let waiting = false;
  return (...args) => {
    if (!waiting) {
      fn(...args);
      waiting = true;
      setTimeout(() => (waiting = false), limit);
    }
  };
}

/** Generate a reasonably unique ID (used for local temp keys, etc). */
export function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Human-readable file size, e.g. 1234567 -> "1.18 MB". */
export function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(size < 10 && i > 0 ? 2 : 0)} ${units[i]}`;
}

/** Format seconds as mm:ss for audio/voice-note players. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Show a small transient toast message at the bottom of the screen. */
export function showToast(message, duration = 3000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/** Toggle a full-screen loading spinner overlay. */
export function setLoading(isLoading, text = "Loading...") {
  let el = document.getElementById("global-loader");
  if (isLoading) {
    if (!el) {
      el = document.createElement("div");
      el.id = "global-loader";
      el.innerHTML = `<div class="spinner"></div><p></p>`;
      document.body.appendChild(el);
    }
    el.querySelector("p").textContent = text;
    el.classList.add("visible");
  } else if (el) {
    el.classList.remove("visible");
  }
}

/** Validate an email address with a reasonable regex. */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate a username: 3-20 chars, letters/numbers/underscore only. */
export function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

/** Read a File object as a data URL (used for local image previews). */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Get initials from a display name, for fallback avatar rendering. */
export function getInitials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic pastel color for an avatar background, based on a string. */
export function colorFromString(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

/** Build an inline SVG data-URI fallback avatar (no external image needed). */
export function generateAvatar(name = "?") {
  const initials = getInitials(name);
  const bg = colorFromString(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" fill="${bg}"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="80" fill="#fff">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Request browser notification permission (returns granted boolean). */
export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}
