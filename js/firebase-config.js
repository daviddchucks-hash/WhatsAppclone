// ==========================================================================
// firebase-config.js
// Central Firebase initialization. Every other module imports auth/db/storage
// from this file so there is only ever ONE Firebase App instance.
// ==========================================================================

// NOTE: This project uses the Firebase "compat" SDKs, loaded via <script>
// tags in every HTML page (see the <head> of each page). The compat SDKs
// attach a single global `firebase` namespace to the window, which we then
// wrap with modern ES module exports below so the rest of the app can use
// clean `import { auth, db, storage } from './firebase-config.js'` syntax
// without needing a bundler (Webpack/Vite/etc). This satisfies the
// "vanilla JS only, no backend framework" requirement.

const firebaseConfig = {
  apiKey: "AIzaSyCUrF2w6l0xPUogGw2kfDvnCc0VZya8nYs",
  authDomain: "drexy-7e070.firebaseapp.com",
  // Standard Realtime Database URL for project drexy-7e070 (us-central1).
  // If you chose a different region when creating the database, update this
  // URL to match what the Firebase console shows under Realtime Database.
  databaseURL: "https://drexy-7e070-default-rtdb.firebaseio.com",
  projectId: "drexy-7e070",
  storageBucket: "drexy-7e070.firebasestorage.app",
  messagingSenderId: "624749772550",
  appId: "1:624749772550:web:fcc22a4c4f2b76e3572887",
  measurementId: "G-GE23KRC0GS"
};

// Initialize the Firebase app (guard against double-initialization if this
// module is ever evaluated twice, e.g. hot reload during development).
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app();
}

// Enable analytics only if the browser supports it (avoids console errors
// on unsupported browsers / privacy-blocked environments).
try {
  if (firebase.analytics && firebase.analytics.isSupported) {
    firebase.analytics.isSupported().then((supported) => {
      if (supported) firebase.analytics();
    });
  }
} catch (e) {
  // Analytics is optional — never let it break the app.
  console.warn("Analytics not initialized:", e.message);
}

// Core service handles used throughout the app.
export const auth = firebase.auth();
export const db = firebase.database();
export const storage = firebase.storage();

// Handy re-export of the special server-timestamp placeholder used when
// writing dates into Realtime Database (keeps clocks consistent across
// devices instead of relying on each client's local clock).
export const SERVER_TIMESTAMP = firebase.database.ServerValue.TIMESTAMP;

// Persist auth session across browser restarts (persistent login).
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

export default firebase;
