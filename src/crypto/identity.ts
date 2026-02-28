import _sodium from 'libsodium-wrappers';
import * as fs from 'fs';
import * as path from 'path';

export interface Identity {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
    idBase64: string;
}

export class IdentityConfig {
    private static readonly KEY_FILE = path.join(process.cwd(), '.archipel_identity.json');

    public static async loadOrGenerate(port: number): Promise<Identity> {
        // ... (previous logic stays same for loading node identity)
        await _sodium.ready;
        const sodium = _sodium;
        const keyFile = path.join(process.cwd(), `.archipel_identity_${port}.json`);

        if (fs.existsSync(keyFile)) {
            const data = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
            return {
                publicKey: sodium.from_base64(data.publicKey),
                privateKey: sodium.from_base64(data.privateKey),
                idBase64: data.idBase64
            };
        }

        const keypair = sodium.crypto_sign_keypair();
        const idBase64 = sodium.to_base64(keypair.publicKey);
        const saveData = {
            publicKey: sodium.to_base64(keypair.publicKey),
            privateKey: sodium.to_base64(keypair.privateKey),
            idBase64: idBase64
        };

        fs.writeFileSync(keyFile, JSON.stringify(saveData, null, 2));
        return {
            publicKey: keypair.publicKey,
            privateKey: keypair.privateKey,
            idBase64: idBase64
        };
    }

    public static async verifyPeer(port: number, peerId: string, publicKey: Uint8Array): Promise<boolean> {
        const trustFile = path.join(process.cwd(), `.trusted_peers_${port}.json`);
        let trusted: Record<string, string> = {};
        if (fs.existsSync(trustFile)) {
            trusted = JSON.parse(fs.readFileSync(trustFile, 'utf8'));
        }

        const pkBase64 = _sodium.to_base64(publicKey);
        if (!trusted[peerId]) {
            // First time seeing this peer: TOFU
            trusted[peerId] = pkBase64;
            fs.writeFileSync(trustFile, JSON.stringify(trusted, null, 2));
            console.log(`\x1b[32m[TRUST]\x1b[0m TOFU: Stored new identity for Node \x1b[33m${peerId.slice(0, 8)}\x1b[0m`);
            return true;
        }

        if (trusted[peerId] !== pkBase64) {
            console.error(`\x1b[31m[SECURITY ALERT]\x1b[0m Identity mismatch for Node ${peerId.slice(0, 8)}! Possible MITM attack.`);
            return false;
        }

        return true;
    }
}
