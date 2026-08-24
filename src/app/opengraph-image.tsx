import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Vera, the audit and reconciliation layer for AI agent purchases";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const mascot = await readFile(join(process.cwd(), "public", "art", "vera-mascot.png"));
  const mascotSrc = `data:image/png;base64,${mascot.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fbfcfa",
          color: "#111714",
          padding: "64px 72px",
          position: "relative",
          overflow: "hidden",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ position: "absolute", inset: 0, display: "flex", opacity: 0.45, background: "radial-gradient(circle at 82% 48%, #b9f3dd 0, transparent 38%)" }} />
        <div style={{ display: "flex", flexDirection: "column", width: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#007f56", fontSize: 28, fontWeight: 700, letterSpacing: "0.02em" }}>
            VERA
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28, fontSize: 66, fontWeight: 750, lineHeight: 1.03, letterSpacing: "-0.045em" }}>
            <span>The ledger that checks</span>
            <span>what your agents bought.</span>
          </div>
          <div style={{ display: "flex", marginTop: 30, maxWidth: 680, color: "#53605a", fontSize: 25, lineHeight: 1.45 }}>
            Signed mandates, exact carts, receipts, settlements, bank deposits, and independently verifiable audit bundles.
          </div>
          <div style={{ display: "flex", marginTop: 34, gap: 14, alignItems: "center", color: "#007f56", fontSize: 20, fontWeight: 700 }}>
            <span>SELF-HOSTED</span><span>·</span><span>RAZORPAY</span><span>·</span><span>AP2</span><span>·</span><span>ACP</span><span>·</span><span>x402</span>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mascotSrc} alt="" width={430} height={430} style={{ objectFit: "contain" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14, display: "flex", background: "#009f6b" }} />
      </div>
    ),
    size
  );
}
