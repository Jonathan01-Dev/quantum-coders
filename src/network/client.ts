import { Socket } from 'net';
import { EventEmitter } from 'events';
import { Identity } from '../crypto/identity';
import { Handshake } from '../crypto/handshake';
import { SecureSession } from '../crypto/session';

const HANDSHAKE_SIZE = 130;

export class TCPClient extends EventEmitter {
    private socket: Socket;
    private session: SecureSession | null = null;
    public peerId: string | null = null;
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
                    // Etape 1 (Alice): Envoyer HELLO
                    const { ephemeralKeyPair, packet: helloPacket } = await Handshake.initiate(this.myIdentity, this.myPort);
                    this.socket.write(helloPacket);

                    let incomingBuf = Buffer.alloc(0);

                    const onData = async (data: Buffer) => {
                        incomingBuf = Buffer.concat([incomingBuf, data]);

                        // Etape 2: Attendre HELLO_REPLY (128 bytes)
                        if (this.session === null) {
                            if (incomingBuf.length < 128) return;
                            const replyPacket = Buffer.from(incomingBuf.subarray(0, 128));
                            incomingBuf = Buffer.from(incomingBuf.subarray(128));

                            try {
                                const { session, authPacket, peerId } = await Handshake.finish(replyPacket, this.myIdentity, ephemeralKeyPair, this.myPort);
                                this.session = new SecureSession(session);
                                this.peerId = peerId;

                                // Etape 3: Envoyer AUTH
                                this.socket.write(authPacket);

                                console.log(`\x1b[32m[SECURE]\x1b[0m Mutual Authentication successful with Node \x1b[33m${this.peerId.slice(0, 8)}\x1b[0m`);
                                this.bindSessionEvents();
                                this.emit('secure_ready', { peerId: this.peerId, peerPort: this.peerPort });
                                resolve(this.session);

                                // Process any remaining data as encrypted frames
                                if (incomingBuf.length > 0) {
                                    this.socket.emit('data', Buffer.alloc(0));
                                }
                            } catch (err) {
                                reject(err);
                            }
                        }
                    };

                    this.socket.on('data', onData);
                } catch (err) {
                    reject(err);
                }
            });

            this.socket.on('error', (err) => reject(err));
        });
    }

    public async send(data: Buffer): Promise<void> {
        if (!this.session) throw new Error("Secure session not established");
        const encryptedPayload = this.session.encrypt(data);

        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(encryptedPayload.length, 0);
        this.socket.write(Buffer.concat([lenBuf, encryptedPayload]));
    }

    private bindSessionEvents() {
        let messageBuf = Buffer.alloc(0);
        this.socket.removeAllListeners('data'); // Clear handshake listener

        this.socket.on('data', (chunk: any) => {
            if (this.session) {
                const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                messageBuf = Buffer.concat([Buffer.from(messageBuf), chunkBuf]);
                while (messageBuf.length >= 4) {
                    const frameLen = messageBuf.readUInt32BE(0);
                    if (messageBuf.length < 4 + frameLen) break;

                    const framePayload = Buffer.from(messageBuf.subarray(4, 4 + frameLen));
                    messageBuf = Buffer.from(messageBuf.subarray(4 + frameLen));

                    try {
                        const plaintext = this.session.decrypt(framePayload);
                        this.emit('message', { peerId: this.peerId, data: plaintext });
                    } catch (e) { }
                }
            }
        });

        this.socket.on('close', () => {
            if (this.peerId) {
                console.log(`\x1b[31m[DISCONNECT]\x1b[0m Tunnel to Node \x1b[33m${this.peerId.slice(0, 8)}\x1b[0m torn down`);
            }
        });
    }
}
