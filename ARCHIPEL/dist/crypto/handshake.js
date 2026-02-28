"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Handshake = void 0;
const libsodium_wrappers_1 = __importDefault(require("libsodium-wrappers"));
class Handshake {
    // Etape 1 : Le noeud initialisant la connexion envoie Hello
    static async initiate(myIdentity) {
        await libsodium_wrappers_1.default.ready;
        const sodium = libsodium_wrappers_1.default;
        // X25519 ephemeral pair
        const ephemeralKeyPair = sodium.crypto_kx_keypair();
        // Pour simplifier la demo Hackathon, on envoie :
        // [ IdentityPubKey (32) | EphemeralPubKey (32) | Signature sur EphemeralPubKey (64) ]
        const sig = sodium.crypto_sign(ephemeralKeyPair.publicKey, myIdentity.privateKey);
        // crypto_sign prefix the message with the signature. We extract the 64 bytes signature
        const signatureOnly = sig.slice(0, 64);
        const packet = Buffer.concat([
            Buffer.from(myIdentity.publicKey),
            Buffer.from(ephemeralKeyPair.publicKey),
            Buffer.from(signatureOnly)
        ]);
        return { ephemeralKeyPair, packet };
    }
    // Etape 2 : Le récepteur vérifie Hello, crée sa paire X25519, et calcule le secret
    static async respond(packet, myIdentity) {
        await libsodium_wrappers_1.default.ready;
        const sodium = libsodium_wrappers_1.default;
        if (packet.length !== 128)
            throw new Error("Invalid Handshake packet length");
        const peerIdentityPubKey = new Uint8Array(packet.subarray(0, 32));
        const peerEphemeralPubKey = new Uint8Array(packet.subarray(32, 64));
        const signature = new Uint8Array(packet.subarray(64, 128));
        // Vérification de la signature (Hackathon TOFU: On assume que c'est bien lui)
        const isValid = sodium.crypto_sign_verify_detached(signature, peerEphemeralPubKey, peerIdentityPubKey);
        if (!isValid)
            throw new Error("Cryptographic signature verification failed");
        const peerId = sodium.to_base64(peerIdentityPubKey);
        // Mon côté :
        const myEphemeral = sodium.crypto_kx_keypair();
        const mySig = sodium.crypto_sign(myEphemeral.publicKey, myIdentity.privateKey);
        const mySignatureOnly = mySig.slice(0, 64);
        const responsePacket = Buffer.concat([
            Buffer.from(myIdentity.publicKey),
            Buffer.from(myEphemeral.publicKey),
            Buffer.from(mySignatureOnly)
        ]);
        // Dérivation de clés
        const rx = sodium.crypto_kx_server_session_keys(myEphemeral.publicKey, myEphemeral.privateKey, peerEphemeralPubKey).sharedRx;
        const tx = sodium.crypto_kx_server_session_keys(myEphemeral.publicKey, myEphemeral.privateKey, peerEphemeralPubKey).sharedTx;
        return { session: { sharedRx: rx, sharedTx: tx }, responsePacket, peerId };
    }
    // Etape 3 : L'initiateur reçoit la réponse et dérive le secret
    static async finish(packet, myIdentity, myEphemeralKeyPair) {
        await libsodium_wrappers_1.default.ready;
        const sodium = libsodium_wrappers_1.default;
        if (packet.length !== 128)
            throw new Error("Invalid Handshake packet length");
        const peerIdentityPubKey = new Uint8Array(packet.subarray(0, 32));
        const peerEphemeralPubKey = new Uint8Array(packet.subarray(32, 64));
        const signature = new Uint8Array(packet.subarray(64, 128));
        const isValid = sodium.crypto_sign_verify_detached(signature, peerEphemeralPubKey, peerIdentityPubKey);
        if (!isValid)
            throw new Error("Cryptographic signature verification failed");
        const peerId = sodium.to_base64(peerIdentityPubKey);
        // Dérivation
        const rx = sodium.crypto_kx_client_session_keys(myEphemeralKeyPair.publicKey, myEphemeralKeyPair.privateKey, peerEphemeralPubKey).sharedRx;
        const tx = sodium.crypto_kx_client_session_keys(myEphemeralKeyPair.publicKey, myEphemeralKeyPair.privateKey, peerEphemeralPubKey).sharedTx;
        return { session: { sharedRx: rx, sharedTx: tx }, peerId };
    }
}
exports.Handshake = Handshake;
