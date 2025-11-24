# Prompt & Adapter Mini-Market (Prompt / LoRA 小市场)

## 项目定位
- 一句话（USP 升级）：PromptGuard™ — 购买前仅看摘要，购买后本地解密全文的 Prompt/LoRA 市场（Seal‑compatible 工作流）。
  - 英文：PromptGuard — Partial‑Reveal Encryption for Prompts/LoRA. Buy to unlock the full content.

### 要讲清楚的点
- 问题：
  - Prompt / LoRA 多在私下交易；
  - 没有所有权记录、没有持续分润机制；
  - 平台关停后内容难以长期访问。
- 解决方案：
  - Walrus 做持久存储：Prompt/LoRA 不依赖中心化服务器；
  - Sui 上只存所有权 + 价格，做到简易但可信的交易；
  - PromptGuard（Seal‑compatible mock）：发布时前端本地 AES‑GCM 加密，仅把“摘要 + 加密后 blobId”写入清单；购买成功后在浏览器本地解密，未购买只能看到摘要；
  - 后续可扩展：真实 Seal/KMS、买家公钥封装密钥、版税、订阅等。

## 最小闭环（Demo）
1) 上架（创作者）
- 连接钱包（Sui Wallet / Ethos）。
- 填写：名称、描述、类型（Prompt / LoRA）、价格。
- 上传文件：前端调用 Walrus Publisher API → 得到 `blob_id`。
- 调用 Move 合约 `list_asset(name, kind, price, blob_id)`：链上创建 Asset 对象。

2) 浏览市场（任何人）
- 前端从链上读取所有 Asset 列表：名称 / 类型 / 价格 / 作者地址 / 是否已售出。

3) 购买（买家）
- 点击「Buy」→ 调用 `buy_asset(asset_id, payment)`：用 SUI 支付给卖家；标记已售出，记录买家地址。
- 交易成功后：
  - 若未加密：显示 Walrus 链接并下载。
  - 若启用 PromptGuard：弹出解密窗口（Decrypt & Download）。前端使用交易摘要 txDigest 解锁清单中的 keyBox（演示用途），本地解密后下载明文。

> PromptGuard 采用 Seal‑compatible 的客户端加密工作流（hackathon 演示版，未集成真实 KMS）。

## Move 合约（Testnet）
- 包 ID：`0x111fecc5b7ca3ad3747435437259a7209a8aad0b51c8026b28945ce65f81d645`
- 模块：`prompt_market`，函数：`list_asset` / `buy_asset`
- 数据结构：`Asset { creator, owner, walrus_id: vector<u8>, price: u64, sold: bool, kind: u8, name: vector<u8> }`

## 前端结构（Next.js）
- 路由：`/market`（列表）、`/sell`（上架）
- 关键：
  - WalletProvider（@mysten/dapp-kit）
  - WalrusUploader（调用 Publisher，返回 `blob_id`）
  - SuiClient（list_asset / buy_asset；用 getObjectsByType 拉列表）
  - PromptGuard：
    - `web/lib/crypto.ts` AES‑GCM 加密/解密 + PBKDF2 keyBox；
    - `/sell` 新增 PromptGuard 开关（默认开）与摘要输入（自动生成可编辑）；
    - `/market` 卡片显示 Summary + Sealed 徽标；购买后显示解密弹窗。

## Walrus 对接要点
- 上传：Publisher（本地或自建）接收二进制内容并返回 `blob_id`。
- 读取：Aggregator `https://aggregator.walrus-testnet.walrus.space/v1/<blob_id>` 返回 JSON/原文件。
- 部署：使用 walrus-sites 将静态站点发布为 Walrus Site，通过 SuiNS + wal.app 访问。

PromptGuard 细节：
- 密文格式：`[12字节IV] + ciphertext`，作为一个 Walrus blob 上传；
- 清单（metadata）字段：
  - `sealed: true`（驱动 UI 显示 Sealed 与解密流程）
  - `description` 存放 20–80 字摘要（购买前可见）
  - `contentBlobId` 指向加密后 blobId
  - `keyBox`（推荐）：PBKDF2(passphrase=txDigest, salt=`salt:${contentBlobId}`) → AES‑GCM 包裹数据密钥；
  - `keyBoxLegacy`（demo 兼容）：使用固定口令 `'TX_DIGEST_REQUIRED'` 包裹数据密钥；前端购买后仍要求输入 `txDigest` 才可继续操作；
  - `requiresTxDigest: true`（UI 提示与流程控制）。

Seal 服务（Demo）
- 路由：`/api/seal/release`（Node 运行时）
- 入参：`metaId`、`contentBlobId`、`txDigest`、`keyBoxLegacy`
- 逻辑：服务端用 PBKDF2(passphrase=`'TX_DIGEST_REQUIRED'`, salt=`salt:${contentBlobId}`) 解包 `keyBoxLegacy`，返回数据密钥 `keyB64`；生产环境应替换为真实 Seal/KMS 与链上校验。

注意：这是演示级 Seal（mock）。真实上线可替换为：
- 使用买家公钥对数据密钥做封装；
-/或由合约/服务端依据所有权策略下发密钥；
- 与 Seal/KMS 服务整合实现强访问控制。

## 演示步骤
1) 本地 `pnpm run dev`；钱包切换到 testnet。
2) 在 `/sell` 上传并上架；或直接在 `/market` 购买链上示例资产。
3) 购买成功弹窗显示 `blob_id` 与下载按钮。

## Testnet 配置
- `.env.local` 示例（已提供默认 testnet 包 ID）：
  - `NEXT_PUBLIC_PACKAGE_ID=0x111fecc5b7ca3ad3747435437259a7209a8aad0b51c8026b28945ce65f81d645`
  - `NEXT_PUBLIC_WALRUS_PUBLISHER_URL=http://127.0.0.1:31415` 或你的 Publisher 地址
  - `NEXT_PUBLIC_WALRUS_USE_MOCK=0`（启用真实 Walrus 存储）
- 启动 Publisher（testnet）：见 `web/README_DEPLOY.md` 的 Real Publisher 小节。
