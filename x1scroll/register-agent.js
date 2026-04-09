#!/usr/bin/env node
'use strict';

/**
 * register-agent.js — Standalone X1 Agent Registration
 * agent-memory-program | x1scroll.io
 *
 * Program ID: ECgaMEwH4KLSz3awDo1vz84mSrx5n6h1ZCrbmunB5UxB
 * Fee: 0.05 XNT (50,000,000 lamports)
 *
 * Usage:
 *   node register-agent.js \
 *     --keypair ./my-wallet.json \
 *     --name "MyAgent" \
 *     --memory-cid <ipfs-cid> \
 *     --manifest-cid <ipfs-cid> \
 *     [--rpc <url>]
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
const FEE_REGISTER_AGENT = 50_000_000; // 0.05 XNT

// Anchor discriminator: sha256("global:register_agent")[0..8]
const DISCRIMINATOR = crypto
  .createHash('sha256')
  .update('global:register_agent')
  .digest()
  .slice(0, 8);

// ── Borsh string encoding: 4-byte LE length prefix + UTF-8 bytes ──────────────
function encodeString(s) {
  const bytes  = Buffer.from(s, 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([prefix, bytes]);
}

// ── Arg parser ────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const out  = {
    keypair: null,
    name: null,
    memoryCid: '',
    manifestCid: '',
    rpc: 'https://x1scroll.io/rpc',
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keypair')      out.keypair      = args[++i];
    if (args[i] === '--name')         out.name         = args[++i];
    if (args[i] === '--memory-cid')   out.memoryCid    = args[++i];
    if (args[i] === '--manifest-cid') out.manifestCid  = args[++i];
    if (args[i] === '--rpc')          out.rpc          = args[++i];
  }
  return out;
}

// ── Load keypair (handles array, {secret_b58}, or bs58 string) ───────────────
function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(raw))  return Keypair.fromSecretKey(Uint8Array.from(raw));
  if (raw.secret_b58)      return Keypair.fromSecretKey(bs58decode(raw.secret_b58));
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

// ── Poll confirmation (no WebSocket) ─────────────────────────────────────────
async function pollConfirm(conn, sig) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await conn.getSignatureStatuses([sig]);
    const s = status?.value?.[0];
    if (s && !s.err && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return;
    if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
  }
  throw new Error('Confirmation timeout — check explorer manually.');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (!args.keypair || !args.name) {
    console.error([
      'Usage: node register-agent.js \\',
      '  --keypair <path> \\',
      '  --name "<AgentName>" \\',
      '  [--memory-cid <ipfs-cid>] \\',
      '  [--manifest-cid <ipfs-cid>] \\',
      '  [--rpc <url>]',
    ].join('\n'));
    process.exit(1);
  }

  const keypairPath = path.resolve(args.keypair);
  if (!fs.existsSync(keypairPath)) {
    console.error(`Keypair file not found: ${keypairPath}`);
    process.exit(1);
  }

  // Validate lengths
  if (args.name.length > 32) { console.error('--name must be ≤ 32 chars'); process.exit(1); }
  if (args.memoryCid && args.memoryCid.length > 64)   { console.error('--memory-cid must be ≤ 64 chars'); process.exit(1); }
  if (args.manifestCid && args.manifestCid.length > 64) { console.error('--manifest-cid must be ≤ 64 chars'); process.exit(1); }

  // memory_cid and manifest_cid must be non-empty (program requires it)
  const memoryCid   = args.memoryCid   || 'QmDefault';
  const manifestCid = args.manifestCid || 'QmDefault';

  console.log(`\n🤖 X1 Agent Registration`);
  console.log(`   Program : ${PROGRAM_ID.toBase58()}`);
  console.log(`   Treasury: ${TREASURY.toBase58()}`);
  console.log(`   Fee     : 0.05 XNT`);
  console.log(`   RPC     : ${args.rpc}`);

  const kp   = loadKeypair(keypairPath);
  const conn = new Connection(args.rpc, 'confirmed');

  console.log(`\n🔑 Wallet  : ${kp.publicKey.toBase58()}`);

  // Check balance
  const balance = await conn.getBalance(kp.publicKey);
  console.log(`   Balance : ${(balance / 1e9).toFixed(6)} XNT`);

  if (balance < FEE_REGISTER_AGENT + 5_000_000) {
    console.error(`\n❌ Insufficient balance. Need at least 0.055 XNT (0.05 fee + rent + tx fee).`);
    process.exit(1);
  }

  // Derive PDA
  const [agentPDA] = deriveAgentPDA(kp.publicKey, args.name);
  console.log(`\n📍 Agent PDA: ${agentPDA.toBase58()}`);

  // Check if already registered
  const existing = await conn.getAccountInfo(agentPDA);
  if (existing) {
    console.log(`\n✅ Agent already registered at this wallet.`);
    console.log(`   PDA: ${agentPDA.toBase58()}`);
    process.exit(0);
  }

  console.log(`\n📝 Registering agent: "${args.name}"`);
  console.log(`   memory_cid  : ${memoryCid}`);
  console.log(`   manifest_cid: ${manifestCid}`);

  // Build instruction data:
  // discriminator(8) + agent_id(str) + memory_cid(str) + manifest_cid(str)
  const data = Buffer.concat([
    DISCRIMINATOR,
    encodeString(args.name),
    encodeString(memoryCid),
    encodeString(manifestCid),
  ]);

  const keys = [
    { pubkey: kp.publicKey,            isSigner: true,  isWritable: true  }, // agent_authority
    { pubkey: agentPDA,                isSigner: false, isWritable: true  }, // agent_record
    { pubkey: TREASURY,                isSigner: false, isWritable: true  }, // treasury
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ];

  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });

  const { blockhash } = await conn.getLatestBlockhash('finalized');
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: kp.publicKey }).add(ix);
  tx.sign(kp);

  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'finalized',
    maxRetries: 5,
  });

  console.log(`\n⏳ Confirming... (polling)`);
  await pollConfirm(conn, sig);

  console.log(`\n✅ Agent registered!`);
  console.log(`   TX   : ${sig}`);
  console.log(`   PDA  : ${agentPDA.toBase58()}`);
  console.log(`   Name : ${args.name}`);
  console.log(`\n   Explorer: https://explorer.x1.xyz/tx/${sig}`);
  console.log(`\n   Next: node store-memory.js --keypair ${args.keypair} --cid <new-cid>`);
}

main().catch(err => {
  console.error('\n❌ Registration failed:', err.message || err);
  if (err.logs) { console.error('\nLogs:'); err.logs.forEach(l => console.error(' ', l)); }
  process.exit(1);
});
