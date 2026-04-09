#!/usr/bin/env node
/**
 * find-archive-nodes.js
 * Scan X1 cluster nodes to find deep archive RPC nodes.
 * Queries getClusterNodes, then checks minimumLedgerSlot on each.
 * Shows top 20 deepest archive nodes sorted by min slot.
 *
 * Usage: node find-archive-nodes.js [max_nodes_to_check]
 * Example: node find-archive-nodes.js 50
 */

const RPC_URL = process.env.X1_RPC_URL || 'https://rpc.x1.xyz';
const MAX_NODES = parseInt(process.argv[2] || '100', 10);
const TIMEOUT_MS = 4000;
const BLOCK_TIME_SEC = 0.4; // ~400ms per slot

async function rpc(url, method, params = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    const data = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function checkNode(nodeRpc, currentSlot) {
  const result = await rpc(`http://${nodeRpc}`, 'minimumLedgerSlot');
  if (result === null || typeof result !== 'number') return null;
  const slotsDeep = currentSlot - result;
  const daysDeep = (slotsDeep * BLOCK_TIME_SEC) / 86400;
  return { minSlot: result, slotsDeep, daysDeep };
}

async function main() {
  console.log(`\n🔍 X1 Archive Node Scanner`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Checking up to ${MAX_NODES} nodes...\n`);

  // Get current slot
  const currentSlot = await rpc(RPC_URL, 'getSlot');
  if (!currentSlot) {
    console.error('Failed to get current slot. Check RPC URL.');
    process.exit(1);
  }
  console.log(`   Current slot: ${currentSlot.toLocaleString()}\n`);

  // Get all cluster nodes
  const nodes = await rpc(RPC_URL, 'getClusterNodes');
  if (!nodes) {
    console.error('Failed to get cluster nodes.');
    process.exit(1);
  }

  const rpcNodes = nodes.filter((n) => n.rpc);
  console.log(`   Found ${rpcNodes.length} nodes with open RPC ports.`);
  console.log(`   Scanning up to ${Math.min(MAX_NODES, rpcNodes.length)} nodes (${TIMEOUT_MS}ms timeout each)...\n`);

  // Check nodes concurrently in batches of 10
  const BATCH_SIZE = 10;
  const results = [];
  const toCheck = rpcNodes.slice(0, MAX_NODES);

  for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
    const batch = toCheck.slice(i, i + BATCH_SIZE);
    const checks = await Promise.all(
      batch.map(async (node) => {
        const info = await checkNode(node.rpc, currentSlot);
        if (!info) return null;
        return {
          rpc: node.rpc,
          pubkey: node.pubkey?.slice(0, 16) + '...',
          ...info,
        };
      })
    );
    results.push(...checks.filter(Boolean));
    process.stdout.write(`\r   Progress: ${Math.min(i + BATCH_SIZE, toCheck.length)} / ${toCheck.length} checked, ${results.length} responding...`);
  }

  console.log(`\n\n   Checked ${toCheck.length} nodes, ${results.length} responded.\n`);

  if (results.length === 0) {
    console.log('   No archive nodes found. Try increasing timeout or checking network.');
    return;
  }

  // Sort by minSlot ascending (lowest = deepest archive)
  results.sort((a, b) => a.minSlot - b.minSlot);
  const top20 = results.slice(0, 20);

  // Print table
  const col1 = 28, col2 = 14, col3 = 12;
  console.log(
    'RPC Address'.padEnd(col1) +
    'Min Slot'.padEnd(col2) +
    'Days Deep'.padEnd(col3) +
    'Node Pubkey'
  );
  console.log('-'.repeat(col1 + col2 + col3 + 20));

  for (const r of top20) {
    const marker =
      r.minSlot === 0 ? ' ← GENESIS' : r.daysDeep > 30 ? ' ← DEEP' : '';
    console.log(
      r.rpc.padEnd(col1) +
      r.minSlot.toLocaleString().padEnd(col2) +
      `${r.daysDeep.toFixed(1)} days`.padEnd(col3) +
      r.pubkey +
      marker
    );
  }

  console.log();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// ---
// Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
// Built by ArnettX1 · x1scroll.io
