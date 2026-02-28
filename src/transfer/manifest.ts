import { statSync, createReadStream } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import { CONFIG } from '../core/config';
import _sodium from 'libsodium-wrappers';
import { Identity } from '../crypto/identity';

export interface ChunkInfo {
    index: number;
    hash: string;
    size: number;
}

export interface FileManifest {
    file_id: string;    // SHA-256 du fichier entier
    filename: string;
    size: number;
    chunk_size: number;
    nb_chunks: number;
    chunks: ChunkInfo[];
    sender_id: string;  // ed25519_public_key_hex (base64 in our case)
    signature: string;  // sig_ed25519_sur_manifest_hash
}

export class ManifestBuilder {
    public static async create(filePath: string, myIdentity: Identity): Promise<FileManifest> {
        try {
            await _sodium.ready;
            const sodium = _sodium;

            let cleanPath = filePath.trim();
            if (cleanPath.startsWith('"') && cleanPath.endsWith('"')) {
                cleanPath = cleanPath.substring(1, cleanPath.length - 1);
            }
            if (cleanPath.startsWith('file:///')) {
                cleanPath = require('url').fileURLToPath(cleanPath);
            }
            if (cleanPath.includes('%20') || cleanPath.includes('%')) {
                cleanPath = decodeURIComponent(cleanPath);
            }
            cleanPath = path.normalize(cleanPath);

            const stats = statSync(cleanPath);
            const filename = path.basename(cleanPath);
            const chunkSize = CONFIG.TRANSFER.CHUNK_SIZE;

            // Calcul du SHA-256 du fichier entier
            const fileHash = createHash('sha256');
            const stream = createReadStream(cleanPath);

            const chunks: ChunkInfo[] = [];
            let currentChunkIndex = 0;
            let totalBytesProcessed = 0;

            return new Promise((resolve, reject) => {
                let currentChunkBuffer = Buffer.alloc(0);

                stream.on('data', (chunk: Buffer) => {
                    fileHash.update(chunk);
                    currentChunkBuffer = Buffer.concat([currentChunkBuffer, chunk]);

                    while (currentChunkBuffer.length >= chunkSize) {
                        const chunkData = currentChunkBuffer.subarray(0, chunkSize);
                        chunks.push({
                            index: currentChunkIndex++,
                            hash: createHash('sha256').update(chunkData).digest('hex'),
                            size: chunkData.length
                        });
                        currentChunkBuffer = Buffer.from(currentChunkBuffer.subarray(chunkSize));
                    }
                });

                stream.on('end', async () => {
                    if (currentChunkBuffer.length > 0) {
                        chunks.push({
                            index: currentChunkIndex++,
                            hash: createHash('sha256').update(currentChunkBuffer).digest('hex'),
                            size: currentChunkBuffer.length
                        });
                    }

                    const fullFileHash = fileHash.digest('hex');

                    // Création du manifeste sans signature pour le hachage
                    const manifestData = {
                        file_id: fullFileHash,
                        filename,
                        size: stats.size,
                        chunk_size: chunkSize,
                        nb_chunks: chunks.length,
                        chunks,
                        sender_id: myIdentity.idBase64
                    };

                    const manifestHash = createHash('sha256').update(JSON.stringify(manifestData)).digest();
                    const signature = sodium.crypto_sign_detached(manifestHash, myIdentity.privateKey);

                    resolve({
                        ...manifestData,
                        signature: sodium.to_base64(signature)
                    });
                });

                stream.on('error', (err) => reject(err));
            });
        } catch (e) {
            console.log(`\x1b[31m[ERROR]\x1b[0m Could not create manifest for ${filePath}`);
            throw e;
        }
    }
}
