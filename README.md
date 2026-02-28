# Archipel : The Sovereign Resilient P2P Network

**Archipel** is a decentralized, secure, and privacy-first peer-to-peer (P2P) network prototype developed for the Hack-Days-Build-In-Public hackathon. It combines robust cryptographic primitives, BitTorrent-inspired file transfer, and contextual AI integration to create a resilient communication platform.

## 🚀 Key Features

- **Decentralized Discovery**: Automatic node discovery via UDP Multicast (LAN) and peer table gossip.
- **Noise-Inspired Security**: 3-step mutual authentication, X25519 ephemeral key exchange (FS), and AES-256-GCM encryption.
- **BitTorrent-Style Transfer**: Large file chunking, parallel multi-source fetching, and SHA-256 integrity verification.
- **Web of Trust (WoT)**: Decentralized identity verification (TOFU) with digital signatures on peer IDs.
- **Contextual AI Assistant**: Integrated Gemini AI for real-time chat and automated file summarization.
- **Resilient Mesh**: E2EE relayed messaging across nodes, even without direct visibility.

## 🛠 Tech Stack

- **Core**: Node.js, TypeScript
- **Networking**: `dgram` (UDP), `net` (TCP)
- **Cryptography**: `libsodium-wrappers`
- **UI**: React, Vite, TailwindCSS (Web Dashboard)
- **AI**: Google Gemini API (@google/generative-ai)
- **Storage**: JSON-based persistent index (`index.db`)

## 🏗 Architecture

See [Architecture Documentation](docs/architecture.md) and [Protocol Specification](docs/protocol-spec.md) for deep dives.

## 📦 Installation & Execution

### Prerequisites
- Node.js (v18+)
- Gemini API Key (Optional, for AI features)

### Setup
```bash
git clone https://github.com/USER/Archipel.git
cd Archipel
npm install        # Backend dependencies
cd ui && npm install # Frontend dependencies
cd ..
```

### Running a Node
```bash
npm run dev -- --port 7777 --api-key YOUR_GEMINI_KEY
```
*The Web UI will automatically be available at `http://localhost:8777` (Node Port + 1000).*

## 📖 Demo Scenario (Step-by-Step)

1. **Launch 2 Nodes**: Open two terminals and run:
   - Terminal 1: `npm run dev -- --port 7777`
   - Terminal 2: `npm run dev -- --port 8888`
2. **Auto-Discovery**: Observe Node A and Node B discovering each other instantly via UDP.
3. **Secure Messaging**: In the Web UI, send an encrypted message from Node A to Node B.
4. **File Sharing**: 
   - On Node A, use `send <path_to_file>` to share a file.
   - On Node B, use `receive` to see the file ID, then `download <id>`.
   - Watch the transfer progress bar as chunks are verified via SHA-256.
5. **AI Summarization**: Once downloaded, click the "Book" icon on Node B to ask Gemini to summarize the file from Node A.

## 🛡 Security Best Practices
- **No Private Keys in Git**: Identities are stored locally in `.archipel_identity_PORT.json`.
- **Standard Primitives**: Using Libsodium (Sodium) for all cryptographic operations.
- **Ephemeral Keys**: Handshake generates fresh session keys for every connection.

---
*Built for Hack-Days-Build-In-Public.*
