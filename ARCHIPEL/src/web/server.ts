import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { ArchipelNode } from '../core/node';
import { PeerInfo } from '../network/discovery';

export class WebDashboard {
    private app = express();
    private server: http.Server;
    private wss: WebSocketServer;
    private clients: Set<WebSocket> = new Set();

    // Historique pour les nouveaux clients WS
    private logs: any[] = [];
    private uiPort: number;

    constructor(private node: ArchipelNode, nodePort: number) {
        // Le dashboard est exposé sur le meme port + 1000 pour éviter les collisions (ex: 8777)
        this.uiPort = nodePort + 1000;
        this.server = http.createServer(this.app);

        this.wss = new WebSocketServer({ server: this.server });

        this.setupExpress();
        this.setupWebSocket();
        this.hookNodeEvents();
    }

    public async start() {
        return new Promise<void>((resolve) => {
            this.server.listen(this.uiPort, () => {
                console.log(`\x1b[32m[WEB UI]\x1b[0m Dashboard running at \x1b[4mhttp://localhost:${this.uiPort}\x1b[0m`);
                resolve();
            });
        });
    }

    private setupExpress() {
        this.app.use(cors());
        this.app.use(express.json());

        // API REST basique pour des actions spécifiques si besoin
        this.app.get('/api/info', (req, res) => {
            const peersCount = this.node.getPeers().length;
            res.json({
                nodeId: this.node.id,
                peersCount: peersCount,
                networkSize: peersCount + 1
            });
        });

        this.app.get('/api/peers', (req, res) => {
            res.json(this.node.getPeers());
        });

        this.app.post('/api/msg', async (req, res) => {
            try {
                const { targetId, content } = req.body;
                await this.node.sendMessage(targetId, content);
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: (err as Error).message });
            }
        });

        this.app.post('/api/broadcast', (req, res) => {
            this.node.broadcastMessage(req.body.content);
            res.json({ success: true });
        });

        this.app.post('/api/relay', async (req, res) => {
            const { targetId, content } = req.body;
            try {
                await this.node.sendRelayMessage(targetId, content);
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: (err as Error).message });
            }
        });

        this.app.post('/api/connect', async (req, res) => {
            try {
                const { ip, port } = req.body;
                if (!ip) throw new Error("IP is required");
                await this.node.connectToPeer(ip, port ? parseInt(port, 10) : undefined);
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: (err as Error).message });
            }
        });

        this.app.post('/api/send', async (req, res) => {
            try {
                await this.node.shareFile(req.body.filePath);
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ error: (e as Error).message });
            }
        });

        this.app.post('/api/download', async (req, res) => {
            try {
                // For compatibility, if UI still sends peerId, we just use manifestId
                const manifestId = req.body.manifestId || req.body.peerId;
                await this.node.downloadFile(manifestId);
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ error: (e as Error).message });
            }
        });
    }

    private setupWebSocket() {
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);

            // Envoyer l'état initial
            ws.send(JSON.stringify({
                type: 'INIT',
                nodeId: this.node.id,
                peers: this.node.getPeers(),
                logs: this.logs
            }));

            ws.on('close', () => this.clients.delete(ws));
        });
    }

    private broadcast(type: string, payload: any) {
        const msg = JSON.stringify({ type, payload, timestamp: Date.now() });
        this.logs.push({ type, payload, timestamp: Date.now() });
        if (this.logs.length > 100) this.logs.shift(); // keep last 100

        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        }
    }

    // Brancher le Dashboard sur les événements internes
    private hookNodeEvents() {
        this.node.on('peer:new', (peer: PeerInfo) => {
            this.broadcast('PEER_NEW', peer);
            this.broadcast('LOG', `[NEW PEER] Discovered Node ${peer.id.slice(0, 8)}`);
        });

        this.node.on('peer:lost', (peer: PeerInfo) => {
            this.broadcast('PEER_LOST', peer);
            this.broadcast('LOG', `[LOST PEER] Node ${peer.id.slice(0, 8)} disconnected`);
        });

        this.node.on('message', (data: any) => {
            this.broadcast('MESSAGE', data);
            this.broadcast('LOG', `[MSG from ${data.peerId.slice(0, 8)}] ${data.data?.content || ''}`);
        });

        this.node.on('secure_connection', (data: any) => {
            this.broadcast('LOG', `[SECURE] Tunnel established with Node ${data.peerId.slice(0, 8)}`);
        });

        this.node.on('transfer:verified', (data: any) => {
            this.broadcast('LOG', `[VERIFIED] Chunk ${data.chunkIndex} passed SHA-256 integrity`);
        });

        this.node.on('transfer:complete', (data: any) => {
            this.broadcast('LOG', `[SUCCESS] File fully downloaded and verified!`);
        });

        this.node.on('file:shared', (data: any) => {
            this.broadcast('LOG', `[SHARED] File ${data.filename} published! Manifest ID: ${data.id}`);
        });
    }
}
