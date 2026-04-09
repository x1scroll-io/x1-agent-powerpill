# x1scroll Agent Scripts

Standalone scripts for interacting with the X1 agent-memory program.  
No SDK version drama. Raw `@solana/web3.js` only.

## Program

- **ID:** `ECgaMEwH4KLSz3awDo1vz84mSrx5n6h1ZCrbmunB5UxB`
- **Treasury:** `GmvrL1ymC9ENuQCUqymC9robGa9t9L59AbFiwhDDd4Ld`
- **Network:** X1 Mainnet

## ⚠️ PDA Seed Structure (Critical — read before integrating)

The AgentRecord PDA is derived from **three seeds**:

```
["agent", wallet_pubkey_bytes, agent_name_utf8_bytes]
```

This was confirmed by Cyberdyne (Theo) on 2026-04-09 via reverse-engineering the live program. All scripts in this repo use the correct seed structure as of v2.2.0.

> Previous versions used `["agent", wallet_pubkey_bytes]` — **this was wrong** and produced incorrect PDAs. If you have an older integration, update to use the name seed.

## Setup

```bash
npm install
```

## register-agent.js

Register your wallet as an agent on-chain. Fee: **0.05 XNT**.

```bash
node x1scroll/register-agent.js \
  --keypair ./my-wallet.json \
  --name "my-agent-name" \
  [--memory-cid <ipfs-cid>] \
  [--manifest-cid <ipfs-cid>] \
  [--rpc https://x1scroll.io/rpc]
```

- `--keypair` — path to your wallet JSON (Solana array format)
- `--name` — agent name, max 32 chars. **Must match exactly in all future calls** — it's part of your PDA seed
- `--memory-cid` — optional IPFS CID for initial memory state (max 64 chars)
- `--manifest-cid` — optional IPFS CID for context manifest (max 64 chars)

Already registered? The script detects this and exits cleanly with your existing PDA.

## decision-write.js

Write a decision entry on-chain. Lightweight on-chain log for agent reasoning. Fee: **~0.001 XNT**.

```bash
node x1scroll/decision-write.js \
  --keypair ./my-wallet.json \
  --name "my-agent-name" \
  --type "trade" \
  --message "Bought XNT at 0.34 — RSI oversold signal" \
  [--cid <ipfs-cid>] \
  [--rpc https://x1scroll.io/rpc]
```

- `--name` must match the name used at registration (same PDA derivation)

## store-memory.js

Update your agent's memory CID. Fee: **0.001 XNT**.

```bash
node x1scroll/store-memory.js \
  --keypair ./my-wallet.json \
  --name "my-agent-name" \
  --cid <new-ipfs-cid> \
  [--rpc https://x1scroll.io/rpc]
```

⚠️ Known program limitation: fails if the AgentRecord account was initialized with a short placeholder CID (program lacks realloc). Use `register-agent.js` with your real CID at registration time to avoid this.

## Verify your agent is live

```bash
# Check on explorer
https://explorer.x1.xyz/address/<your-agent-PDA>

# Derive your PDA locally before registering
node -e "
const { PublicKey } = require('@solana/web3.js');
const PROG = new PublicKey('ECgaMEwH4KLSz3awDo1vz84mSrx5n6h1ZCrbmunB5UxB');
const wallet = new PublicKey('YOUR_WALLET_PUBKEY');
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from('agent'), wallet.toBuffer(), Buffer.from('YOUR_AGENT_NAME')],
  PROG
);
console.log('Your PDA will be:', pda.toBase58());
"
```

## Notes

- All scripts use polling for confirmation — no WebSocket required
- Works with proxied RPCs (`https://x1scroll.io/rpc` recommended — our archival node)
- Confirmed working on X1 mainnet as of 2026-04-09
- Cyberdyne (Theo) was the first external team to register — TX: 4xZy... PDA: 9SAV...
