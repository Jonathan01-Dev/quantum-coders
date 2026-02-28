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
exports.WebDashboard = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
const http = __importStar(require("http"));
class WebDashboard {
    node;
    app = (0, express_1.default)();
    server;
    wss;
    clients = new Set();
    // Historique pour les nouveaux clients WS
    logs = [];
    uiPort;
    constructor(node, nodePort) {
        this.node = node;
        // Le dashboard est exposé sur le meme port + 1000 pour éviter les collisions (ex: 8777)
        this.uiPort = nodePort + 1000;
        this.server = http.createServer(this.app);
        this.wss = new ws_1.WebSocketServer({ server: this.server });
        this.setupExpress();
        this.setupWebSocket();
        this.hookNodeEvents();
    }
    async start() {
        return new Promise((resolve) => {
            this.server.listen(this.uiPort, () => {
                console.log(`\x1b[32m[WEB UI]\x1b[0m Dashboard running at \x1b[4mhttp://localhost:${this.uiPort}\x1b[0m`);
                resolve();
            });
        });
    }
    setupExpress() {
        this.app.use((0, cors_1.default)());
        this.app.use(express_1.default.json());
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
            }
            catch (err) {
                res.status(500).json({ error: err.message });
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
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
        this.app.post('/api/connect', async (req, res) => {
            try {
                const { ip, port } = req.body;
                if (!ip)
                    throw new Error("IP is required");
                await this.node.connectToPeer(ip, port ? parseInt(port, 10) : undefined);
                res.json({ success: true });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
        this.app.post('/api/send', async (req, res) => {
            try {
                await this.node.shareFile(req.body.filePath);
                res.json({ success: true });
            }
            catch (e) {
                res.status(500).json({ error: e.message });
            }
        });
        this.app.post('/api/download', async (req, res) => {
            try {
                // For compatibility, if UI still sends peerId, we just use manifestId
                const manifestId = req.body.manifestId || req.body.peerId;
                await this.node.downloadFile(manifestId);
                res.json({ success: true });
            }
            catch (e) {
                res.status(500).json({ error: e.message });
            }
        });
    }
    setupWebSocket() {
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
    broadcast(type, payload) {
        const msg = JSON.stringify({ type, payload, timestamp: Date.now() });
        this.logs.push({ type, payload, timestamp: Date.now() });
        if (this.logs.length > 100)
            this.logs.shift(); // keep last 100
        for (const client of this.clients) {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(msg);
            }
        }
    }
    // Brancher le Dashboard sur les événements internes
    hookNodeEvents() {
        this.node.on('peer:new', (peer) => {
            this.broadcast('PEER_NEW', peer);
            this.broadcast('LOG', `[NEW PEER] Discovered Node ${peer.id.slice(0, 8)}`);
        });
        this.node.on('peer:lost', (peer) => {
            this.broadcast('PEER_LOST', peer);
            this.broadcast('LOG', `[LOST PEER] Node ${peer.id.slice(0, 8)} disconnected`);
        });
        this.node.on('message', (data) => {
            this.broadcast('MESSAGE', data);
            this.broadcast('LOG', `[MSG from ${data.peerId.slice(0, 8)}] ${data.data?.content || ''}`);
        });
        this.node.on('secure_connection', (data) => {
            this.broadcast('LOG', `[SECURE] Tunnel established with Node ${data.peerId.slice(0, 8)}`);
        });
        this.node.on('transfer:verified', (data) => {
            this.broadcast('LOG', `[VERIFIED] Chunk ${data.chunkIndex} passed SHA-256 integrity`);
        });
        this.node.on('transfer:complete', (data) => {
            this.broadcast('LOG', `[SUCCESS] File fully downloaded and verified!`);
        });
        this.node.on('file:shared', (data) => {
            this.broadcast('LOG', `[SHARED] File ${data.filename} published! Manifest ID: ${data.id}`);
        });
    }
}
exports.WebDashboard = WebDashboard;
