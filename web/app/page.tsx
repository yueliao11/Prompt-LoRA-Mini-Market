"use client";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";

export default function HomePage() {
  const account = useCurrentAccount();

  return (
    <main style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "70vh",
      padding: "20px"
    }}>
      {/* Main Hero Card */}
      <div className="gradient-border" style={{
        maxWidth: "900px",
        width: "100%",
        marginBottom: "60px",
        position: "relative"
      }}>
        {/* Decorative glow behind */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "80%",
          height: "80%",
          background: "radial-gradient(circle, rgba(168, 85, 247, 0.2) 0%, transparent 70%)",
          filter: "blur(60px)",
          zIndex: -1
        }} />

        <div className="gradient-border-content" style={{
          textAlign: "center",
          padding: "64px 32px",
          background: "rgba(10, 10, 15, 0.8)"
        }}>
          {/* Logo */}
          <div style={{
            width: 100,
            height: 100,
            margin: "0 auto 32px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #2563eb, #9333ea)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "48px",
            border: "4px solid rgba(147, 51, 234, 0.5)",
            boxShadow: "0 0 50px rgba(147, 51, 234, 0.4)"
          }}>
            🦭
          </div>

          {/* Title */}
          <h1 className="page-title" style={{
            marginBottom: "16px",
            fontSize: "56px",
            textShadow: "0 0 40px rgba(255, 255, 255, 0.1)"
          }}>
            Prompt & LoRA Mini-Market
          </h1>

          {/* Subtitle */}
          <p className="page-subtitle" style={{
            marginBottom: "48px",
            fontSize: "20px",
            maxWidth: "600px",
            marginLeft: "auto",
            marginRight: "auto"
          }}>
            Upload to Walrus, list on Sui, trade, access content
          </p>

          {/* Action Buttons */}
          <div style={{
            display: "flex",
            gap: 20,
            justifyContent: "center",
            flexWrap: "wrap",
            marginBottom: "56px"
          }}>
            <div style={{ transform: "scale(1.1)" }}>
              <ConnectButton />
            </div>
            <a href="/market/" className="btn" style={{
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span>Go to Market</span>
              <span>→</span>
            </a>
            <a href="/sell/" className="btn btn-secondary" style={{ textDecoration: "none" }}>
              Sell an Asset
            </a>
          </div>

          {/* Workflow Stepper */}
          <div style={{ marginTop: "64px", maxWidth: "700px", margin: "64px auto 0" }}>
            <div style={{
              fontSize: "14px",
              color: "var(--text-secondary)",
              marginBottom: "32px",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase"
            }}>
              upload to Walrus <span style={{ color: "#a855f7" }}>→</span> list on Sui <span style={{ color: "#a855f7" }}>→</span> purchase <span style={{ color: "#a855f7" }}>→</span> access content
            </div>

            <div className="stepper">
              <div className="step active">1</div>
              <div className="step active">2</div>
              <div className="step active">3</div>
              <div className="step active">4</div>
              <div className="step">5</div>
              <div className="step">6</div>
              <div className="step">7</div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      {account ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "32px",
          width: "100%",
          maxWidth: "1000px"
        }}>
          <div className="glass-card" style={{ padding: "32px" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>🎨</div>
            <h3 style={{
              fontSize: "20px",
              marginBottom: "12px",
              color: "#d8b4fe",
              fontWeight: 700
            }}>
              For Creators
            </h3>
            <p style={{
              fontSize: "15px",
              color: "var(--text-secondary)",
              lineHeight: "1.6"
            }}>
              Upload your prompts and LoRA models to Walrus, set your price, and list them on the Sui blockchain marketplace.
            </p>
          </div>

          <div className="glass-card" style={{ padding: "32px" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>🛍️</div>
            <h3 style={{
              fontSize: "20px",
              marginBottom: "12px",
              color: "#67e8f9",
              fontWeight: 700
            }}>
              For Buyers
            </h3>
            <p style={{
              fontSize: "15px",
              color: "var(--text-secondary)",
              lineHeight: "1.6"
            }}>
              Browse the marketplace, purchase assets with SUI tokens, and get instant access to the content via Walrus.
            </p>
          </div>

          <div className="glass-card" style={{ padding: "32px" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔗</div>
            <h3 style={{
              fontSize: "20px",
              marginBottom: "12px",
              color: "#93c5fd",
              fontWeight: 700
            }}>
              Decentralized
            </h3>
            <p style={{
              fontSize: "15px",
              color: "var(--text-secondary)",
              lineHeight: "1.6"
            }}>
              All content is stored on Walrus decentralized storage, with ownership and transactions secured on Sui blockchain.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass-card" style={{
          padding: "48px",
          textAlign: "center",
          maxWidth: "600px",
          margin: "0 auto",
          border: "1px solid rgba(168, 85, 247, 0.3)",
          background: "linear-gradient(180deg, rgba(20, 20, 30, 0.8) 0%, rgba(10, 10, 15, 0.9) 100%)"
        }}>
          <h3 style={{
            fontSize: "24px",
            marginBottom: "16px",
            background: "linear-gradient(135deg, #2563eb, #9333ea)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontWeight: 800
          }}>
            Wallet-based authentication for Web3
          </h3>
          <p style={{
            fontSize: "16px",
            color: "var(--text-secondary)",
            marginBottom: "32px"
          }}>
            Connect your wallet to start buying and selling digital assets
          </p>

          {/* Wallet Icons Placeholder */}
          <div className="wallet-icons">
            <div className="wallet-icon" title="Sui Wallet">
              💼
            </div>
            <div className="wallet-icon" title="Ethos Wallet">
              🔐
            </div>
            <div className="wallet-icon" title="Other Wallets">
              🌐
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
