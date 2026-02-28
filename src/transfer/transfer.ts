import { promises as fs, existsSync, mkdirSync } from 'fs';
import { CONFIG } from '../core/config';
import { createHash } from 'crypto';
import * as path from 'path';
import { FileManifest } from './manifest';

export class TransferManager {
    // Stockage des manifestes partagés localement
    private sharedFiles: Map<string, { manifest: FileManifest, path: string }> = new Map();

    // Suivi des téléchargements : file_id -> state
    private downloads: Map<string, {
        manifest: FileManifest,
        bitfield: boolean[],
        tempPath: string,
        outputPath: string
    }> = new Map();

    private storageDir: string;
    private indexFile: string;

    constructor() {
        this.storageDir = path.join(process.cwd(), '.archipel');
        this.indexFile = path.join(this.storageDir, 'index.db');
        if (!existsSync(this.storageDir)) {
            mkdirSync(this.storageDir);
        }
        this.loadIndex();
    }

    private async loadIndex() {
        if (existsSync(this.indexFile)) {
            try {
                const data = await fs.readFile(this.indexFile, 'utf-8');
                const parsed = JSON.parse(data);
                for (const item of parsed) {
                    this.sharedFiles.set(item.manifest.file_id, item);
                }
            } catch (e) {
                console.error("[TRANSFER] Failed to load index.db", e);
            }
        }
    }

    private async saveIndex() {
        const data = Array.from(this.sharedFiles.values());
        await fs.writeFile(this.indexFile, JSON.stringify(data, null, 2));
    }

    public shareFile(manifest: FileManifest, filePath: string) {
        this.sharedFiles.set(manifest.file_id, { manifest, path: filePath });
        this.saveIndex();
    }

    public getSharedManifest(fileId: string): FileManifest | undefined {
        return this.sharedFiles.get(fileId)?.manifest;
    }

    public hasChunk(fileId: string, index: number): boolean {
        const file = this.sharedFiles.get(fileId);
        if (!file) return false;
        return index >= 0 && index < file.manifest.nb_chunks;
    }

    public async readChunk(fileId: string, chunkIndex: number): Promise<Buffer | null> {
        const file = this.sharedFiles.get(fileId);
        if (!file) return null;

        const start = chunkIndex * file.manifest.chunk_size;
        const chunkInfo = file.manifest.chunks.find(c => c.index === chunkIndex);
        if (!chunkInfo) return null;

        const buffer = Buffer.alloc(chunkInfo.size);
        const fd = await fs.open(file.path, 'r');
        try {
            const { bytesRead } = await fd.read(buffer, 0, chunkInfo.size, start);
            if (bytesRead !== chunkInfo.size) return null;
            return buffer;
        } catch (e) {
            return null;
        } finally {
            await fd.close();
        }
    }

    public async initDownload(manifest: FileManifest, outputDir: string) {
        const tempPath = path.join(this.storageDir, `${manifest.file_id}.tmp`);
        const outputPath = path.join(outputDir, manifest.filename);

        // Pre-allocate file if it doesn't exist
        if (!existsSync(tempPath)) {
            const h = await fs.open(tempPath, 'w');
            await h.truncate(manifest.size);
            await h.close();
        }

        this.downloads.set(manifest.file_id, {
            manifest,
            bitfield: new Array(manifest.nb_chunks).fill(false),
            tempPath,
            outputPath
        });

        console.log(`\x1b[36m[DOWNLOAD]\x1b[0m Init: ${manifest.filename} (${manifest.nb_chunks} chunks)`);
    }

    public async verifyAndWriteChunk(fileId: string, chunkIndex: number, data: Buffer): Promise<boolean> {
        const download = this.downloads.get(fileId);
        if (!download) return false;

        const chunkInfo = download.manifest.chunks.find(c => c.index === chunkIndex);
        if (!chunkInfo) return false;

        // SHA-256 verification
        const hash = createHash('sha256').update(data).digest('hex');
        if (hash !== chunkInfo.hash) {
            console.log(`\x1b[31m[ERROR]\x1b[0m Chunk ${chunkIndex} hash mismatch!`);
            return false;
        }

        const start = chunkIndex * download.manifest.chunk_size;
        const fd = await fs.open(download.tempPath, 'r+');
        try {
            await fd.write(data, 0, data.length, start);
            download.bitfield[chunkIndex] = true;
            return true;
        } catch (e) {
            return false;
        } finally {
            await fd.close();
        }
    }

    public getMissingChunks(fileId: string): number[] {
        const download = this.downloads.get(fileId);
        if (!download) return [];
        return download.bitfield
            .map((done, idx) => done ? -1 : idx)
            .filter(idx => idx !== -1);
    }

    public isDownloadComplete(fileId: string): boolean {
        const download = this.downloads.get(fileId);
        if (!download) return false;
        return download.bitfield.every(b => b === true);
    }

    public async finalizeDownload(fileId: string): Promise<string> {
        const download = this.downloads.get(fileId);
        if (!download) throw new Error("Download not found");

        if (!this.isDownloadComplete(fileId)) throw new Error("Download incomplete");

        // Copy from temp to final output
        await fs.rename(download.tempPath, download.outputPath);

        // Add to shared files automatically (Module 3.4)
        this.shareFile(download.manifest, download.outputPath);

        this.downloads.delete(fileId);
        return download.outputPath;
    }

    public getProgress(fileId: string): number {
        const download = this.downloads.get(fileId);
        if (!download) return 0;
        const done = download.bitfield.filter(b => b).length;
        return (done / download.manifest.nb_chunks) * 100;
    }

    public getStats() {
        let totalSize = 0;
        for (const f of this.sharedFiles.values()) totalSize += f.manifest.size;
        return {
            files: this.sharedFiles.size,
            size: totalSize,
            active: this.downloads.size
        };
    }

    public getSharedFiles() {
        return Array.from(this.sharedFiles.values());
    }

    public async getFileContent(fileId: string): Promise<string | null> {
        const file = this.sharedFiles.get(fileId);
        if (!file) return null;
        return fs.readFile(file.path, 'utf-8');
    }
}
