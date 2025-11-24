# Deploy to Walrus (walrus-sites)

This app is configured for static export and ready to publish via `walrus-sites`.

## Prerequisites
- Rust toolchain (cargo)
- walrus-sites `site-builder` binary
  - Option A: Build from source
    ```bash
    git clone https://github.com/MystenLabs/walrus-sites.git
    cd walrus-sites/site-builder
    cargo install --path .
    # ensures `~/.cargo/bin/site-builder` is on PATH
    ```
  - Option B: Build release binary
    ```bash
    git clone https://github.com/MystenLabs/walrus-sites.git
    cd walrus-sites
    cargo build -p site-builder --release
    # use ./target/release/site-builder
    ```

## Configure Context
- `sites-config.yaml` is provided in this folder with a `testnet` context.
- Adjust values as needed (e.g., custom fullnode or publisher endpoints).

```yaml
contexts:
  testnet:
    fullnode: https://fullnode.testnet.sui.io
```

## Build and Publish
From `web/`:

```bash
# 1) Fill .env
cp .env.example .env
# ensure NEXT_PUBLIC_PACKAGE_ID is set

# 2) Static export to ./dist
npm i
npm run build:static

# 3) Publish with walrus-sites
npm run publish:walrus
```

`site-builder` prints a `site-id` on success. Keep that as your demo URL reference per the walrus-sites docs.

## Notes
- This Next.js app uses `output: 'export'` and relative paths; it’s suitable for static hosting on Walrus.
- If you need another context (e.g. `devnet`), add it to `sites-config.yaml` and change the publish script accordingly.
- To customize parallelism or epochs, edit the `publish:walrus` script in `package.json`.

## Real Publisher (Testnet)

To enable real uploads from `/sell` instead of mock IDs, run a local Walrus Publisher and point the UI to it.

1) Start publisher (testnet) in `web/`:

```
mkdir -p .walrus-publisher-wallets
# Acquire some WAL on testnet for fees
./walrus --config ./client_config.yaml --context testnet get-wal --amount 500000000

# Start with small refill amounts (lower balance requirements)
./walrus \
  --config ./client_config.yaml --context testnet \
  publisher \
  --bind-address 127.0.0.1:8080 \
  --sub-wallets-dir ./.walrus-publisher-wallets \
  --n-clients 2 \
  --gas-refill-amount 10000000 \
  --wal-refill-amount 10000000 \
  --sub-wallets-min-balance 10000000
```

2) Point the app to the publisher by creating `.env.local` in `web/`:

```
NEXT_PUBLIC_PACKAGE_ID=<your testnet package id>
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=http://127.0.0.1:8080
NEXT_PUBLIC_WALRUS_USE_MOCK=0
```

3) Run `pnpm run dev` and use `/sell` to upload+list. The publisher returns a real `blob_id` used on-chain.
