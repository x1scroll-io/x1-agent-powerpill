#!/usr/bin/env node
/**
 * strategy-template.js
 * TEMPLATE ONLY — Price monitoring + buy/sell trigger structure for X1/xDEX.
 *
 * ⚠️  This is a TEMPLATE. It does NOT execute any trades.
 *     Replace all "YOUR_*" placeholders before use.
 *     NEVER commit private keys to version control.
 *
 * Usage: node strategy-template.js
 */

// ─── Configuration ─────────────────────────────────────────────────────────
const CONFIG = {
  rpcUrl:        process.env.X1_RPC_URL       || 'https://rpc.x1.xyz',
  walletAddress: process.env.WALLET_ADDRESS   || 'YOUR_WALLET_ADDRESS',
  poolId:        process.env.XDEX_POOL_ID     || 'YOUR_POOL_ID',

  // Price triggers
  buyBelowUsd:   parseFloat(process.env.BUY_BELOW  || '0.0005'),  // Buy when price drops below this
  sellAboveUsd:  parseFloat(process.env.SELL_ABOVE || '0.0010'),  // Sell when price rises above this

  // Trade size (in native XNT)
  tradeAmountXnt: parseFloat(process.env.TRADE_AMOUNT || '1.0'),

  // Loop interval (ms)
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000', 10),

  // Safety: minimum XNT balance to keep (gas reserve)
  minGasReserveXnt: 0.05,
};

const XDEX_API = 'https://api.xdex.xyz';

// ─── RPC Helper ────────────────────────────────────────────────────────────
async function rpc(method, params = []) {
  const res = await fetch(CONFIG.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

// ─── Wallet Balance Check ──────────────────────────────────────────────────
async function getWalletBalance(address) {
  const lamports = await rpc('getBalance', [address]);
  return lamports / 1e9; // Convert to XNT
}

// ─── Price Fetch ───────────────────────────────────────────────────────────
async function getCurrentPrice() {
  const url = `${XDEX_API}/api/xendex/pool/${CONFIG.poolId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`xDEX API error: ${res.status}`);
  const data = await res.json();

  // Normalize price field — xDEX API may vary
  const price = data?.price ?? data?.tokenPrice ?? data?.priceUsd ?? null;
  if (!price) throw new Error('Could not parse price from xDEX response');
  return parseFloat(price);
}

// ─── Swap Execution (PSEUDOCODE — fill in your keypair loader) ─────────────
async function executeSwap({ direction, amountXnt }) {
  /**
   * TEMPLATE — Replace with real keypair loading and swap execution.
   *
   * Steps:
   *  1. Load keypair from secure source (never hardcode):
   *       const keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(
   *         fs.readFileSync(process.env.KEYPAIR_PATH)
   *       )));
   *
   *  2. Prepare swap via xDEX API:
   *       POST https://api.xdex.xyz/api/xendex/swap/prepare
   *       Body: { poolId, inputMint, outputMint, amount, slippage, userPublicKey }
   *
   *  3. Deserialize and sign the returned transaction:
   *       const tx = VersionedTransaction.deserialize(Buffer.from(swapData.transaction, 'base64'));
   *       tx.sign([keypair]);
   *
   *  4. Send and confirm:
   *       const sig = await connection.sendRawTransaction(tx.serialize());
   *       await connection.confirmTransaction(sig);
   */

  console.log(`   [SWAP TEMPLATE] Would execute: ${direction} ${amountXnt} XNT`);
  console.log(`   → Replace this function with real swap logic before trading.`);

  // Return a mock result for template purposes
  return { success: false, reason: 'TEMPLATE — not implemented' };
}

// ─── Buy/Sell Triggers ─────────────────────────────────────────────────────
function shouldBuy(price) {
  return price <= CONFIG.buyBelowUsd;
}

function shouldSell(price) {
  return price >= CONFIG.sellAboveUsd;
}

// ─── Main Monitoring Loop ──────────────────────────────────────────────────
async function main() {
  console.log(`\n⚡ X1 Strategy Template`);
  console.log(`   Wallet:     ${CONFIG.walletAddress}`);
  console.log(`   Pool:       ${CONFIG.poolId}`);
  console.log(`   Buy below:  $${CONFIG.buyBelowUsd}`);
  console.log(`   Sell above: $${CONFIG.sellAboveUsd}`);
  console.log(`   Trade size: ${CONFIG.tradeAmountXnt} XNT`);
  console.log(`   Poll every: ${CONFIG.pollIntervalMs / 1000}s`);
  console.log(`\n   ⚠️  TEMPLATE MODE — no real trades will execute.\n`);

  let lastPrice   = null;
  let loopCount   = 0;

  while (true) {
    loopCount++;
    try {
      // 1. Check wallet balance (gas safety)
      const balance = await getWalletBalance(CONFIG.walletAddress);
      if (balance < CONFIG.minGasReserveXnt) {
        console.log(`   [${new Date().toISOString()}] ⛽ LOW GAS: ${balance.toFixed(4)} XNT — skipping cycle`);
        await sleep(CONFIG.pollIntervalMs);
        continue;
      }

      // 2. Fetch current price
      const price = await getCurrentPrice();
      const change = lastPrice ? (((price - lastPrice) / lastPrice) * 100).toFixed(2) : '—';
      console.log(`   [${new Date().toISOString()}] Price: $${price.toFixed(6)}  Δ${change}%  Balance: ${balance.toFixed(4)} XNT`);

      // 3. Evaluate triggers
      if (shouldBuy(price) && balance >= CONFIG.tradeAmountXnt + CONFIG.minGasReserveXnt) {
        console.log(`   🟢 BUY TRIGGER at $${price.toFixed(6)}`);
        const result = await executeSwap({ direction: 'BUY', amountXnt: CONFIG.tradeAmountXnt });
        console.log(`   Swap result:`, result);
      } else if (shouldSell(price)) {
        console.log(`   🔴 SELL TRIGGER at $${price.toFixed(6)}`);
        const result = await executeSwap({ direction: 'SELL', amountXnt: CONFIG.tradeAmountXnt });
        console.log(`   Swap result:`, result);
      } else {
        console.log(`   ⏳ Holding — price between triggers`);
      }

      lastPrice = price;
    } catch (err) {
      console.error(`   ⚠️  Error in loop ${loopCount}: ${err.message}`);
    }

    await sleep(CONFIG.pollIntervalMs);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

// ---
// Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
// Built by ArnettX1 · x1scroll.io
