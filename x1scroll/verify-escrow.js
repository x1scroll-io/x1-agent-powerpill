#!/usr/bin/env node
/**
 * verify-escrow.js
 * Verify an on-chain payment transaction for x1scroll.io escrow system.
 * Confirms:
 *   - TX fetched from RPC and exists on-chain
 *   - Funds went to the correct treasury/PDA address
 *   - Amount matches expected (with optional tolerance)
 *   - Transaction is not too old (within max age)
 *   - Returns: { verified: bool, reason: string, details: {} }
 *
 * Usage:
 *   node verify-escrow.js <tx_signature> <expected_recipient> <expected_amount_xnt>
 *
 * Example:
 *   node verify-escrow.js 5Kx9...<sig> YOUR_TREASURY_ADDRESS 0.1
 *
 * Or use env vars:
 *   TX_SIG=... EXPECTED_TO=... EXPECTED_AMOUNT=0.1 node verify-escrow.js
 */

const RPC_URL          = process.env.X1_RPC_URL        || 'https://rpc.x1.xyz';
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS  || 'YOUR_TREASURY_ADDRESS';

// CLI args or env
const TX_SIG           = process.argv[2] || process.env.TX_SIG;
const EXPECTED_TO      = process.argv[3] || process.env.EXPECTED_TO    || TREASURY_ADDRESS;
const EXPECTED_AMOUNT  = parseFloat(process.argv[4] || process.env.EXPECTED_AMOUNT || '0');

// Config
const MAX_AGE_SEC      = parseInt(process.env.MAX_AGE_SEC    || String(24 * 3600), 10); // 24h default
const TOLERANCE_XNT    = parseFloat(process.env.TOLERANCE_XNT || '0.000001');            // rounding tolerance

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

function fail(reason, details = {}) {
  return { verified: false, reason, details };
}

function pass(reason, details = {}) {
  return { verified: true, reason, details };
}

async function verifyPayment({ txSig, expectedTo, expectedAmountXnt }) {
  // 1. Fetch transaction
  const tx = await rpc('getTransaction', [
    txSig,
    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
  ]);

  if (!tx) {
    return fail('TX_NOT_FOUND', { signature: txSig });
  }

  // 2. Check for errors in transaction
  if (tx.meta?.err) {
    return fail('TX_FAILED', {
      signature: txSig,
      error: JSON.stringify(tx.meta.err),
    });
  }

  // 3. Check age
  const blockTime = tx.blockTime ?? null;
  const nowSec    = Math.floor(Date.now() / 1000);
  if (!blockTime) {
    return fail('TX_NO_TIMESTAMP', { signature: txSig });
  }

  const ageSec = nowSec - blockTime;
  if (ageSec > MAX_AGE_SEC) {
    return fail('TX_TOO_OLD', {
      signature: txSig,
      ageSec,
      maxAgeSec: MAX_AGE_SEC,
      blockTime: new Date(blockTime * 1000).toISOString(),
    });
  }

  // 4. Find recipient in account keys and check balance change
  const accountKeys  = tx.transaction?.message?.accountKeys ?? [];
  const preBalances  = tx.meta?.preBalances  ?? [];
  const postBalances = tx.meta?.postBalances ?? [];

  const recipientIdx = accountKeys.findIndex((k) => {
    const pubkey = typeof k === 'string' ? k : k?.pubkey;
    return pubkey === expectedTo;
  });

  if (recipientIdx < 0) {
    return fail('RECIPIENT_NOT_IN_TX', {
      signature: txSig,
      expectedTo,
      accountsInTx: accountKeys.map((k) => (typeof k === 'string' ? k : k?.pubkey)),
    });
  }

  // 5. Calculate amount received
  const preLamports  = preBalances[recipientIdx]  ?? 0;
  const postLamports = postBalances[recipientIdx] ?? 0;
  const receivedXnt  = (postLamports - preLamports) / 1e9;

  if (receivedXnt <= 0) {
    return fail('NO_INFLOW_TO_RECIPIENT', {
      signature: txSig,
      recipient: expectedTo,
      preBalance: preLamports / 1e9,
      postBalance: postLamports / 1e9,
      delta: receivedXnt,
    });
  }

  // 6. Check amount (if expected > 0)
  if (expectedAmountXnt > 0) {
    const diff = Math.abs(receivedXnt - expectedAmountXnt);
    if (diff > TOLERANCE_XNT) {
      return fail('AMOUNT_MISMATCH', {
        signature: txSig,
        expectedXnt: expectedAmountXnt,
        receivedXnt,
        diff,
        tolerance: TOLERANCE_XNT,
      });
    }
  }

  // ✅ All checks passed
  return pass('PAYMENT_VERIFIED', {
    signature: txSig,
    recipient: expectedTo,
    receivedXnt,
    blockTime: new Date(blockTime * 1000).toISOString(),
    ageSec,
    slot: tx.slot,
  });
}

async function main() {
  if (!TX_SIG) {
    console.error('Usage: node verify-escrow.js <tx_signature> [recipient] [expected_amount_xnt]');
    console.error('');
    console.error('Or use env vars: TX_SIG, EXPECTED_TO, EXPECTED_AMOUNT, TREASURY_ADDRESS');
    console.error('');
    console.error('Example:');
    console.error('  node verify-escrow.js 5Kx9abc... YOUR_TREASURY_ADDRESS 0.1');
    process.exit(1);
  }

  console.log(`\n🔍 Escrow Verification — x1scroll.io`);
  console.log(`   RPC:       ${RPC_URL}`);
  console.log(`   Signature: ${TX_SIG}`);
  console.log(`   Recipient: ${EXPECTED_TO}`);
  if (EXPECTED_AMOUNT > 0)
    console.log(`   Expected:  ${EXPECTED_AMOUNT} XNT`);
  console.log(`   Max age:   ${MAX_AGE_SEC / 3600}h\n`);

  const result = await verifyPayment({
    txSig: TX_SIG,
    expectedTo: EXPECTED_TO,
    expectedAmountXnt: EXPECTED_AMOUNT,
  });

  if (result.verified) {
    console.log(`   ✅ VERIFIED — ${result.reason}`);
    console.log(`   Received:  ${result.details.receivedXnt?.toFixed(6)} XNT`);
    console.log(`   Block:     ${result.details.slot?.toLocaleString()}`);
    console.log(`   Time:      ${result.details.blockTime} (${result.details.ageSec}s ago)`);
    console.log(`   Explorer:  https://explorer.x1.xyz/tx/${TX_SIG}`);
  } else {
    console.log(`   ❌ FAILED — ${result.reason}`);
    console.log(`   Details:`);
    console.log(JSON.stringify(result.details, null, 4).split('\n').map((l) => `     ${l}`).join('\n'));
  }

  console.log();

  // Machine-readable output
  if (process.env.JSON_OUTPUT === '1') {
    console.log(JSON.stringify(result));
  }

  process.exit(result.verified ? 0 : 1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// ---
// Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
// Built by ArnettX1 · x1scroll.io
