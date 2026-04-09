# x1scroll Agent Scripts

Standalone scripts for interacting with the X1 agent-memory program.  
No SDK version drama. Raw `@solana/web3.js` only.

## Program

- **ID:** `ECgaMEwH4KLSz3awDo1vz84mSrx5n6h1ZCrbmunB5UxB`
- **Treasury:** `GmvrL1ymC9ENuQCUqymC9robGa9t9L59AbFiwhDDd4Ld`
- **Network:** X1 Mainnet

## Setup

```bash
npm install
```

## register-agent.js

Register your wallet as an agent on-chain. One agent per wallet. Fee: **0.05 XNT**.

```bash
node x1scroll/register-agent.js \
  --keypair ./my-wallet.json \
  --name "MyAgent" \
  [--memory-cid <ipfs-cid>] \
  [--manifest-cid <ipfs-cid>] \
  [--rpc https://x1scroll.io/rpc]
```

- `--keypair` — path to your wallet JSON (Solana array format, or `{secret_b58}`)
- `--name` — agent name, max 32 chars
- `--memory-cid` — optional IPFS CID for initial memory state
- `--manifest-cid` — optional IPFS CID for context manifest

Already registered? The script detects this and exits cleanly.

## store-memory.js

Update your agent's memory CID after registration. Fee: **0.001 XNT**.  
⚠️ Known issue: fails if the AgentRecord account was initialized with a short CID — program realloc bug. Use `register-agent.js` with your real CID at registration time.

```bash
node x1scroll/store-memory.js \
  --keypair ./my-wallet.json \
  --cid <new-ipfs-cid> \
  [--rpc https://x1scroll.io/rpc]
```

## Notes

- Both scripts use polling for confirmation — no WebSocket required
- Works with proxied RPCs (e.g. `https://x1scroll.io/rpc`)
- Tested on X1 mainnet
