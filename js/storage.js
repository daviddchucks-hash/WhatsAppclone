// ==========================================================================
// storage.js
// Handles all Firebase Storage uploads: profile pictures, chat images,
// videos, audio/voice notes, and documents. Every function returns a
// promise resolving with { url, path, name, size, type }.
// ==========================================================================

import { storage } from "./firebase-config.js";
import { uid } from "./utilities.js";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB safety cap

/**
 * Upload a file to a given storage path, optionally reporting progress.
 * @param {File|Blob} file
 * @param {string} path - full storage path, e.g. "chatImages/abc/123.jpg"
 * @param {(pct:number)=>void} onProgress
 */
export function uploadFile(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error("File is too large (max 50MB)."));
      return;
    }
    const ref = storage.ref(path);
    const task = ref.put(file, { contentType: file.type || undefined });

    task.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      (error) => reject(error),
      async () => {
        const url = await task.snapshot.ref.getDownloadURL();
        resolve({
          url,
          path,
          name: file.name || "voice-note.webm",
          size: file.size,
          type: file.type || "audio/webm",
        });
      }
    );
  });
}

/** Upload a user's profile picture. */
export function uploadProfilePicture(uidStr, file, onProgress) {
  const ext = (file.name && file.name.split(".").pop()) || "jpg";
  const path = `profilePictures/${uidStr}/avatar_${Date.now()}.${ext}`;
  return uploadFile(file, path, onProgress);
}

/** Upload a group icon. */
export function uploadGroupIcon(groupId, file, onProgress) {
  const ext = (file.name && file.name.split(".").pop()) || "jpg";
  const path = `groupIcons/${groupId}/icon_${Date.now()}.${ext}`;
  return uploadFile(file, path, onProgress);
}

/** Upload a chat media file (image, video, audio, document). */
export function uploadChatMedia(chatId, file, onProgress) {
  const safeName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `chatMedia/${chatId}/${uid("f")}_${safeName}`;
  return uploadFile(file, path, onProgress);
}

/** Upload a recorded voice note (Blob from MediaRecorder). */
export function uploadVoiceNote(chatId, blob, onProgress) {
  const path = `voiceNotes/${chatId}/${uid("vn")}.webm`;
  const file = new File([blob], "voice-note.webm", { type: "audio/webm" });
  return uploadFile(file, path, onProgress);
}

/** Delete a file from Storage given its path (best-effort, ignores errors). */
export async function deleteStorageFile(path) {
  try {
    await storage.ref(path).delete();
  } catch (err) {
    console.warn("Could not delete storage file:", path, err.message);
  }
}

/** Classify a MIME type into a broad category used for rendering. */
export function classifyMediaType(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}
