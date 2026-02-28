import { createServer, Server, Socket } from 'net';
import { EventEmitter } from 'events';
import { Identity } from '../crypto/identity';
import { Handshake } from '../crypto/handshake';
import { SecureSession } from '../crypto/session';

export class TCPServer extends EventEmitter {
    private server: Server;
    private activeSessions: Map<string, SecureSession> = new Map();

    constructor(private port: number, private myIdentity: Identity) {
        super();
        this.server = createServer(this.handleConnection.bind(this));
    }

    public async start(): Promise<void> {
        return new Promise((resolve) => {
            this.server.listen(this.port, () => resolve());
        });
    }

    private handleConnection(socket: Socket) {
        console.log(`\x1b[36m[TCP]\x1b[0m Incoming connection from ${socket.remoteAddress}`);
        let isHandshakeDone = false;
        let session: SecureSession | null = null;
        let peerId: string | null = null;

        socket.on('data', async (data) => {
            try {
                if (!isHandshakeDone) {
                    // Etape 2 (Server side): Recevoir HELLO, valider la signature, envoyer la reponse
                    const res = await Handshake.respond(Buffer.from(data as any), this.myIdentity, this.port);
                    session = new SecureSession(res.session);
                    peerId = res.peerId;
                    const peerPort = res.peerPort;

                    this.activeSessions.set(peerId, session);
                    isHandshakeDone = true;

                    socket.write(res.responsePacket);
                    console.log(`\x1b[32m[SECURE]\x1b[0m Secure tunnel established with Node \x1b[33m${peerId.slice(0, 8)}\x1b[0m`);
                    console.log(`\x1b[35m[CRYPTO]\x1b[0m Forward secrecy enabled via X25519 + AES-GCM`);

                    this.emit('secure_connection', { socket, session, peerId, peerPort });
                } else {
                    // Session is established, decrypt incoming frame
                    if (session) {
                        const plaintext = await session.decrypt(Buffer.from(data as any));
                        this.emit('message', { peerId, data: plaintext });
                    }
                }
            } catch (err) {
                console.log(`\x1b[31m[ERROR]\x1b[0m TCP Handshake/Decryption failed: ${(err as Error).message}`);
                socket.destroy();
            }
        });

        socket.on('close', () => {
            if (peerId) {
                this.activeSessions.delete(peerId);
                console.log(`\x1b[31m[DISCONNECT]\x1b[0m Node \x1b[33m${peerId.slice(0, 8)}\x1b[0m disconnected`);
            }
        });

        socket.on('error', (err) => {
            // Ignore clean closing errors for proxy purposes in hackathon
        });
    }
}
