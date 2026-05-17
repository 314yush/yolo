import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const TRADES = [
  { asset: "BTC", color: "#FF9500", leverage: "500x", dir: "LONG", pnl: +32.15, pct: +321.5, entry: "97,241.50", close: "97,333.42", status: "win" },
  { asset: "GOLD", color: "#FFD700", leverage: "250x", dir: "SHORT", pnl: -10.0, pct: -100, entry: "3,312.40", close: "3,325.60", status: "liquidated" },
  { asset: "SOL", color: "#14F195", leverage: "300x", dir: "LONG", pnl: +18.90, pct: +189.0, entry: "178.42", close: "184.71", status: "win" },
  { asset: "SILVER", color: "#C0C0C0", leverage: "250x", dir: "LONG", pnl: +5.40, pct: +54.0, entry: "33.12", close: "33.84", status: "win" },
  { asset: "ETH", color: "#627EEA", leverage: "400x", dir: "SHORT", pnl: -10.0, pct: -100, entry: "3,412.20", close: "3,480.56", status: "liquidated" },
];

interface Props {
  enterFrame?: number;
}

export const TradeCardStack: React.FC<Props> = ({ enterFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const f = Math.max(0, frame - enterFrame);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        width: 650,
        alignItems: "center",
      }}
    >
      {TRADES.map((trade, i) => {
        const stagger = i * 10;
        const cardFrame = Math.max(0, f - stagger);

        const slideX = interpolate(
          spring({
            frame: cardFrame,
            fps,
            config: { damping: 14, stiffness: 120 },
          }),
          [0, 1],
          [750, 0]
        );

        const opacity = interpolate(cardFrame, [0, 8], [0, 1], {
          extrapolateRight: "clamp",
        });

        const isProfit = trade.pnl >= 0;
        const accent = isProfit ? "#CCFF00" : "#FF006E";
        const isLiquidated = trade.status === "liquidated";

        return (
          <div
            key={i}
            style={{
              transform: `translateX(${slideX}px)`,
              opacity,
              width: "100%",
              border: `5px solid ${accent}`,
              boxShadow: `8px 8px 0px ${accent}4D`,
              background: "#111827",
              padding: "20px 25px",
              fontFamily: '"Outfit", sans-serif',
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {/* Left side */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: trade.color, fontSize: 18 }}>●</span>
                <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>
                  {trade.asset}
                </span>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 16 }}>
                  {trade.leverage}
                </span>
                <span
                  style={{
                    color: trade.dir === "LONG" ? "#CCFF00" : "#FF006E",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  {trade.dir}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "rgba(255,255,255,0.5)" }}>
                <span>${trade.entry}</span>
                <span style={{ color: "rgba(255,255,255,0.2)" }}>→</span>
                <span style={{ color: accent }}>${trade.close}</span>
              </div>
            </div>

            {/* Right side */}
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  color: accent,
                  lineHeight: 1,
                }}
              >
                {isProfit ? "+" : ""}${trade.pnl.toFixed(2)}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: accent,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 5,
                }}
              >
                {isLiquidated && <span>⚡</span>}
                {isProfit ? "+" : ""}
                {trade.pct.toFixed(1)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
