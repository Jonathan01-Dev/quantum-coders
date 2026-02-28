# Archipel Protocol Specification (v1.0)

## 1. Network Layer (Sprint 1)
- **Discovery**: UDP Multicast on `239.255.42.99:6000`.
- **Keep-alive**: TCP `PING`/`PONG` every 15 seconds. Timeout after 90s.
- **Topology**: Mesh network with peer table gossip.

## 2. Security Layer (Sprint 2)
- **Identity**: Ed25519 key pair (Permanent ID).
- **Handshake**: 3-step mutual authentication inspired by Noise Protocol.
  - New ephemeral X25519 keys per session (Forward Secrecy).
- **Encryption**: AES-256-GCM for all TCP data.
- **Trust**: Web of Trust (WoT) via digital signatures on peer IDs (TOFU).

## 3. Transfer Layer (Sprint 3)
- **Segmentation**: Files split into 512KB chunks.
- **Integrity**: Full-file SHA-256 + individual chunk SHA-256.
- **Authenticity**: Manifests and Chunks are digitally signed by the sender.
- **Distribution**: 
  - Distributed Hash Table (DHT) for manifest discovery.
  - Multi-source parallel fetching (Rarest First strategy).

## 4. Messaging & AI (Sprint 4)
- **Relay**: End-to-End Encrypted (E2EE) sealed boxes for meshed messaging.
- **AI**: Contextual Gemini AI integration with thread history and file summarization.
