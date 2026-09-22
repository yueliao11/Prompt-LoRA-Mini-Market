# Prompt & LoRA Mini‑Market — PromptGuard (Seal‑compatible Demo)

PromptMarket is a minimal, production‑oriented MVP for buying and selling AI Prompts and LoRA models with decentralized storage (Walrus) and on‑chain provenance (Sui). This demo integrates PromptGuard — summary‑only before purchase, decrypt locally after purchase — following a Seal‑compatible workflow.

- Frontend: Next.js (`/web`) with pages `/market` (browse/buy), `/sell` (list), `/profile` (my purchases & decrypt).
- Smart contracts: Sui Move (`/move/prompt_market`) on Sui testnet.
- Storage: Walrus Publisher/Aggregator; static hosting via Walrus Sites.

Why it matters
- Provable provenance: Walrus blob IDs + Sui events (AssetListed/AssetSold).
- PromptGuard: Buyers see only a short summary; after paying, decrypt locally to access full content.
- Defense‑in‑depth demo: Ciphertext lives on Walrus; keys never stored on chain; a minimal “Seal service” approves key release post‑purchase (demo route).

Live and IDs
- Live site (SuiNS → wal.app): https://promptmarket.wal.app/
- Sui testnet Package ID: `0x111fecc5b7ca3ad3747435437259a7209a8aad0b51c8026b28945ce65f81d645`
- Walrus Aggregator (testnet): https://aggregator.walrus-testnet.walrus.space

How it works
1) Client‑side seal: On `/sell`, when PromptGuard is enabled (default), the file is encrypted client‑side using AES‑GCM. Only ciphertext is uploaded to Walrus.
2) Manifest: Metadata written to Walrus contains summary + pointers only, e.g. `sealed: true`, `description` (summary), `contentBlobId` (ciphertext blob id), optional key wrapping fields (see below).
3) On‑chain listing: `list_asset(metaId, price, kind, name)` creates an Asset on Sui; contract stores price/ownership only — no plaintext or keys.
4) Post‑purchase key release (demo): After `buy_asset`, the UI requests a data key via `/api/seal/release` (demo “Seal service”), or unwraps with `txDigest` when available.
5) Local decrypt: Browser decrypts ciphertext locally and downloads the plaintext file.

What’s in PromptGuard (demo)
- Crypto (`web/lib/crypto.ts`): AES‑GCM with 12‑byte IV prefix; PBKDF2 for key wrapping; summary generator.
- Walrus utils (`web/lib/walrus.ts`): `uploadToWalrus`, `readMetadata`, `readBlobBytes` for raw ciphertext download.
- `/sell`: PromptGuard toggle (default on). Generates a summary for text files, encrypts locally, uploads ciphertext, writes manifest fields.
- `/market`: Sealed badge + summary on cards; after purchase, “Decrypt & Download” modal uses `txDigest` or demo Seal service.
- `/profile`: “My Purchases” lists owned assets; sealed items can be decrypted with `txDigest` from here as well.
- Demo Seal route: `web/app/api/seal/release/route.ts` unwraps a legacy demo keyBox server‑side and returns the data key (base64). Replace with real Seal/KMS in production.

Manifest fields (demo)
- `sealed: true`: Drives Sealed UI and decrypt path.
- `description`: Summary (20–80 chars), visible before purchase.
- `contentBlobId`: Walrus blob id of the ciphertext.
- `cipher: 'AES-GCM'`: Cipher used.
- `requiresTxDigest: true`: UI requires a purchase `txDigest` to proceed.
- `keyBox` (recommended path): PBKDF2(passphrase=`txDigest`, salt=`salt:${contentBlobId}`) → AES‑GCM wrap of the data key.
- `keyBoxLegacy` (demo compatibility): Wrap with a fixed passphrase `'TX_DIGEST_REQUIRED'`; the demo Seal service unwraps this server‑side after purchase to simulate approval.

Security note
- This is a hackathon‑grade Seal‑compatible demo. No real KMS; server route performs minimal checks. Replace `/api/seal/release` with a proper Seal/KMS + on‑chain verification in production. Decryption always occurs client‑side.

Run locally (quick start)
1) `cd web && npm i && npm run dev`
2) Create `.env.local` in `web/`:
   - `NEXT_PUBLIC_PACKAGE_ID=0x111fecc5b7ca3ad3747435437259a7209a8aad0b51c8026b28945ce65f81d645`
   - `NEXT_PUBLIC_WALRUS_PUBLISHER_URL=http://127.0.0.1:8080` (optional; mock when unset)
   - `NEXT_PUBLIC_WALRUS_USE_MOCK=0|1` (fallback to mock uploads)
   - `NEXT_PUBLIC_MARKET_INCLUDE_FAKE=1` (blend curated demo items on first page)
3) Switch wallet to Sui testnet.
4) Visit `/sell` to list (PromptGuard default on), `/market` to buy (Sealed badge + decrypt modal), `/profile` to decrypt from “My Purchases”.

Developer notes
- Contracts: see `/move/prompt_market` and on‑chain events `AssetListed`/`AssetSold`.
- Walrus: upload via Publisher; fetch via Aggregator `https://aggregator.walrus-testnet.walrus.space/v1/<blob_id>`.
- Demo Seal route: `POST /api/seal/release` with `{ metaId, contentBlobId, txDigest, keyBoxLegacy }` → `{ keyB64 }` (data key) → decrypt locally.

Deploy (Walrus Sites)
- See `web/README_DEPLOY.md` for static export + publish via `walrus-sites` and SuiNS binding.

Roadmap
- Replace demo route with real Seal/KMS and purchase verification.
- Add royalties/resale, attestations, watermarking/private access controls.

中文简介

本仓库包含 Prompt & LoRA 小市场（带 PromptGuard 演示版 Seal 工作流）：

- 上架页 `/sell`：默认启用 PromptGuard。文件先在前端 AES‑GCM 加密，再上传 Walrus；清单只写摘要+加密 blob id。
- 市场页 `/market`：Sealed 徽标与摘要预览；购买后弹出“Decrypt & Download”，用 `txDigest` 或演示 Seal 服务获取密钥并在本地解密下载。
- 个人页 `/profile`：在“已购”中同样可输入 `txDigest` 解密下载。

核心信息
- Testnet Package ID：`0x111fecc5b7ca3ad3747435437259a7209a8aad0b51c8026b28945ce65f81d645`
- Walrus Aggregator（testnet）：`https://aggregator.walrus-testnet.walrus.space`

更多细节见 `web/README_PRODUCT.md`。


## 🛠️ Related AI Developer Tools & Rate Limit Trackers

When running prompt batch generation and LoRA training pipelines, tracking LLM rate limits and quota resets prevents pipeline stalls:
- **[Codex Reset Status](https://codexresetstatus.com/)**: Real-time OpenAI Codex quota radar, 5-hour limit countdown clocks, and global reset tracker.
  - [5-Hour Limit Reset Countdown](https://codexresetstatus.com/codex/5-hour-limit)
  - [Global Timezone Reset Table](https://codexresetstatus.com/codex/reset-time)
  - [Codex Usage & Quota Calculator](https://codexresetstatus.com/calculator)
