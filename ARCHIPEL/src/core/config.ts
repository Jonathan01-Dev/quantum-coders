import { randomBytes } from 'crypto';

export const CONFIG = {
    NETWORK: {
        MULTICAST_IP: '239.255.42.99',
        DISCOVERY_PORT: 6000,
        DEFAULT_TCP_PORT: 7777,
        HELLO_INTERVAL_MS: 15000,
        PEER_TIMEOUT_MS: 45000, // 3 missed hellos
    },
    TRANSFER: {
        CHUNK_SIZE: 512 * 1024, // 512 KB
        MAX_CONCURRENT_DOWNLOADS: 2,
    }
};

export const generateNodeId = (): string => {
    return randomBytes(16).toString('hex');
};
