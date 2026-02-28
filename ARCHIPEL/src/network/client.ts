import { Socket } from 'net';
import { EventEmitter } from 'events';
import { Identity } from '../crypto/identity';
import { Handshake } from '../crypto/handshake';
import { SecureSession } from '../crypto/session';

export class TCPClient extends EventEmitter {
    private socket: Socket;
    private session: SecureSession | null = null;
    private peerId: string | null = null;
    private myPort: number = 7777; // Default or updated via setter

    constructor(private myIdentity: Identity, private peerIp: string, private peerPort: number, myPort?: number) {
        super();
        this.socket = new Socket();
        if (myPort) this.myPort = myPort;
    }

    public async connect(): Promise<SecureSession> {
        return new Promise((resolve, reject) => {
            this.socket.connect(this.peerPort, this.peerIp, async () => {
                try {
                    // Etape 1 (Client side): Envoyer HELLO
                    const { ephemeralKeyPair, packet } = await Handshake.initiate(this.myIdentity, this.myPort);
                    this.socket.write(packet);

                    this.socket.once('data', async (data) => {
                        try {
                            // Etape 3 (Client side): Recevoir Reponse, valider signature et calculer secret partagé
                            const res = await Handshake.finish(Buffer.from(data as any), this.myIdentity, ephemeralKeyPair);
                            this.session = new SecureSession(res.session);
                            this.peerId = res.peerId;
                            const peerPortValue = res.peerPort;

                            console.log(`\x1b[32m[SECURE]\x1b[0m Secure tunnel established with Node \x1b[33m${this.peerId.slice(0, 8)}\x1b[0m`);
                            console.log(`\x1b[35m[CRYPTO]\x1b[0m Forward secrecy enabled via X25519 + AES-GCM`);

                            // Lier les évenements de session en post-handshake
                            this.bindSessionEvents();
                            this.emit('secure_ready', { peerId: this.peerId, peerPort: peerPortValue });
                            resolve(this.session);
                        } catch (err) {
                            console.log(`\x1b[31m[ERROR]\x1b[0m Handshake Etape 3 failed: ${(err as Error).message}`);
                            this.socket.destroy();
                            reject(err);
                        }
                    });
                } catch (err) {
                    console.log(`\x1b[31m[ERROR]\x1b[0m Handshake Etape 1 failed: ${(err as Error).message}`);
                    reject(err);
                }
            });

            this.socket.on('error', (err) => {
                reject(err);
            });
        });
    }

    public async send(data: Buffer): Promise<void> {
        if (!this.session) throw new Error("Secure session not established");
        const encryptedPayload = await this.session.encrypt(data);
        this.socket.write(encryptedPayload);
    }

    private bindSessionEvents() {
        this.socket.on('data', async (data) => {
            if (this.session) {
                try {
                    const plaintext = await this.session.decrypt(Buffer.from(data as any));
                    this.emit('message', { peerId: this.peerId, data: plaintext });
                } catch (e) { /* Error logged in decrypt */ }
            }
        });

        this.socket.on('close', () => {
            if (this.peerId) {
                console.log(`\x1b[31m[DISCONNECT]\x1b[0m Tunnel to Node \x1b[33m${this.peerId.slice(0, 8)}\x1b[0m torn down`);
            }
        });
    }
}
