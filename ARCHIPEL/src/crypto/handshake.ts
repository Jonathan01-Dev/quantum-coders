import _sodium from 'libsodium-wrappers';
import { Identity } from './identity';

export interface ISession {
    sharedRx: Uint8Array;
    sharedTx: Uint8Array;
}

export class Handshake {

    // Etape 1 : Le noeud initialisant la connexion envoie Hello
    public static async initiate(myIdentity: Identity, myPort: number): Promise<{ ephemeralKeyPair: any, packet: Buffer }> {
        await _sodium.ready;
        const sodium = _sodium;

        // X25519 ephemeral pair
        const ephemeralKeyPair = sodium.crypto_kx_keypair();

        // [ IdentityPubKey (32) | EphemeralPubKey (32) | Port (2) | Signature sur [EphemeralPubKey|Port] (64) ]
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(myPort, 0);

        const msgToSign = Buffer.concat([Buffer.from(ephemeralKeyPair.publicKey), portBuf]);
        const sig = sodium.crypto_sign(msgToSign, myIdentity.privateKey);
        const signatureOnly = sig.slice(0, 64);

        const packet = Buffer.concat([
            Buffer.from(myIdentity.publicKey),
            Buffer.from(ephemeralKeyPair.publicKey),
            portBuf,
            Buffer.from(signatureOnly)
        ]);

        return { ephemeralKeyPair, packet };
    }

    // Etape 2 : Le récepteur vérifie Hello, crée sa paire X25519, et calcule le secret
    public static async respond(packet: Buffer, myIdentity: Identity, myPort: number): Promise<{ session: ISession, responsePacket: Buffer, peerId: string, peerPort: number }> {
        await _sodium.ready;
        const sodium = _sodium;

        if (packet.length !== 130) throw new Error("Invalid Handshake packet length");

        const peerIdentityPubKey = new Uint8Array(packet.subarray(0, 32));
        const peerEphemeralPubKey = new Uint8Array(packet.subarray(32, 64));
        const peerPortBuf = packet.subarray(64, 66);
        const peerPort = peerPortBuf.readUInt16BE(0);
        const signature = new Uint8Array(packet.subarray(66, 130));

        // Vérification de la signature
        const signedMsg = Buffer.concat([Buffer.from(peerEphemeralPubKey), peerPortBuf]);
        const isValid = sodium.crypto_sign_verify_detached(signature, signedMsg, peerIdentityPubKey);
        if (!isValid) throw new Error("Cryptographic signature verification failed");

        const peerId = sodium.to_base64(peerIdentityPubKey);

        // Mon côté :
        const myEphemeral = sodium.crypto_kx_keypair();
        const myPortBuf = Buffer.alloc(2);
        myPortBuf.writeUInt16BE(myPort, 0);

        const myMsgToSign = Buffer.concat([Buffer.from(myEphemeral.publicKey), myPortBuf]);
        const mySig = sodium.crypto_sign(myMsgToSign, myIdentity.privateKey);
        const mySignatureOnly = mySig.slice(0, 64);

        const responsePacket = Buffer.concat([
            Buffer.from(myIdentity.publicKey),
            Buffer.from(myEphemeral.publicKey),
            myPortBuf,
            Buffer.from(mySignatureOnly)
        ]);

        // Dérivation de clés
        const rx = sodium.crypto_kx_server_session_keys(myEphemeral.publicKey, myEphemeral.privateKey, peerEphemeralPubKey).sharedRx;
        const tx = sodium.crypto_kx_server_session_keys(myEphemeral.publicKey, myEphemeral.privateKey, peerEphemeralPubKey).sharedTx;

        return { session: { sharedRx: rx, sharedTx: tx }, responsePacket, peerId, peerPort };
    }

    // Etape 3 : L'initiateur reçoit la réponse et dérive le secret
    public static async finish(packet: Buffer, myIdentity: Identity, myEphemeralKeyPair: any): Promise<{ session: ISession, peerId: string, peerPort: number }> {
        await _sodium.ready;
        const sodium = _sodium;

        if (packet.length !== 130) throw new Error("Invalid Handshake packet length");

        const peerIdentityPubKey = new Uint8Array(packet.subarray(0, 32));
        const peerEphemeralPubKey = new Uint8Array(packet.subarray(32, 64));
        const peerPortBuf = packet.subarray(64, 66);
        const peerPort = peerPortBuf.readUInt16BE(0);
        const signature = new Uint8Array(packet.subarray(66, 130));

        const signedMsg = Buffer.concat([Buffer.from(peerEphemeralPubKey), peerPortBuf]);
        const isValid = sodium.crypto_sign_verify_detached(signature, signedMsg, peerIdentityPubKey);
        if (!isValid) throw new Error("Cryptographic signature verification failed");

        const peerId = sodium.to_base64(peerIdentityPubKey);

        // Dérivation
        const rx = sodium.crypto_kx_client_session_keys(myEphemeralKeyPair.publicKey, myEphemeralKeyPair.privateKey, peerEphemeralPubKey).sharedRx;
        const tx = sodium.crypto_kx_client_session_keys(myEphemeralKeyPair.publicKey, myEphemeralKeyPair.privateKey, peerEphemeralPubKey).sharedTx;

        return { session: { sharedRx: rx, sharedTx: tx }, peerId, peerPort };
    }
}
