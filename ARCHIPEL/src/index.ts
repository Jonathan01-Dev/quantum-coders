import { CLI } from './cli/commands';
import { WebDashboard } from './web/server';
import * as readline from 'readline';

async function bootstrap() {
    console.log('DEBUG args:', process.argv);
    const cli = new CLI();

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
        if (portArg) port = parseInt(portArg, 10);
    }

    if (command === 'start') {
        const nodePort = port || 7777; // Default for UI computation
        await cli.start(port);

        // Lancement du Dashboard UI en arriere plan
        const uiServer = new WebDashboard((cli as any).node, nodePort);
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
            if (input === 'peers') cli.showPeers();
            else if (input.startsWith('msg ')) {
                const parts = input.split(' ');
                if (parts.length >= 3) {
                    cli.msg(parts[1], parts.slice(2).join(' '));
                } else {
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: msg <node_id> <message>');
                }
            }
            else if (input.startsWith('send ')) {
                const parts = input.split(' ');
                if (parts[1]) cli.send(parts[1]);
                else console.log('\x1b[31m[ERROR]\x1b[0m Usage: send <file_path>');
            }
            else if (input.startsWith('download ')) {
                const parts = input.split(' ');
                if (parts.length >= 2) cli.download(parts[1]);
                else console.log('\x1b[31m[ERROR]\x1b[0m Usage: download <manifest_id>');
            }
            else if (input.startsWith('connect ')) {
                const parts = input.split(' ');
                if (parts[1]) {
                    const hostParts = parts[1].split(':');
                    const ip = hostParts[0];
                    const portOrUndefined = hostParts[1] ? parseInt(hostParts[1], 10) : undefined;
                    cli.connect(ip, portOrUndefined);
                } else {
                    console.log('\x1b[31m[ERROR]\x1b[0m Usage: connect <ip>[:port]');
                }
            }
            else if (input === 'exit') process.exit(0);
            else if (input) console.log(`Command '${input}' not yet implemented in Sprint 1/2.`);

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