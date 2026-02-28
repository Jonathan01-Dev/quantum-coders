# Archipel : Devpost Project Description (300 Words Max)

**Archipel** is a decentralized, secure, and privacy-first peer-to-peer (P2P) network designed to empower users with sovereign communication and resilient data sharing. Built on top of Node.js and TypeScript, Archipel addresses the challenges of centralized dependency and data vulnerability by creating a self-healing mesh of nodes that can discover each other, authenticate securely, and transfer large files without any central authority.

At its core, Archipel implements a multi-layered protocol:
1.  **Network Resilience**: Nodes use UDP Multicast for automatic LAN discovery and a gossip-based peer table to map the broader network topology, ensuring connectivity even in dynamic environments.
2.  **Zero-Trust Security**: Every connection undergoes a three-step mutual authentication handshake, generating ephemeral X25519 session keys for forward secrecy. All data is encrypted using AES-256-GCM, and node identities are verified via a decentralized Web of Trust (WoT), preventing man-in-the-middle attacks through a Trust-on-First-Use (TOFU) model.
3.  **BitTorrent-Inspired Transfer**: Large files are segmented into signed chunks, tracked via bitfields, and fetched in parallel from multiple sources. A "Rarest First" selection strategy optimizes network throughput, while SHA-256 integrity checks guarantee data consistency.
4.  **Contextual AI Integration**: A dedicated Gemini AI service is embedded into each node, providing users with real-time assistance and the ability to summarize complex, shared documents directly within the secure mesh.

Archipel is not just a file-sharing tool; it is a framework for building resilient, private, and intelligent decentralized applications. Whether for local collaboration or mesh-relayed messaging, Archipel puts the power back into the hands of the individuals at the edges of the network.

**Built for Hack-Days-Build-In-Public.**
