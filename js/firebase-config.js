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
  apiKey: "AIzaSyCuAIyM54XWy4DaYqoFYoEIUP0mQNaZQY4",
  authDomain: "church-app-637f7.firebaseapp.com",
  // IMPORTANT: Once you create a Realtime Database in the Firebase console
  // it will give you a URL that looks like the line below. Replace it with
  // your actual databaseURL (Firebase usually auto-fills this correctly,
  // but double check it matches your project + region).
  databaseURL: "https://church-app-637f7-default-rtdb.firebaseio.com",
  projectId: "church-app-637f7",
  storageBucket: "church-app-637f7.firebasestorage.app",
  messagingSenderId: "534721516086",
  appId: "1:534721516086:web:1dd27eae690c620098be97",
  measurementId: "G-JJL8SP6LNW"
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
