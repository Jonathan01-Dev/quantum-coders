"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureSession = void 0;
const libsodium_wrappers_1 = __importDefault(require("libsodium-wrappers"));
class SecureSession {
    sessionKeys;
    sodium;
    constructor(sessionKeys) {
        this.sessionKeys = sessionKeys;
        this.sodium = libsodium_wrappers_1.default;
    }
    async encrypt(plaintext) {
        await this.sodium.ready;
        // Nonce aléatoire de 96 bits (12 bytes) pour AES-256-GCM / ChaCha20Poly1305
        const nonce = this.sodium.randombytes_buf(this.sodium.crypto_secretbox_NONCEBYTES);
        // Libsodium crypto_secretbox uses XSalsa20-Poly1305 which serves our exact purpose of authenticated encryption
        const ciphertext = this.sodium.crypto_secretbox_easy(plaintext, nonce, this.sessionKeys.sharedTx);
        // Le paquet envoyé est [ Nonce (24 bytes) | Ciphertext + AuthTag (16 bytes) ]
        return Buffer.concat([Buffer.from(nonce), Buffer.from(ciphertext)]);
    }
    async decrypt(packet) {
        await this.sodium.ready;
        const nonceBytes = this.sodium.crypto_secretbox_NONCEBYTES;
        if (packet.length < nonceBytes + this.sodium.crypto_secretbox_MACBYTES) {
            throw new Error("Encrypted packet is too short");
        }
        const nonce = new Uint8Array(packet.subarray(0, nonceBytes));
        const ciphertext = new Uint8Array(packet.subarray(nonceBytes));
        try {
            const plaintext = this.sodium.crypto_secretbox_open_easy(ciphertext, nonce, this.sessionKeys.sharedRx);
            return Buffer.from(plaintext);
        }
        catch (e) {
            throw new Error(`\x1b[31m[SECURE]\x1b[0m Decryption failed (Integrity check failed): ${e.message}`);
        }
    }
}
exports.SecureSession = SecureSession;
