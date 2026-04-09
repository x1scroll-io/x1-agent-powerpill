#!/usr/bin/env bash
# find-vanity-address.sh
# Wrapper around solana-keygen grind to find a vanity address with a given prefix.
# Shows estimated time based on CPU cores before starting.
#
# Usage:   bash find-vanity-address.sh <PREFIX> [case_insensitive]
# Example: bash find-vanity-address.sh FRK5
# Example: bash find-vanity-address.sh x1sc insensitive
#
# Requirements: solana-keygen (install Solana CLI tools)
# Output: keypair saved to ./<PREFIX>-keypair.json

set -euo pipefail

PREFIX="${1:-}"
CASE_FLAG="${2:-}"

# ─── Validate Input ──────────────────────────────────────────────────────────
if [ -z "$PREFIX" ]; then
  echo "Usage: bash find-vanity-address.sh <PREFIX> [insensitive]"
  echo ""
  echo "Examples:"
  echo "  bash find-vanity-address.sh FRK5"
  echo "  bash find-vanity-address.sh x1scroll insensitive"
  echo ""
  echo "Notes:"
  echo "  - Base58 characters only: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
  echo "  - Each additional character ~58x harder"
  echo "  - Longer prefixes = days/weeks/longer"
  exit 1
fi

# Check base58 characters
if echo "$PREFIX" | grep -qP '[^123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]'; then
  echo "❌ Invalid characters in prefix. Use Base58 only (no 0, O, I, l)."
  exit 1
fi

# Check solana-keygen is available
if ! command -v solana-keygen &>/dev/null; then
  echo "❌ solana-keygen not found. Install the Solana CLI:"
  echo "   sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
  exit 1
fi

# ─── Estimate Time ──────────────────────────────────────────────────────────
CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
PREFIX_LEN=${#PREFIX}

# Probability: 1/58^N for case-sensitive, ~1/33^N for case-insensitive
if [ "${CASE_FLAG}" = "insensitive" ]; then
  CHARSET=33
else
  CHARSET=58
fi

# Rough estimates based on typical grind speeds (~100K-500K attempts/sec/core)
ATTEMPTS_PER_SEC_PER_CORE=200000
TOTAL_SPEED=$((CORES * ATTEMPTS_PER_SEC_PER_CORE))

# 58^N or 33^N possibilities
POSSIBILITIES=1
for ((i=0; i<PREFIX_LEN; i++)); do
  POSSIBILITIES=$((POSSIBILITIES * CHARSET))
done

EXPECTED_SEC=$((POSSIBILITIES / TOTAL_SPEED))

echo ""
echo "🔍 Vanity Address Grind"
echo "   Prefix:       $PREFIX"
echo "   Length:       $PREFIX_LEN characters"
echo "   Case:         $([ "${CASE_FLAG}" = "insensitive" ] && echo 'insensitive' || echo 'sensitive')"
echo "   CPU Cores:    $CORES"
echo "   Search space: ~$POSSIBILITIES combinations"
echo ""

if [ $EXPECTED_SEC -lt 60 ]; then
  echo "   Estimated time: ~${EXPECTED_SEC}s"
elif [ $EXPECTED_SEC -lt 3600 ]; then
  echo "   Estimated time: ~$((EXPECTED_SEC / 60)) minutes"
elif [ $EXPECTED_SEC -lt 86400 ]; then
  echo "   Estimated time: ~$((EXPECTED_SEC / 3600)) hours"
elif [ $EXPECTED_SEC -lt 604800 ]; then
  echo "   Estimated time: ~$((EXPECTED_SEC / 86400)) days"
else
  echo "   Estimated time: ~$((EXPECTED_SEC / 604800)) weeks (consider a shorter prefix)"
fi

echo ""
echo "   Press Ctrl+C to cancel at any time."
echo "   Output will be saved to: ./${PREFIX}-keypair.json"
echo ""

# ─── Build Command ───────────────────────────────────────────────────────────
OUTFILE="${PREFIX}-keypair.json"

GRIND_CMD="solana-keygen grind --starts-with ${PREFIX}:1"

if [ "${CASE_FLAG}" = "insensitive" ]; then
  GRIND_CMD="${GRIND_CMD} --ignore-case"
fi

if [ $CORES -gt 1 ]; then
  GRIND_CMD="${GRIND_CMD} --num-threads ${CORES}"
fi

# ─── Run ─────────────────────────────────────────────────────────────────────
echo "   Running: ${GRIND_CMD}"
echo "   ─────────────────────────────────────────────────────"
echo ""

START_TIME=$(date +%s)
eval "$GRIND_CMD"
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "   ✅ Done in ${ELAPSED}s"
echo ""

# Find the generated keypair file
FOUND=$(ls ${PREFIX}*.json 2>/dev/null | head -1)
if [ -n "$FOUND" ]; then
  PUBKEY=$(solana-keygen pubkey "$FOUND" 2>/dev/null || echo "unknown")
  echo "   Keypair file: $FOUND"
  echo "   Public key:   $PUBKEY"
  echo ""
  echo "   ⚠️  SECURE YOUR KEYPAIR:"
  echo "      - Move it to a safe location immediately"
  echo "      - Add *.json to .gitignore"
  echo "      - NEVER commit keypair files to git"
  echo "      - Back up to cold storage"
fi

echo ""

# ---
# Donations accepted in XNT: A1TRS3i2g62Zf6K4vybsW4JLx8wifqSoThyTQqXNaLDK
# Built by ArnettX1 · x1scroll.io
