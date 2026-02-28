"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransferManager = void 0;
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
class TransferManager {
    // Stockage en mémoire des manifestes partagés localement
    sharedFiles = new Map();
    // Suivi des téléchargements
    downloads = new Map();
    shareFile(manifest, filePath) {
        this.sharedFiles.set(manifest.id, { manifest, path: filePath });
    }
    getSharedManifest(manifestId) {
        return this.sharedFiles.get(manifestId)?.manifest;
    }
    async readChunk(manifestId, chunkIndex) {
        const file = this.sharedFiles.get(manifestId);
        if (!file)
            return null;
        const fileBuffer = await fs_1.promises.readFile(file.path);
        const start = chunkIndex * file.manifest.chunkSize;
        const end = Math.min(start + file.manifest.chunkSize, fileBuffer.length);
        return Buffer.from(fileBuffer.subarray(start, end));
    }
    initDownload(manifest) {
        this.downloads.set(manifest.id, {
            manifest,
            buffer: Buffer.alloc(manifest.totalSize),
            receivedChunks: new Set()
        });
        console.log(`\x1b[36m[DOWNLOAD]\x1b[0m Started tracking ${manifest.filename} (Size: ${(manifest.totalSize / 1024 / 1024).toFixed(2)} MB)`);
    }
    verifyAndWriteChunk(manifestId, chunkIndex, data) {
        const download = this.downloads.get(manifestId);
        if (!download)
            return false;
        const chunkInfo = download.manifest.chunks.find(c => c.index === chunkIndex);
        if (!chunkInfo)
            return false;
        // VERIFICATION DE L'INTEGRITE SHA-256
        const hash = (0, crypto_1.createHash)('sha256').update(data).digest('hex');
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
    isDownloadComplete(manifestId) {
        const download = this.downloads.get(manifestId);
        if (!download)
            return false;
        return download.receivedChunks.size === download.manifest.chunks.length;
    }
    async commitDownload(manifestId, outputDir) {
        const download = this.downloads.get(manifestId);
        if (!download)
            throw new Error("Download not found");
        if (!this.isDownloadComplete(manifestId)) {
            throw new Error("Cannot commit, download incomplete");
        }
        const outputPath = path.join(outputDir, `downloaded_${download.manifest.filename}`);
        await fs_1.promises.writeFile(outputPath, download.buffer);
        // Nettoyage
        this.downloads.delete(manifestId);
        return outputPath;
    }
}
exports.TransferManager = TransferManager;
