#!/usr/bin/env node
'use strict';

/**
 * decision-write.js — Write an on-chain agent decision
 * Human-Agent Protocol v2 | x1scroll.io
 *
 * Usage:
 *   node decision-write.js --keypair ./my-wallet.json --type BUILD --message "Deployed API v2" [--cid <ipfs-cid>] [--rpc <url>]
 *
 * Types (examples): BUILD, DEPLOY, TRADE, VALIDATE, RESEARCH, DECISION
 * Message (branchLabel): max 32 chars
 * CID: optional IPFS CID (max 64 chars). Pass empty string or omit if none.
 *
 * Requirements:
 *   npm install @solana/web3.js bs58
 */

const fs     = require('fs');
const crypto = require('crypto');
const path   = require('path');

const {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} = require('@solana/web3.js');

const bs58 = require('bs58');
const bs58decode = (typeof bs58.decode === 'function') ? bs58.decode : bs58.default.decode;

// ── Protocol constants ────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey('ECgaMEwH4KLSz3awDo1vz84mSrx5n6h1ZCrbmunB5UxB');
const TREASURY   = new PublicKey('A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK');

// Anchor discriminator: sha256("global:decision_write")[0..8]
const DISCRIMINATOR = crypto
  .createHash('sha256')
  .update('global:decision_write')
  .digest()
  .slice(0, 8);

// ── Encoding helpers ──────────────────────────────────────────────────────────

// Fixed-size byte array: null-padded to exactly n bytes
function encodeFixed(s, n) {
  const buf = Buffer.alloc(n, 0);
  Buffer.from(s, 'utf8').copy(buf, 0, 0, n);
  return buf;
}

function encodeU32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

// ── Arg parser ────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const out  = {
    keypair: null,
    type: null,
    message: null,
    cid: '',
    rpc: 'https://x1scroll.io/rpc',
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keypair') out.keypair = args[++i];
    if (args[i] === '--type')    out.type    = args[++i];
    if (args[i] === '--message') out.message = args[++i];
    if (args[i] === '--name')    out.name    = args[++i];
    if (args[i] === '--cid')     out.cid     = args[++i];
    if (args[i] === '--rpc')     out.rpc     = args[++i];
  }
  return out;
}

// ── Load keypair (handles array, {secret_b58}, or bs58 string) ───────────────
function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(raw)) return Keypair.fromSecretKey(Uint8Array.from(raw));
  if (raw.secret_b58)     return Keypair.fromSecretKey(bs58decode(raw.secret_b58));
  if (typeof raw === 'string') return Keypair.fromSecretKey(bs58decode(raw));
  throw new Error('Unrecognized keypair format. Expected array, {secret_b58}, or bs58 string.');
}

// ── PDA derivation ────────────────────────────────────────────────────────────
function deriveAgentPDA(humanPubkey, agentName) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), humanPubkey.toBuffer(), Buffer.from(agentName, 'utf8')],
    PROGRAM_ID
  );
}

function deriveDecisionPDA(agentPDA, decisionHash) {
  // Seeds: [b"decision", agentRecordPDA, decisionHash(32 bytes)]
  return PublicKey.findProgramAddressSync(
    [Buffer.from('decision'), agentPDA.toBuffer(), decisionHash],
    PROGRAM_ID
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (!args.keypair || !args.type || !args.message) {
    console.error('Usage: node decision-write.js --keypair <path> --type <TYPE> --message "<text>" [--cid <ipfs-cid>] [--rpc <url>]');
    process.exit(1);
  }

  const keypairPath = path.resolve(args.keypair);
  if (!fs.existsSync(keypairPath)) {
    console.error(`Keypair file not found: ${keypairPath}`);
    process.exit(1);
  }

  // Truncate to fixed-array max sizes
  const branchLabel = args.type.slice(0, 32);
  const cid         = (args.cid || '').slice(0, 64);
  const timestamp   = Date.now();

  console.log(`\n📝 X1 Decision Write`);
  console.log(`   Program : ${PROGRAM_ID.toBase58()}`);
  console.log(`   RPC     : ${args.rpc}`);

  const kp   = loadKeypair(keypairPath);
  const conn = new Connection(args.rpc, 'confirmed');

  console.log(`\n🔑 Wallet  : ${kp.publicKey.toBase58()}`);

  // Verify agent is registered
  const [agentPDA] = deriveAgentPDA(kp.publicKey, args.name);
  const agentAccount = await conn.getAccountInfo(agentPDA);
  if (!agentAccount) {
    console.error(`\n❌ No agent registered for this wallet. Run register-agent.js first.`);
    process.exit(1);
  }

  // Compute decision_hash = sha256(JSON.stringify({ cid, branchLabel, timestamp }))
  const decisionHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ cid, branchLabel, timestamp }))
    .digest(); // 32 bytes

  const [decisionPDA] = deriveDecisionPDA(agentPDA, decisionHash);

  console.log(`   Agent PDA    : ${agentPDA.toBase58()}`);
  console.log(`   Decision PDA : ${decisionPDA.toBase58()}`);
  console.log(`\n   Type    : ${branchLabel}`);
  console.log(`   Message : ${args.message}`);
  if (cid) console.log(`   CID     : ${cid}`);

  // Instruction data layout (matches on-chain DecisionRecord struct):
  // [discriminator(8)] [branch_label[u8;32]] [cid[u8;64]] [decision_hash[u8;32]]
  // [parent_hash[u8;32]] [outcome(u8)] [confidence(u32 LE)]
  const data = Buffer.concat([
    DISCRIMINATOR,
    encodeFixed(branchLabel, 32),   // branch_label: [u8;32]
    encodeFixed(cid, 64),           // cid: [u8;64]
    decisionHash,                   // decision_hash: [u8;32]
    Buffer.alloc(32),               // parent_hash: [u8;32] — zeros = no parent
    Buffer.from([1]),               // outcome: 1 = executed
    encodeU32(10000),               // confidence: 10000 = 100% (basis points, u32 LE)
  ]);

  const keys = [
    { pubkey: kp.publicKey,            isSigner: true,  isWritable: true  }, // agent_authority
    { pubkey: agentPDA,                isSigner: false, isWritable: true  }, // agent_record
    { pubkey: decisionPDA,             isSigner: false, isWritable: true  }, // decision_record (init)
    { pubkey: TREASURY,                isSigner: false, isWritable: true  }, // treasury
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ];

  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: kp.publicKey,
  }).add(ix);

  tx.sign(kp);

  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  console.log(`\n⏳ Confirming... (polling, ~5s)`);

  // Poll for confirmation — avoids WebSocket 405 errors on proxied RPCs
  let confirmed = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await conn.getSignatureStatuses([sig]);
    const s = status?.value?.[0];
    if (s && !s.err && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) {
      confirmed = true;
      break;
    }
    if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
  }
  if (!confirmed) throw new Error('Confirmation timeout — check explorer manually.');

  console.log(`\n✅ Decision written!`);
  console.log(`   TX           : ${sig}`);
  console.log(`   Decision PDA : ${decisionPDA.toBase58()}`);
  console.log(`   Hash         : ${decisionHash.toString('hex')}`);
  console.log(`\n   Explorer: https://explorer.x1.xyz/tx/${sig}`);
}

main().catch(err => {
  console.error('\n❌ Decision write failed:', err.message || err);
  if (err.logs) {
    console.error('\nProgram logs:');
    err.logs.forEach(l => console.error(' ', l));
  }
  process.exit(1);
});
