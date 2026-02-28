"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TCPClient = void 0;
const net_1 = require("net");
const events_1 = require("events");
const handshake_1 = require("../crypto/handshake");
const session_1 = require("../crypto/session");
class TCPClient extends events_1.EventEmitter {
    myIdentity;
    peerIp;
    peerPort;
    socket;
    session = null;
    peerId = null;
    constructor(myIdentity, peerIp, peerPort) {
        super();
        this.myIdentity = myIdentity;
        this.peerIp = peerIp;
        this.peerPort = peerPort;
        this.socket = new net_1.Socket();
    }
    async connect() {
        return new Promise((resolve, reject) => {
            this.socket.connect(this.peerPort, this.peerIp, async () => {
                try {
                    // Etape 1 (Client side): Envoyer HELLO
                    const { ephemeralKeyPair, packet } = await handshake_1.Handshake.initiate(this.myIdentity);
                    this.socket.write(packet);
                    this.socket.once('data', async (data) => {
                        try {
                            // Etape 3 (Client side): Recevoir Reponse, valider signature et calculer secret partagé
                            const res = await handshake_1.Handshake.finish(Buffer.from(data), this.myIdentity, ephemeralKeyPair);
                            this.session = new session_1.SecureSession(res.session);
                            this.peerId = res.peerId;
                            console.log(`\x1b[32m[SECURE]\x1b[0m Secure tunnel established with Node \x1b[33m${this.peerId.slice(0, 8)}\x1b[0m`);
                            console.log(`\x1b[35m[CRYPTO]\x1b[0m Forward secrecy enabled via X25519 + AES-GCM`);
                            // Lier les évenements de session en post-handshake
                            this.bindSessionEvents();
                            resolve(this.session);
                        }
                        catch (err) {
                            console.log(`\x1b[31m[ERROR]\x1b[0m Handshake Etape 3 failed: ${err.message}`);
                            this.socket.destroy();
                            reject(err);
                        }
                    });
                }
                catch (err) {
                    console.log(`\x1b[31m[ERROR]\x1b[0m Handshake Etape 1 failed: ${err.message}`);
                    reject(err);
                }
            });
            this.socket.on('error', (err) => {
                reject(err);
            });
        });
    }
    async send(data) {
        if (!this.session)
            throw new Error("Secure session not established");
        const encryptedPayload = await this.session.encrypt(data);
        this.socket.write(encryptedPayload);
    }
    bindSessionEvents() {
        this.socket.on('data', async (data) => {
            if (this.session) {
                try {
                    const plaintext = await this.session.decrypt(Buffer.from(data));
                    this.emit('message', { peerId: this.peerId, data: plaintext });
                }
                catch (e) { /* Error logged in decrypt */ }
            }
        });
        this.socket.on('close', () => {
            if (this.peerId) {
                console.log(`\x1b[31m[DISCONNECT]\x1b[0m Tunnel to Node \x1b[33m${this.peerId.slice(0, 8)}\x1b[0m torn down`);
            }
        });
    }
}
exports.TCPClient = TCPClient;
