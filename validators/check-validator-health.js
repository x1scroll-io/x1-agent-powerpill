#!/usr/bin/env node
/**
 * check-validator-health.js
 * Health check for an X1 validator by identity pubkey.
 * Reports: skip rate, stake, commission, delinquency status, rank.
 *
 * Usage: node check-validator-health.js [validator_identity]
 * Example: node check-validator-health.js YOUR_VALIDATOR_IDENTITY
 */

const RPC_URL  = process.env.X1_RPC_URL          || 'https://rpc.x1.xyz';
const IDENTITY = process.argv[2]
              || process.env.VALIDATOR_IDENTITY
              || 'YOUR_VALIDATOR_IDENTITY';

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

function formatStake(lamports) {
  const sol = lamports / 1e9;
  if (sol >= 1_000_000) return `${(sol / 1_000_000).toFixed(2)}M XNT`;
  if (sol >= 1_000)     return `${(sol / 1_000).toFixed(2)}K XNT`;
  return `${sol.toFixed(2)} XNT`;
}

async function main() {
  if (IDENTITY === 'YOUR_VALIDATOR_IDENTITY') {
    console.error('Usage: node check-validator-health.js <validator_identity>');
    console.error('Or set VALIDATOR_IDENTITY env var.');
    process.exit(1);
  }

  console.log(`\n🔐 Validator Health Check`);
  console.log(`   Identity: ${IDENTITY}`);
  console.log(`   RPC:      ${RPC_URL}\n`);

  const [voteAccounts, epochInfo] = await Promise.all([
    rpc('getVoteAccounts'),
    rpc('getEpochInfo'),
  ]);

  const allValidators = [
    ...voteAccounts.current.map((v) => ({ ...v, status: 'active' })),
    ...voteAccounts.delinquent.map((v) => ({ ...v, status: 'delinquent' })),
  ];

  const validator = allValidators.find((v) => v.nodePubkey === IDENTITY);

  if (!validator) {
    console.log(`   ❌ Validator not found in current vote accounts.`);
    console.log(`   Either the identity is incorrect or the validator has no stake.`);
    process.exit(1);
  }

  // Rank by activated stake (among active validators)
  const activeValidators = voteAccounts.current
    .slice()
    .sort((a, b) => b.activatedStake - a.activatedStake);

  const rank = activeValidators.findIndex((v) => v.nodePubkey === IDENTITY) + 1;

  const activatedStake = parseInt(validator.activatedStake, 10);
  const commission     = validator.commission;
  const epochCredits   = validator.epochCredits || [];

  // Skip rate: derived from epoch vote credits
  let skipRate = null;
  if (epochCredits.length >= 2) {
    const last   = epochCredits[epochCredits.length - 1];
    const prev   = epochCredits[epochCredits.length - 2];
    const earned = last[1] - prev[1];
    const diff   = last[2] - prev[2];
    const total  = earned + diff;
    skipRate = total > 0 ? ((diff / total) * 100).toFixed(2) : '0.00';
  }

  // Status indicators
  const statusIcon  = validator.status === 'delinquent' ? '🔴 DELINQUENT' : '🟢 Active';
  const skipIcon    = skipRate !== null
    ? (parseFloat(skipRate) > 10 ? '⚠️ ' : parseFloat(skipRate) > 5 ? '🟡' : '✅')
    : '❓';
  const rankDisplay = rank > 0 ? `#${rank} of ${activeValidators.length}` : 'N/A (delinquent)';

  console.log(`   Status:     ${statusIcon}`);
  console.log(`   Vote Acct:  ${validator.votePubkey}`);
  console.log(`   Stake:      ${formatStake(activatedStake)}`);
  console.log(`   Commission: ${commission}%`);
  console.log(`   Rank:       ${rankDisplay}`);
  console.log(`   Skip Rate:  ${skipIcon} ${skipRate !== null ? skipRate + '%' : 'N/A'}`);
  console.log(`   Root Slot:  ${validator.rootSlot?.toLocaleString() ?? 'N/A'}`);
  console.log(`   Last Vote:  ${validator.lastVote?.toLocaleString() ?? 'N/A'}`);
  console.log();

  // Epoch credits summary
  if (epochCredits.length > 0) {
    const latest = epochCredits[epochCredits.length - 1];
    console.log(`   Epoch Credits (last entry):`);
    console.log(`     Epoch:   ${latest[0]}`);
    console.log(`     Credits: ${latest[1].toLocaleString()}`);
    console.log(`     Prev:    ${latest[2].toLocaleString()}`);
    console.log();
  }

  // Health summary
  const issues = [];
  if (validator.status === 'delinquent') issues.push('⛔ Validator is DELINQUENT');
  if (skipRate !== null && parseFloat(skipRate) > 10) issues.push(`⚠️  High skip rate: ${skipRate}%`);
  if (commission > 10) issues.push(`ℹ️  Commission is ${commission}% (high)`);

  if (issues.length > 0) {
    console.log(`   ⚠️  Health Issues:`);
    issues.forEach((i) => console.log(`     ${i}`));
  } else {
    console.log(`   ✅ Validator appears healthy.`);
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
