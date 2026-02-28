import { statSync, promises as fs } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';
import { CONFIG } from '../core/config';

export interface ChunkInfo {
    index: number;
    hash: string;
    size: number;
}

export interface FileManifest {
    id: string;
    filename: string;
    totalSize: number;
    chunkSize: number;
    chunks: ChunkInfo[];
}

export class ManifestBuilder {
    public static async create(filePath: string): Promise<FileManifest> {
        try {
            let cleanPath = filePath.trim();
            if (cleanPath.startsWith('file:///')) {
                cleanPath = require('url').fileURLToPath(cleanPath);
            }
            if (cleanPath.includes('%20') || cleanPath.includes('%')) {
                cleanPath = decodeURIComponent(cleanPath);
            }
            cleanPath = path.normalize(cleanPath);

            const stats = statSync(cleanPath);
            const filename = path.basename(cleanPath);

            const chunks: ChunkInfo[] = [];
            const fileBuffer = await fs.readFile(cleanPath);
            const chunkSize = CONFIG.TRANSFER.CHUNK_SIZE;

            for (let i = 0; i < stats.size; i += chunkSize) {
                const chunkBuffer = fileBuffer.subarray(i, i + chunkSize);
                const hash = createHash('sha256').update(chunkBuffer).digest('hex');
                chunks.push({
                    index: Math.floor(i / chunkSize),
                    hash,
                    size: chunkBuffer.length
                });
            }

            // L'ID du fichier dérive du hachage de sa structure complète (Merkle-like tree simplifié)
            const manifestString = JSON.stringify(chunks);
            const manifestId = createHash('sha256').update(manifestString).digest('hex').slice(0, 16);

            console.log(`\x1b[36m[FILE]\x1b[0m Generated manifest for ${filename}: ${chunks.length} chunks`);

            return {
                id: manifestId,
                filename,
                totalSize: stats.size,
                chunkSize,
                chunks
            };
        } catch (e) {
            console.log(`\x1b[31m[ERROR]\x1b[0m Could not create manifest for ${filePath}`);
            throw e;
        }
    }
}
