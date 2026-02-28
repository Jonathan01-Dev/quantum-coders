import 'dotenv/config';
import { CLI } from './cli/commands';
import { WebDashboard } from './web/server';
import * as readline from 'readline';

async function bootstrap() {
    const cli = new CLI();

    // Quick argument parser
    const args = process.argv.slice(2);

    // Handle --no-ai flag
    if (args.includes('--no-ai')) {
        process.env.AIS_DISABLED = 'true';
    }

    // Handle --api-key flag
    if (args.includes('--api-key')) {
        const keyIndex = args.indexOf('--api-key') + 1;
        if (args[keyIndex]) {
            process.env.GOOGLE_API_KEY = args[keyIndex];
        }
    }

    const command = args.find(a => !a.startsWith('--') && isNaN(Number(a))) || 'start';

    let port = undefined;
    if (args.includes('--port')) {
        port = parseInt(args[args.indexOf('--port') + 1], 10);
    }
    if (!port) {
        const portArg = args.find(a => !isNaN(Number(a)) && Number(a) > 1000);
        if (portArg) port = parseInt(portArg, 10);
    }

    if (command === 'start') {
        const nodePort = port || 7777;
        await cli.start(port);

        const uiServer = new WebDashboard((cli as any).node, nodePort);
        uiServer.start();

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'archipel> '
        });

        rl.prompt();

        rl.on('line', (line) => {
            const input = line.trim();
            const parts = input.split(' ');
            const cmd = parts[0];

            if (cmd === 'peers') {
                cli.showPeers();
            } else if (cmd === 'msg') {
                if (parts.length >= 3) {
                    cli.msg(parts[1], parts.slice(2).join(' '));
                } else {
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: msg <node_id> <message>');
                }
            } else if (cmd === 'send') {
                if (parts.length >= 2) {
                    cli.send(parts.slice(1).join(' '));
                } else {
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: send <file_path>');
                }
            } else if (cmd === 'download') {
                if (parts.length >= 2) {
                    cli.download(parts[1]);
                } else {
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: download <manifest_id>');
                }
            } else if (cmd === 'connect') {
                if (parts[1]) {
                    const hostParts = parts[1].split(':');
                    const ip = hostParts[0];
                    const pOrU = hostParts[1] ? parseInt(hostParts[1], 10) : undefined;
                    cli.connect(ip, pOrU);
                } else {
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: connect <ip>[:port]');
                }
            } else if (cmd === 'status') {
                cli.status();
            } else if (cmd === 'receive') {
                cli.receive();
            } else if (cmd === 'trust') {
                if (parts[1]) cli.trust(parts[1]);
                else console.log('\x1b[31m[ERROR]\x1b[0m Usage: trust <node_id>');
            } else if (cmd === 'exit') {
                process.exit(0);
            } else if (input) {
                console.log(`Command '${cmd}' not recognized or use 'exit' to quit.`);
            }

            rl.prompt();
        }).on('close', () => {
            process.exit(0);
        });

    } else {
        console.log(`\x1b[31m[ERROR]\x1b[0m Unknown startup command: ${command}`);
        process.exit(1);
    }
}

bootstrap().catch(console.error);
