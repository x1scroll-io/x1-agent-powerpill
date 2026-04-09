#!/usr/bin/env node
/**
 * xnt-price-check.js
 * Fetch current XNT price data from the xDEX API.
 * Shows price, 24h volume, price change, TVL.
 * Clean output suitable for agent consumption.
 *
 * Usage: node xnt-price-check.js [--json]
 *   --json  Output raw JSON instead of formatted display
 */

const XDEX_BASE    = 'https://api.xdex.xyz';
const XDEX_POOL_ID = process.env.XDEX_POOL_ID || 'CAJeVEoSm1QQZccnCqYu9cnNF7TTD2fcUA3E5HQoxRvR'; // default XNT pool

const JSON_MODE = process.argv.includes('--json');

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function getPoolPrice() {
  const url = `${XDEX_BASE}/api/xendex/pool/${XDEX_POOL_ID}`;
  return fetchWithTimeout(url);
}

async function getMarketStats() {
  const url = `${XDEX_BASE}/api/xendex/pools?limit=50`;
  try {
    return await fetchWithTimeout(url);
  } catch {
    return null;
  }
}

function formatUsd(val) {
  if (!val && val !== 0) return 'N/A';
  const n = parseFloat(val);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(6)}`;
}

function formatChange(val) {
  if (val === null || val === undefined) return 'N/A';
  const n = parseFloat(val);
  const icon = n > 0 ? '📈' : n < 0 ? '📉' : '➡️';
  return `${icon} ${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

async function main() {
  if (!JSON_MODE) {
    console.log(`\n💱 XNT Price Check — xDEX`);
    console.log(`   Pool: ${XDEX_POOL_ID}\n`);
  }

  let poolData;
  try {
    poolData = await getPoolPrice();
  } catch (err) {
    console.error(`Failed to fetch pool data: ${err.message}`);
    console.error('Check XDEX_POOL_ID env var or xDEX API availability.');
    process.exit(1);
  }

  // Normalize fields — xDEX API may vary
  const price       = poolData?.price ?? poolData?.tokenPrice ?? poolData?.priceUsd ?? null;
  const price24hAgo = poolData?.price24hAgo ?? null;
  const priceChange = poolData?.priceChange24h ??
    (price && price24hAgo ? ((price - price24hAgo) / price24hAgo) * 100 : null);
  const volume24h   = poolData?.volume24h ?? poolData?.volumeUsd24h ?? null;
  const tvl         = poolData?.tvl ?? poolData?.liquidityUsd ?? null;
  const tokenA      = poolData?.tokenA?.symbol ?? 'XNT';
  const tokenB      = poolData?.tokenB?.symbol ?? 'USDC';
  const lastUpdated = new Date().toISOString();

  if (JSON_MODE) {
    console.log(JSON.stringify({
      price,
      priceChange24h: priceChange,
      volume24h,
      tvl,
      tokenA,
      tokenB,
      poolId: XDEX_POOL_ID,
      source: 'xDEX',
      timestamp: lastUpdated,
      raw: poolData,
    }, null, 2));
    return;
  }

  console.log(`   Pair:          ${tokenA} / ${tokenB}`);
  console.log(`   Price:         ${price ? formatUsd(price) : 'N/A'}`);
  console.log(`   24h Change:    ${formatChange(priceChange)}`);
  console.log(`   24h Volume:    ${formatUsd(volume24h)}`);
  console.log(`   TVL:           ${formatUsd(tvl)}`);
  console.log(`   Last Updated:  ${lastUpdated}`);
  console.log();

  // Raw pool fields for debugging
  if (process.env.DEBUG === '1') {
    console.log('   Raw pool data:', JSON.stringify(poolData, null, 2));
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// ---
// Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
// Built by ArnettX1 · x1scroll.io
