#!/usr/bin/env node
/**
 * get-epoch-info.js
 * Query current epoch, slot, block height, TPS, and time remaining in epoch.
 * X1 Network (SVM-compatible) — block time ~400ms
 *
 * Usage: node get-epoch-info.js
 */

const RPC_URL = process.env.X1_RPC_URL || 'https://rpc.x1.xyz';

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function main() {
  console.log(`\n🔗 X1 Epoch Info — ${RPC_URL}\n`);

  // Fetch in parallel
  const [epochInfo, slot, perfSamples] = await Promise.all([
    rpc('getEpochInfo'),
    rpc('getSlot'),
    rpc('getRecentPerformanceSamples', [5]),
  ]);

  const {
    epoch,
    slotIndex,
    slotsInEpoch,
    absoluteSlot,
    blockHeight,
    transactionCount,
  } = epochInfo;

  // TPS: average over recent samples
  let tps = 0;
  if (perfSamples && perfSamples.length > 0) {
    const totalTx = perfSamples.reduce((a, s) => a + s.numTransactions, 0);
    const totalSec = perfSamples.reduce((a, s) => a + s.samplePeriodSecs, 0);
    tps = totalSec > 0 ? (totalTx / totalSec).toFixed(1) : 0;
  }

  // Time remaining in epoch (~400ms per slot on X1)
  const BLOCK_TIME_MS = 400;
  const slotsRemaining = slotsInEpoch - slotIndex;
  const msRemaining = slotsRemaining * BLOCK_TIME_MS;
  const hoursRemaining = (msRemaining / 3600000).toFixed(2);
  const pctComplete = ((slotIndex / slotsInEpoch) * 100).toFixed(2);

  // Progress bar
  const BAR_WIDTH = 30;
  const filled = Math.round((slotIndex / slotsInEpoch) * BAR_WIDTH);
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);

  console.log(`  Epoch:            ${epoch}`);
  console.log(`  Current Slot:     ${absoluteSlot.toLocaleString()}`);
  console.log(`  Block Height:     ${blockHeight.toLocaleString()}`);
  console.log(`  Transactions:     ${transactionCount?.toLocaleString() ?? 'N/A'}`);
  console.log(`  Live TPS:         ${tps}`);
  console.log(`  Slot in Epoch:    ${slotIndex.toLocaleString()} / ${slotsInEpoch.toLocaleString()}`);
  console.log(`  Progress:         [${bar}] ${pctComplete}%`);
  console.log(`  Slots Remaining:  ${slotsRemaining.toLocaleString()}`);
  console.log(`  Time Remaining:   ~${hoursRemaining}h`);
  console.log();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// ---
// Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
// Built by ArnettX1 · x1scroll.io
