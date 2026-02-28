import _sodium from 'libsodium-wrappers';
import { Identity, IdentityConfig } from './identity';

export interface ISession {
    sharedRx: Uint8Array;
    sharedTx: Uint8Array;
}

export class Handshake {
    // Etape 1 (Alice): HELLO (e_A_pub, timestamp)
    public static async initiate(myIdentity: Identity, myPort: number): Promise<{ ephemeralKeyPair: any, packet: Buffer }> {
        await _sodium.ready;
        const sodium = _sodium;
        const ephemeralKeyPair = sodium.crypto_kx_keypair();

        // Packet: [ EphemeralPubKey (32) | Timestamp (8) ]
        const tsBuf = Buffer.alloc(8);
        tsBuf.writeBigUInt64BE(BigInt(Date.now()), 0);

        const packet = Buffer.concat([
            Buffer.from(ephemeralKeyPair.publicKey),
            tsBuf
        ]);

        return { ephemeralKeyPair, packet };
    }

    // Etape 2 (Bob): Recevoir HELLO, envoyer HELLO_REPLY (e_B_pub, ID_B, sig_B)
    public static async respond(packet: Buffer, myIdentity: Identity, myPort: number): Promise<{ session: ISession, responsePacket: Buffer, peerId: string, peerEphemeralPubKey: Uint8Array }> {
        await _sodium.ready;
        const sodium = _sodium;

        if (packet.length < 40) throw new Error("Invalid HELLO packet length");

        const peerEphemeralPubKey = new Uint8Array(packet.subarray(0, 32));
        // timestamp is at 32..40

        const myEphemeral = sodium.crypto_kx_keypair();

        // Signature Bob: sig(e_A_pub | e_B_pub)
        const msgToSign = Buffer.concat([Buffer.from(peerEphemeralPubKey), Buffer.from(myEphemeral.publicKey)]);
        const sig = sodium.crypto_sign_detached(msgToSign, myIdentity.privateKey);

        // responsePacket: [ ID_B (32) | e_B_pub (32) | sig_B (64) ]
        const responsePacket = Buffer.concat([
            Buffer.from(myIdentity.publicKey),
            Buffer.from(myEphemeral.publicKey),
            Buffer.from(sig)
        ]);

        const rx = sodium.crypto_kx_server_session_keys(myEphemeral.publicKey, myEphemeral.privateKey, peerEphemeralPubKey).sharedRx;
        const tx = sodium.crypto_kx_server_session_keys(myEphemeral.publicKey, myEphemeral.privateKey, peerEphemeralPubKey).sharedTx;

        return {
            session: { sharedRx: rx, sharedTx: tx },
            responsePacket,
            peerId: "pending", // ID_A will be revealed in AUTH step
            peerEphemeralPubKey
        };
    }

    // Etape 3 (Alice): Recevoir HELLO_REPLY, vérifier sig_B, envoyer AUTH (ID_A, sig_A)
    public static async finish(packet: Buffer, myIdentity: Identity, myEphemeralKeyPair: any, myPort: number): Promise<{ session: ISession, authPacket: Buffer, peerId: string }> {
        await _sodium.ready;
        const sodium = _sodium;

        if (packet.length < 128) throw new Error("Invalid HELLO_REPLY length");

        const peerIdentityPubKey = new Uint8Array(packet.subarray(0, 32));
        const peerEphemeralPubKey = new Uint8Array(packet.subarray(32, 64));
        const peerSig = new Uint8Array(packet.subarray(64, 128));

        // Vérifier sig_B: sig(e_A_pub | e_B_pub)
        const msgToVerify = Buffer.concat([Buffer.from(myEphemeralKeyPair.publicKey), Buffer.from(peerEphemeralPubKey)]);
        const isValid = sodium.crypto_sign_verify_detached(peerSig, msgToVerify, peerIdentityPubKey);
        if (!isValid) throw new Error("Server identity verification failed");

        const peerId = sodium.to_base64(peerIdentityPubKey);
        await IdentityConfig.verifyPeer(myPort, peerId, peerIdentityPubKey);

        // Signature Alice: sig(e_A_pub | e_B_pub)
        const mySig = sodium.crypto_sign_detached(msgToVerify, myIdentity.privateKey);

        // authPacket: [ ID_A (32) | sig_A (64) ]
        const authPacket = Buffer.concat([
            Buffer.from(myIdentity.publicKey),
            Buffer.from(mySig)
        ]);

        const rx = sodium.crypto_kx_client_session_keys(myEphemeralKeyPair.publicKey, myEphemeralKeyPair.privateKey, peerEphemeralPubKey).sharedRx;
        const tx = sodium.crypto_kx_client_session_keys(myEphemeralKeyPair.publicKey, myEphemeralKeyPair.privateKey, peerEphemeralPubKey).sharedTx;

        return { session: { sharedRx: rx, sharedTx: tx }, authPacket, peerId };
    }

    // Etape 4 (Bob): Recevoir AUTH, vérifier sig_A
    public static async verifyAuth(packet: Buffer, myEphemeralPubKey: Uint8Array, peerEphemeralPubKey: Uint8Array, myPort: number): Promise<{ peerId: string }> {
        await _sodium.ready;
        const sodium = _sodium;

        if (packet.length < 96) throw new Error("Invalid AUTH packet length");

        const peerIdentityPubKey = new Uint8Array(packet.subarray(0, 32));
        const peerSig = new Uint8Array(packet.subarray(32, 96));

        // Vérifier sig_A: sig(e_A_pub | e_B_pub)
        const msgToVerify = Buffer.concat([Buffer.from(peerEphemeralPubKey), Buffer.from(myEphemeralPubKey)]);
        const isValid = sodium.crypto_sign_verify_detached(peerSig, msgToVerify, peerIdentityPubKey);
        if (!isValid) throw new Error("Client identity verification failed");

        const peerId = sodium.to_base64(peerIdentityPubKey);
        await IdentityConfig.verifyPeer(myPort, peerId, peerIdentityPubKey);

        return { peerId };
    }
}
