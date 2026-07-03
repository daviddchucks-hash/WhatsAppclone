// ==========================================================================
// app.js
// Wires together all modules to drive the chat.html UI: sidebar, active
// chat window, composer (text/media/voice), typing indicators, message
// actions (edit/delete/reply), and group/contact info panels.
// ==========================================================================

import { auth, db } from "./firebase-config.js";
import { requireAuth, initPresence, logoutUser } from "./auth.js";
import {
  getUserProfile,
  watchUserProfile,
  searchUsers,
} from "./profile.js";
import {
  addContact,
  watchContacts,
  watchRecentChats,
  resetUnread,
  watchUnreadCounts,
} from "./contacts.js";
import {
  sendMessage,
  watchMessages,
  editMessage,
  deleteMessage,
  markMessagesRead,
  setTyping,
  watchTyping,
  ensurePrivateChat,
} from "./chat.js";
import {
  createGroup,
  getGroup,
  watchGroup,
  updateGroupInfo,
  changeGroupIcon,
  addGroupMembers,
  removeGroupMember,
  leaveGroup,
  makeGroupAdmin,
  removeGroupAdmin,
  isGroupAdmin,
  getGroupMemberProfiles,
} from "./groups.js";
import { uploadChatMedia, uploadVoiceNote, classifyMediaType, deleteStorageFile } from "./storage.js";
import {
  escapeHtml,
  linkify,
  formatTime,
  formatDateLabel,
  formatLastSeen,
  debounce,
  showToast,
  setLoading,
  formatFileSize,
  formatDuration,
  getPrivateChatId,
  generateAvatar,
} from "./utilities.js";
import {
  getNotificationsEnabled,
  notifyNewMessage,
  updateTitleBadge,
  sumUnread,
  playNotificationSound,
} from "./notifications.js";

// -------------------------------- Theme init --------------------------------
(function initTheme() {
  const saved = localStorage.getItem("drexy-theme") || "system";
  const theme =
    saved === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : saved;
  document.documentElement.setAttribute("data-theme", theme);
})();

// -------------------------------- Auth + my profile --------------------------------
const user = await requireAuth();
let myProfile = await getUserProfile(user.uid);
initPresence(user.uid);

document.getElementById("my-avatar").src = myProfile.photoURL;
document.getElementById("my-avatar").addEventListener("click", () => (window.location.href = "profile.html"));
document.getElementById("settings-btn").addEventListener("click", () => (window.location.href = "settings.html"));

// -------------------------------- State --------------------------------
let currentChat = null; // { id, type: 'private'|'group', otherUid?, group? }
let unsubMessages = null;
let unsubTyping = null;
let unsubHeaderProfile = null;
let allContacts = [];
let allRecentChats = [];
let unreadCounts = {};
let replyingTo = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingInterval = null;
let recordingSeconds = 0;
let selectedGroupMembers = new Map();
let selectedAddMembers = new Map();

const chatListEl = document.getElementById("chat-list");
const searchResultsEl = document.getElementById("search-results");
const searchInput = document.getElementById("search-input");
const messagesContainer = document.getElementById("messages-container");
const appShell = document.getElementById("app-shell");

// -------------------------------- Sidebar rendering --------------------------------

function renderSidebar() {
  const recentChatIds = new Set(allRecentChats.map((c) => c.chatId));
  const contactsWithoutChats = allContacts.filter(
    (c) => !recentChatIds.has(getPrivateChatId(user.uid, c.uid))
  );

  let html = "";

  allRecentChats.forEach((rc) => {
    html += renderChatListItemHtml(rc);
  });

  contactsWithoutChats.forEach((c) => {
    html += renderChatListItemHtml({
      chatId: getPrivateChatId(user.uid, c.uid),
      type: "private",
      otherUid: c.uid,
      lastMessage: "",
      lastMessageType: "text",
      timestamp: 0,
      _contactProfile: c,
    });
  });

  chatListEl.innerHTML =
    html ||
    `<div class="empty-state"><p>No chats yet. Search above to find people and start chatting!</p></div>`;

  // Attach click handlers + async profile hydration
  chatListEl.querySelectorAll(".chat-list-item").forEach((el) => {
    el.addEventListener("click", () => openChatFromListItem(el.dataset));
  });

  hydrateChatListItems();
}

function renderChatListItemHtml(rc) {
  const unread = unreadCounts[rc.chatId] || 0;
  const isActive = currentChat && currentChat.id === rc.chatId;
  return `
    <div class="chat-list-item ${isActive ? "active" : ""}"
         data-chat-id="${rc.chatId}" data-type="${rc.type}"
         data-other-uid="${rc.otherUid || ""}" data-group-id="${rc.groupId || ""}">
      <img class="avatar avatar-md placeholder-avatar" data-key="${rc.chatId}" src="${generateAvatar("?")}" alt="" />
      <div class="info">
        <div class="top-row">
          <span class="name" data-name-key="${rc.chatId}">Loading...</span>
          <span class="time">${rc.timestamp ? formatTime(rc.timestamp) : ""}</span>
        </div>
        <div class="bottom-row">
          <span class="preview">${escapeHtml(previewText(rc))}</span>
          ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? "99+" : unread}</span>` : ""}
        </div>
      </div>
    </div>`;
}

function previewText(rc) {
  if (!rc.lastMessage && rc.lastMessageType === "text") return "Say hello 👋";
  if (rc.lastMessageType === "system") return rc.lastMessage;
  const prefix = rc.lastSenderId === user.uid ? "You: " : "";
  return prefix + (rc.lastMessage || "");
}

async function hydrateChatListItems() {
  const items = chatListEl.querySelectorAll(".chat-list-item");
  for (const el of items) {
    const type = el.dataset.type;
    let name, photo;
    if (type === "private") {
      const otherUid = el.dataset.otherUid;
      const profile = await getUserProfile(otherUid);
      name = profile ? profile.displayName : "Unknown user";
      photo = profile ? profile.photoURL : generateAvatar("?");
    } else {
      const groupId = el.dataset.groupId || el.dataset.chatId;
      const group = await getGroup(groupId);
      name = group ? group.name : "Unknown group";
      photo = group ? group.icon : generateAvatar("?");
    }
    const nameEl = el.querySelector(`[data-name-key]`);
    const avatarEl = el.querySelector(`.placeholder-avatar`);
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.src = photo;
  }
}

function openChatFromListItem(dataset) {
  if (dataset.type === "private") {
    openPrivateChat(dataset.otherUid);
  } else {
    openGroupChat(dataset.groupId || dataset.chatId);
  }
}

// -------------------------------- Search --------------------------------

const debouncedSearch = debounce(async (q) => {
  if (!q.trim()) {
    searchResultsEl.style.display = "none";
    chatListEl.style.display = "block";
    return;
  }
  const results = await searchUsers(q, user.uid);
  chatListEl.style.display = "none";
  searchResultsEl.style.display = "block";
  if (!results.length) {
    searchResultsEl.innerHTML = `<div class="empty-state" style="padding:30px;"><p>No users found.</p></div>`;
    return;
  }
  searchResultsEl.innerHTML =
    `<div class="section-label">Users</div>` +
    results
      .map(
        (u) => `
      <div class="chat-list-item" data-uid="${u.uid}">
        <img class="avatar avatar-md" src="${u.photoURL}" alt="" />
        <div class="info">
          <div class="top-row"><span class="name">${escapeHtml(u.displayName)}</span></div>
          <div class="bottom-row"><span class="preview">@${escapeHtml(u.username)}</span></div>
        </div>
      </div>`
      )
      .join("");
  searchResultsEl.querySelectorAll(".chat-list-item").forEach((el) => {
    el.addEventListener("click", async () => {
      await addContact(user.uid, el.dataset.uid);
      searchInput.value = "";
      searchResultsEl.style.display = "none";
      chatListEl.style.display = "block";
      openPrivateChat(el.dataset.uid);
    });
  });
}, 350);

searchInput.addEventListener("input", (e) => debouncedSearch(e.target.value));

// -------------------------------- Live sidebar data --------------------------------

watchContacts(user.uid, (contacts) => {
  allContacts = contacts;
  renderSidebar();
});

watchRecentChats(user.uid, (chats) => {
  allRecentChats = chats;
  renderSidebar();
});

watchUnreadCounts(user.uid, (counts) => {
  unreadCounts = counts;
  updateTitleBadge(sumUnread(counts));
  renderSidebar();
});

// -------------------------------- Opening chats --------------------------------

async function openPrivateChat(otherUid) {
  const chatId = await ensurePrivateChat(user.uid, otherUid);
  currentChat = { id: chatId, type: "private", otherUid };
  await enterChat();
  bindHeaderForPrivateChat(otherUid);
}

async function openGroupChat(groupId) {
  currentChat = { id: groupId, type: "group", groupId };
  await enterChat();
  bindHeaderForGroupChat(groupId);
}

async function enterChat() {
  appShell.classList.add("chat-active");
  document.getElementById("no-chat-selected").style.display = "none";
  document.getElementById("active-chat").style.display = "flex";
  document.getElementById("info-panel").classList.remove("open");
  replyingTo = null;
  hideReplyBar();

  if (unsubMessages) unsubMessages();
  if (unsubTyping) unsubTyping();
  if (unsubHeaderProfile) unsubHeaderProfile();

  messagesContainer.innerHTML = "";
  await resetUnread(user.uid, currentChat.id);

  unsubMessages = watchMessages(currentChat.id, (messages) => {
    renderMessages(messages);
    markMessagesRead(currentChat.id, user.uid);
  });

  unsubTyping = watchTyping(currentChat.id, user.uid, renderTypingIndicator);

  renderSidebar();
}

function bindHeaderForPrivateChat(otherUid) {
  document.getElementById("header-search-btn").onclick = () => showToast("Search in chat coming soon.");
  document.getElementById("chat-header-clickable").onclick = (e) => {
    if (e.target.closest("#back-to-list") || e.target.closest("#header-search-btn")) return;
    openContactInfoPanel(otherUid);
  };
  if (unsubHeaderProfile) unsubHeaderProfile();
  unsubHeaderProfile = watchUserProfile(otherUid, (profile) => {
    if (!profile) return;
    document.getElementById("header-avatar").src = profile.photoURL;
    document.getElementById("header-name").textContent = profile.displayName;
    document.getElementById("header-status").textContent = formatLastSeen(profile.lastSeen, profile.isOnline);
    document.getElementById("header-online-dot").classList.toggle("online", !!profile.isOnline);
  });
}

function bindHeaderForGroupChat(groupId) {
  document.getElementById("chat-header-clickable").onclick = (e) => {
    if (e.target.closest("#back-to-list") || e.target.closest("#header-search-btn")) return;
    openGroupInfoPanel(groupId);
  };
  document.getElementById("header-online-dot").classList.remove("online");
  if (unsubHeaderProfile) unsubHeaderProfile();
  unsubHeaderProfile = watchGroup(groupId, (group) => {
    if (!group) return;
    document.getElementById("header-avatar").src = group.icon;
    document.getElementById("header-name").textContent = group.name;
    const count = Object.keys(group.members || {}).length;
    document.getElementById("header-status").textContent = `${count} member${count !== 1 ? "s" : ""}`;
  });
}

document.getElementById("back-to-list").addEventListener("click", () => {
  appShell.classList.remove("chat-active");
});

// -------------------------------- Rendering messages --------------------------------

function renderMessages(messages) {
  const scrollAtBottom =
    messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 80;

  messagesContainer.innerHTML = "";
  let lastDateLabel = null;

  messages.forEach((msg) => {
    const dateLabel = formatDateLabel(msg.timestamp);
    if (dateLabel !== lastDateLabel) {
      const sep = document.createElement("div");
      sep.className = "date-separator";
      sep.textContent = dateLabel;
      messagesContainer.appendChild(sep);
      lastDateLabel = dateLabel;
    }
    messagesContainer.appendChild(buildMessageRow(msg));
  });

  if (scrollAtBottom) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function buildMessageRow(msg) {
  const isOutgoing = msg.senderId === user.uid;
  const row = document.createElement("div");
  row.className = `message-row ${isOutgoing ? "outgoing" : ""}`;
  row.dataset.messageId = msg.id;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  let innerHtml = "";

  if (currentChat.type === "group" && !isOutgoing) {
    innerHtml += `<div class="sender-name">${escapeHtml(msg._senderName || "")}</div>`;
    hydrateSenderName(bubble, msg.senderId);
  }

  if (msg.replyTo) {
    innerHtml += `<div class="reply-preview" data-jump="${msg.replyTo.id}">
      <span class="reply-sender">${escapeHtml(msg.replyTo.senderName)}</span>
      ${escapeHtml((msg.replyTo.text || "").slice(0, 80))}
    </div>`;
  }

  if (msg.deleted) {
    innerHtml += `<div class="msg-text deleted">🚫 This message was deleted</div>`;
  } else if (msg.type === "image") {
    innerHtml += `<img class="media-image" src="${msg.mediaUrl}" alt="photo" data-lightbox="image" />`;
    if (msg.text) innerHtml += `<div class="msg-text">${linkify(msg.text)}</div>`;
  } else if (msg.type === "video") {
    innerHtml += `<video class="media-video" src="${msg.mediaUrl}" controls></video>`;
    if (msg.text) innerHtml += `<div class="msg-text">${linkify(msg.text)}</div>`;
  } else if (msg.type === "audio") {
    innerHtml += buildVoicePlayerHtml(msg);
  } else if (msg.type === "document") {
    innerHtml += `<a class="media-doc" href="${msg.mediaUrl}" target="_blank" download="${escapeHtml(msg.mediaName || "file")}">
      <div class="doc-icon">📄</div>
      <div class="doc-info">
        <div class="doc-name">${escapeHtml(msg.mediaName || "Document")}</div>
        <div class="doc-size">${formatFileSize(msg.mediaSize)}</div>
      </div>
    </a>`;
  } else {
    innerHtml += `<div class="msg-text">${linkify(msg.text)}</div>`;
  }

  const editedTag = msg.edited && !msg.deleted ? `<span class="edited-tag">edited</span> ` : "";
  const statusHtml = isOutgoing ? buildStatusTicksHtml(msg.status) : "";
  innerHtml += `<div class="msg-meta">${editedTag}${formatTime(msg.timestamp)} ${statusHtml}</div>`;

  bubble.innerHTML = innerHtml;
  row.appendChild(bubble);

  if (!msg.deleted) {
    const actions = document.createElement("div");
    actions.className = "hover-actions";
    actions.innerHTML = `
      <button data-action="reply" title="Reply">↩️</button>
      ${isOutgoing && msg.type === "text" ? `<button data-action="edit" title="Edit">✏️</button>` : ""}
      ${isOutgoing ? `<button data-action="delete" title="Delete">🗑️</button>` : ""}
    `;
    actions.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => handleMessageAction(btn.dataset.action, msg));
    });
    row.appendChild(actions);
  }

  bubble.querySelectorAll("[data-lightbox]").forEach((el) => {
    el.addEventListener("click", () => openLightbox(msg.mediaUrl, msg.type));
  });

  const replyPreviewEl = bubble.querySelector(".reply-preview");
  if (replyPreviewEl) {
    replyPreviewEl.addEventListener("click", () => jumpToMessage(msg.replyTo.id));
  }

  return row;
}

async function hydrateSenderName(bubbleEl, senderId) {
  const profile = await getUserProfile(senderId);
  const nameEl = bubbleEl.querySelector(".sender-name");
  if (nameEl && profile) nameEl.textContent = profile.displayName;
}

function buildStatusTicksHtml(status) {
  if (status === "read") {
    return `<span class="msg-status read"><svg viewBox="0 0 24 24" fill="none"><path d="M1 12l4 4L14 7" stroke="currentColor" stroke-width="2"/><path d="M8 12l4 4L21 7" stroke="currentColor" stroke-width="2"/></svg></span>`;
  }
  if (status === "delivered") {
    return `<span class="msg-status"><svg viewBox="0 0 24 24" fill="none"><path d="M1 12l4 4L14 7" stroke="currentColor" stroke-width="2"/><path d="M8 12l4 4L21 7" stroke="currentColor" stroke-width="2"/></svg></span>`;
  }
  return `<span class="msg-status"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" stroke-width="2"/></svg></span>`;
}

function jumpToMessage(id) {
  const el = messagesContainer.querySelector(`[data-message-id="${id}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background 0.3s";
    el.style.background = "rgba(0,168,132,0.15)";
    setTimeout(() => (el.style.background = ""), 900);
  }
}

// -------------------------------- Voice note player --------------------------------

function buildVoicePlayerHtml(msg) {
  return `<div class="voice-player" data-audio-src="${msg.mediaUrl}">
    <button type="button" class="vp-play" data-role="play">▶</button>
    <div class="vp-track" data-role="track"><div class="vp-progress" data-role="progress"></div></div>
    <span class="vp-time" data-role="time">${formatDuration(msg.duration || 0)}</span>
  </div>`;
}

messagesContainer.addEventListener("click", (e) => {
  const playBtn = e.target.closest('[data-role="play"]');
  const track = e.target.closest('[data-role="track"]');
  const player = e.target.closest(".voice-player");
  if (!player) return;
  const src = player.dataset.audioSrc;

  if (!player._audio) {
    player._audio = new Audio(src);
    player._audio.addEventListener("timeupdate", () => {
      const pct = (player._audio.currentTime / (player._audio.duration || 1)) * 100;
      player.querySelector('[data-role="progress"]').style.width = pct + "%";
      player.querySelector('[data-role="time"]').textContent = formatDuration(player._audio.currentTime);
    });
    player._audio.addEventListener("ended", () => {
      player.querySelector('[data-role="play"]').textContent = "▶";
      player.querySelector('[data-role="progress"]').style.width = "0%";
    });
  }

  if (playBtn) {
    if (player._audio.paused) {
      document.querySelectorAll(".voice-player audio-playing").forEach(() => {});
      player._audio.play();
      playBtn.textContent = "⏸";
    } else {
      player._audio.pause();
      playBtn.textContent = "▶";
    }
  } else if (track) {
    const rect = track.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (player._audio.duration) player._audio.currentTime = pct * player._audio.duration;
  }
});

// -------------------------------- Typing indicator --------------------------------

function renderTypingIndicator(typers) {
  let el = document.getElementById("typing-indicator-el");
  if (typers.length === 0) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.id = "typing-indicator-el";
    el.className = "typing-indicator";
    el.innerHTML = "<span></span><span></span><span></span>";
    messagesContainer.appendChild(el);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

// -------------------------------- Composer: text --------------------------------

const messageInput = document.getElementById("message-input");
const composerForm = document.getElementById("composer-form");

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
  if (currentChat) setTyping(currentChat.id, user.uid, messageInput.value.length > 0);
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composerForm.requestSubmit();
  }
});

composerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentChat) return;
  const text = messageInput.value.trim();
  if (!text) return;

  await sendCurrentMessage({ text });
  messageInput.value = "";
  messageInput.style.height = "auto";
  setTyping(currentChat.id, user.uid, false);
  clearReply();
});

async function sendCurrentMessage(extra) {
  const base = {
    chatId: currentChat.id,
    chatType: currentChat.type,
    senderId: user.uid,
    replyTo: replyingTo,
    text: "",
  };
  if (currentChat.type === "private") {
    base.recipientUid = currentChat.otherUid;
  } else {
    const group = await getGroup(currentChat.groupId);
    base.groupMemberUids = Object.keys(group.members || {});
  }
  await sendMessage({ ...base, ...extra });
  messagesContainer.scrollTop = messagesContainer.scrollHeight + 999;
}

// -------------------------------- Reply UI --------------------------------

function handleMessageAction(action, msg) {
  if (action === "reply") {
    startReply(msg);
  } else if (action === "edit") {
    startEdit(msg);
  } else if (action === "delete") {
    if (confirm("Delete this message?")) {
      deleteMessage(currentChat.id, msg.id);
      if (msg.mediaUrl) deleteStorageFile(decodeStoragePath(msg.mediaUrl));
    }
  }
}

function decodeStoragePath(url) {
  try {
    const match = decodeURIComponent(url).match(/\/o\/(.+?)\?/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

async function startReply(msg) {
  const senderName = msg.senderId === user.uid ? "You" : (await getUserProfile(msg.senderId))?.displayName || "User";
  replyingTo = { id: msg.id, text: msg.text || previewForReply(msg), senderName };
  document.getElementById("reply-bar-sender").textContent = senderName;
  document.getElementById("reply-bar-text").textContent = replyingTo.text;
  document.getElementById("reply-bar").classList.add("visible");
  messageInput.focus();
}

function previewForReply(msg) {
  const map = { image: "📷 Photo", video: "🎥 Video", audio: "🎵 Voice note", document: "📄 Document" };
  return map[msg.type] || "";
}

function hideReplyBar() {
  document.getElementById("reply-bar").classList.remove("visible");
}
function clearReply() {
  replyingTo = null;
  hideReplyBar();
}
document.getElementById("cancel-reply").addEventListener("click", clearReply);

function startEdit(msg) {
  const newText = prompt("Edit message:", msg.text);
  if (newText !== null && newText.trim() && newText.trim() !== msg.text) {
    editMessage(currentChat.id, msg.id, newText.trim());
  }
}

// -------------------------------- Attach media --------------------------------

const attachBtn = document.getElementById("attach-btn");
const attachOptions = document.getElementById("attach-options");
const fileInput = document.getElementById("file-input");

attachBtn.addEventListener("click", () => attachOptions.classList.toggle("open"));
document.addEventListener("click", (e) => {
  if (!e.target.closest(".attach-menu")) attachOptions.classList.remove("open");
});

attachOptions.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    fileInput.accept = btn.dataset.accept;
    fileInput.dataset.type = btn.dataset.type;
    fileInput.click();
    attachOptions.classList.remove("open");
  });
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file || !currentChat) return;
  setLoading(true, "Uploading...");
  try {
    const result = await uploadChatMedia(currentChat.id, file, (pct) => setLoading(true, `Uploading ${pct}%...`));
    const mediaType = classifyMediaType(result.type);
    await sendCurrentMessage({
      mediaUrl: result.url,
      mediaType,
      mediaName: result.name,
      mediaSize: result.size,
    });
    clearReply();
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
    fileInput.value = "";
  }
});

// -------------------------------- Voice notes --------------------------------

const micBtn = document.getElementById("mic-btn");
const recordingIndicator = document.getElementById("recording-indicator");

micBtn.addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopRecording(true);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
    };
    mediaRecorder.start();
    recordingSeconds = 0;
    recordingIndicator.classList.add("active");
    document.getElementById("message-input").style.display = "none";
    recordingInterval = setInterval(() => {
      recordingSeconds++;
      document.getElementById("recording-time").textContent = formatDuration(recordingSeconds);
    }, 1000);
    micBtn.style.color = "var(--clr-danger)";
  } catch (err) {
    showToast("Microphone access denied.");
  }
});

function stopRecording(shouldSend) {
  if (!mediaRecorder) return;
  clearInterval(recordingInterval);
  recordingIndicator.classList.remove("active");
  document.getElementById("message-input").style.display = "";
  micBtn.style.color = "";
  const durationAtStop = recordingSeconds;

  mediaRecorder.addEventListener(
    "stop",
    async () => {
      if (!shouldSend || durationAtStop < 1) return;
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      setLoading(true, "Sending voice note...");
      try {
        const result = await uploadVoiceNote(currentChat.id, blob, (pct) => setLoading(true, `Uploading ${pct}%...`));
        await sendCurrentMessage({
          mediaUrl: result.url,
          mediaType: "audio",
          mediaName: result.name,
          mediaSize: result.size,
          duration: durationAtStop,
        });
      } catch (err) {
        showToast(err.message);
      } finally {
        setLoading(false);
      }
    },
    { once: true }
  );

  mediaRecorder.stop();
}

// -------------------------------- Emoji picker --------------------------------

const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😜","🤔","😎","😢","😭","😡","👍","👎","🙏",
  "👏","🎉","❤️","💔","🔥","✨","🥳","😴","🤗","😇","🙄","😅","😱","🤝","💯","🌟",
  "☀️","🌈","🍕","🍔","☕","🎂","🎁","📞","📷","🎵","⚽","🏆","💰","⏰","🚀","💡",
];

const emojiPicker = document.getElementById("emoji-picker");
emojiPicker.innerHTML = EMOJIS.map((e) => `<button type="button">${e}</button>`).join("");
emojiPicker.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    messageInput.value += btn.textContent;
    messageInput.dispatchEvent(new Event("input"));
    messageInput.focus();
  });
});

document.getElementById("emoji-btn").addEventListener("click", () => emojiPicker.classList.toggle("open"));
document.addEventListener("click", (e) => {
  if (!e.target.closest("#emoji-btn") && !e.target.closest("#emoji-picker")) emojiPicker.classList.remove("open");
});

// -------------------------------- Lightbox --------------------------------

const lightbox = document.getElementById("lightbox");
function openLightbox(url, type) {
  const content = document.getElementById("lightbox-content");
  content.innerHTML =
    type === "video" ? `<video src="${url}" controls autoplay></video>` : `<img src="${url}" alt="media" />`;
  lightbox.classList.add("open");
}
document.getElementById("close-lightbox").addEventListener("click", () => lightbox.classList.remove("open"));
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) lightbox.classList.remove("open");
});

// -------------------------------- Info panels --------------------------------

const infoPanel = document.getElementById("info-panel");
const infoPanelBody = document.getElementById("info-panel-body");
document.getElementById("close-info-panel").addEventListener("click", () => infoPanel.classList.remove("open"));

async function openContactInfoPanel(otherUid) {
  const profile = await getUserProfile(otherUid);
  document.getElementById("info-panel-title").textContent = "Contact info";
  infoPanelBody.innerHTML = `
    <div class="info-avatar-section">
      <img class="avatar avatar-xl" src="${profile.photoURL}" alt="" />
      <h3>${escapeHtml(profile.displayName)}</h3>
      <p>@${escapeHtml(profile.username)}</p>
    </div>
    <div class="info-section">
      <h4>About</h4>
      <div class="about-text">${escapeHtml(profile.about || "")}</div>
    </div>
    <div class="info-section">
      <h4>Status</h4>
      <div class="about-text">${escapeHtml(formatLastSeen(profile.lastSeen, profile.isOnline))}</div>
    </div>
  `;
  infoPanel.classList.add("open");
}

async function openGroupInfoPanel(groupId) {
  const group = await getGroup(groupId);
  const members = await getGroupMemberProfiles(group);
  const amAdmin = isGroupAdmin(group, user.uid);

  document.getElementById("info-panel-title").textContent = "Group info";
  infoPanelBody.innerHTML = `
    <div class="info-avatar-section">
      <label style="cursor:pointer; position:relative;">
        <img class="avatar avatar-xl" id="group-icon-img" src="${group.icon}" alt="" />
        ${amAdmin ? `<input type="file" id="group-icon-input" accept="image/*" hidden />` : ""}
      </label>
      <h3 id="group-name-display">${escapeHtml(group.name)}</h3>
      <p>Group · ${members.length} members</p>
    </div>
    <div class="info-section">
      <h4>Description</h4>
      <div class="about-text" id="group-desc-display">${escapeHtml(group.description || "Add a group description")}</div>
      ${amAdmin ? `<button class="btn btn-secondary" style="margin-top:10px; padding:8px 14px; font-size:13px;" id="edit-group-info-btn">Edit Info</button>` : ""}
    </div>
    <div class="info-section" style="display:flex; align-items:center; justify-content:space-between;">
      <h4 style="margin:0;">${members.length} Members</h4>
      ${amAdmin ? `<button class="btn btn-secondary" style="padding:6px 12px; font-size:12.5px;" id="add-members-open-btn">+ Add</button>` : ""}
    </div>
    <div id="group-members-list"></div>
    <div class="danger-action" id="leave-group-btn" style="cursor:pointer;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Leave Group
    </div>
  `;

  const membersListEl = document.getElementById("group-members-list");
  membersListEl.innerHTML = members
    .map(
      (m) => `
    <div class="member-row" data-uid="${m.uid}">
      <img class="avatar avatar-sm" src="${m.photoURL}" alt="" />
      <div class="info">
        <div class="name">${m.uid === user.uid ? "You" : escapeHtml(m.displayName)} ${m.isAdmin ? `<span class="admin-tag">· Admin</span>` : ""}</div>
      </div>
      ${amAdmin && m.uid !== user.uid ? `
        <button class="btn-icon admin-toggle-btn" data-uid="${m.uid}" data-is-admin="${m.isAdmin}" title="${m.isAdmin ? "Remove admin" : "Make admin"}">⭐</button>
        <button class="remove-btn" data-uid="${m.uid}">Remove</button>
      ` : ""}
    </div>`
    )
    .join("");

  membersListEl.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Remove this member from the group?")) {
        await removeGroupMember(groupId, btn.dataset.uid);
        openGroupInfoPanel(groupId);
      }
    });
  });
  membersListEl.querySelectorAll(".admin-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const isAdmin = btn.dataset.isAdmin === "true";
      if (isAdmin) await removeGroupAdmin(groupId, btn.dataset.uid);
      else await makeGroupAdmin(groupId, btn.dataset.uid);
      openGroupInfoPanel(groupId);
    });
  });

  const editBtn = document.getElementById("edit-group-info-btn");
  if (editBtn) {
    editBtn.addEventListener("click", async () => {
      const newName = prompt("Group name:", group.name);
      if (newName === null) return;
      const newDesc = prompt("Group description:", group.description || "");
      try {
        await updateGroupInfo(groupId, { name: newName, description: newDesc || "" });
        openGroupInfoPanel(groupId);
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  const iconInput = document.getElementById("group-icon-input");
  if (iconInput) {
    document.getElementById("group-icon-img").parentElement.addEventListener("click", () => iconInput.click());
    iconInput.addEventListener("change", async () => {
      const file = iconInput.files[0];
      if (!file) return;
      setLoading(true, "Updating icon...");
      try {
        await changeGroupIcon(groupId, file);
        openGroupInfoPanel(groupId);
      } catch (err) {
        showToast(err.message);
      } finally {
        setLoading(false);
      }
    });
  }

  const addMembersBtn = document.getElementById("add-members-open-btn");
  if (addMembersBtn) {
    addMembersBtn.addEventListener("click", () => openAddMembersModal(groupId, members.map((m) => m.uid)));
  }

  document.getElementById("leave-group-btn").addEventListener("click", async () => {
    if (confirm("Leave this group?")) {
      await leaveGroup(groupId, user.uid);
      infoPanel.classList.remove("open");
      appShell.classList.remove("chat-active");
      document.getElementById("active-chat").style.display = "none";
      document.getElementById("no-chat-selected").style.display = "flex";
    }
  });

  infoPanel.classList.add("open");
}

// -------------------------------- New Group Modal --------------------------------

const newGroupModal = document.getElementById("new-group-modal");
document.getElementById("new-group-btn").addEventListener("click", () => {
  selectedGroupMembers = new Map();
  document.getElementById("group-name-input").value = "";
  document.getElementById("group-member-search").value = "";
  document.getElementById("group-member-results").innerHTML = "";
  renderSelectedMembers("group-selected-members", selectedGroupMembers);
  newGroupModal.classList.add("open");
});
document.getElementById("close-new-group").addEventListener("click", () => newGroupModal.classList.remove("open"));
document.getElementById("cancel-new-group").addEventListener("click", () => newGroupModal.classList.remove("open"));

const debouncedGroupMemberSearch = debounce(async (q) => {
  const resultsEl = document.getElementById("group-member-results");
  if (!q.trim()) {
    resultsEl.innerHTML = "";
    return;
  }
  const results = await searchUsers(q, user.uid);
  resultsEl.innerHTML = results
    .map(
      (u) => `
    <div class="member-row" style="cursor:pointer;" data-uid="${u.uid}" data-name="${escapeHtml(u.displayName)}" data-photo="${u.photoURL}">
      <img class="avatar avatar-sm" src="${u.photoURL}" alt="" />
      <div class="info"><div class="name">${escapeHtml(u.displayName)}</div></div>
      <span>${selectedGroupMembers.has(u.uid) ? "✓" : "+"}</span>
    </div>`
    )
    .join("");
  resultsEl.querySelectorAll(".member-row").forEach((row) => {
    row.addEventListener("click", () => {
      const uid = row.dataset.uid;
      if (selectedGroupMembers.has(uid)) selectedGroupMembers.delete(uid);
      else selectedGroupMembers.set(uid, { name: row.dataset.name, photo: row.dataset.photo });
      renderSelectedMembers("group-selected-members", selectedGroupMembers, (u) => {
        selectedGroupMembers.delete(u);
        renderSelectedMembers("group-selected-members", selectedGroupMembers);
      });
      debouncedGroupMemberSearch(q);
    });
  });
}, 300);
document.getElementById("group-member-search").addEventListener("input", (e) => debouncedGroupMemberSearch(e.target.value));

function renderSelectedMembers(containerId, map, onRemove) {
  const el = document.getElementById(containerId);
  el.innerHTML = Array.from(map.entries())
    .map(
      ([uid, info]) => `
    <span style="display:flex; align-items:center; gap:6px; background:var(--clr-primary-light); color:var(--clr-primary-dark); padding:4px 10px; border-radius:16px; font-size:13px;">
      ${escapeHtml(info.name)} <button type="button" data-uid="${uid}" style="font-weight:700;">✕</button>
    </span>`
    )
    .join("");
  el.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      map.delete(btn.dataset.uid);
      renderSelectedMembers(containerId, map, onRemove);
    });
  });
}

document.getElementById("create-group-btn").addEventListener("click", async () => {
  const name = document.getElementById("group-name-input").value.trim();
  if (!name) {
    showToast("Please enter a group name.");
    return;
  }
  if (selectedGroupMembers.size === 0) {
    showToast("Add at least one member.");
    return;
  }
  setLoading(true, "Creating group...");
  try {
    const groupId = await createGroup(user.uid, name, Array.from(selectedGroupMembers.keys()));
    newGroupModal.classList.remove("open");
    openGroupChat(groupId);
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});

// -------------------------------- Add Members Modal --------------------------------

const addMembersModal = document.getElementById("add-members-modal");
let addMembersTargetGroupId = null;
let existingGroupMemberUids = [];

function openAddMembersModal(groupId, existingUids) {
  addMembersTargetGroupId = groupId;
  existingGroupMemberUids = existingUids;
  selectedAddMembers = new Map();
  document.getElementById("add-member-search").value = "";
  document.getElementById("add-member-results").innerHTML = "";
  renderSelectedMembers("add-member-selected", selectedAddMembers);
  addMembersModal.classList.add("open");
}
document.getElementById("close-add-members").addEventListener("click", () => addMembersModal.classList.remove("open"));
document.getElementById("cancel-add-members").addEventListener("click", () => addMembersModal.classList.remove("open"));

const debouncedAddMemberSearch = debounce(async (q) => {
  const resultsEl = document.getElementById("add-member-results");
  if (!q.trim()) {
    resultsEl.innerHTML = "";
    return;
  }
  const results = (await searchUsers(q, user.uid)).filter((u) => !existingGroupMemberUids.includes(u.uid));
  resultsEl.innerHTML = results
    .map(
      (u) => `
    <div class="member-row" style="cursor:pointer;" data-uid="${u.uid}" data-name="${escapeHtml(u.displayName)}" data-photo="${u.photoURL}">
      <img class="avatar avatar-sm" src="${u.photoURL}" alt="" />
      <div class="info"><div class="name">${escapeHtml(u.displayName)}</div></div>
      <span>${selectedAddMembers.has(u.uid) ? "✓" : "+"}</span>
    </div>`
    )
    .join("");
  resultsEl.querySelectorAll(".member-row").forEach((row) => {
    row.addEventListener("click", () => {
      const uid = row.dataset.uid;
      if (selectedAddMembers.has(uid)) selectedAddMembers.delete(uid);
      else selectedAddMembers.set(uid, { name: row.dataset.name, photo: row.dataset.photo });
      renderSelectedMembers("add-member-selected", selectedAddMembers);
      debouncedAddMemberSearch(q);
    });
  });
}, 300);
document.getElementById("add-member-search").addEventListener("input", (e) => debouncedAddMemberSearch(e.target.value));

document.getElementById("confirm-add-members").addEventListener("click", async () => {
  if (selectedAddMembers.size === 0) {
    showToast("Select at least one person to add.");
    return;
  }
  setLoading(true, "Adding members...");
  try {
    await addGroupMembers(addMembersTargetGroupId, Array.from(selectedAddMembers.keys()));
    addMembersModal.classList.remove("open");
    openGroupInfoPanel(addMembersTargetGroupId);
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
});

// -------------------------------- Global new-message notifications --------------------------------

db.ref(`recentChats/${user.uid}`).on("child_changed", (snap) => {
  const rc = snap.val();
  if (!rc || rc.lastSenderId === user.uid) return;
  const isChatOpen = currentChat && currentChat.id === rc.chatId;
  getUserProfile(rc.lastSenderId).then((senderProfile) => {
    notifyNewMessage({
      senderName: senderProfile ? senderProfile.displayName : "New message",
      senderPhoto: senderProfile ? senderProfile.photoURL : null,
      text: rc.lastMessage,
      isTabFocused: document.hasFocus(),
      isChatOpen,
    });
    if (localStorage.getItem("soundEnabled") !== "false") playNotificationSound();
  });
});
