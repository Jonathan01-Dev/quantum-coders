import { ArchipelNode } from './src/core/node';
import { promises as fs } from 'fs';

async function testDHT() {
    const node1 = new ArchipelNode(7000);
    const node2 = new ArchipelNode(7100);

    await node1.start();
    await node2.start();

    console.log('Nodes started, waiting for discovery...');
    await new Promise(r => setTimeout(r, 2000));

    node1.on('file:shared', async (manifest) => {
        console.log(`Node 1 shared file: ${manifest.id}`);
        // Give time for DHT_PROVIDE to gossip
        await new Promise(r => setTimeout(r, 1000));
        console.log(`Node 2 attempting to download ${manifest.id} via DHT`);
        await node2.downloadFile(manifest.id);
    });

    node2.on('transfer:complete', () => {
        console.log('Transfer complete! DHT Test PASSED.');
        setTimeout(() => process.exit(0), 1000);
    });

    // Create dummy file and share
    await fs.writeFile('test_dht.txt', 'DHT test content');
    await node1.shareFile('test_dht.txt');
}

testDHT().catch(e => {
    console.error(e);
    process.exit(1);
});
