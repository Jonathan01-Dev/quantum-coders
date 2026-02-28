"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoveryService = void 0;
const dgram_1 = require("dgram");
const events_1 = require("events");
const config_1 = require("../core/config");
class DiscoveryService extends events_1.EventEmitter {
    nodeId;
    tcpPort;
    socket;
    peers = new Map();
    helloInterval;
    cleanupInterval;
    constructor(nodeId, tcpPort) {
        super();
        this.nodeId = nodeId;
        this.tcpPort = tcpPort;
        this.socket = (0, dgram_1.createSocket)({ type: 'udp4', reuseAddr: true });
    }
    async start() {
        return new Promise((resolve) => {
            this.socket.bind(config_1.CONFIG.NETWORK.DISCOVERY_PORT, () => {
                this.socket.setMulticastLoopback(true);
                try {
                    const interfaces = require('os').networkInterfaces();
                    for (const name of Object.keys(interfaces)) {
                        for (const iface of interfaces[name]) {
                            if (iface.family === 'IPv4' && !iface.internal) {
                                try {
                                    this.socket.addMembership(config_1.CONFIG.NETWORK.MULTICAST_IP, iface.address);
                                }
                                catch (e) { }
                            }
                        }
                    }
                }
                catch (err) {
                    console.warn(`[WARN] Could not add multicast membership:  ${err.message}`);
                }
                this.socket.on('message', this.handleMessage.bind(this));
                this.startBroadcasting();
                this.startCleanupTask();
                resolve();
            });
        });
    }
    stop() {
        if (this.helloInterval)
            clearInterval(this.helloInterval);
        if (this.cleanupInterval)
            clearInterval(this.cleanupInterval);
        this.socket.close();
    }
    getPeers() {
        return Array.from(this.peers.values());
    }
    startBroadcasting() {
        const broadcast = () => {
            const message = JSON.stringify({
                type: 'HELLO',
                id: this.nodeId,
                tcpPort: this.tcpPort
            });
            const interfaces = require('os').networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        try {
                            this.socket.setMulticastInterface(iface.address);
                            this.socket.send(message, 0, message.length, config_1.CONFIG.NETWORK.DISCOVERY_PORT, config_1.CONFIG.NETWORK.MULTICAST_IP);
                        }
                        catch (e) { }
                    }
                }
            }
        };
        // Broadcast immediately, then on interval
        broadcast();
        this.helloInterval = setInterval(broadcast, config_1.CONFIG.NETWORK.HELLO_INTERVAL_MS);
    }
    handleMessage(msg, rinfo) {
        try {
            const data = JSON.parse(msg.toString());
            if (data.type === 'HELLO' && data.id && typeof data.id === 'string' && data.id !== this.nodeId) {
                const isNew = !this.peers.has(data.id);
                this.peers.set(data.id, {
                    id: data.id,
                    ip: rinfo.address,
                    tcpPort: data.tcpPort,
                    lastSeen: Date.now()
                });
                if (isNew) {
                    this.emit('peer:new', this.peers.get(data.id));
                }
            }
        }
        catch (e) {
            // Ignore malformed packets
        }
    }
    startCleanupTask() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let changed = false;
            for (const [id, peer] of this.peers.entries()) {
                if (now - peer.lastSeen > config_1.CONFIG.NETWORK.PEER_TIMEOUT_MS) {
                    this.peers.delete(id);
                    this.emit('peer:lost', peer);
                    changed = true;
                }
            }
        }, config_1.CONFIG.NETWORK.HELLO_INTERVAL_MS);
    }
}
exports.DiscoveryService = DiscoveryService;
