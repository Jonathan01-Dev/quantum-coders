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
const commands_1 = require("./cli/commands");
const server_1 = require("./web/server");
const readline = __importStar(require("readline"));
async function bootstrap() {
    console.log('DEBUG args:', process.argv);
    const cli = new commands_1.CLI();
    // Quick argument parser
    const args = process.argv.slice(2);
    const command = args.find(a => !a.startsWith('--') && isNaN(Number(a))) || 'start';
    let port = undefined;
    if (args.includes('--port')) {
        port = parseInt(args[args.indexOf('--port') + 1], 10);
    }
    // Fallback: plain number argument e.g. ts-node src/index.ts 7777
    if (!port) {
        const portArg = args.find(a => !isNaN(Number(a)) && Number(a) > 1000);
        if (portArg)
            port = parseInt(portArg, 10);
    }
    if (command === 'start') {
        const nodePort = port || 7777; // Default for UI computation
        await cli.start(port);
        // Lancement du Dashboard UI en arriere plan
        const uiServer = new server_1.WebDashboard(cli.node, nodePort);
        uiServer.start();
        // Simple interactive loop for the hackathon demo
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'archipel> '
        });
        rl.prompt();
        rl.on('line', (line) => {
            const input = line.trim();
            if (input === 'peers')
                cli.showPeers();
            else if (input.startsWith('msg ')) {
                const parts = input.split(' ');
                if (parts.length >= 3) {
                    cli.msg(parts[1], parts.slice(2).join(' '));
                }
                else {
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: msg <node_id> <message>');
                }
            }
            else if (input.startsWith('send ')) {
                const parts = input.split(' ');
                if (parts[1])
                    cli.send(parts[1]);
                else
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: send <file_path>');
            }
            else if (input.startsWith('download ')) {
                const parts = input.split(' ');
                if (parts.length >= 2)
                    cli.download(parts[1]);
                else
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: download <manifest_id>');
            }
            else if (input.startsWith('connect ')) {
                const parts = input.split(' ');
                if (parts[1]) {
                    const hostParts = parts[1].split(':');
                    const ip = hostParts[0];
                    const portOrUndefined = hostParts[1] ? parseInt(hostParts[1], 10) : undefined;
                    cli.connect(ip, portOrUndefined);
                }
                else {
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: connect <ip>[:port]');
                }
            }
            else if (input === 'exit')
                process.exit(0);
            else if (input)
                console.log(`Command '${input}' not yet implemented in Sprint 1/2.`);
            rl.prompt();
        }).on('close', () => {
            process.exit(0);
        });
    }
    else {
        console.log(`\x1b[31m[ERROR]\x1b[0m Unknown startup command: ${command}`);
        process.exit(1);
    }
}
bootstrap().catch(console.error);
