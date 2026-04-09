#!/usr/bin/env node
/**
 * check-wallet-portfolio.js
 * Show full portfolio for an X1 wallet:
 *   - Native XNT balance
 *   - All SPL token balances (Token + Token-2022)
 *   - USDC.X balance highlighted
 *   - USD value estimate via xDEX price API
 *
 * Usage: node check-wallet-portfolio.js [wallet_address]
 * Example: node check-wallet-portfolio.js YOUR_WALLET_ADDRESS
 */

const RPC_URL    = process.env.X1_RPC_URL      || 'https://rpc.x1.xyz';
const WALLET     = process.argv[2]
               || process.env.WALLET_ADDRESS
               || 'YOUR_WALLET_ADDRESS';

const XDEX_PRICE = 'https://api.xdex.xyz/api/token-price/price?network=X1+Mainnet&token_address=';

// Known token mints on X1
const KNOWN_TOKENS = {
  // Add known mints here for symbol resolution
  // 'MINT_ADDRESS': { symbol: 'USDC.X', name: 'USD Coin (X1)', decimals: 6 },
};

const TOKEN_PROGRAM   = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN22_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

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

async function getPrice(mint) {
  try {
    const res = await fetch(XDEX_PRICE + mint, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price =
      data?.price ??
      data?.data?.price ??
      data?.usdPrice ??
      data?.priceUsd ??
      null;
    return price ? parseFloat(price) : null;
  } catch {
    return null;
  }
}

async function getMintMetadata(mint) {
  try {
    const result = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
    if (!result?.value) return {};
    const info = result.value.data?.parsed?.info;
    if (!info) return {};
    // Token-2022 tokenMetadata extension
    const extensions = info.extensions || [];
    for (const ext of extensions) {
      if (ext.extension === 'tokenMetadata') {
        return {
          name: ext.state?.name || ext.name || null,
          symbol: ext.state?.symbol || ext.symbol || null,
        };
      }
    }
    return {};
  } catch {
    return {};
  }
}

async function main() {
  if (WALLET === 'YOUR_WALLET_ADDRESS') {
    console.error('Usage: node check-wallet-portfolio.js <wallet_address>');
    console.error('Or set WALLET_ADDRESS env var.');
    process.exit(1);
  }

  console.log(`\n💼 Wallet Portfolio`);
  console.log(`   Address: ${WALLET}`);
  console.log(`   RPC:     ${RPC_URL}\n`);

  // Native XNT balance
  const lamports = await rpc('getBalance', [WALLET]);
  const xntBalance = lamports / 1e9;
  const xntPrice = await getPrice('XNT'); // fill in XNT mint if known
  const xntUsd = xntPrice ? (xntBalance * xntPrice).toFixed(2) : null;

  console.log(`   ◎ XNT (Native)`);
  console.log(`     Balance: ${xntBalance.toFixed(6)} XNT`);
  if (xntPrice) console.log(`     Price:   $${xntPrice.toFixed(6)}`);
  if (xntUsd)   console.log(`     Value:   ~$${xntUsd}`);
  console.log();

  // SPL token accounts
  let accounts = [];
  for (const prog of [TOKEN_PROGRAM, TOKEN22_PROGRAM]) {
    try {
      const res = await rpc('getTokenAccountsByOwner', [
        WALLET,
        { programId: prog },
        { encoding: 'jsonParsed' },
      ]);
      if (res?.value) accounts.push(...res.value);
    } catch (e) {
      console.warn(`   Warning: could not fetch tokens from ${prog}: ${e.message}`);
    }
  }

  console.log(`   SPL Tokens (${accounts.length} accounts found)\n`);

  let totalUsd = xntUsd ? parseFloat(xntUsd) : 0;

  const tokens = accounts
    .map((acc) => {
      const info = acc.account.data?.parsed?.info;
      if (!info) return null;
      const mint = info.mint;
      const amount = parseFloat(info.tokenAmount?.uiAmountString || '0');
      const decimals = info.tokenAmount?.decimals ?? 0;
      return { mint, amount, decimals, accountPubkey: acc.pubkey };
    })
    .filter(Boolean)
    .filter((t) => t.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (tokens.length === 0) {
    console.log('   No SPL token balances found.');
  }

  for (const token of tokens) {
    const known = KNOWN_TOKENS[token.mint];
    let symbol = known?.symbol || null;
    let name   = known?.name   || null;

    if (!symbol) {
      const meta = await getMintMetadata(token.mint);
      symbol = meta.symbol || null;
      name   = meta.name   || null;
    }

    const label = symbol
      ? `${symbol}${name ? ` (${name})` : ''}`
      : `Unknown token`;

    const price = await getPrice(token.mint);
    const usdVal = price ? (token.amount * price).toFixed(2) : null;
    if (usdVal) totalUsd += parseFloat(usdVal);

    const isUsdc = symbol?.toUpperCase().includes('USDC');

    console.log(`   ${isUsdc ? '💵' : '🪙'} ${label}`);
    console.log(`     Mint:    ${token.mint}`);
    console.log(`     Balance: ${token.amount.toLocaleString()} ${symbol || ''}`);
    if (price)  console.log(`     Price:   $${price.toFixed(6)}`);
    if (usdVal) console.log(`     Value:   ~$${usdVal}`);
    console.log();

    // Throttle to avoid rate limits
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`   ─────────────────────────────────`);
  console.log(`   Total Portfolio Value: ~$${totalUsd.toFixed(2)}\n`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// ---
// Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
// Built by ArnettX1 · x1scroll.io
