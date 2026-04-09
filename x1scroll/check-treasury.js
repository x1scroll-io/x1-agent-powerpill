#!/usr/bin/env node
/**
 * check-treasury.js
 * Query an x1scroll.io treasury wallet on X1:
 *   - Current XNT balance
 *   - Recent inflows (last 10 transactions)
 *   - Total XNT received this week
 *
 * Usage: node check-treasury.js [treasury_address]
 * Example: node check-treasury.js YOUR_TREASURY_ADDRESS
 */

const RPC_URL  = process.env.X1_RPC_URL        || 'https://rpc.x1.xyz';
const TREASURY = process.argv[2]
              || process.env.TREASURY_ADDRESS
              || 'YOUR_TREASURY_ADDRESS';

const ONE_WEEK_SEC = 7 * 24 * 3600;

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

async function getTransaction(signature) {
  return rpc('getTransaction', [
    signature,
    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
  ]);
}

function formatXnt(lamports) {
  return (lamports / 1e9).toFixed(6) + ' XNT';
}

function timeAgo(unixSec) {
  const diffSec = Math.floor(Date.now() / 1000) - unixSec;
  if (diffSec < 60)       return `${diffSec}s ago`;
  if (diffSec < 3600)     return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400)    return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

async function main() {
  if (TREASURY === 'YOUR_TREASURY_ADDRESS') {
    console.error('Usage: node check-treasury.js <treasury_address>');
    console.error('Or set TREASURY_ADDRESS env var.');
    process.exit(1);
  }

  console.log(`\n🏦 Treasury Check — x1scroll.io`);
  console.log(`   Address: ${TREASURY}`);
  console.log(`   RPC:     ${RPC_URL}\n`);

  // Current balance
  const lamports = await rpc('getBalance', [TREASURY]);
  const balance  = lamports / 1e9;
  console.log(`   💰 Current Balance: ${balance.toFixed(6)} XNT\n`);

  // Get recent transactions
  const sigs = await rpc('getSignaturesForAddress', [
    TREASURY,
    { limit: 20 },
  ]);

  if (!sigs || sigs.length === 0) {
    console.log('   No transactions found.');
    return;
  }

  console.log(`   📜 Recent Transactions (last ${Math.min(sigs.length, 20)}):\n`);

  const nowSec     = Math.floor(Date.now() / 1000);
  const weekAgoSec = nowSec - ONE_WEEK_SEC;

  let weeklyInflow  = 0;
  let inflowCount   = 0;
  const inflows     = [];

  for (const sigInfo of sigs.slice(0, 10)) {
    const tx = await getTransaction(sigInfo.signature);
    if (!tx) continue;

    const blockTime = tx.blockTime ?? null;
    const timeStr   = blockTime ? timeAgo(blockTime) : 'unknown';

    // Find balance change for treasury account
    const accountKeys = tx.transaction?.message?.accountKeys ?? [];
    const preBalances  = tx.meta?.preBalances ?? [];
    const postBalances = tx.meta?.postBalances ?? [];

    const treasuryIdx = accountKeys.findIndex((k) => {
      const pubkey = typeof k === 'string' ? k : k?.pubkey;
      return pubkey === TREASURY;
    });

    let balanceChange = null;
    if (treasuryIdx >= 0) {
      const pre  = preBalances[treasuryIdx]  ?? 0;
      const post = postBalances[treasuryIdx] ?? 0;
      balanceChange = (post - pre) / 1e9;
    }

    const isInflow  = balanceChange !== null && balanceChange > 0;
    const isOutflow = balanceChange !== null && balanceChange < 0;
    const icon      = isInflow ? '⬇️ IN ' : isOutflow ? '⬆️ OUT' : '↔️   ';
    const changeStr = balanceChange !== null ? `${balanceChange >= 0 ? '+' : ''}${balanceChange.toFixed(6)} XNT` : '—';

    const status = sigInfo.err ? '❌' : '✅';

    console.log(`   ${status} ${icon}  ${changeStr.padEnd(20)} ${timeStr.padEnd(12)} ${sigInfo.signature.slice(0, 24)}...`);

    // Track weekly inflows
    if (isInflow && blockTime && blockTime >= weekAgoSec) {
      weeklyInflow += balanceChange;
      inflowCount++;
      inflows.push({ sig: sigInfo.signature, amount: balanceChange, time: blockTime });
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n   📊 This Week's Inflows:`);
  console.log(`     Total received: ${weeklyInflow.toFixed(6)} XNT`);
  console.log(`     Transactions:   ${inflowCount}`);

  if (inflows.length > 0) {
    console.log(`\n   Top inflows this week:`);
    inflows
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .forEach((inf) => {
        console.log(`     +${inf.amount.toFixed(6)} XNT  ${timeAgo(inf.time)}  ${inf.sig.slice(0, 24)}...`);
      });
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
