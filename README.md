# Drexy — Connect Boldly

A modern real-time messaging app built with vanilla HTML/CSS/JavaScript and Firebase.

🌐 **Live site:** https://daviddchucks-hash.github.io/WhatsAppclone/

---

## Features

- 🔐 **Auth** — Email/password sign-up & login, persistent sessions, password reset
- 👤 **Username system** — Unique handles, searchable by name or @username
- 💬 **Real-time messaging** — Instant delivery via Firebase Realtime Database
- 👥 **Group chats** — Create groups, add/remove members, group admin roles
- 📎 **Media sharing** — Images, videos, documents, voice notes via Firebase Storage
- ↩️ **Reply & edit** — Quote-reply to messages, edit or delete sent messages
- ✅ **Read receipts** — Sent → Delivered → Read status ticks
- 🟢 **Presence** — Live online/last-seen indicators
- 🎤 **Voice notes** — Record and send audio messages
- 🌙 **Dark & Light mode** — System-aware, persisted per browser
- 🔔 **Push notifications** — Browser notifications for new messages

---

## Project Structure

```
WhatsAppclone/
├── index.html              # Auth-state redirect entry point
├── login.html              # Sign-in page
├── register.html           # Sign-up page
├── chat.html               # Main messaging application
├── profile.html            # Edit profile (name, username, avatar)
├── settings.html           # Theme, notifications, account
├── css/
│   ├── style.css           # Drexy design system (variables, resets, shared)
│   ├── auth.css            # Login / Register pages
│   ├── chat.css            # Chat UI — sidebar, bubbles, input, panels
│   └── responsive.css      # Mobile breakpoints
├── js/
│   ├── firebase-config.js  # Firebase init — EDIT THIS to add your project
│   ├── auth.js             # Registration, login, logout, route guards
│   ├── app.js              # Wires everything together for chat.html
│   ├── chat.js             # Messaging engine (send, receive, edit, delete)
│   ├── contacts.js         # Contact list & recent chats sidebar
│   ├── groups.js           # Group creation and management
│   ├── profile.js          # Profile fetch, edit, avatar upload
│   ├── storage.js          # Firebase Storage uploads
│   ├── notifications.js    # Browser push notifications
│   └── utilities.js        # Shared helpers (format, escape, debounce…)
├── assets/                 # Static assets (images, icons)
├── database.rules.json     # Firebase Realtime Database security rules
├── storage.rules           # Firebase Storage security rules
└── firebase.json           # Firebase Hosting config
```

---

## Firebase Setup

### 1. Create a Firebase project
Go to [console.firebase.google.com](https://console.firebase.google.com) → New project.

### 2. Enable services
- **Authentication** → Sign-in method → Email/Password → Enable
- **Realtime Database** → Create database (start in test mode, then apply rules below)
- **Storage** → Get started

### 3. Configure `js/firebase-config.js`
Replace the `firebaseConfig` object with your project's credentials (found in Project Settings → Your apps → Web app).

### 4. Apply Realtime Database rules
Paste the contents of `database.rules.json` into Firebase Console → Realtime Database → Rules → Publish.

### 5. Apply Storage rules
Paste the contents of `storage.rules` into Firebase Console → Storage → Rules → Publish.

### 6. Deploy to GitHub Pages
```bash
git add -A && git commit -m "Deploy Drexy" && git push origin main
```
GitHub Pages serves automatically from `main` branch root.

---

## Design System

| Token | Value | Usage |
|---|---|---|
| `--clr-primary` | `#8B5CF6` | Buttons, links, active states |
| `--clr-accent` | `#A855F7` | Gradients, highlights |
| `--clr-bg` | `#07071A` | Page background (dark) |
| `--clr-panel` | `#0D0D24` | Cards, sidebar |
| `--gradient` | `#7C3AED → #A855F7` | Brand gradient |

Font: **Poppins** (Google Fonts)

---

## Local Development

No build step required. Serve files with any static server:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .

# Then open: http://localhost:8080
```

---

*Drexy — built with ❤️ using Firebase + vanilla JS*
