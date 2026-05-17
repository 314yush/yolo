import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface Props {
  enterFrame?: number;
  pnlAmount?: number;
  pnlPercent?: number;
  asset?: string;
  assetColor?: string;
  leverage?: string;
  direction?: "LONG" | "SHORT";
  entryPrice?: string;
  currentPrice?: string;
  collateral?: number;
}

export const PnLDisplay: React.FC<Props> = ({
  enterFrame = 0,
  pnlAmount = 47.32,
  pnlPercent = 473.2,
  asset = "BTC",
  assetColor = "#FF9500",
  leverage = "500x",
  direction = "LONG",
  entryPrice = "97,241.50",
  currentPrice = "97,333.42",
  collateral = 10,
}) => {
  const frame = useCurrentFrame();

  const f = Math.max(0, frame - enterFrame);
  const isProfit = pnlAmount >= 0;
  const accentColor = isProfit ? "#CCFF00" : "#FF006E";

  // Hard cut in
  const visible = f > 0 ? 1 : 0;

  // Animated counter (keeps the count-up — it's not a spring, it's content)
  const countProgress = interpolate(f, [2, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const easedCount = 1 - Math.pow(1 - countProgress, 3);
  const displayAmount = (pnlAmount * easedCount).toFixed(2);
  const displayPercent = (pnlPercent * easedCount).toFixed(1);

  const glowIntensity = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.3, 0.6]
  );

  // Staggered hard cuts for sub-elements
  const badgeVisible = f > 5 ? 1 : 0;
  const infoVisible = f > 10 ? 1 : 0;

  const winPulse =
    isProfit && pnlPercent > 100
      ? 1 + Math.sin(frame * 0.12) * 0.02
      : 1;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        opacity: visible,
        width: "100%",
      }}
    >
      {/* Status badge */}
      <div
        style={{
          opacity: badgeVisible,
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: `3px solid ${accentColor}`,
          padding: "8px 18px",
          color: accentColor,
          fontFamily: '"Outfit", sans-serif',
          fontSize: 20,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: accentColor,
            opacity: 0.5 + Math.sin(frame * 0.2) * 0.5,
          }}
        />
        {isProfit ? "WINNING" : "LOSING"}
        <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>
          2:34m
        </span>
      </div>

      {/* Asset + Leverage + Direction row */}
      <div
        style={{
          opacity: badgeVisible,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: '"Outfit", sans-serif',
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        <span style={{ color: assetColor }}>● {asset}</span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>•</span>
        <span style={{ color: "#fff" }}>{leverage}</span>
        <span style={{ color: "rgba(255,255,255,0.3)" }}>•</span>
        <span style={{ color: direction === "LONG" ? "#CCFF00" : "#FF006E" }}>
          {direction}
        </span>
      </div>

      {/* Big PnL number */}
      <div
        style={{
          transform: `scale(${winPulse})`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: '"Outfit", sans-serif',
            fontSize: 120,
            fontWeight: 900,
            color: accentColor,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            textShadow: `0 0 25px ${accentColor}80, 0 0 50px ${accentColor}4D, 0 0 75px ${accentColor}1A`,
          }}
        >
          {isProfit ? "+" : "-"}${Math.abs(Number(displayAmount)).toFixed(2)}
        </div>
        <div
          style={{
            fontFamily: '"Outfit", sans-serif',
            fontSize: 45,
            fontWeight: 700,
            color: accentColor,
            marginTop: 10,
            textShadow: `0 0 20px ${accentColor}4D`,
          }}
        >
          {isProfit ? "+" : ""}
          {displayPercent}%
        </div>
      </div>

      {/* Price comparison */}
      <div
        style={{
          opacity: infoVisible,
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontFamily: '"Outfit", sans-serif',
          fontSize: 25,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 15, marginBottom: 5 }}>
            ENTRY
          </div>
          <div style={{ color: "#fff", fontWeight: 700 }}>${entryPrice}</div>
        </div>
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 30 }}>→</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 15, marginBottom: 5 }}>
            CURRENT
          </div>
          <div style={{ color: accentColor, fontWeight: 700 }}>${currentPrice}</div>
        </div>
      </div>

      {/* Info bar */}
      <div
        style={{
          opacity: infoVisible,
          display: "flex",
          gap: 60,
          fontFamily: '"Outfit", sans-serif',
          fontSize: 18,
          fontWeight: 600,
          color: "rgba(255,255,255,0.5)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingTop: 20,
          marginTop: 10,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, marginBottom: 5 }}>COLLATERAL</div>
          <div style={{ color: "#fff" }}>${collateral}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, marginBottom: 5 }}>TARGET</div>
          <div style={{ color: "#CCFF00" }}>+${(collateral * 2).toFixed(0)}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, marginBottom: 5 }}>LIQUIDATION</div>
          <div style={{ color: "#FF006E" }}>-${collateral}</div>
        </div>
      </div>

      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 100% 60% at 50% 40%, ${accentColor}${Math.round(glowIntensity * 25).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
    </div>
  );
};
