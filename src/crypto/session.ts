import * as crypto from 'crypto';
import { ISession } from './handshake';

export class SecureSession {
    constructor(private sessionKeys: ISession) { }

    public encrypt(plaintext: Buffer): Buffer {
        // Sprint 2 Spec: AES-256-GCM with 96-bit random nonce
        const nonce = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.sessionKeys.sharedTx, nonce);

        const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag(); // 128-bit auth tag (16 bytes)

        // Packet structure: [ Nonce (12) | AuthTag (16) | Ciphertext (var) ]
        return Buffer.concat([nonce, tag, encrypted]);
    }

    public decrypt(packet: Buffer): Buffer {
        if (packet.length < 28) { // 12 (nonce) + 16 (tag)
            throw new Error("Encrypted packet is too short");
        }

        const nonce = packet.subarray(0, 12);
        const tag = packet.subarray(12, 28);
        const ciphertext = packet.subarray(28);

        const decipher = crypto.createDecipheriv('aes-256-gcm', this.sessionKeys.sharedRx, nonce);
        decipher.setAuthTag(tag);

        try {
            const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
            return plaintext;
        } catch (e) {
            throw new Error(`\x1b[31m[SECURE]\x1b[0m AES-GCM Decryption failed (Integrity check failed): ${(e as Error).message}`);
        }
    }
}
