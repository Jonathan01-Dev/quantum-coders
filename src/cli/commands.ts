import { ArchipelNode } from '../core/node';
import * as os from 'os';

export class CLI {
    private node: ArchipelNode | null = null;

    constructor() {
        this.printLogo();
    }

    public async start(port?: number) {
        this.node = new ArchipelNode(port);

        console.log(`\n\x1b[32m[SYSTEM]\x1b[0m Starting Archipel Node \x1b[1m${this.node.id.slice(0, 8)}\x1b[0m`);
        console.log(`\x1b[32m[SYSTEM]\x1b[0m Network interfaces:`);
        this.printIPs();

        await this.node.start();
        console.log(`\x1b[32m[SYSTEM]\x1b[0m Node listening and radiating on Discovery UDP/6000\n`);
    }

    public showPeers() {
        if (!this.node) return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');

        const peers = this.node.getPeers();
        console.log(`\n\x1b[36m=== Discovered Peers (${peers.length}) ===\x1b[0m`);
        peers.forEach(p => {
            console.log(`- Node \x1b[33m${p.id.slice(0, 8)}\x1b[0m (${p.ip}:${p.tcpPort})`);
        });
        console.log('');
    }

    public async msg(targetId: string, content: string) {
        if (!this.node) return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        await this.node.sendMessage(targetId, content);
    }

    public async send(filePath: string) {
        if (!this.node) return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        await this.node.shareFile(filePath);
    }

    public async download(manifestId: string) {
        if (!this.node) return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        await this.node.downloadFile(manifestId);
    }

    public async connect(ip: string, port?: number) {
        if (!this.node) return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        try {
            await this.node.connectToPeer(ip, port);
        } catch (err) {
            console.log(`\x1b[31m[ERROR]\x1b[0m Failed to connect: ${(err as Error).message}`);
        }
    }

    public status() {
        if (!this.node) return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        const stats = this.node.getNodeStats();
        console.log(`\n\x1b[32m=== Archipel Node Status ===\x1b[0m`);
        console.log(`ID: ${stats.id}`);
        console.log(`Peers: ${stats.peersCount}`);
        console.log(`Shared Files: ${stats.files}`);
        console.log(`Total Shared Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Active Downloads: ${stats.active}`);
        console.log(``);
    }

    public receive() {
        if (!this.node) return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        const dht = this.node.getDht();
        console.log(`\n\x1b[36m=== Available Files in Network ===\x1b[0m`);
        if (dht.length === 0) console.log('No files discovered yet.');
        dht.forEach(f => {
            console.log(`- ID: \x1b[1m${f.manifestId}\x1b[0m (${f.providers.length} providers)`);
        });
        console.log(``);
    }

    public async trust(nodeId: string) {
        if (!this.node) return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        await this.node.trustPeer(nodeId);
        console.log(`\x1b[32m[TRUST]\x1b[0m Node \x1b[33m${nodeId.slice(0, 8)}\x1b[0m has been added to your Web of Trust.`);
    }

    private printIPs() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    console.log(`  -> ${name}: ${iface.address}`);
                }
            }
        }
    }

    private printLogo() {
        const logo = `
\x1b[36m    ___          _____ __    _            __ 
   /   |  ____  / ___// /_  (_)___  ___  / / 
  / /| | / __ \\/ /__ / __ \\/ / __ \\/ _ \\/ /  
 / ___ |/ /  / /___// / / / / /_/ /  __/ /   
/_/  |_/_/  /_//____/_/ /_/_/ .___/\\___/_/   
                           /_/               \x1b[0m
\x1b[3mThe Sovereign Resilient Network (Hackathon Edition)\x1b[0m
`;
        console.log(logo);
    }
}
