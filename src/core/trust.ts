import _sodium from 'libsodium-wrappers';
import * as fs from 'fs';
import * as path from 'path';
import { Identity } from '../crypto/identity';

export interface TrustAssertion {
    targetId: string;
    targetPublicKey: string; // Base64
    signerId: string;
    signature: string; // sig(targetId | targetPublicKey)
    timestamp: number;
}

export class TrustService {
    private assertions: TrustAssertion[] = [];
    private trustFile: string;

    constructor(private port: number) {
        this.trustFile = path.join(process.cwd(), `.web_of_trust_${port}.json`);
        this.load();
    }

    private load() {
        if (fs.existsSync(this.trustFile)) {
            this.assertions = JSON.parse(fs.readFileSync(this.trustFile, 'utf8'));
        }
    }

    private save() {
        fs.writeFileSync(this.trustFile, JSON.stringify(this.assertions, null, 2));
    }

    public async signPeer(targetId: string, targetPublicKey: Uint8Array, myIdentity: Identity): Promise<TrustAssertion> {
        await _sodium.ready;
        const sodium = _sodium;

        const targetPkBase64 = sodium.to_base64(targetPublicKey);
        const msgToSign = Buffer.concat([Buffer.from(targetId), Buffer.from(targetPkBase64)]);
        const signature = sodium.crypto_sign_detached(msgToSign, myIdentity.privateKey);

        const assertion: TrustAssertion = {
            targetId,
            targetPublicKey: targetPkBase64,
            signerId: myIdentity.idBase64,
            signature: sodium.to_base64(signature),
            timestamp: Date.now()
        };

        this.assertions.push(assertion);
        this.save();
        return assertion;
    }

    public async verifyAssertion(assertion: TrustAssertion, signerPublicKey: Uint8Array): Promise<boolean> {
        await _sodium.ready;
        const sodium = _sodium;

        const msgToVerify = Buffer.concat([Buffer.from(assertion.targetId), Buffer.from(assertion.targetPublicKey)]);
        const signature = sodium.from_base64(assertion.signature);

        return sodium.crypto_sign_verify_detached(signature, msgToVerify, signerPublicKey);
    }

    public getAssertionsFor(targetId: string): TrustAssertion[] {
        return this.assertions.filter(a => a.targetId === targetId);
    }

    public getAllAssertions(): TrustAssertion[] {
        return this.assertions;
    }
}
