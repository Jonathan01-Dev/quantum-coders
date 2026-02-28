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
        await _sodium.ready;
        const sodium = _sodium;

        // Pour simplifier les tests locaux de 3 noeuds dans le même dossier, on ajoute le port dans le nom du fichier
        const keyFile = path.join(process.cwd(), `.archipel_identity_${port}.json`);

        if (fs.existsSync(keyFile)) {
            const data = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
            console.log(`\x1b[32m[IDENTITY]\x1b[0m Loaded existing Ed25519 identity: \x1b[1m${data.idBase64.slice(0, 16)}...\x1b[0m`);
            return {
                publicKey: sodium.from_base64(data.publicKey),
                privateKey: sodium.from_base64(data.privateKey),
                idBase64: data.idBase64
            };
        }

        // Génération
        const keypair = sodium.crypto_sign_keypair();
        const idBase64 = sodium.to_base64(keypair.publicKey);

        const saveData = {
            publicKey: sodium.to_base64(keypair.publicKey),
            privateKey: sodium.to_base64(keypair.privateKey),
            idBase64: idBase64
        };

        fs.writeFileSync(keyFile, JSON.stringify(saveData, null, 2));
        console.log(`\x1b[35m[IDENTITY]\x1b[0m Generated NEW Ed25519 identity: \x1b[1m${idBase64.slice(0, 16)}...\x1b[0m`);

        return {
            publicKey: keypair.publicKey,
            privateKey: keypair.privateKey,
            idBase64: idBase64
        };
    }
}
