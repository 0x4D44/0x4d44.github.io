#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUST="$ROOT/rust"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v cargo >/dev/null || { echo "cargo is required" >&2; exit 1; }
command -v wasm-pack >/dev/null || { echo "wasm-pack 0.13.1 is required" >&2; exit 1; }

cd "$RUST"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run --quiet --release -p darwin-cli -- verify
cargo run --quiet --release -p darwin-cli -- trace > "$ROOT/reports/ancestor-trace.json"
DARWIN_REPORT_JSON="$ROOT/reports/mutational-neighbourhood.json" cargo run --quiet --release -p darwin-cli -- neighbourhood all >/dev/null
DARWIN_ASSAY_JSON="$ROOT/reports/evolutionary-assays.json" cargo run --quiet --release -p darwin-cli -- assay all >/dev/null
DARWIN_SEARCH_JSON="$ROOT/reports/replicator-search.json" cargo run --quiet --release -p darwin-cli -- search >/dev/null
cargo run --quiet --release -p darwin-cli -- benchmark > "$ROOT/reports/native-benchmark.json"
cargo run --quiet --release -p darwin-cli -- vectors > "$ROOT/reports/rng-vectors.json"

wasm-pack build "$RUST/crates/darwin-wasm" \
  --target web \
  --release \
  --out-dir "$TMP/pkg" \
  --out-name darwin_wasm

mkdir -p "$ROOT/pkg"
cp "$TMP/pkg/darwin_wasm.js" "$ROOT/pkg/darwin_wasm.js"
cp "$TMP/pkg/darwin_wasm_bg.wasm" "$ROOT/pkg/darwin_wasm_bg.wasm"
cp "$TMP/pkg/darwin_wasm.d.ts" "$ROOT/pkg/darwin_wasm.d.ts"
cp "$TMP/pkg/darwin_wasm_bg.wasm.d.ts" "$ROOT/pkg/darwin_wasm_bg.wasm.d.ts"
node "$ROOT/scripts/write-build-info.mjs"
node "$ROOT/scripts/render-evidence.mjs"

echo "Built and verified The Darwin Machine (${ROOT#*/})."
