import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const ASSETS = [
  { name: "BTC", color: "#FF9500", symbol: "₿" },
  { name: "ETH", color: "#627EEA", symbol: "Ξ" },
  { name: "SOL", color: "#14F195", symbol: "◎" },
] as const;

export const AssetLogos: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        display: "flex",
        gap: 40,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {ASSETS.map((asset, i) => {
        const stagger = delay + i * 6;
        const adjustedFrame = Math.max(0, frame - stagger);

        const scale = spring({
          frame: adjustedFrame,
          fps,
          config: { damping: 10, stiffness: 180, mass: 0.6 },
        });

        // Fly in from above
        const translateY = interpolate(
          spring({ frame: adjustedFrame, fps, config: { damping: 12, stiffness: 150 } }),
          [0, 1],
          [-120, 0]
        );

        // Slight random rotation for playful feel
        const rotate = interpolate(
          spring({ frame: adjustedFrame, fps, config: { damping: 8, stiffness: 100 } }),
          [0, 1],
          [i % 2 === 0 ? -20 : 25, i % 2 === 0 ? -3 : 3]
        );

        return (
          <div
            key={asset.name}
            style={{
              transform: `scale(${scale}) translateY(${translateY}px) rotate(${rotate}deg)`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                border: `4px solid ${asset.color}`,
                boxShadow: `6px 6px 0px ${asset.color}66`,
                background: "#111827",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 40, color: asset.color }}>{asset.symbol}</span>
            </div>
            <span
              style={{
                fontFamily: '"Outfit", sans-serif',
                fontSize: 16,
                fontWeight: 700,
                color: asset.color,
                letterSpacing: "0.05em",
              }}
            >
              {asset.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};
