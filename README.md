# 🔮 Whispr — Anonymous Stranger Chat

> Say what you can't say in real life.

A real-time anonymous chat platform built with Node.js, Express, and Socket.io. Completely anonymous — no accounts, no logs, no names. Just two strangers talking.

---

## ✨ Features

- **Instant random matching** — pure Omegle-style pairing
- **Real-time messaging** with typing indicators
- **"Next" button** — skip to a new stranger anytime
- **Fully anonymous** — no user data stored
- **Mobile-friendly** dark UI
- **Auto-reconnect** — if a stranger leaves, you're put back in the queue

---

## 🚀 Quick Start

### 1. Install Node.js
Download from https://nodejs.org (v16 or higher)

### 2. Install dependencies
```bash
cd whispr-backend
npm install
```

### 3. Start the server
```bash
npm start
```

### 4. Open your browser
Go to: **http://localhost:3000**

Open it in **two different browser tabs or windows** to test two users chatting.

---

## 🛠 Development Mode (auto-restart)

```bash
npm run dev
```

---

## 🌐 Deploy to the Internet (Free Options)

### Option A: Railway (Recommended — easiest)
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Upload/push this folder to a GitHub repo
4. Railway auto-detects Node.js and deploys it
5. You get a public URL like `https://whispr-xyz.railway.app`

### Option B: Render
1. Go to https://render.com
2. "New Web Service" → connect your GitHub repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Free tier available

### Option C: Fly.io
```bash
npm install -g flyctl
fly launch
fly deploy
```

---

## 📁 File Structure

```
whispr-backend/
├── server.js          ← Main server (Socket.io logic)
├── package.json       ← Dependencies
├── README.md          ← This file
└── public/
    └── index.html     ← Frontend (UI + Socket.io client)
```

---

## ⚙️ How It Works

1. User opens the app → connects via WebSocket
2. User clicks "Find a Stranger" → added to a waiting queue
3. When 2+ users are waiting → they get matched as a pair
4. Messages route directly between the pair (server relays only)
5. Either user clicks "Next" or disconnects → pair is broken, both re-queued

---

## 🔒 Privacy Notes

- No messages are stored on the server
- No user accounts or IDs
- Socket IDs are temporary and reset on reconnect
- To add message encryption, use the `tweetnacl` npm package

---

## 🧩 Customization Ideas

| Feature | How |
|---|---|
| Topic rooms | Add a `room` field on join, match by topic |
| Message limit | Track count per session in `userMeta` |
| Profanity filter | Use `bad-words` npm package |
| Rate limiting | Use `socket.io-rate-limiter` |
| HTTPS | Use nginx reverse proxy + Let's Encrypt |

---

Built with ❤️ and Socket.io
