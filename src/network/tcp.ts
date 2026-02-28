import { createServer, Server, Socket } from 'net';
import { EventEmitter } from 'events';
import { Identity } from '../crypto/identity';
import { Handshake } from '../crypto/handshake';
import { SecureSession } from '../crypto/session';

const HANDSHAKE_SIZE = 130;

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

        // Buffers for framing
        let handshakeState: 'WAIT_HELLO' | 'WAIT_AUTH' | 'ESTABLISHED' = 'WAIT_HELLO';
        let handshakeBuf = Buffer.alloc(0);
        let messageBuf = Buffer.alloc(0);

        let myEphemeralPubKey: Uint8Array | null = null;
        let peerEphemeralPubKey: Uint8Array | null = null;

        socket.on('data', async (chunk) => {
            try {
                if (handshakeState === 'WAIT_HELLO') {
                    const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
                    handshakeBuf = Buffer.concat([Buffer.from(handshakeBuf), chunkBuf]);
                    if (handshakeBuf.length < 40) return;

                    const helloPacket = Buffer.from(handshakeBuf.subarray(0, 40));
                    messageBuf = Buffer.from(handshakeBuf.subarray(40));
                    handshakeBuf = Buffer.alloc(0);

                    const res = await Handshake.respond(helloPacket, this.myIdentity, this.port);
                    session = new SecureSession(res.session);
                    myEphemeralPubKey = Buffer.from(res.responsePacket.subarray(32, 64));
                    peerEphemeralPubKey = Buffer.from(res.peerEphemeralPubKey);

                    socket.write(res.responsePacket);
                    handshakeState = 'WAIT_AUTH';

                    if (messageBuf.length > 0) {
                        socket.emit('data', Buffer.alloc(0)); // Trigger next state if data already in buf
                    }
                }
                else if (handshakeState === 'WAIT_AUTH') {
                    const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
                    handshakeBuf = Buffer.concat([Buffer.from(handshakeBuf), Buffer.from(messageBuf), chunkBuf]);
                    messageBuf = Buffer.alloc(0);
                    if (handshakeBuf.length < 96) return;

                    const authPacket = Buffer.from(handshakeBuf.subarray(0, 96));
                    messageBuf = Buffer.from(handshakeBuf.subarray(96));
                    handshakeBuf = Buffer.alloc(0);

                    const { peerId: verifiedPeerId } = await Handshake.verifyAuth(authPacket, myEphemeralPubKey!, peerEphemeralPubKey!, this.port);
                    peerId = verifiedPeerId;
                    this.activeSessions.set(peerId, session!);

                    handshakeState = 'ESTABLISHED';
                    console.log(`\x1b[32m[SECURE]\x1b[0m Mutual Authentication successful with Node \x1b[33m${peerId.slice(0, 8)}\x1b[0m`);
                    this.emit('secure_connection', { socket, session, peerId, peerPort: 0 }); // Port will be gossiped

                    if (messageBuf.length > 0) {
                        messageBuf = await this.processMessageFrames(socket, session!, peerId, Buffer.from(messageBuf));
                    }
                }
                else {
                    // Session established
                    const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
                    messageBuf = Buffer.from(Buffer.concat([Buffer.from(messageBuf), chunkBuf]));
                    messageBuf = await this.processMessageFrames(socket, session!, peerId!, messageBuf);
                }
            } catch (err) {
                console.log(`\x1b[31m[ERROR]\x1b[0m Handshake/Auth failed: ${(err as Error).message}`);
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
            // Ignore clean closing errors
        });
    }

    private async processMessageFrames(socket: Socket, session: SecureSession, peerId: string, buf: Buffer): Promise<Buffer> {
        // Length-prefix framing: each frame is [4-byte length (BE) | encrypted payload]
        while (buf.length >= 4) {
            const frameLen = buf.readUInt32BE(0);
            if (buf.length < 4 + frameLen) break; // Incomplete frame, wait for more data

            const framePayload = Buffer.from(buf.subarray(4, 4 + frameLen));
            buf = Buffer.from(buf.subarray(4 + frameLen));

            const plaintext = session.decrypt(framePayload);
            this.emit('message', { peerId, data: plaintext });
        }
        return buf;
    }
}
