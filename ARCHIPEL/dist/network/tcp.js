"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TCPServer = void 0;
const net_1 = require("net");
const events_1 = require("events");
const handshake_1 = require("../crypto/handshake");
const session_1 = require("../crypto/session");
class TCPServer extends events_1.EventEmitter {
    port;
    myIdentity;
    server;
    activeSessions = new Map();
    constructor(port, myIdentity) {
        super();
        this.port = port;
        this.myIdentity = myIdentity;
        this.server = (0, net_1.createServer)(this.handleConnection.bind(this));
    }
    async start() {
        return new Promise((resolve) => {
            this.server.listen(this.port, () => resolve());
        });
    }
    handleConnection(socket) {
        console.log(`\x1b[36m[TCP]\x1b[0m Incoming connection from ${socket.remoteAddress}`);
        let isHandshakeDone = false;
        let session = null;
        let peerId = null;
        socket.on('data', async (data) => {
            try {
                if (!isHandshakeDone) {
                    // Etape 2 (Server side): Recevoir HELLO, valider la signature, envoyer la reponse
                    const res = await handshake_1.Handshake.respond(Buffer.from(data), this.myIdentity);
                    session = new session_1.SecureSession(res.session);
                    peerId = res.peerId;
                    this.activeSessions.set(peerId, session);
                    isHandshakeDone = true;
                    socket.write(res.responsePacket);
                    console.log(`\x1b[32m[SECURE]\x1b[0m Secure tunnel established with Node \x1b[33m${peerId.slice(0, 8)}\x1b[0m`);
                    console.log(`\x1b[35m[CRYPTO]\x1b[0m Forward secrecy enabled via X25519 + AES-GCM`);
                    this.emit('secure_connection', { socket, session, peerId });
                }
                else {
                    // Session is established, decrypt incoming frame
                    if (session) {
                        const plaintext = await session.decrypt(Buffer.from(data));
                        this.emit('message', { peerId, data: plaintext });
                    }
                }
            }
            catch (err) {
                console.log(`\x1b[31m[ERROR]\x1b[0m TCP Handshake/Decryption failed: ${err.message}`);
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
exports.TCPServer = TCPServer;
