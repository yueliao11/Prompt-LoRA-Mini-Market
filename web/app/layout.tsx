"use client";
import { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider as MystenWalletProvider, ConnectButton } from "@mysten/dapp-kit";
import { SuiClientProvider, createNetworkConfig } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui.js/client";
import "@mysten/dapp-kit/dist/index.css";
import "./globals.css";

const queryClient = new QueryClient();

const { networkConfig } = createNetworkConfig({
  localnet: { url: getFullnodeUrl("localnet") },
  devnet: { url: getFullnodeUrl("devnet") },
  testnet: { url: getFullnodeUrl("testnet") },
  mainnet: { url: getFullnodeUrl("mainnet") },
});

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <title>Walrus Prompt & LoRA Mini-Market</title>
        <meta name="description" content="Upload to Walrus, list on Sui, trade, access content" />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
            <MystenWalletProvider autoConnect>
              <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
                <header style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 48,
                  padding: "16px 0"
                }}>
                  <a href="/" style={{
                    fontWeight: 700,
                    fontSize: "18px",
                    textDecoration: "none",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px"
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #2563eb, #9333ea)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid rgba(147, 51, 234, 0.5)"
                    }}>
                      🦭
                    </div>
                    Prompt & LoRA Mini-Market
                  </a>
                  <nav style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                    <a href="/" style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      textDecoration: "none",
                      fontSize: "16px",
                      fontWeight: 500,
                      transition: "color 0.3s ease"
                    }}>
                      Home
                    </a>
                    <a href="/market/" style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      textDecoration: "none",
                      fontSize: "16px",
                      fontWeight: 500,
                      transition: "color 0.3s ease"
                    }}>
                      Market
                    </a>
                    <a href="/profile/" style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      textDecoration: "none",
                      fontSize: "16px",
                      fontWeight: 500,
                      transition: "color 0.3s ease"
                    }}>
                      Profile
                    </a>
                    <a href="/sell/" style={{
                      padding: "8px 20px",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, #9333ea, #06b6d4)",
                      color: "white",
                      textDecoration: "none",
                      fontSize: "16px",
                      fontWeight: 600,
                      transition: "all 0.3s ease"
                    }}>
                      Sell
                    </a>
                    <ConnectButton />
                  </nav>
                </header>
                {children}
              </div>
            </MystenWalletProvider>
          </SuiClientProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
