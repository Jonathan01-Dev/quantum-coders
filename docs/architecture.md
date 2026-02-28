# Archipel System Architecture

```
                  +-----------------------+
                  |  Archipel Node (A)    |
                  |  [Port: 7777]         |
                  +-----------+-----------+
                              |
      +-----------------------+-----------------------+
      |                                               |
      v                                               v
+-----------+-----------+                   +-----------+-----------+
|  Archipel Node (B)    | <--- P2P MESH --->|  Archipel Node (C)    |
|  [Port: 8888]         | (TCP/UDP/Discovery)|  [Port: 9999]         |
+-----------+-----------+                   +-----------+-----------+
      |                                               |
      +-----------------------\ /---------------------+
                               X
      +-----------------------/ \---------------------+
      |                                               |
      v                                               v
+-----------+-----------+                   +-----------------------+
|  Web Dashboard        |                   |  Gemini AI Integration|
|  (React frontend)     |                   |  (Contextual Assistant)|
+-----------------------+                   +-----------------------+
```

## Layers
1. **Application**: CLI + React Web UI.
2. **Services**: TransferManager, TrustService, GeminiService.
3. **Core**: ArchipelNode (Event-driven message dispatcher).
4. **Network**: DiscoveryService (UDP), TCPServer/TCPClient (Encryption/Handshake).
5. **Crypto**: Sodium-based primitives (Ed25519, X25519, AES-GCM).
