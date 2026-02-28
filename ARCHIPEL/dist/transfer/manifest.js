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
exports.ManifestBuilder = void 0;
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
const config_1 = require("../core/config");
class ManifestBuilder {
    static async create(filePath) {
        try {
            let cleanPath = filePath.trim();
            if (cleanPath.startsWith('file:///')) {
                cleanPath = require('url').fileURLToPath(cleanPath);
            }
            if (cleanPath.includes('%20') || cleanPath.includes('%')) {
                cleanPath = decodeURIComponent(cleanPath);
            }
            cleanPath = path.normalize(cleanPath);
            const stats = (0, fs_1.statSync)(cleanPath);
            const filename = path.basename(cleanPath);
            const chunks = [];
            const fileBuffer = await fs_1.promises.readFile(cleanPath);
            const chunkSize = config_1.CONFIG.TRANSFER.CHUNK_SIZE;
            for (let i = 0; i < stats.size; i += chunkSize) {
                const chunkBuffer = fileBuffer.subarray(i, i + chunkSize);
                const hash = (0, crypto_1.createHash)('sha256').update(chunkBuffer).digest('hex');
                chunks.push({
                    index: Math.floor(i / chunkSize),
                    hash,
                    size: chunkBuffer.length
                });
            }
            // L'ID du fichier dérive du hachage de sa structure complète (Merkle-like tree simplifié)
            const manifestString = JSON.stringify(chunks);
            const manifestId = (0, crypto_1.createHash)('sha256').update(manifestString).digest('hex').slice(0, 16);
            console.log(`\x1b[36m[FILE]\x1b[0m Generated manifest for ${filename}: ${chunks.length} chunks`);
            return {
                id: manifestId,
                filename,
                totalSize: stats.size,
                chunkSize,
                chunks
            };
        }
        catch (e) {
            console.log(`\x1b[31m[ERROR]\x1b[0m Could not create manifest for ${filePath}`);
            throw e;
        }
    }
}
exports.ManifestBuilder = ManifestBuilder;
