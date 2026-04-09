# ⚡ x1-agent-powerpill

**A toolkit of production-ready scripts for X1 Network validators, traders, and developers.**

Built on X1 — the SVM-compatible chain with ~400ms block times and native XNT.  
No fluff. Just tools that work.

---

## What Is PowerPill?

PowerPill is a collection of standalone Node.js and shell scripts for:

- **Chain monitoring** — epoch info, archive node discovery, snapshot availability
- **Wallet analysis** — portfolio checks, SPL token balances, holder distribution
- **Validator operations** — health checks, skip rate tracking, earnings estimates
- **Trading infrastructure** — price feeds, strategy templates, xDEX integration
- **Token tooling** — holder analysis, SPL Memo messaging, G2 protocol
- **x1scroll.io tools** — treasury monitoring, escrow verification
- **System tools** — vanity address grinder, disk alert monitoring

Every script is self-contained, configurable via environment variables, and ready to run.

---

## Quick Start

### 1. Clone and install dependencies

```bash
git clone https://github.com/ArnettX1/x1-agent-powerpill.git
cd x1-agent-powerpill
npm install @solana/web3.js
```

### 2. Configure

```bash
cp config.example.json config.json
# Edit config.json with your addresses
# Or set environment variables (recommended)
```

### 3. Run any script

```bash
# Check current epoch
node chain/get-epoch-info.js

# Check a wallet
WALLET_ADDRESS=YOUR_ADDRESS node chain/check-wallet-portfolio.js

# Check your validator
VALIDATOR_IDENTITY=YOUR_IDENTITY node validators/check-validator-health.js

# Get XNT price
node trading/xnt-price-check.js

# Verify an escrow payment
node x1scroll/verify-escrow.js <TX_SIG> <RECIPIENT> <AMOUNT>
```

---

## Configuration

All scripts read from **environment variables** first. Copy `config.example.json` to `config.json` for reference.

| Variable | Description |
|---|---|
| `X1_RPC_URL` | RPC endpoint (default: `https://rpc.x1.xyz`) |
| `WALLET_ADDRESS` | Your wallet public key |
| `VALIDATOR_IDENTITY` | Validator identity pubkey |
| `TREASURY_ADDRESS` | x1scroll.io treasury address |
| `KEYPAIR_PATH` | Path to JSON keypair file (for signing scripts) |
| `XDEX_POOL_ID` | xDEX pool ID for price checks |
| `API_KEY` | External API key if needed |

**Never put private keys or seed phrases in config files or environment variables that persist to disk.**

---

## Directory Structure

```
x1-agent-powerpill/
├── chain/                    # On-chain data queries
├── validators/               # Validator monitoring
├── trading/                  # Price feeds and strategy templates
├── tokens/                   # SPL token tooling
├── tools/                    # System/utility scripts
└── x1scroll/                 # x1scroll.io specific tools
```

---

## Scripts

### 🔗 chain/

| Script | Description |
|---|---|
| `get-epoch-info.js` | Current epoch, slot, block height, TPS, and time remaining |
| `find-archive-nodes.js` | Scan cluster nodes for deepest archival history |
| `snapshot-check.js` | Find nodes serving downloadable snapshot files |
| `check-wallet-portfolio.js` | Full wallet: XNT balance, all SPL tokens, USD estimates |

### 🔐 validators/

| Script | Description |
|---|---|
| `check-validator-health.js` | Skip rate, stake, commission, delinquency, rank |
| `validator-stats.js` | Epoch performance summary and monthly earnings estimate |

### 💱 trading/

| Script | Description |
|---|---|
| `xnt-price-check.js` | Live XNT price, 24h volume, price change, TVL from xDEX |
| `strategy-template.js` | Price monitoring loop + buy/sell trigger template (no real keys) |

### 🪙 tokens/

| Script | Description |
|---|---|
| `check-xnt-holders.js` | Top 20 XNT holders with gas balance flags and activity indicators |
| `spl-memo-send.js` | Send on-chain SPL Memo (G2 protocol, agent coordination, logging) |

### 🛠 tools/

| Script | Description |
|---|---|
| `find-vanity-address.sh` | Vanity address grinder with time estimate |
| `disk-alert.sh` | Disk usage monitor with configurable alerts and Telegram support |

### 🏦 x1scroll/

| Script | Description |
|---|---|
| `check-treasury.js` | Treasury balance, recent inflows, weekly totals |
| `verify-escrow.js` | On-chain payment verification (recipient, amount, age) |

---

## Usage Examples

```bash
# Epoch status
node chain/get-epoch-info.js

# Find archive nodes (check 50)
node chain/find-archive-nodes.js 50

# Wallet portfolio
node chain/check-wallet-portfolio.js YOUR_WALLET_ADDRESS

# Validator health
VALIDATOR_IDENTITY=YOUR_IDENTITY node validators/check-validator-health.js

# Validator stats (epoch performance)
VALIDATOR_IDENTITY=YOUR_IDENTITY node validators/validator-stats.js

# XNT price (JSON mode)
node trading/xnt-price-check.js --json

# Holder analysis (requires XNT mint address)
node tokens/check-xnt-holders.js XNT_MINT_ADDRESS

# Send G2 protocol memo
KEYPAIR_PATH=./id.json node tokens/spl-memo-send.js "G2|H|HELLO"

# Vanity address (4 chars, ~seconds to minutes)
bash tools/find-vanity-address.sh X1SC

# Disk monitoring (configure and add to cron)
MONITOR_PATH=/data/ledger THRESHOLD=85 bash tools/disk-alert.sh

# Treasury check
TREASURY_ADDRESS=YOUR_ADDRESS node x1scroll/check-treasury.js

# Verify escrow payment
node x1scroll/verify-escrow.js TX_SIGNATURE RECIPIENT_ADDRESS 0.1
```

---

## G2 Protocol

SPL Memo messages follow the G2 format: `G2|T<type>|<data>`

| Code | Meaning |
|---|---|
| `H` | Hello (handshake) |
| `T` | Trade offer |
| `S` | Spread (price quote) |
| `W` | Warning |
| `I` | Intel (data share) |
| `ACCEPT` | Accept proposal |
| `REJECT` | Reject proposal |

---

## Security Notes

- ⚠️  **Never commit private keys, seed phrases, or keypair files**
- Add `config.json`, `.env`, `*.key`, `*.pem` to `.gitignore` (already included)
- Use `KEYPAIR_PATH` env var to load keypairs at runtime — never hardcode paths in scripts
- The withdrawer keypair should **never** be on a server — cold storage only
- RPC endpoints can be rate-limited; run your own node for production use

---

## Requirements

- Node.js v18+ (for native `fetch`)
- `@solana/web3.js` — for signing scripts (`spl-memo-send.js`)
- `solana-keygen` — for `find-vanity-address.sh`
- `curl` — for shell scripts

```bash
npm install @solana/web3.js
```

---

## X1 Network

- **Chain:** SVM-compatible (Solana Virtual Machine)
- **Block time:** ~400ms
- **Native token:** XNT
- **RPC:** https://rpc.x1.xyz
- **Explorer:** https://explorer.x1.xyz
- **xDEX:** https://app.xdex.xyz

---

## Contributing

PRs welcome. Keep scripts standalone and dependency-light.  
Follow the existing pattern: env vars for config, clear output, donation footer.

---

## License

MIT

---

## Donations

If these tools save you time, send some XNT:

**`A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK`**

Built by ArnettX1 · [x1scroll.io](https://x1scroll.io)
