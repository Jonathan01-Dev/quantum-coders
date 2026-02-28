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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLI = void 0;
const node_1 = require("../core/node");
const os = __importStar(require("os"));
class CLI {
    node = null;
    constructor() {
        this.printLogo();
    }
    async start(port) {
        this.node = new node_1.ArchipelNode(port);
        console.log(`\n\x1b[32m[SYSTEM]\x1b[0m Starting Archipel Node \x1b[1m${this.node.id.slice(0, 8)}\x1b[0m`);
        console.log(`\x1b[32m[SYSTEM]\x1b[0m Network interfaces:`);
        this.printIPs();
        await this.node.start();
        console.log(`\x1b[32m[SYSTEM]\x1b[0m Node listening and radiating on Discovery UDP/6000\n`);
    }
    showPeers() {
        if (!this.node)
            return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        const peers = this.node.getPeers();
        console.log(`\n\x1b[36m=== Discovered Peers (${peers.length}) ===\x1b[0m`);
        peers.forEach(p => {
            console.log(`- Node \x1b[33m${p.id.slice(0, 8)}\x1b[0m (${p.ip}:${p.tcpPort})`);
        });
        console.log('');
    }
    async msg(targetId, content) {
        if (!this.node)
            return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        await this.node.sendMessage(targetId, content);
    }
    async send(filePath) {
        if (!this.node)
            return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        await this.node.shareFile(filePath);
    }
    async download(manifestId) {
        if (!this.node)
            return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        await this.node.downloadFile(manifestId);
    }
    async connect(ip, port) {
        if (!this.node)
            return console.log('\x1b[31m[ERROR]\x1b[0m Node not started');
        try {
            await this.node.connectToPeer(ip, port);
        }
        catch (err) {
            console.log(`\x1b[31m[ERROR]\x1b[0m Failed to connect: ${err.message}`);
        }
    }
    printIPs() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name] || []) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    console.log(`  -> ${name}: ${iface.address}`);
                }
            }
        }
    }
    printLogo() {
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
exports.CLI = CLI;
