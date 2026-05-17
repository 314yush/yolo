import { interpolate, useCurrentFrame, random } from "remotion";

interface Props {
  enterFrame?: number;
  count?: number;
}

const COLORS = ["#CCFF00", "#FF006E", "#FFD700", "#627EEA", "#14F195", "#FF9500", "#fff"];

export const Confetti: React.FC<Props> = ({ enterFrame = 0, count = 60 }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - enterFrame);

  if (f <= 0) return null;

  const particles = Array.from({ length: count }, (_, i) => {
    const seed = i * 7;
    const x = random(`x-${seed}`) * 100;
    const delay = random(`delay-${seed}`) * 8;
    const speed = 300 + random(`speed-${seed}`) * 500;
    const size = 8 + random(`size-${seed}`) * 16;
    const color = COLORS[Math.floor(random(`color-${seed}`) * COLORS.length)];
    const rotation = random(`rot-${seed}`) * 360;
    const rotSpeed = (random(`rotspd-${seed}`) - 0.5) * 20;
    const drift = (random(`drift-${seed}`) - 0.5) * 200;
    const isRect = random(`shape-${seed}`) > 0.5;

    const pf = Math.max(0, f - delay);
    const y = interpolate(pf, [0, 80], [-50, speed], {
      extrapolateRight: "extend",
    });
    const xDrift = interpolate(pf, [0, 80], [0, drift], {
      extrapolateRight: "extend",
    });
    const opacity = interpolate(pf, [0, 3, 50, 80], [0, 1, 1, 0], {
      extrapolateRight: "clamp",
    });
    const rot = rotation + pf * rotSpeed;

    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${x}%`,
          top: -20,
          transform: `translateY(${y}px) translateX(${xDrift}px) rotate(${rot}deg)`,
          width: isRect ? size * 0.6 : size,
          height: size,
          backgroundColor: color,
          borderRadius: isRect ? 2 : size / 2,
          opacity,
        }}
      />
    );
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {particles}
    </div>
  );
};
