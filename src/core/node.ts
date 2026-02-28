import { promises as fs } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { TCPServer } from '../network/tcp';
import { TCPClient } from '../network/client';
import { DiscoveryService, PeerInfo } from '../network/discovery';
import { Identity, IdentityConfig } from '../crypto/identity';
import { FileManifest, ManifestBuilder } from '../transfer/manifest';
import { GeminiService } from '../messaging/gemini';
import { TransferManager } from '../transfer/transfer';
import { TrustService, TrustAssertion } from './trust';
import { createHash } from 'crypto';
import _sodium from 'libsodium-wrappers';
import { CONFIG } from './config';

export class ArchipelNode extends EventEmitter {
    public id: string = "";
    private discovery!: DiscoveryService;
    private server!: TCPServer;
    private identity!: Identity;
    private activeClients: Map<string, TCPClient> = new Map();
    private transferManager: TransferManager = new TransferManager();
    private dht: Map<string, Set<string>> = new Map();
    private pendingDownloads: Set<string> = new Set();
    private gossipInterval?: NodeJS.Timeout;
    private seenPackets: Set<string> = new Set();
    private gemini?: GeminiService;
    private messageHistory: Map<string, { role: 'user' | 'model', parts: { text: string }[] }[]> = new Map();
    private trustService!: TrustService;

    constructor(private port: number = CONFIG.NETWORK.DEFAULT_TCP_PORT) {
        super();
    }

    public async start(): Promise<void> {
        this.identity = await IdentityConfig.loadOrGenerate(this.port);
        this.id = this.identity.idBase64;

        this.server = new TCPServer(this.port, this.identity);
        await this.server.start();

        this.trustService = new TrustService(this.port);
        this.discovery = new DiscoveryService(this.id, this.port);
        await this.discovery.start();

        const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        const aiDisabled = process.env.AIS_DISABLED === 'true';

        if (apiKey && !aiDisabled) {
            console.log(`\x1b[32m[SYSTEM]\x1b[0m Gemini API Key detected. Initializing AI service...`);
            this.gemini = new GeminiService(apiKey);
            console.log(`\x1b[32m[GEMINI]\x1b[0m AI Service initialized for Node ${this.id.slice(0, 8)}`);
        } else {
            console.log(`\x1b[33m[SYSTEM]\x1b[0m Gemini AI disabled or Key missing (Key: ${apiKey ? 'Present' : 'Missing'}, Disabled: ${aiDisabled})`);
        }

        // Module 3.4: File persistence - Re-announce shared files on DHT
        const shared = this.transferManager.getSharedFiles();
        for (const f of shared) {
            if (!this.dht.has(f.manifest.file_id)) this.dht.set(f.manifest.file_id, new Set());
            this.dht.get(f.manifest.file_id)!.add(this.id);
            console.log(`\x1b[36m[PERSISTENCE]\x1b[0m Re-announced: ${f.manifest.filename}`);
        }

        this.server.on('message', async ({ peerId, data }) => {
            let payload: any;
            try {
                payload = JSON.parse(data.toString());
            } catch (e) {
                return;
            }

            if (payload.type === 'TRUST_ASSERTION') {
                const assertion = payload.assertion as TrustAssertion;
                console.log(`\x1b[32m[TRUST]\x1b[0m Received trust signature for ${assertion.targetId.slice(0, 8)} by ${assertion.signerId.slice(0, 8)}`);
            }
            else if (payload.type === 'MSG') {
                console.log(`\n\x1b[36m[MSG from ${peerId.slice(0, 8)}]\x1b[0m ${payload.content}`);
                this.emit('message', { peerId, data: payload });

                if (!this.messageHistory.has(peerId)) this.messageHistory.set(peerId, []);
                const history = this.messageHistory.get(peerId)!;
                history.push({ role: 'user', parts: [{ text: payload.content }] });

                const triggers = ['/ask ', '@archipel-ai ', '/ai '];
                const matchedTrigger = triggers.find(t => payload.content.startsWith(t));

                if (matchedTrigger && this.gemini) {
                    const prompt = payload.content.substring(matchedTrigger.length);
                    this.handleAiPrompt(peerId, prompt).catch(console.error);
                }
            }
            else if (payload.type === 'REQ_MANIFEST') {
                const manifest = this.transferManager.getSharedManifest(payload.manifestId);
                if (manifest) {
                    await this.sendPacket(peerId, { type: 'MANIFEST', manifest }).catch(() => { });
                }
            }
            else if (payload.type === 'MANIFEST') {
                const manifest = payload.manifest as FileManifest;
                await this.transferManager.initDownload(manifest, process.cwd());
                this.continueDownload(manifest.file_id).catch(() => { });
            }
            else if (payload.type === 'CHUNK_REQ') {
                const chunk = await this.transferManager.readChunk(payload.file_id, payload.chunk_idx);
                if (chunk) {
                    const sodium = _sodium;
                    await sodium.ready;
                    const msgToSign = Buffer.concat([
                        Buffer.from(payload.file_id),
                        Buffer.from([payload.chunk_idx]),
                        chunk
                    ]);
                    const signature = sodium.crypto_sign_detached(msgToSign, this.identity.privateKey);

                    await this.sendPacket(peerId, {
                        type: 'CHUNK_DATA',
                        file_id: payload.file_id,
                        chunk_idx: payload.chunk_idx,
                        data: chunk.toString('base64'),
                        hash: createHash('sha256').update(chunk).digest('hex'),
                        signature: sodium.to_base64(signature)
                    });
                } else {
                    await this.sendPacket(peerId, { type: 'ACK', chunk_idx: payload.chunk_idx, status: 0x02 }); // NOT_FOUND
                }
            }
            else if (payload.type === 'CHUNK_DATA') {
                const chunkData = Buffer.from(payload.data, 'base64');
                const verified = await this.transferManager.verifyAndWriteChunk(payload.file_id, payload.chunk_idx, chunkData);

                if (verified) {
                    await this.sendPacket(peerId, { type: 'ACK', chunk_idx: payload.chunk_idx, status: 0x00 });
                    this.emit('transfer:progress', {
                        fileId: payload.file_id,
                        progress: this.transferManager.getProgress(payload.file_id)
                    });

                    if (this.transferManager.isDownloadComplete(payload.file_id)) {
                        const finalPath = await this.transferManager.finalizeDownload(payload.file_id);
                        console.log(`\n\x1b[32m[COMPLETE]\x1b[0m File downloaded to: ${finalPath}`);
                        this.emit('transfer:complete', { fileId: payload.file_id, path: finalPath });
                    } else {
                        this.continueDownload(payload.file_id).catch(() => { });
                    }
                } else {
                    await this.sendPacket(peerId, { type: 'ACK', chunk_idx: payload.chunk_idx, status: 0x01 }); // HASH_MISMATCH
                }
            }
            else if (payload.type === 'ACK') {
                if (payload.status !== 0x00) {
                    console.log(`\x1b[31m[ACK ERROR]\x1b[0m Peer ${peerId.slice(0, 8)} reported status ${payload.status} for chunk ${payload.chunk_idx}`);
                }
            }
            else if (payload.type === 'DHT_PROVIDE') {
                if (!this.dht.has(payload.manifestId)) {
                    this.dht.set(payload.manifestId, new Set());
                }
                this.dht.get(payload.manifestId)!.add(payload.providerId);
                this.emit('dht:update', { manifestId: payload.manifestId, providerId: payload.providerId });

                if (this.pendingDownloads.has(payload.manifestId)) {
                    this.pendingDownloads.delete(payload.manifestId);
                    this.downloadFileFromProvider(payload.providerId, payload.manifestId).catch(() => { });
                }
            }
            else if (payload.type === 'DHT_FIND') {
                if (this.transferManager.getSharedManifest(payload.manifestId)) {
                    await this.sendPacket(peerId, { type: 'DHT_FOUND', manifestId: payload.manifestId, providerId: this.id }).catch(() => { });
                }
            }
            else if (payload.type === 'DHT_FOUND') {
                if (!this.dht.has(payload.manifestId)) {
                    this.dht.set(payload.manifestId, new Set());
                }
                this.dht.get(payload.manifestId)!.add(payload.providerId);
                console.log(`\n\x1b[32m[DHT]\x1b[0m Found provider \x1b[33m${payload.providerId.slice(0, 8)}\x1b[0m for manifest \x1b[1m${payload.manifestId}\x1b[0m`);
                this.emit('dht:update', { manifestId: payload.manifestId, providerId: payload.providerId });

                if (this.pendingDownloads.has(payload.manifestId)) {
                    this.pendingDownloads.delete(payload.manifestId);
                    this.downloadFileFromProvider(payload.providerId, payload.manifestId).catch(() => { });
                }
            }
            else if (payload.type === 'PING') {
                await this.sendPacket(peerId, { type: 'PONG', timestamp: Date.now() }).catch(() => { });
            }
            else if (payload.type === 'PONG') {
                const peer = this.getPeers().find(p => p.id === peerId);
                if (peer) peer.lastSeen = Date.now();
            }
            else if (payload.type === 'GOSSIP_PEERS') {
                const gossipedPeers = payload.peers as PeerInfo[];
                if (Array.isArray(gossipedPeers)) {
                    for (const peer of gossipedPeers) {
                        if (peer.id !== this.id && !this.getPeers().find(p => p.id === peer.id)) {
                            this.discovery.registerPeer(peer.id, peer.ip, peer.tcpPort);
                            this.connectToPeer(peer.ip, peer.tcpPort).catch(() => { });
                        }
                    }
                }
            }
            else if (payload.type === 'RELAY') {
                const packetId = `${payload.fromId}-${payload.toId}-${payload.encryptedPayload.slice(-16)}`;
                if (this.seenPackets.has(packetId)) return;
                this.seenPackets.add(packetId);
                setTimeout(() => this.seenPackets.delete(packetId), 60000);

                if (payload.toId === this.id) {
                    try {
                        const sodium = _sodium;
                        await sodium.ready;
                        const pk = sodium.crypto_sign_ed25519_pk_to_curve25519(this.identity.publicKey);
                        const sk = sodium.crypto_sign_ed25519_sk_to_curve25519(this.identity.privateKey);
                        const encrypted = sodium.from_base64(payload.encryptedPayload);
                        const decrypted = sodium.crypto_box_seal_open(encrypted, pk, sk);
                        const content = sodium.to_string(decrypted);
                        this.emit('message', { peerId: payload.fromId, data: { content, isRelayed: true } });
                    } catch (e) { }
                } else {
                    this.sendPacket(payload.toId, payload).catch(() => { });
                }
            }
        });

        this.server.on('secure_connection', async ({ socket, peerId, peerPort }) => {
            const remoteIp = socket.remoteAddress?.replace('::ffff:', '') || '127.0.0.1';
            this.discovery.registerPeer(peerId, remoteIp, peerPort);

            const knownPeers = this.getPeers();
            if (knownPeers.length > 0) {
                await this.sendPacket(peerId, { type: 'GOSSIP_PEERS', peers: knownPeers }).catch(() => { });
            }
        });

        this.discovery.on('peer:new', (peer: PeerInfo) => {
            console.log(`\x1b[36m[NEW PEER]\x1b[0m Node \x1b[33m${peer.id.slice(0, 8)}\x1b[0m at ${peer.ip}:${peer.tcpPort}`);
            this.emit('peer:new', peer);
            this.connectToPeer(peer.ip, peer.tcpPort).catch(() => { });
        });

        this.discovery.on('peer:lost', (peer: PeerInfo) => {
            console.log(`\x1b[31m[LOST PEER]\x1b[0m Node \x1b[33m${peer.id.slice(0, 8)}\x1b[0m`);
            this.activeClients.delete(peer.id);
            this.emit('peer:lost', peer);
        });

        this.startPeriodicGossip();
    }

    private startPeriodicGossip(): void {
        this.gossipInterval = setInterval(() => {
            const peers = this.getPeers();
            if (peers.length > 0) {
                this.broadcast({ type: 'GOSSIP_PEERS', peers }).catch(() => { });
                this.broadcast({ type: 'PING', timestamp: Date.now() }).catch(() => { });
            }
        }, 15000);
    }

    public stop(): void {
        this.discovery?.stop();
        if (this.gossipInterval) clearInterval(this.gossipInterval);
    }

    public getPeers(): PeerInfo[] {
        return this.discovery?.getPeers() || [];
    }

    public getDht(): Array<{ manifestId: string, providers: string[] }> {
        return Array.from(this.dht.entries()).map(([manifestId, providers]) => ({
            manifestId,
            providers: Array.from(providers)
        }));
    }

    public getNodeStats() {
        return {
            ...this.transferManager.getStats(),
            peersCount: this.getPeers().length,
            id: this.id
        };
    }

    public async connectToPeer(ip: string, port: number = CONFIG.NETWORK.DEFAULT_TCP_PORT): Promise<void> {
        if (this.activeClients.has(ip)) return; // Simple deduplication
        const client = new TCPClient(this.identity, ip, port, this.port);
        client.once('secure_ready', ({ peerId, peerPort }) => {
            this.activeClients.set(peerId, client);
            this.discovery.registerPeer(peerId, ip, peerPort || port);
        });
        await client.connect().catch(() => { });
    }

    private async broadcast(payload: any): Promise<void> {
        const peers = this.getPeers();
        for (const peer of peers) {
            this.sendPacket(peer.id, payload).catch(() => { });
        }
    }

    private async sendPacket(targetId: string, payload: any): Promise<void> {
        let client = this.activeClients.get(targetId);
        if (!client) {
            const peer = this.getPeers().find(p => p.id === targetId || p.id.startsWith(targetId));
            if (peer) {
                client = new TCPClient(this.identity, peer.ip, peer.tcpPort, this.port);
                await client.connect();
                this.activeClients.set(peer.id, client);
            } else {
                return;
            }
        }
        await client.send(Buffer.from(JSON.stringify(payload)));
    }

    public async sendMessage(targetId: string, content: string): Promise<void> {
        await this.sendPacket(targetId, { type: 'MSG', content });
    }

    public async broadcastMessage(content: string): Promise<void> {
        await this.broadcast({ type: 'MSG', content });
        this.emit('message', { peerId: this.id, data: { content } });
    }

    public async sendRelayMessage(targetId: string, content: string): Promise<void> {
        try {
            const sodium = _sodium;
            await sodium.ready;
            const targetPkRaw = sodium.from_base64(targetId);
            const targetPkCurve = sodium.crypto_sign_ed25519_pk_to_curve25519(targetPkRaw);
            const encrypted = sodium.crypto_box_seal(content, targetPkCurve);
            const encryptedPayload = sodium.to_base64(encrypted);
            await this.broadcast({
                type: 'RELAY',
                toId: targetId,
                fromId: this.id,
                encryptedPayload
            });
        } catch (e) {
            console.error(`[RELAY ERROR] ${e}`);
        }
    }

    public async shareFile(filePath: string): Promise<void> {
        const manifest = await ManifestBuilder.create(filePath, this.identity);
        this.transferManager.shareFile(manifest, filePath);

        if (!this.dht.has(manifest.file_id)) this.dht.set(manifest.file_id, new Set());
        this.dht.get(manifest.file_id)!.add(this.id);

        console.log(`\x1b[32m[SHARED]\x1b[0m File ${manifest.filename} shared. ID: ${manifest.file_id}`);
        this.emit('file:shared', manifest);
        await this.broadcast({ type: 'DHT_PROVIDE', manifestId: manifest.file_id, providerId: this.id }).catch(() => { });
    }

    public async downloadFile(manifestId: string): Promise<void> {
        const providers = this.dht.get(manifestId);
        if (providers && providers.size > 0) {
            const providerId = Array.from(providers)[0];
            await this.downloadFileFromProvider(providerId, manifestId);
        } else {
            this.pendingDownloads.add(manifestId);
            await this.broadcast({ type: 'DHT_FIND', manifestId }).catch(() => { });
        }
    }

    private async downloadFileFromProvider(peerId: string, manifestId: string): Promise<void> {
        await this.sendPacket(peerId, { type: 'REQ_MANIFEST', manifestId });
    }

    private async continueDownload(fileId: string): Promise<void> {
        const missing = this.transferManager.getMissingChunks(fileId);
        if (missing.length === 0) return;

        const maxParallel = 3;
        const missingToRequest = missing.slice(0, maxParallel);
        const providers = Array.from(this.dht.get(fileId) || []);
        if (providers.length === 0) return;

        for (let i = 0; i < missingToRequest.length; i++) {
            const providerId = providers[i % providers.length];
            await this.sendPacket(providerId, {
                type: 'CHUNK_REQ',
                file_id: fileId,
                chunk_idx: missingToRequest[i]
            }).catch(() => { });
        }
    }

    private async handleAiPrompt(peerId: string, prompt: string) {
        if (!this.gemini) return;
        const history = this.messageHistory.get(peerId) || [];
        try {
            const response = await this.gemini.generateResponse(prompt, history);
            await this.sendMessage(peerId, `[GEMINI] ${response}`);
            history.push({ role: 'model', parts: [{ text: response }] });
        } catch (e) {
            await this.sendMessage(peerId, `[GEMINI ERROR] Failed to process.`);
        }
    }

    public async askGeminiLocal(prompt: string, history: any[] = []): Promise<string> {
        if (!this.gemini) throw new Error("AI not configured.");
        return this.gemini.generateResponse(prompt, history);
    }

    public async summarizeFile(fileId: string): Promise<string> {
        if (!this.gemini) throw new Error("AI not configured.");
        const content = await this.transferManager.getFileContent(fileId);
        if (!content) throw new Error("Content not found.");
        return this.gemini.summarizeContent(content);
    }

    public async trustPeer(nodeId: string): Promise<void> {
        const publicKey = _sodium.from_base64(nodeId);
        const assertion = await this.trustService.signPeer(nodeId, publicKey, this.identity);
        this.broadcast({ type: 'TRUST_ASSERTION', assertion }).catch(() => { });
    }
}
