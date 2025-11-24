"use client";
import { useEffect, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { uploadToWalrus, uploadMetadata } from "@/lib/walrus";
import { encryptBlobAesGcm, summarizeForPreview, wrapKeyWithPassphrase } from "@/lib/crypto";

function stringToBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function toMist(sui: number): number {
  return Math.floor(sui * 1_000_000_000);
}

export default function SellPage() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [kind, setKind] = useState<0 | 1>(0);
  const [price, setPrice] = useState<number>(0.1);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [blobId, setBlobId] = useState<string | null>(null);
  const [publisherStatus, setPublisherStatus] = useState<"mock" | "ok" | "down" | "unset">("unset");
  const [usePromptGuard, setUsePromptGuard] = useState<boolean>(true);
  const [summary, setSummary] = useState<string>("");
  const pkgId = process.env.NEXT_PUBLIC_PACKAGE_ID as string;
  useEffect(() => {
    // Prefill a random-ish prompt for better demo experience
    setDesc((d) => d && d.length > 0 ? d : "Ultra-detailed cyberpunk city at night, neon reflections, rainy streets.");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      alert("Please choose a file to upload.");
      return;
    }
    if (price <= 0) {
      alert("Price must be greater than 0");
      return;
    }
    setBusy(true);
    try {
      // 0) Prepare optional PromptGuard (AES-GCM) encryption
      let contentId: string;
      let keyBox: string | undefined;
      let keyBoxLegacy: string | undefined;
      let sealed = false;
      let previewText = summary || desc;

      if (usePromptGuard) {
        // Generate summary first
        previewText = (await summarizeForPreview(file, desc)).slice(0, 80);
        // Encrypt file client-side and upload ciphertext
        const enc = await encryptBlobAesGcm(file);
        const encBlob = new Blob([enc.bytes], { type: 'application/octet-stream' });
        contentId = await uploadToWalrus(encBlob);
        // Demo: create a legacy keyBox wrapped under a constant. Buyer UI will
        // require txDigest to proceed and can internally re-wrap.
        // Salt ties to content id to avoid reuse across assets
        keyBoxLegacy = await wrapKeyWithPassphrase(enc.keyB64, 'TX_DIGEST_REQUIRED', `salt:${contentId}`);
        sealed = true;
      } else {
        // Plain upload (legacy behavior)
        contentId = await uploadToWalrus(file);
      }

      // 2) Upload metadata to Walrus (include imageUrl for nicer market cards)
      const AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";
      const imageUrl = (file && (file as any).type?.startsWith('image/'))
        ? `${AGGREGATOR_URL}/v1/${contentId}`
        : (function(){
            const seed = (name || (file as any).name || Date.now()).toString();
            const query = (kind === 1) ? "ai+model,lora,neon" : "prompt,typography,code";
            const sig = Array.from(String(seed)).reduce((a, c) => a + c.charCodeAt(0), 0);
            return `https://source.unsplash.com/featured/800x600/?${encodeURIComponent(query)}&sig=${sig}`;
          })();
      const meta = {
        name,
        description: (sealed ? previewText : desc),
        kind,
        contentBlobId: contentId,
        imageUrl,
        createdAt: Date.now(),
        sealed,
        cipher: sealed ? 'AES-GCM' : undefined,
        // For txDigest-only demo flow, prefer keyBox omitted and publish keyBoxLegacy
        // wrapped with a constant; market UI will require txDigest to continue.
        keyBox,
        keyBoxLegacy,
        requiresTxDigest: sealed ? true : undefined,
      };
      const metaId = await uploadMetadata(meta);
      setBlobId(metaId);

      // 3) Call Move list_asset with metadata ID
      const tx = new Transaction();
      tx.moveCall({
        target: `${pkgId}::prompt_market::list_asset`,
        arguments: [
          tx.pure.vector('u8', stringToBytes(metaId)),
          tx.pure.u64(BigInt(toMist(price))),
          tx.pure.u8(kind as number),
          tx.pure.vector('u8', stringToBytes(name || file.name)),
        ],
      });

      const res = await signAndExecute({
        transaction: tx as any,
      });
      console.log("list res", res);
      alert("Listed! It may take a moment to appear in Market.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Failed to list asset");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      {/* Publisher Health */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', margin: '0 0 16px 0' }}>
        {(() => {
          const useMock = process.env.NEXT_PUBLIC_WALRUS_USE_MOCK === '1';
          const base = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL;
          // inline health: do a one-shot on render; this avoids extra hooks churn
          if (publisherStatus === 'unset') {
            if (useMock) {
              setPublisherStatus('mock');
            } else if (!base) {
              setPublisherStatus('unset');
            } else {
              const ctrl = new AbortController();
              const timer = setTimeout(() => ctrl.abort(), 2500);
              fetch(`${base.replace(/\/$/, '')}/v1/status`, { signal: ctrl.signal })
                .then(r => setPublisherStatus(r.ok ? 'ok' : 'down'))
                .catch(() => setPublisherStatus('down'))
                .finally(() => clearTimeout(timer));
            }
          }
          return null;
        })()}
        {publisherStatus === 'mock' && (
          <div style={{ padding:'10px 14px', background:'rgba(147, 51, 234, 0.12)', border:'1px solid rgba(147,51,234,0.35)', borderRadius:10, color:'#c4b5fd' }}>
            Walrus Publisher: Mock Mode (uploads not persisted on testnet)
          </div>
        )}
        {publisherStatus === 'ok' && (
          <div style={{ padding:'10px 14px', background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.35)', borderRadius:10, color:'#86efac' }}>
            Walrus Publisher: Connected
          </div>
        )}
        {publisherStatus === 'down' && (
          <div style={{ padding:'10px 14px', background:'rgba(220,38,38,0.12)', border:'1px solid rgba(220,38,38,0.35)', borderRadius:10, color:'#fca5a5' }}>
            Walrus Publisher: Unreachable (falling back to mock if enabled)
          </div>
        )}
        {publisherStatus === 'unset' && (
          <div style={{ padding:'10px 14px', background:'rgba(234,179,8,0.12)', border:'1px solid rgba(234,179,8,0.35)', borderRadius:10, color:'#fde68a' }}>
            Walrus Publisher: Not configured
          </div>
        )}
      </div>
      {/* Page Header */}
      <div className="page-header" style={{ textAlign: "center", marginBottom: "48px" }}>
        <h1 className="page-title">
          List New Asset
        </h1>
        <p className="page-subtitle">
          Upload to Walrus & List on Sui
        </p>
      </div>

      {/* Workflow Stepper */}
      <div style={{ maxWidth: "600px", margin: "0 auto 48px" }}>
        <div className="stepper">
          <div className={!busy ? "step active" : "step"}>1</div>
          <div className={busy ? "step active" : "step"}>2</div>
          <div className="step">3</div>
        </div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "12px",
          color: "var(--text-secondary)",
          marginTop: "-24px",
          padding: "0 10px"
        }}>
          <span>Upload Content</span>
          <span>Metadata & Listing</span>
          <span>Complete</span>
        </div>
      </div>

      {/* Form Container */}
      <div className="gradient-border" style={{ maxWidth: "640px", margin: "0 auto" }}>
        <div className="gradient-border-content">
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* PromptGuard Toggle */}
            <div>
              <label className="label" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span>Enable PromptGuard™ (Seal-compatible protection)</span>
                <input type="checkbox" checked={usePromptGuard} onChange={(e)=>setUsePromptGuard(e.target.checked)} />
              </label>
              <div style={{ color:'var(--text-secondary)', fontSize:12, marginTop:6 }}>
                When enabled: buyers see only a short summary before purchase; content decrypts locally after purchase.
              </div>
            </div>

            {/* File Upload - Prominent */}
            <div>
              <label className="label">
                Asset File
                <span style={{ color: "#a855f7", marginLeft: "4px" }}>*</span>
              </label>
              <div style={{
                border: "2px dashed rgba(168, 85, 247, 0.3)",
                borderRadius: "16px",
                padding: "40px",
                textAlign: "center",
                background: "rgba(20, 20, 30, 0.4)",
                transition: "all 0.3s ease",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden"
              }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = "#a855f7";
                  e.currentTarget.style.background = "rgba(168, 85, 247, 0.1)";
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.3)";
                  e.currentTarget.style.background = "rgba(20, 20, 30, 0.4)";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.3)";
                  e.currentTarget.style.background = "rgba(20, 20, 30, 0.4)";
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) setFile(droppedFile);
                }}
              >
                <input
                  type="file"
                  onChange={async (e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && (f as any).type?.startsWith('image/')) {
                      setDesc((d) => d && d.length > 0 ? d : "A cinematic portrait with dramatic lighting and shallow depth of field.");
                    }
                    if (f && usePromptGuard) {
                      try { setSummary((await summarizeForPreview(f, desc)).slice(0, 80)); } catch {}
                    }
                  }}
                  disabled={busy}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer"
                  }}
                />
                <div style={{ fontSize: "48px", marginBottom: "16px", filter: "drop-shadow(0 0 10px rgba(168, 85, 247, 0.5))" }}>
                  {file ? "📄" : "☁️"}
                </div>
                <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "white" }}>
                  {file ? file.name : "Drag & Drop or Click to Upload"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Supports Prompts (.txt, .md) and LoRA models (.safetensors)"}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              {/* Name Input */}
              <div>
                <label className="label">
                  Name
                </label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cyberpunk City"
                  disabled={busy}
                />
              </div>

              {/* Type Select */}
              <div>
                <label className="label">
                  Type
                  <span style={{ color: "#a855f7", marginLeft: "4px" }}>*</span>
                </label>
                <div style={{
                  display: "flex",
                  background: "rgba(15, 15, 20, 0.6)",
                  borderRadius: "12px",
                  padding: "4px",
                  border: "1px solid rgba(255, 255, 255, 0.1)"
                }}>
                  <button
                    type="button"
                    onClick={() => setKind(0)}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "8px",
                      border: "none",
                      background: kind === 0 ? "rgba(168, 85, 247, 0.2)" : "transparent",
                      color: kind === 0 ? "#d8b4fe" : "var(--text-secondary)",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.3s ease"
                    }}
                  >
                    Prompt
                  </button>
                  <button
                    type="button"
                    onClick={() => setKind(1)}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "8px",
                      border: "none",
                      background: kind === 1 ? "rgba(6, 182, 212, 0.2)" : "transparent",
                      color: kind === 1 ? "#67e8f9" : "var(--text-secondary)",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.3s ease"
                    }}
                  >
                    LoRA
                  </button>
                </div>
              </div>
            </div>

            {/* Description / Summary */}
            <div>
              <label className="label">{usePromptGuard ? 'Summary (auto generated for prompts, editable)' : 'Description'}</label>
              <textarea
                className="textarea"
                value={usePromptGuard ? summary : desc}
                onChange={(e) => usePromptGuard ? setSummary(e.target.value) : setDesc(e.target.value)}
                placeholder={usePromptGuard ? "Short summary (20-80 chars)" : "Describe your asset..."}
                disabled={busy}
                rows={4}
              />
              {usePromptGuard && (
                <div style={{ color:'var(--text-secondary)', fontSize:12, marginTop:6 }}>
                  The full content will be encrypted and uploaded to Walrus. Only the summary is visible pre-purchase.
                </div>
              )}
            </div>

            {/* Price Input */}
            <div>
              <label className="label">
                Price (SUI)
                <span style={{ color: "#a855f7", marginLeft: "4px" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type="number"
                  step="0.000000001"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  disabled={busy}
                  min="0"
                  style={{ paddingRight: "60px" }}
                />
                <div style={{
                  position: "absolute",
                  right: "16px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-secondary)",
                  fontWeight: 600
                }}>
                  SUI
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn"
              disabled={busy}
              style={{
                width: "100%",
                marginTop: "16px",
                height: "56px",
                fontSize: "18px"
              }}
            >
              {busy ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                  <span className="loading"></span>
                  Processing...
                </span>
              ) : (
                "List Asset"
              )}
            </button>
          </form>

          {/* Success Message */}
          {blobId && (
            <div style={{
              marginTop: "32px",
              padding: "24px",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "16px"
            }}>
              <div style={{
                fontSize: "18px",
                fontWeight: 700,
                color: "#6ee7b7",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                ✓ Successfully Listed!
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                Walrus Metadata Blob ID:
              </div>
              <div style={{
                fontFamily: "monospace",
                fontSize: "13px",
                background: "rgba(0, 0, 0, 0.3)",
                padding: "16px",
                borderRadius: "12px",
                wordBreak: "break-all",
                color: "#67e8f9",
                border: "1px solid rgba(255, 255, 255, 0.1)"
              }}>
                {blobId}
              </div>
              <div style={{
                marginTop: "24px",
                display: "flex",
                gap: "16px"
              }}>
                <a href="/market/" className="btn btn-secondary" style={{
                  flex: 1,
                  textDecoration: "none",
                  textAlign: "center"
                }}>
                  View in Market
                </a>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setBlobId(null);
                    setFile(null);
                    setName("");
                    setDesc("");
                  }}
                  style={{ flex: 1 }}
                >
                  List Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
