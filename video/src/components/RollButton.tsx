import { interpolate, useCurrentFrame } from "remotion";

interface Props {
  enterFrame?: number;
  label?: string;
  pressFrame?: number;
}

export const RollButton: React.FC<Props> = ({
  enterFrame = 0,
  label = "ROLL",
  pressFrame,
}) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - enterFrame);

  // Hard cut in
  const visible = f > 0 ? 1 : 0;

  // Press animation — quick snap, not springy
  let pressTranslate = 0;
  let pressShadow = 10;
  if (pressFrame !== undefined) {
    const pf = Math.max(0, frame - pressFrame);
    if (pf > 0 && pf < 8) {
      const press = interpolate(pf, [0, 2, 5, 8], [0, 1, 1, 0], {
        extrapolateRight: "clamp",
      });
      pressTranslate = press * 5;
      pressShadow = 10 - press * 5;
    }
  }

  const glow = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.3, 0.5]);

  return (
    <div
      style={{
        opacity: visible,
        transform: `translate(${pressTranslate}px, ${pressTranslate}px)`,
        background: "linear-gradient(180deg, #CCFF00 0%, #AEEA00 100%)",
        border: "10px solid #000",
        boxShadow: `${pressShadow}px ${pressShadow}px 0px rgba(0,0,0,1), 0 0 40px rgba(204,255,0,${glow})`,
        padding: "22px 80px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <span style={{ fontSize: 40 }}>🎲</span>
      <span
        style={{
          fontFamily: '"Outfit", sans-serif',
          fontSize: 45,
          fontWeight: 900,
          color: "#000",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
    </div>
  );
};
