import { interpolate, useCurrentFrame } from "remotion";

export const YoloLogo: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - delay);

  // Hard cut — invisible then fully visible
  const visible = adjustedFrame > 0 ? 1 : 0;

  // Glow pulse after logo lands
  const glowOpacity = interpolate(
    adjustedFrame,
    [5, 15, 25, 35],
    [0, 0.8, 0.4, 0.6],
    { extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        opacity: visible,
        transform: "rotate(-2deg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          border: "10px solid #CCFF00",
          padding: "20px 40px",
          boxShadow: `15px 15px 0px rgba(204, 255, 0, 0.5), 0 0 ${50 * glowOpacity}px rgba(204, 255, 0, ${glowOpacity * 0.5})`,
          background: "#000",
        }}
      >
        <span
          style={{
            fontFamily: '"Oswald", sans-serif',
            fontSize: 120,
            fontWeight: 700,
            color: "#CCFF00",
            letterSpacing: "0.08em",
            lineHeight: 1,
          }}
        >
          YOLO
        </span>
      </div>
    </div>
  );
};
