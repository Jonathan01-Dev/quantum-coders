"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchipelNode = void 0;
const libsodium_wrappers_1 = __importDefault(require("libsodium-wrappers"));
const discovery_1 = require("../network/discovery");
const config_1 = require("./config");
const identity_1 = require("../crypto/identity");
const tcp_1 = require("../network/tcp");
const client_1 = require("../network/client");
const transfer_1 = require("../transfer/transfer");
const manifest_1 = require("../transfer/manifest");
const path = __importStar(require("path"));
const events_1 = require("events");
class ArchipelNode extends events_1.EventEmitter {
    port;
    id = "";
    discovery;
    server;
    identity;
    activeClients = new Map();
    transferManager = new transfer_1.TransferManager();
    dht = new Map();
    pendingDownloads = new Set();
    gossipInterval;
    constructor(port = config_1.CONFIG.NETWORK.DEFAULT_TCP_PORT) {
        super();
        this.port = port;
    }
    async start() {
        this.identity = await identity_1.IdentityConfig.loadOrGenerate(this.port);
        this.id = this.identity.idBase64;
        this.server = new tcp_1.TCPServer(this.port, this.identity);
        await this.server.start();
        this.server.on('message', async ({ peerId, data }) => {
            const payload = JSON.parse(data.toString());
            if (payload.type === 'MSG') {
                console.log(`\n\x1b[36m[MSG from ${peerId.slice(0, 8)}]\x1b[0m ${payload.content}`);
                this.emit('message', { peerId, data: payload });
            }
            else if (payload.type === 'REQ_MANIFEST') {
                const manifest = this.transferManager.getSharedManifest(payload.manifestId);
                if (manifest) {
                    await this.sendPacket(peerId, { type: 'RES_MANIFEST', manifest });
                }
            }
            else if (payload.type === 'RES_MANIFEST') {
                const manifest = payload.manifest;
                this.transferManager.initDownload(manifest);
                this.startChunkDownload(peerId, manifest);
            }
            else if (payload.type === 'REQ_CHUNK') {
                const chunkBuffer = await this.transferManager.readChunk(payload.manifestId, payload.chunkIndex);
                if (chunkBuffer) {
                    await this.sendPacket(peerId, {
                        type: 'RES_CHUNK',
                        manifestId: payload.manifestId,
                        chunkIndex: payload.chunkIndex,
                        chunkDataBase64: chunkBuffer.toString('base64')
                    });
                }
            }
            else if (payload.type === 'RES_CHUNK') {
                const buf = Buffer.from(payload.chunkDataBase64, 'base64');
                const isValid = this.transferManager.verifyAndWriteChunk(payload.manifestId, payload.chunkIndex, buf);
                if (isValid && this.transferManager.isDownloadComplete(payload.manifestId)) {
                    console.log(`\n\x1b[32m[SUCCESS]\x1b[0m File fully downloaded and verified!`);
                    this.emit('transfer:complete', { manifestId: payload.manifestId });
                    const outPath = await this.transferManager.commitDownload(payload.manifestId, process.cwd());
                    console.log(`Saved at: ${outPath}\n`);
                }
            }
            else if (payload.type === 'DHT_PROVIDE') {
                if (!this.dht.has(payload.manifestId)) {
                    this.dht.set(payload.manifestId, new Set());
                }
                const providers = this.dht.get(payload.manifestId);
                if (!providers.has(payload.providerId)) {
                    providers.add(payload.providerId);
                    console.log(`\n\x1b[36m[DHT]\x1b[0m Learned provider \x1b[33m${payload.providerId.slice(0, 8)}\x1b[0m for manifest \x1b[1m${payload.manifestId}\x1b[0m`);
                    this.broadcast(payload).catch(() => { });
                }
            }
            else if (payload.type === 'DHT_FIND') {
                if (this.transferManager.getSharedManifest(payload.manifestId)) {
                    await this.sendPacket(peerId, { type: 'DHT_FOUND', manifestId: payload.manifestId, providerId: this.id }).catch(() => { });
                }
                else if (this.dht.has(payload.manifestId) && this.dht.get(payload.manifestId).size > 0) {
                    const providerId = Array.from(this.dht.get(payload.manifestId))[0];
                    await this.sendPacket(peerId, { type: 'DHT_FOUND', manifestId: payload.manifestId, providerId }).catch(() => { });
                }
            }
            else if (payload.type === 'DHT_FOUND') {
                if (!this.dht.has(payload.manifestId)) {
                    this.dht.set(payload.manifestId, new Set());
                }
                const providers = this.dht.get(payload.manifestId);
                if (!providers.has(payload.providerId)) {
                    providers.add(payload.providerId);
                    console.log(`\n\x1b[32m[DHT]\x1b[0m Found provider \x1b[33m${payload.providerId.slice(0, 8)}\x1b[0m for manifest \x1b[1m${payload.manifestId}\x1b[0m`);
                    if (this.pendingDownloads.has(payload.manifestId)) {
                        this.pendingDownloads.delete(payload.manifestId);
                        this.downloadFileFromProvider(payload.providerId, payload.manifestId).catch(() => { });
                    }
                }
            }
            else if (payload.type === 'ANNOUNCE') {
                const isNew = !this.getPeers().find(p => p.id === payload.id);
                if (isNew) {
                    this.discovery.peers.set(payload.id, {
                        id: payload.id,
                        ip: peerId,
                        tcpPort: payload.tcpPort,
                        lastSeen: Date.now()
                    });
                    this.emit('peer:new', { id: payload.id, ip: 'LAN', tcpPort: payload.tcpPort, lastSeen: Date.now() });
                }
            }
            else if (payload.type === 'GOSSIP_PEERS') {
                const gossipedPeers = payload.peers;
                if (Array.isArray(gossipedPeers)) {
                    for (const peer of gossipedPeers) {
                        if (peer.id !== this.id && !this.getPeers().find(p => p.id === peer.id)) {
                            console.log(`\x1b[35m[GOSSIP]\x1b[0m Learned about Node \x1b[33m${peer.id.slice(0, 8)}\x1b[0m via ${peerId.slice(0, 8)}`);
                            this.discovery.peers.set(peer.id, {
                                id: peer.id,
                                ip: peer.ip,
                                tcpPort: peer.tcpPort,
                                lastSeen: Date.now()
                            });
                            this.emit('peer:new', { id: peer.id, ip: peer.ip, tcpPort: peer.tcpPort, lastSeen: Date.now() });
                            this.connectToPeer(peer.ip, peer.tcpPort).catch(() => { });
                        }
                    }
                }
            }
            else if (payload.type === 'RELAY') {
                if (payload.toId === this.id) {
                    console.log(`\n\x1b[32m[RELAY]\x1b[0m Received E2E message for me from \x1b[33m${payload.fromId.slice(0, 8)}\x1b[0m`);
                    try {
                        const sodium = libsodium_wrappers_1.default;
                        await sodium.ready;
                        // Convert internal Ed25519 keys to Curve25519 for sealedbox
                        const pk = sodium.crypto_sign_ed25519_pk_to_curve25519(this.identity.publicKey);
                        const sk = sodium.crypto_sign_ed25519_sk_to_curve25519(this.identity.privateKey);
                        const encrypted = sodium.from_base64(payload.encryptedPayload);
                        const decrypted = sodium.crypto_box_seal_open(encrypted, pk, sk);
                        const content = sodium.to_string(decrypted);
                        console.log(`\x1b[36m[E2E CONTENT]\x1b[0m ${content}`);
                        this.emit('message', { peerId: payload.fromId, data: { content, isRelayed: true } });
                    }
                    catch (e) {
                        console.log(`\x1b[31m[RELAY ERROR]\x1b[0m Decryption failed: ${e.message}`);
                    }
                }
                else {
                    // Forwarding logic
                    console.log(`\x1b[35m[RELAY]\x1b[0m Relaying packet for Node \x1b[33m${payload.toId.slice(0, 8)}\x1b[0m... (Content unreadable)`);
                    this.sendPacket(payload.toId, payload).catch(() => {
                        console.log(`\x1b[31m[RELAY ERROR]\x1b[0m Target ${payload.toId.slice(0, 8)} unreachable.`);
                    });
                }
            }
        });
        this.server.on('secure_connection', async ({ peerId }) => {
            const knownPeers = this.getPeers();
            if (knownPeers.length > 0) {
                await this.sendPacket(peerId, { type: 'GOSSIP_PEERS', peers: knownPeers }).catch(() => { });
            }
        });
        this.discovery = new discovery_1.DiscoveryService(this.id, this.port);
        await this.discovery.start();
        this.discovery.on('peer:new', (peer) => {
            console.log(`\x1b[36m[NEW PEER]\x1b[0m Discovered Node \x1b[33m${peer?.id ? peer.id.slice(0, 8) : 'Unknown'}\x1b[0m at ${peer?.ip}:${peer?.tcpPort}`);
            this.emit('peer:new', peer);
        });
        this.discovery.on('peer:lost', (peer) => {
            console.log(`\x1b[31m[LOST PEER]\x1b[0m Node \x1b[33m${peer?.id ? peer.id.slice(0, 8) : 'Unknown'}\x1b[0m disconnected`);
            if (peer?.id)
                this.activeClients.delete(peer.id);
            this.emit('peer:lost', peer);
        });
        this.startPeriodicGossip();
    }
    startPeriodicGossip() {
        this.gossipInterval = setInterval(() => {
            const peers = this.getPeers();
            if (peers.length > 0) {
                console.log(`\x1b[35m[GOSSIP]\x1b[0m Pulse: Sharing routing table with ${peers.length} peers...`);
                this.broadcast({ type: 'GOSSIP_PEERS', peers }).catch(() => { });
            }
        }, 30000);
    }
    stop() {
        this.discovery?.stop();
        if (this.gossipInterval)
            clearInterval(this.gossipInterval);
    }
    getPeers() {
        return this.discovery?.getPeers() || [];
    }
    async connectToPeer(ip, port = config_1.CONFIG.NETWORK.DEFAULT_TCP_PORT) {
        console.log(`\x1b[36m[CONNECT]\x1b[0m Attempting manual connection to ${ip}:${port}...`);
        const tempClient = new client_1.TCPClient(this.identity, ip, port);
        await tempClient.connect();
        // Handshake happens internally in TCPClient
    }
    async broadcast(payload) {
        const peers = this.getPeers();
        for (const peer of peers) {
            this.sendPacket(peer.id, payload).catch(() => { });
        }
    }
    async sendPacket(targetId, payload) {
        let client = this.activeClients.get(targetId);
        if (!client) {
            const peer = this.getPeers().find(p => p.id === targetId || p.id.startsWith(targetId));
            if (peer) {
                console.log(`\x1b[35m[CRYPTO]\x1b[0m Initiating secure link with ${peer.id.slice(0, 8)}...`);
                client = new client_1.TCPClient(this.identity, peer.ip, peer.tcpPort);
                await client.connect();
                this.activeClients.set(peer.id, client);
            }
            else {
                console.log(`\x1b[31m[ERROR]\x1b[0m Peer ${targetId.slice(0, 8)} not found.`);
                return;
            }
        }
        const packet = Buffer.from(JSON.stringify(payload));
        await client.send(packet);
    }
    async sendMessage(targetId, content) {
        await this.sendPacket(targetId, { type: 'MSG', content });
        console.log(`\x1b[32m[SENT]\x1b[0m Message delivered to ${targetId.slice(0, 8)}`);
    }
    async broadcastMessage(content) {
        console.log(`\x1b[35m[BROADCAST]\x1b[0m Sending message to the entire archipelago...`);
        await this.broadcast({ type: 'MSG', content });
        this.emit('message', { peerId: this.id, data: { content } });
    }
    async sendRelayMessage(targetId, content) {
        console.log(`\x1b[35m[RELAY]\x1b[0m Encrypting E2E message for ${targetId.slice(0, 8)}...`);
        try {
            const sodium = libsodium_wrappers_1.default;
            await sodium.ready;
            // Get target public key (ID) and convert it
            const targetPkRaw = sodium.from_base64(targetId);
            const targetPkCurve = sodium.crypto_sign_ed25519_pk_to_curve25519(targetPkRaw);
            const encrypted = sodium.crypto_box_seal(content, targetPkCurve);
            const encryptedPayload = sodium.to_base64(encrypted);
            // Find a neighbor to relay the packet
            const peers = this.getPeers();
            if (peers.length === 0)
                throw new Error("No neighbors to relay");
            // Simple logic: send to all neighbors, they will forward
            await this.broadcast({
                type: 'RELAY',
                toId: targetId,
                fromId: this.id,
                encryptedPayload
            });
            console.log(`\x1b[32m[RELAY SENT]\x1b[0m Packet launched into the mesh.`);
        }
        catch (e) {
            console.log(`\x1b[31m[ERROR]\x1b[0m Relay failed: ${e.message}`);
            throw e;
        }
    }
    async shareFile(filePath) {
        let cleanPath = filePath.trim();
        if (cleanPath.startsWith('file:///')) {
            cleanPath = require('url').fileURLToPath(cleanPath);
        }
        if (cleanPath.includes('%20') || cleanPath.includes('%')) {
            cleanPath = decodeURIComponent(cleanPath);
        }
        cleanPath = path.normalize(cleanPath);
        const manifest = await manifest_1.ManifestBuilder.create(cleanPath);
        this.transferManager.shareFile(manifest, cleanPath);
        if (!this.dht.has(manifest.id))
            this.dht.set(manifest.id, new Set());
        this.dht.get(manifest.id).add(this.id);
        console.log(`\x1b[32m[SHARED]\x1b[0m File ${manifest.filename} published! ID: \x1b[1m${manifest.id}\x1b[0m`);
        this.emit('file:shared', manifest);
        await this.broadcast({ type: 'DHT_PROVIDE', manifestId: manifest.id, providerId: this.id }).catch(() => { });
    }
    async downloadFile(manifestId) {
        const providers = this.dht.get(manifestId);
        if (providers && providers.size > 0) {
            const providerId = Array.from(providers)[0];
            await this.downloadFileFromProvider(providerId, manifestId);
        }
        else {
            console.log(`\n\x1b[36m[DHT]\x1b[0m Looking for providers for \x1b[1m${manifestId}\x1b[0m...`);
            this.pendingDownloads.add(manifestId);
            await this.broadcast({ type: 'DHT_FIND', manifestId }).catch(() => { });
        }
    }
    async downloadFileFromProvider(peerId, manifestId) {
        console.log(`\x1b[36m[TRANSFER]\x1b[0m Requesting manifest ${manifestId} from ${peerId.slice(0, 8)}...`);
        await this.sendPacket(peerId, { type: 'REQ_MANIFEST', manifestId });
    }
    async startChunkDownload(peerId, manifest) {
        console.log(`\x1b[36m[TRANSFER]\x1b[0m Manifest received. Downloading chunks...`);
        for (const chunk of manifest.chunks) {
            await this.sendPacket(peerId, { type: 'REQ_CHUNK', manifestId: manifest.id, chunkIndex: chunk.index });
            await new Promise(r => setTimeout(r, 50));
        }
    }
}
exports.ArchipelNode = ArchipelNode;
