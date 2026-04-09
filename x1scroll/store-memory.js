#!/usr/bin/env node
'use strict';

/**
 * store-memory.js — Update agent memory CID on-chain
 * agent-memory-program | x1scroll.io
 *
 * Program ID: ECgaMEwH4KLSz3awDo1vz84mSrx5n6h1ZCrbmunB5UxB
 * Fee: 0.001 XNT
 *
 * Usage:
 *   node store-memory.js --keypair ./my-wallet.json --cid <ipfs-cid> [--rpc <url>]
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
const FEE_STORE_MEMORY = 1_000_000; // 0.001 XNT

const DISCRIMINATOR = crypto
  .createHash('sha256')
  .update('global:store_memory')
  .digest()
  .slice(0, 8);

function encodeString(s) {
  const bytes  = Buffer.from(s, 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([prefix, bytes]);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out  = { keypair: null, cid: null, rpc: 'https://x1scroll.io/rpc' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keypair') out.keypair = args[++i];
    if (args[i] === '--name')    out.name    = args[++i];
    if (args[i] === '--cid')     out.cid     = args[++i];
    if (args[i] === '--rpc')     out.rpc     = args[++i];
  }
  return out;
}

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(raw))      return Keypair.fromSecretKey(Uint8Array.from(raw));
  if (raw.secret_b58)          return Keypair.fromSecretKey(bs58decode(raw.secret_b58));
  if (typeof raw === 'string') return Keypair.fromSecretKey(bs58decode(raw));
  throw new Error('Unrecognized keypair format.');
}

function deriveAgentPDA(humanPubkey, agentName) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), humanPubkey.toBuffer(), Buffer.from(agentName, 'utf8')],
    PROGRAM_ID
  );
}

async function pollConfirm(conn, sig) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const status = await conn.getSignatureStatuses([sig]);
    const s = status?.value?.[0];
    if (s && !s.err && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return;
    if (s?.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
  }
  throw new Error('Confirmation timeout.');
}

async function main() {
  const args = parseArgs();
  if (!args.keypair || !args.cid) {
    console.error('Usage: node store-memory.js --keypair <path> --cid <ipfs-cid> [--rpc <url>]');
    process.exit(1);
  }
  if (args.cid.length > 64) { console.error('--cid must be ≤ 64 chars'); process.exit(1); }

  const kp   = loadKeypair(path.resolve(args.keypair));
  const conn = new Connection(args.rpc, 'confirmed');
  const [agentPDA] = deriveAgentPDA(kp.publicKey, args.name);

  console.log(`\n🧠 Store Memory`);
  console.log(`   Wallet   : ${kp.publicKey.toBase58()}`);
  console.log(`   Agent PDA: ${agentPDA.toBase58()}`);
  console.log(`   CID      : ${args.cid}`);

  const agentAccount = await conn.getAccountInfo(agentPDA);
  if (!agentAccount) {
    console.error(`\n❌ No agent registered. Run register-agent.js first.`);
    process.exit(1);
  }

  // discriminator(8) + new_memory_cid(str)
  const data = Buffer.concat([DISCRIMINATOR, encodeString(args.cid)]);

  const keys = [
    { pubkey: kp.publicKey,            isSigner: true,  isWritable: true  }, // agent_authority
    { pubkey: agentPDA,                isSigner: false, isWritable: true  }, // agent_record
    { pubkey: TREASURY,                isSigner: false, isWritable: true  }, // treasury
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ];

  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: kp.publicKey }).add(ix);
  tx.sign(kp);

  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });

  console.log(`\n⏳ Confirming...`);
  await pollConfirm(conn, sig);

  console.log(`\n✅ Memory stored!`);
  console.log(`   TX : ${sig}`);
  console.log(`   CID: ${args.cid}`);
  console.log(`\n   Explorer: https://explorer.x1.xyz/tx/${sig}`);
}

main().catch(err => {
  console.error('\n❌ store-memory failed:', err.message || err);
  if (err.logs) { console.error('\nLogs:'); err.logs.forEach(l => console.error(' ', l)); }
  process.exit(1);
});
