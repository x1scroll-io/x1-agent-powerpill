#!/usr/bin/env node
/**
 * validator-stats.js
 * Epoch performance summary for an X1 validator.
 * Shows slots confirmed, skip rate trend, estimated monthly earnings.
 *
 * Usage: node validator-stats.js [validator_identity]
 * Example: node validator-stats.js YOUR_VALIDATOR_IDENTITY
 */

const RPC_URL  = process.env.X1_RPC_URL          || 'https://rpc.x1.xyz';
const IDENTITY = process.argv[2]
              || process.env.VALIDATOR_IDENTITY
              || 'YOUR_VALIDATOR_IDENTITY';

// Approximate epoch duration on X1 (~432,000 slots × 400ms = ~48 hours)
const SLOTS_PER_EPOCH   = 432_000;
const BLOCK_TIME_SEC    = 0.4;
const EPOCH_DURATION_HR = (SLOTS_PER_EPOCH * BLOCK_TIME_SEC) / 3600;
const EPOCHS_PER_MONTH  = (30 * 24) / EPOCH_DURATION_HR;

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

function formatXnt(lamports) {
  return (lamports / 1e9).toFixed(4) + ' XNT';
}

function skipRateLabel(rate) {
  if (rate > 10) return `${rate.toFixed(2)}% ⚠️  HIGH`;
  if (rate > 5)  return `${rate.toFixed(2)}% 🟡 ELEVATED`;
  return `${rate.toFixed(2)}% ✅`;
}

async function main() {
  if (IDENTITY === 'YOUR_VALIDATOR_IDENTITY') {
    console.error('Usage: node validator-stats.js <validator_identity>');
    console.error('Or set VALIDATOR_IDENTITY env var.');
    process.exit(1);
  }

  console.log(`\n📊 Validator Stats`);
  console.log(`   Identity: ${IDENTITY}`);
  console.log(`   RPC:      ${RPC_URL}\n`);

  const [voteAccounts, epochInfo, inflationReward] = await Promise.all([
    rpc('getVoteAccounts'),
    rpc('getEpochInfo'),
    rpc('getInflationReward', [[IDENTITY], { epoch: null }]).catch(() => null),
  ]);

  const allValidators = [
    ...voteAccounts.current.map((v) => ({ ...v, status: 'active' })),
    ...voteAccounts.delinquent.map((v) => ({ ...v, status: 'delinquent' })),
  ];

  const validator = allValidators.find((v) => v.nodePubkey === IDENTITY);
  if (!validator) {
    console.log('   ❌ Validator not found. Check identity pubkey.');
    process.exit(1);
  }

  const commission     = validator.commission;
  const activatedStake = parseInt(validator.activatedStake, 10);
  const epochCredits   = validator.epochCredits || [];

  // Current epoch credits
  const currentEpoch = epochInfo.epoch;
  const currentCredit = epochCredits.find((ec) => ec[0] === currentEpoch);
  const prevCredit    = epochCredits.find((ec) => ec[0] === currentEpoch - 1);

  // Credits earned this epoch
  let creditsThisEpoch = null;
  let skipRateThis     = null;
  if (currentCredit) {
    const earned = currentCredit[1] - currentCredit[2];
    creditsThisEpoch = earned;
    const possible   = currentCredit[2]; // slots attempted
    skipRateThis     = possible > 0 ? ((currentCredit[2] / (earned + currentCredit[2])) * 100) : 0;
  }

  // Skip rate trend (last 3 epochs)
  const trend = [];
  for (let i = epochCredits.length - 1; i >= Math.max(0, epochCredits.length - 4); i--) {
    const ec   = epochCredits[i];
    const prev = epochCredits[i - 1];
    if (!prev) continue;
    const earned = ec[1] - prev[1];
    const diff   = ec[2] - prev[2];
    const total  = earned + diff;
    const rate   = total > 0 ? (diff / total) * 100 : 0;
    trend.push({ epoch: ec[0], skipRate: rate, creditsEarned: earned });
  }
  trend.reverse();

  // Estimated monthly rewards
  // Inflation reward for last epoch (if available)
  const lastReward = inflationReward?.[0];
  let estimatedMonthlyXnt = null;
  if (lastReward?.amount) {
    const epochReward = lastReward.amount / 1e9;
    estimatedMonthlyXnt = (epochReward * EPOCHS_PER_MONTH).toFixed(4);
  }

  // Current epoch progress
  const slotIndex    = epochInfo.slotIndex;
  const slotsInEpoch = epochInfo.slotsInEpoch;
  const pct          = ((slotIndex / slotsInEpoch) * 100).toFixed(1);

  console.log(`   Epoch: ${currentEpoch}  (${pct}% complete)`);
  console.log(`   Slots confirmed this epoch: ${slotIndex.toLocaleString()} / ${slotsInEpoch.toLocaleString()}`);
  if (creditsThisEpoch !== null)
    console.log(`   Vote credits earned:        ${creditsThisEpoch.toLocaleString()}`);
  console.log(`   Activated stake:            ${(activatedStake / 1e9).toFixed(2)} XNT`);
  console.log(`   Commission:                 ${commission}%`);
  console.log();

  // Skip rate trend
  if (trend.length > 0) {
    console.log(`   Skip Rate Trend (recent epochs):`);
    for (const t of trend) {
      console.log(`     Epoch ${t.epoch}: ${skipRateLabel(t.skipRate)}  (${t.creditsEarned.toLocaleString()} credits)`);
    }
    console.log();
  }

  // Monthly earnings estimate
  if (estimatedMonthlyXnt) {
    console.log(`   💰 Estimated Monthly Earnings (at ${commission}% commission):`);
    console.log(`     Last epoch reward: ${lastReward.amount / 1e9} XNT`);
    console.log(`     Monthly estimate:  ~${estimatedMonthlyXnt} XNT`);
    console.log(`     (Based on ${EPOCHS_PER_MONTH.toFixed(1)} epochs/month)`);
  } else {
    console.log(`   💰 Monthly earnings: N/A (no recent inflation reward data)`);
    console.log(`     Tip: Run after an epoch boundary to see reward data.`);
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
