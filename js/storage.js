// ==========================================================================
// storage.js
// Handles all file uploads via Cloudinary's free unsigned upload API.
// Replaces Firebase Storage (which requires a paid Blaze plan).
//
// Cloudinary free tier: 25 GB storage + 25 GB bandwidth/month — no card needed.
// Configure your cloud name and upload preset in js/cloudinary-config.js.
// ==========================================================================

import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary-config.js";
import { uid } from "./utilities.js";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB safety cap

/**
 * Upload any file to Cloudinary using the unsigned upload API.
 * @param {File|Blob}        file
 * @param {string}           folder     - Cloudinary folder path, e.g. "profilePictures/uid123"
 * @param {string}           publicId   - Optional stable public ID within the folder
 * @param {(pct:number)=>void} onProgress
 * @returns {Promise<{url, path, name, size, type}>}
 */
function uploadToCloudinary(file, folder, publicId, onProgress) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error("File is too large (max 50 MB)."));
      return;
    }

    if (
      CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" ||
      CLOUDINARY_UPLOAD_PRESET === "YOUR_UPLOAD_PRESET"
    ) {
      reject(
        new Error(
          "Cloudinary is not configured yet. Open js/cloudinary-config.js and fill in your cloud name and upload preset."
        )
      );
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", folder);
    if (publicId) formData.append("public_id", publicId);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`
    );

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status === 200) {
          resolve({
            url: data.secure_url,
            path: data.public_id,         // Cloudinary public ID (used as "path" throughout the app)
            name: file.name || "upload",
            size: data.bytes || file.size,
            type: file.type || "application/octet-stream",
          });
        } else {
          reject(new Error(data.error?.message || "Upload failed. Check your Cloudinary settings."));
        }
      } catch {
        reject(new Error("Unexpected response from Cloudinary."));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload. Check your connection."));
    xhr.send(formData);
  });
}

/** Upload a user's profile picture. */
export function uploadProfilePicture(uidStr, file, onProgress) {
  const folder = `profilePictures/${uidStr}`;
  const publicId = `avatar_${Date.now()}`;
  return uploadToCloudinary(file, folder, publicId, onProgress);
}

/** Upload a group icon. */
export function uploadGroupIcon(groupId, file, onProgress) {
  const folder = `groupIcons/${groupId}`;
  const publicId = `icon_${Date.now()}`;
  return uploadToCloudinary(file, folder, publicId, onProgress);
}

/** Upload a chat media file (image, video, audio, document). */
export function uploadChatMedia(chatId, file, onProgress) {
  const folder = `chatMedia/${chatId}`;
  const safeName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const publicId = `${uid("f")}_${safeName}`;
  return uploadToCloudinary(file, folder, publicId, onProgress);
}

/** Upload a recorded voice note (Blob from MediaRecorder). */
export function uploadVoiceNote(chatId, blob, onProgress) {
  const folder = `voiceNotes/${chatId}`;
  const publicId = `${uid("vn")}_voice-note`;
  const file = new File([blob], "voice-note.webm", { type: "audio/webm" });
  return uploadToCloudinary(file, folder, publicId, onProgress);
}

/**
 * Delete a file by its Cloudinary public ID.
 * NOTE: Cloudinary deletion from the client requires an API secret, which
 * must never be exposed in browser code. Files will be cleaned up via the
 * Cloudinary dashboard or a server-side function if needed.
 */
export async function deleteStorageFile(path) {
  // No-op on the client side — Cloudinary does not support unsigned deletes.
  console.warn("deleteStorageFile: client-side deletion is not supported with Cloudinary unsigned uploads.", path);
}

/** Classify a MIME type into a broad category used for rendering. */
export function classifyMediaType(mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}
