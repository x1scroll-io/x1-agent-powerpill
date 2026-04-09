#!/usr/bin/env node
/**
 * spl-memo-send.js
 * Send an SPL Memo transaction on-chain (X1 / SVM networks).
 * Attach any text to a transaction — for G2 protocol messages,
 * agent coordination, provenance logging, on-chain annotations.
 *
 * Requires: @solana/web3.js
 * Install:  npm install @solana/web3.js
 *
 * Usage:
 *   node spl-memo-send.js "G2|H|HELLO"
 *   node spl-memo-send.js "G2|I|price=0.00042"
 *   KEYPAIR_PATH=/path/to/keypair.json node spl-memo-send.js "your memo text"
 *
 * ⚠️  NEVER commit your keypair file to version control.
 *     Add *.json to .gitignore if using JSON keypair files.
 *     Prefer KEYPAIR_PATH env var over hardcoded paths.
 */

import { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { readFileSync } from 'fs';

// ─── Configuration ─────────────────────────────────────────────────────────
const RPC_URL      = process.env.X1_RPC_URL   || 'https://rpc.x1.xyz';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || null;

// SPL Memo Program ID (same on all SVM chains)
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// ─── G2 Protocol Message Types ─────────────────────────────────────────────
/**
 * G2 Protocol format: G2|T<type>|<data>
 *
 * Types:
 *   H      — Hello (handshake)
 *   T      — Trade offer
 *   S      — Spread (price quote)
 *   W      — Warning
 *   I      — Intel (data share)
 *   ACCEPT — Accept proposal
 *   REJECT — Reject proposal
 *
 * Examples:
 *   "G2|H|HELLO"
 *   "G2|I|xnt_price=0.00042|epoch=142"
 *   "G2|W|validator_skip_rate=12.5"
 *   "G2|ACCEPT|task_id=abc123"
 */

// ─── Helpers ────────────────────────────────────────────────────────────────
function loadKeypair(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(raw));
}

function buildMemoInstruction(memoText, signerPublicKey) {
  return new TransactionInstruction({
    keys: [{ pubkey: signerPublicKey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoText, 'utf8'),
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function sendMemo(memoText, keypair) {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log(`\n📝 SPL Memo Send`);
  console.log(`   RPC:    ${RPC_URL}`);
  console.log(`   Signer: ${keypair.publicKey.toBase58()}`);
  console.log(`   Memo:   "${memoText}"`);
  console.log();

  // Check balance
  const lamports = await connection.getBalance(keypair.publicKey);
  const balance  = lamports / 1e9;
  console.log(`   Balance: ${balance.toFixed(6)} XNT`);

  if (balance < 0.001) {
    console.error('   ❌ Insufficient balance. Need at least 0.001 XNT for fees.');
    process.exit(1);
  }

  // Build transaction
  const tx = new Transaction();
  tx.add(buildMemoInstruction(memoText, keypair.publicKey));

  console.log(`   Sending...`);
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: 'confirmed',
  });

  console.log(`   ✅ Confirmed!`);
  console.log(`   Signature: ${signature}`);
  console.log(`   Explorer:  https://explorer.x1.xyz/tx/${signature}`);
  console.log();

  return signature;
}

async function main() {
  const memoText = process.argv[2];
  if (!memoText) {
    console.error('Usage: node spl-memo-send.js "<memo text>"');
    console.error('');
    console.error('G2 Protocol examples:');
    console.error('  node spl-memo-send.js "G2|H|HELLO"');
    console.error('  node spl-memo-send.js "G2|I|data_point=value"');
    console.error('  node spl-memo-send.js "G2|W|alert_message"');
    process.exit(1);
  }

  if (!KEYPAIR_PATH) {
    console.error('❌ KEYPAIR_PATH env var not set.');
    console.error('   Set it to the path of your JSON keypair file:');
    console.error('   export KEYPAIR_PATH=/path/to/keypair.json');
    console.error('');
    console.error('   ⚠️  NEVER commit keypair files to version control.');
    process.exit(1);
  }

  let keypair;
  try {
    keypair = loadKeypair(KEYPAIR_PATH);
  } catch (err) {
    console.error(`❌ Failed to load keypair from ${KEYPAIR_PATH}: ${err.message}`);
    process.exit(1);
  }

  await sendMemo(memoText, keypair);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// ---
// Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
// Built by ArnettX1 · x1scroll.io
