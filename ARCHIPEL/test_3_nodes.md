# Test Protocol for 3 Nodes (Offline Mesh)

## 1. Environment Setup
- Open 3 separate terminal windows in the project directory.

## 2. Launching Nodes
In Terminal 1:
```powershell
npx ts-node --transpile-only src/index.ts --port 7777
```
In Terminal 2:
```powershell
npx ts-node --transpile-only src/index.ts --port 7778
```
In Terminal 3:
```powershell
npx ts-node --transpile-only src/index.ts --port 7779
```

## 3. Verifying Discovery
- Wait ~15 seconds.
- Each node should log `[NEW PEER] Discovered Node...`.
- Type `peers` in any terminal to see the other two nodes.

## 4. Multi-Node Communication
- From Node 7777, send a message to Node 7779 using the UI (localhost:8777 -> localhost:8779) or CLI:
  `msg <7779_id_prefix> "Hello Mesh!"`
- Verify that Node 7779 receives it through the secure channel.

## 5. Gossip Verification
- If you manually connect Node A to Node B, Node A should automatically learn about Node C from Node B's routing table.
