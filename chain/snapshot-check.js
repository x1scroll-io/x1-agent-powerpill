#!/usr/bin/env node
/**
 * snapshot-check.js
 * Check which X1 cluster nodes are serving downloadable snapshot files via HTTP.
 * Tries /snapshot.tar.bz2 and /snapshot.tar.zst on each node's RPC port.
 *
 * Usage: node snapshot-check.js [max_nodes]
 * Example: node snapshot-check.js 50
 */

const RPC_URL = process.env.X1_RPC_URL || 'https://rpc.x1.xyz';
const MAX_NODES = parseInt(process.argv[2] || '50', 10);
const TIMEOUT_MS = 5000;

const SNAPSHOT_PATHS = [
  '/snapshot.tar.bz2',
  '/snapshot.tar.zst',
  '/genesis.tar.bz2',
];

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  return data.result ?? null;
}

async function checkSnapshotPath(baseUrl, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(baseUrl + path, {
      method: 'HEAD',
      signal: controller.signal,
    });
    if (res.ok || res.status === 200) {
      const size = res.headers.get('content-length');
      return {
        available: true,
        path,
        size: size ? `${(parseInt(size) / 1e9).toFixed(2)} GB` : 'unknown size',
      };
    }
    // Some servers return 200 on GET but not HEAD — try redirect
    if (res.status === 302 || res.status === 301) {
      return { available: true, path, size: 'redirect (present)' };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function checkNode(node) {
  const baseUrl = `http://${node.rpc}`;
  const found = [];

  for (const path of SNAPSHOT_PATHS) {
    const result = await checkSnapshotPath(baseUrl, path);
    if (result) found.push(result);
  }

  return found.length > 0
    ? { rpc: node.rpc, pubkey: node.pubkey?.slice(0, 16) + '...', snapshots: found }
    : null;
}

async function main() {
  console.log(`\n📸 X1 Snapshot Availability Check`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Checking up to ${MAX_NODES} nodes...\n`);

  const nodes = await rpc('getClusterNodes');
  if (!nodes) {
    console.error('Failed to get cluster nodes. Check RPC URL.');
    process.exit(1);
  }

  const rpcNodes = nodes.filter((n) => n.rpc).slice(0, MAX_NODES);
  console.log(`   Scanning ${rpcNodes.length} nodes for snapshots...\n`);

  const BATCH_SIZE = 8;
  const serving = [];

  for (let i = 0; i < rpcNodes.length; i += BATCH_SIZE) {
    const batch = rpcNodes.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(checkNode));
    serving.push(...results.filter(Boolean));
    process.stdout.write(`\r   Progress: ${Math.min(i + BATCH_SIZE, rpcNodes.length)} / ${rpcNodes.length} checked, ${serving.length} serving...`);
  }

  console.log(`\n\n   ✅ ${serving.length} nodes are serving snapshots:\n`);

  if (serving.length === 0) {
    console.log('   No nodes found serving snapshots. This is normal — most validators');
    console.log('   serve snapshots on port 8899 only during bootstrap windows.');
    return;
  }

  for (const node of serving) {
    console.log(`   📦 ${node.rpc}  (${node.pubkey})`);
    for (const snap of node.snapshots) {
      console.log(`      └─ ${snap.path}  [${snap.size}]`);
    }
  }

  console.log(`\n   To download a snapshot:`);
  console.log(`   wget http://<NODE_RPC>/snapshot.tar.bz2\n`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// ---
// Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
// Built by ArnettX1 · x1scroll.io
