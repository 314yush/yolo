import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

const ASSETS = [
  { name: "ETH", color: "#627EEA" },
  { name: "BTC", color: "#FF9500" },
  { name: "SOL", color: "#14F195" },
  { name: "USDJPY", color: "#2DD4BF" },
  { name: "XAU", color: "#FFD700" },
  { name: "XAG", color: "#C0C0C0" },
];

const LEVERAGES = [
  { name: "250x", color: "#FFD60A" },
  { name: "300x", color: "#FF9500" },
  { name: "400x", color: "#FF006E" },
  { name: "500x", color: "#FF006E" },
];

const DIRECTIONS = [
  { name: "LONG", color: "#CCFF00" },
  { name: "SHORT", color: "#FF006E" },
];

const ASSET_STOP = 75;
const LEVERAGE_STOP = 135;
const DIRECTION_STOP = 210;

const TARGET_ROT_1 = 5 * 360 + 210;
const TARGET_ROT_2 = 7 * 360 + 270;
const TARGET_ROT_3 = 5 * 360 + 90;

function cubicEaseOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function renderRingSegments(
  items: { name: string; color: string }[],
  innerR: number,
  outerR: number,
  fontSize: number
) {
  const total = items.length;
  const segAngle = 360 / total;

  return items.map((item, i) => {
    const startAngle = ((i * segAngle - 90) * Math.PI) / 180;
    const endAngle = (((i + 1) * segAngle - 90) * Math.PI) / 180;
    const largeArc = segAngle > 180 ? 1 : 0;

    const x1o = 200 + outerR * Math.cos(startAngle);
    const y1o = 200 + outerR * Math.sin(startAngle);
    const x2o = 200 + outerR * Math.cos(endAngle);
    const y2o = 200 + outerR * Math.sin(endAngle);
    const x1i = 200 + innerR * Math.cos(startAngle);
    const y1i = 200 + innerR * Math.sin(startAngle);
    const x2i = 200 + innerR * Math.cos(endAngle);
    const y2i = 200 + innerR * Math.sin(endAngle);

    const textAngle = i * segAngle + segAngle / 2;
    const textR = (innerR + outerR) / 2;
    const tx = 200 + textR * Math.cos(((textAngle - 90) * Math.PI) / 180);
    const ty = 200 + textR * Math.sin(((textAngle - 90) * Math.PI) / 180);

    return (
      <g key={i}>
        <path
          d={`M ${x1o} ${y1o} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1i} ${y1i} Z`}
          fill={item.color}
          stroke="#000"
          strokeWidth="3"
        />
        <text
          x={tx}
          y={ty}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#000"
          fontSize={fontSize}
          fontWeight="bold"
          fontFamily="'Outfit', sans-serif"
          transform={`rotate(${textAngle}, ${tx}, ${ty})`}
        >
          {item.name}
        </text>
      </g>
    );
  });
}

interface Props {
  spinStartFrame?: number;
  size?: number;
}

export const SpinningWheel: React.FC<Props> = ({
  spinStartFrame = 0,
  size = 500,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const f = Math.max(0, frame - spinStartFrame);

  // Hard cut entrance
  const visible = frame >= Math.max(0, spinStartFrame - 2) ? 1 : 0;

  const p1 = Math.min(f / ASSET_STOP, 1);
  const p2 = Math.min(f / LEVERAGE_STOP, 1);
  const p3 = Math.min(f / DIRECTION_STOP, 1);

  const rot1 = TARGET_ROT_1 * cubicEaseOut(p1);
  const rot2 = TARGET_ROT_2 * cubicEaseOut(p2);
  const rot3 = TARGET_ROT_3 * cubicEaseOut(p3);

  const showAsset = p1 >= 1;
  const showLeverage = p2 >= 1;
  const showDirection = p3 >= 1;

  // Chips — hard cut (appear instantly when ring stops)
  const assetChipOp = showAsset ? 1 : 0;
  const levChipOp = showLeverage ? 1 : 0;
  const dirChipOp = showDirection ? 1 : 0;

  const pointerGlow = interpolate(
    Math.sin(frame * 0.15),
    [-1, 1],
    [0.3, 0.8]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        opacity: visible,
      }}
    >
      {/* Selection chips above wheel */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: '"Outfit", sans-serif',
          fontSize: 35,
          fontWeight: 700,
          color: "#fff",
          height: 50,
        }}
      >
        {showAsset && (
          <span style={{ opacity: assetChipOp, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#FF9500" }}>●</span>
            <span>BTC</span>
          </span>
        )}
        {showLeverage && (
          <>
            <span style={{ opacity: levChipOp, color: "rgba(255,255,255,0.3)" }}>•</span>
            <span style={{ opacity: levChipOp }}>500x</span>
          </>
        )}
        {showDirection && (
          <>
            <span style={{ opacity: dirChipOp, color: "rgba(255,255,255,0.3)" }}>•</span>
            <span style={{ opacity: dirChipOp, color: "#CCFF00" }}>LONG</span>
            <span style={{ opacity: dirChipOp, color: "rgba(255,255,255,0.3)" }}>•</span>
            <span style={{ opacity: dirChipOp, color: "#CCFF00" }}>Good luck!</span>
          </>
        )}
      </div>

      {/* Wheel */}
      <div style={{ position: "relative", width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 400 400"
          style={{ display: "block" }}
        >
          <g style={{ transform: `rotate(${rot1}deg)`, transformOrigin: "200px 200px" }}>
            {renderRingSegments(ASSETS, 130, 190, 22)}
          </g>
          <g style={{ transform: `rotate(${rot2}deg)`, transformOrigin: "200px 200px" }}>
            {renderRingSegments(LEVERAGES, 75, 125, 20)}
          </g>
          <g style={{ transform: `rotate(${rot3}deg)`, transformOrigin: "200px 200px" }}>
            {renderRingSegments(DIRECTIONS, 30, 70, 18)}
          </g>
          <circle cx="200" cy="200" r="25" fill="#000" stroke="#fff" strokeWidth="4" />
        </svg>

        {/* Pointer */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 62,
            height: 62,
            filter: `drop-shadow(0 0 ${15 * pointerGlow}px rgba(204, 255, 0, ${pointerGlow}))`,
          }}
        >
          <svg width="62" height="62" viewBox="0 0 50 50">
            <polygon points="25,10 8,42 42,42" fill="#CCFF00" stroke="#000" strokeWidth="4" />
          </svg>
        </div>

        {/* Outer border */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "10px solid #000",
            boxShadow: "10px 10px 0px rgba(0,0,0,1)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Status text */}
      <div
        style={{
          fontFamily: '"Outfit", sans-serif',
          fontSize: 25,
          fontWeight: 600,
          color: "rgba(255,255,255,0.5)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          height: 35,
        }}
      >
        {f > 0 && !showAsset && "Spinning asset..."}
        {showAsset && !showLeverage && "Spinning leverage..."}
        {showLeverage && !showDirection && "Spinning direction..."}
        {showDirection && "Opening position..."}
      </div>
    </div>
  );
};
