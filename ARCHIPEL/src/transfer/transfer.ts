import { promises as fs } from 'fs';
import { CONFIG } from '../core/config';
import { createHash } from 'crypto';
import * as path from 'path';
import { FileManifest } from './manifest';

export class TransferManager {
    // Stockage en mémoire des manifestes partagés localement
    private sharedFiles: Map<string, { manifest: FileManifest, path: string }> = new Map();

    // Suivi des téléchargements
    private downloads: Map<string, { manifest: FileManifest, buffer: Buffer, receivedChunks: Set<number> }> = new Map();

    public shareFile(manifest: FileManifest, filePath: string) {
        this.sharedFiles.set(manifest.id, { manifest, path: filePath });
    }

    public getSharedManifest(manifestId: string) {
        return this.sharedFiles.get(manifestId)?.manifest;
    }

    public async readChunk(manifestId: string, chunkIndex: number): Promise<Buffer | null> {
        const file = this.sharedFiles.get(manifestId);
        if (!file) return null;

        const fileBuffer = await fs.readFile(file.path);
        const start = chunkIndex * file.manifest.chunkSize;
        const end = Math.min(start + file.manifest.chunkSize, fileBuffer.length);

        return Buffer.from(fileBuffer.subarray(start, end));
    }

    public initDownload(manifest: FileManifest) {
        this.downloads.set(manifest.id, {
            manifest,
            buffer: Buffer.alloc(manifest.totalSize),
            receivedChunks: new Set()
        });
        console.log(`\x1b[36m[DOWNLOAD]\x1b[0m Started tracking ${manifest.filename} (Size: ${(manifest.totalSize / 1024 / 1024).toFixed(2)} MB)`);
    }

    public verifyAndWriteChunk(manifestId: string, chunkIndex: number, data: Buffer): boolean {
        const download = this.downloads.get(manifestId);
        if (!download) return false;

        const chunkInfo = download.manifest.chunks.find(c => c.index === chunkIndex);
        if (!chunkInfo) return false;

        // VERIFICATION DE L'INTEGRITE SHA-256
        const hash = createHash('sha256').update(data).digest('hex');
        if (hash !== chunkInfo.hash) {
            console.log(`\x1b[31m[ERROR]\x1b[0m Chunk ${chunkIndex} integrity check failed! Expected ${chunkInfo.hash}, got ${hash}`);
            return false;
        }

        // Write directly to the alloc buffer
        const start = chunkIndex * download.manifest.chunkSize;
        data.copy(download.buffer, start);
        download.receivedChunks.add(chunkIndex);

        console.log(`\x1b[32m[VERIFIED]\x1b[0m Chunk ${chunkIndex}/${download.manifest.chunks.length} passed SHA-256 integrity`);

        return true;
    }

    public isDownloadComplete(manifestId: string): boolean {
        const download = this.downloads.get(manifestId);
        if (!download) return false;
        return download.receivedChunks.size === download.manifest.chunks.length;
    }

    public async commitDownload(manifestId: string, outputDir: string): Promise<string> {
        const download = this.downloads.get(manifestId);
        if (!download) throw new Error("Download not found");

        if (!this.isDownloadComplete(manifestId)) {
            throw new Error("Cannot commit, download incomplete");
        }

        const outputPath = path.join(outputDir, `downloaded_${download.manifest.filename}`);
        await fs.writeFile(outputPath, download.buffer);

        // Nettoyage
        this.downloads.delete(manifestId);

        return outputPath;
    }
}
