# ChatApp — WhatsApp-style Messaging Web App

A complete real-time messaging web application built with **HTML5, CSS3, and
vanilla JavaScript (ES6+)**, powered entirely by **Firebase** (Authentication,
Realtime Database, and Storage) as the backend. No Node.js, Express, PHP, or
any other server framework is required — this is a 100% static, client-side
app that talks directly to Firebase.

## ✨ Features

- **Authentication**: register, login, logout, password reset, persistent
  sessions, and route guards on protected pages.
- **Profiles**: display name, unique username, profile picture, about/bio,
  online status, last seen, full edit support.
- **Contacts**: search users by name/username/email, add contacts, recent
  chats list with live previews and unread badges.
- **1-to-1 chat**: real-time messaging, timestamps, delivered/read receipts,
  typing indicators, edit, delete, and reply-to-message.
- **Group chats**: create groups, edit group info, group icon, add/remove
  members, admin permissions, leave group.
- **Media sharing**: images, videos, documents, with inline previews,
  lightbox viewer, and downloadable documents.
- **Voice notes**: record directly in the browser (MediaRecorder API), send,
  and play back with a scrubbable progress bar.
- **UX**: emoji picker, dark/light/system theme, fully responsive
  mobile-first layout, smooth animations, loading indicators.
- **Notifications**: browser desktop notifications + unread counters in the
  sidebar and the document title.

## 📁 Project Structure

```
whatsapp-clone/
├── index.html            # Auth-state redirect entry point
├── login.html
├── register.html
├── chat.html              # Main messaging application
├── profile.html
├── settings.html
├── css/
│   ├── style.css          # Variables, resets, shared components
│   ├── auth.css           # Login/Register styling
│   ├── chat.css            # Chat UI, bubbles, sidebar, modals
│   └── responsive.css      # Mobile breakpoints
├── js/
│   ├── firebase-config.js  # Firebase init (EDIT THIS FILE)
│   ├── auth.js
│   ├── chat.js
│   ├── contacts.js
│   ├── groups.js
│   ├── profile.js
│   ├── storage.js
│   ├── notifications.js
│   ├── utilities.js
│   └── app.js              # Wires everything together for chat.html
├── assets/
├── database.rules.json     # Realtime Database security rules
├── storage.rules            # Storage security rules
├── firebase.json
├── .gitignore
└── README.md
```

## 🚀 Setup Guide

### 1. Create the Firebase project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com).
2. Click **Add project**, give it a name, and follow the prompts (you can
   disable Google Analytics if you don't need it).
3. Once created, click the **Web** icon (`</>`) to register a web app and
   copy the generated `firebaseConfig` object.

> This project already ships with a config pointing at the `church-app-637f7`
> Firebase project. If that's your project, you can use it as-is (after
> completing steps 2–4 below). Otherwise, replace the config in
> `js/firebase-config.js` with your own project's values.

### 2. Enable Authentication

1. In the Firebase Console, open **Build → Authentication**.
2. Click **Get started**.
3. Under the **Sign-in method** tab, enable **Email/Password**.

### 3. Create the Realtime Database

1. Open **Build → Realtime Database**.
2. Click **Create Database**, choose a location, and start in **locked
   mode** (we'll deploy proper rules next).
3. Copy the database URL shown at the top (it looks like
   `https://<project-id>-default-rtdb.<region>.firebasedatabase.app`) and
   paste it into the `databaseURL` field inside `js/firebase-config.js`.
4. Deploy the included rules — either paste the contents of
   `database.rules.json` into the **Rules** tab in the console and click
   **Publish**, or deploy via the CLI (see below).

### 4. Configure Storage

1. Open **Build → Storage** and click **Get started**, accepting the
   default bucket location.
2. Deploy the included rules — paste `storage.rules` into the **Rules** tab
   and click **Publish**, or deploy via the CLI (see below).

### 5. Where to paste the Firebase configuration

Open **`js/firebase-config.js`** and replace the `firebaseConfig` object at
the top with your project's values (apiKey, authDomain, databaseURL,
projectId, storageBucket, messagingSenderId, appId, measurementId). This is
the **only file** you need to edit to connect the app to your Firebase
project — every other module imports `auth`, `db`, and `storage` from here.

### 6. Run it locally

Because this app uses ES modules (`<script type="module">`), you must serve
it over `http://` rather than opening the HTML files directly with
`file://`. Any static file server works, for example:

```bash
# Using Python
python3 -m http.server 8000

# Or using Node's http-server (if you have Node installed for local testing only)
npx http-server -p 8000
```

Then visit `http://localhost:8000`.

## ☁️ Deploying

### Deploy with GitHub (source control)

```bash
git init
git add .
git commit -m "Initial commit: ChatApp"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### Option A — Host with Firebase Hosting

1. Install the Firebase CLI: `npm install -g firebase-tools`
2. Log in: `firebase login`
3. From the project folder, link it to your Firebase project:
   `firebase use --add` (select your project)
4. Deploy everything (hosting + database rules + storage rules) in one go:
   ```bash
   firebase deploy
   ```
5. Your app will be live at `https://<project-id>.web.app`.

### Option B — Host with GitHub Pages

1. Push the project to a GitHub repository (see above).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select
   the `main` branch and the `/ (root)` folder, then **Save**.
4. GitHub will publish your site at
   `https://<your-username>.github.io/<your-repo>/`.
5. Because Firebase Authentication restricts sign-in to **Authorized
   domains**, add your GitHub Pages domain (e.g.
   `<your-username>.github.io`) under **Authentication → Settings →
   Authorized domains** in the Firebase Console.

## 🔒 Security Notes

- The provided `database.rules.json` and `storage.rules` restrict all reads
  and writes to authenticated users and, where relevant, to the resource
  owner or chat/group members — review and tighten them further before
  going to production with real user data.
- Never commit real API keys for other sensitive services into this repo;
  the Firebase Web API key is safe to expose publicly (it is not a secret),
  but access is still enforced by your Realtime Database/Storage rules.

## 🧩 Tech Stack

- HTML5 / CSS3 / Vanilla JavaScript (ES6+ modules)
- Firebase Authentication (compat SDK, loaded via CDN)
- Firebase Realtime Database
- Firebase Storage
- Firebase Hosting (optional)
