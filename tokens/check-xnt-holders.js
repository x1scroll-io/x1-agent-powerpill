#!/usr/bin/env node
/**
 * check-xnt-holders.js
 * Analyze top XNT token holders on X1.
 * - Top 20 via getTokenLargestAccounts
 * - Shows token balance, native XNT gas balance, other SPL tokens
 * - Flags wallets with < 0.1 XNT (can't dump — no gas)
 * - Flags wallets with > 5 XNT gas (potential active sellers)
 *
 * Usage: node check-xnt-holders.js <xnt_mint_address>
 * Example: node check-xnt-holders.js XNT_MINT_ADDRESS_HERE
 */

const RPC_URL  = process.env.X1_RPC_URL || 'https://rpc.x1.xyz';
const XNT_MINT = process.argv[2] || process.env.XNT_MINT || 'YOUR_XNT_MINT_ADDRESS';

// Thresholds
const LOW_GAS_THRESHOLD  = 0.1;  // XNT — flagged as "can't dump"
const HIGH_GAS_THRESHOLD = 5.0;  // XNT — flagged as "potential seller"

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

async function getNativeBalance(address) {
  try {
    const lamports = await rpc('getBalance', [address]);
    return lamports / 1e9;
  } catch {
    return null;
  }
}

async function getOwnerFromTokenAccount(tokenAccount) {
  try {
    const result = await rpc('getAccountInfo', [tokenAccount, { encoding: 'jsonParsed' }]);
    return result?.value?.data?.parsed?.info?.owner ?? null;
  } catch {
    return null;
  }
}

async function getTokenCount(owner) {
  try {
    const TOKEN_PROGRAM   = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const TOKEN22_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
    let count = 0;
    for (const prog of [TOKEN_PROGRAM, TOKEN22_PROGRAM]) {
      const res = await rpc('getTokenAccountsByOwner', [
        owner,
        { programId: prog },
        { encoding: 'base64' },
      ]);
      if (res?.value) count += res.value.length;
    }
    return count;
  } catch {
    return null;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (XNT_MINT === 'YOUR_XNT_MINT_ADDRESS') {
    console.error('Usage: node check-xnt-holders.js <xnt_mint_address>');
    console.error('Or set XNT_MINT env var.');
    process.exit(1);
  }

  console.log(`\n👥 XNT Holder Analysis`);
  console.log(`   Mint:  ${XNT_MINT}`);
  console.log(`   RPC:   ${RPC_URL}\n`);

  // Get top holders
  const accounts = await rpc('getTokenLargestAccounts', [XNT_MINT]);
  if (!accounts?.value?.length) {
    console.log('   No holders found. Check mint address.');
    process.exit(1);
  }

  const holders = accounts.value.slice(0, 20);
  console.log(`   Top ${holders.length} holders:\n`);

  // Header
  console.log(
    '   #  ' +
    'Token Balance'.padEnd(18) +
    'XNT Gas'.padEnd(14) +
    'SPL Accts'.padEnd(12) +
    'Flag'.padEnd(18) +
    'Owner'
  );
  console.log('   ' + '─'.repeat(100));

  const summary = { lowGas: 0, highGas: 0, normal: 0 };

  for (let i = 0; i < holders.length; i++) {
    const holder  = holders[i];
    const tokenAmt = parseFloat(holder.uiAmountString || holder.uiAmount || '0');
    const tokenAcct = holder.address;

    // Resolve owner from token account
    const owner = await getOwnerFromTokenAccount(tokenAcct);
    await sleep(100);

    // Get native gas balance
    const gasBalance = owner ? await getNativeBalance(owner) : null;
    await sleep(100);

    // Get token diversity
    const tokenCount = owner ? await getTokenCount(owner) : null;
    await sleep(150);

    // Flags
    let flag = '—';
    let flagEmoji = ' ';
    if (gasBalance !== null) {
      if (gasBalance < LOW_GAS_THRESHOLD) {
        flag = '⛽ LOW GAS';
        flagEmoji = '⚠️ ';
        summary.lowGas++;
      } else if (gasBalance > HIGH_GAS_THRESHOLD) {
        flag = '💰 ACTIVE';
        flagEmoji = '👀';
        summary.highGas++;
      } else {
        flag = '✅ Normal';
        summary.normal++;
      }
    }

    const gasDisplay   = gasBalance !== null ? `${gasBalance.toFixed(3)} XNT` : 'N/A';
    const tokenDisplay = `${tokenAmt.toLocaleString()} XNT`;
    const countDisplay = tokenCount !== null ? `${tokenCount} tokens` : 'N/A';
    const ownerDisplay = owner ? owner.slice(0, 20) + '...' : tokenAcct.slice(0, 20) + '...';
    const rank         = String(i + 1).padStart(2, ' ');

    console.log(
      `   ${rank} ` +
      tokenDisplay.padEnd(18) +
      gasDisplay.padEnd(14) +
      countDisplay.padEnd(12) +
      flag.padEnd(18) +
      ownerDisplay
    );

    // Show full owner address on next line if available
    if (owner) {
      console.log(`       └─ Owner: ${owner}`);
    }
  }

  console.log('\n   ' + '─'.repeat(100));
  console.log(`\n   📊 Summary:`);
  console.log(`     ⛽ Low gas (< ${LOW_GAS_THRESHOLD} XNT) — can't dump:  ${summary.lowGas}`);
  console.log(`     💰 High gas (> ${HIGH_GAS_THRESHOLD} XNT) — active:     ${summary.highGas}`);
  console.log(`     ✅ Normal:                                ${summary.normal}`);
  console.log();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// ---
// Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
// Built by ArnettX1 · x1scroll.io
