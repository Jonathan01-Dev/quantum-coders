import { createSocket, Socket } from 'dgram';
import { EventEmitter } from 'events';
import { CONFIG } from '../core/config';

export interface PeerInfo {
    id: string;
    ip: string;
    tcpPort: number;
    lastSeen: number;
}

export class DiscoveryService extends EventEmitter {
    private socket: Socket;
    private peers: Map<string, PeerInfo> = new Map();
    private helloInterval?: NodeJS.Timeout;
    private cleanupInterval?: NodeJS.Timeout;

    constructor(private nodeId: string, private tcpPort: number) {
        super();
        this.socket = createSocket({ type: 'udp4', reuseAddr: true });
    }

    public async start(): Promise<void> {
        return new Promise((resolve) => {
            this.socket.bind(CONFIG.NETWORK.DISCOVERY_PORT, () => {
                this.socket.setMulticastLoopback(true);
                try {
                    const interfaces = require('os').networkInterfaces();
                    for (const name of Object.keys(interfaces)) {
                        for (const iface of interfaces[name]!) {
                            if (iface.family === 'IPv4' && !iface.internal) {
                                try {
                                    this.socket.addMembership(CONFIG.NETWORK.MULTICAST_IP, iface.address);
                                } catch (e) { }
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`[WARN] Could not add multicast membership:  ${(err as Error).message}`);
                }

                this.socket.on('message', this.handleMessage.bind(this));

                this.startBroadcasting();
                this.startCleanupTask();

                resolve();
            });
        });
    }

    public stop(): void {
        if (this.helloInterval) clearInterval(this.helloInterval);
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        this.socket.close();
    }

    public getPeers(): PeerInfo[] {
        return Array.from(this.peers.values());
    }

    public registerPeer(id: string, ip: string, tcpPort: number): void {
        if (id === this.nodeId) return;

        const isNew = !this.peers.has(id);
        this.peers.set(id, {
            id,
            ip,
            tcpPort,
            lastSeen: Date.now()
        });

        if (isNew) {
            this.emit('peer:new', this.peers.get(id));
        }
    }

    private startBroadcasting(): void {
        const broadcast = () => {
            const message = JSON.stringify({
                type: 'HELLO',
                id: this.nodeId,
                tcpPort: this.tcpPort
            });

            const interfaces = require('os').networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]!) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        try {
                            this.socket.setMulticastInterface(iface.address);
                            this.socket.send(
                                message,
                                0,
                                message.length,
                                CONFIG.NETWORK.DISCOVERY_PORT,
                                CONFIG.NETWORK.MULTICAST_IP
                            );
                        } catch (e) { }
                    }
                }
            }
        };

        // Broadcast immediately, then on interval
        broadcast();
        this.helloInterval = setInterval(broadcast, CONFIG.NETWORK.HELLO_INTERVAL_MS);
    }

    private handleMessage(msg: Buffer, rinfo: any): void {
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
        } catch (e) {
            // Ignore malformed packets
        }
    }

    private startCleanupTask(): void {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let changed = false;

            for (const [id, peer] of this.peers.entries()) {
                if (now - peer.lastSeen > CONFIG.NETWORK.PEER_TIMEOUT_MS) {
                    this.peers.delete(id);
                    this.emit('peer:lost', peer);
                    changed = true;
                }
            }
        }, CONFIG.NETWORK.HELLO_INTERVAL_MS);
    }
}
