import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";
import { YoloLogo } from "../components/YoloLogo";
import { SpinningWheel } from "../components/SpinningWheel";
import { PnLDisplay } from "../components/PnLDisplay";
import { TradeCardStack } from "../components/TradeCardStack";
import { RollButton } from "../components/RollButton";
import { Confetti } from "../components/Confetti";

type Props = {
  layout: "landscape" | "story";
  /** Set to true once audio files are in public/audio/ */
  enableAudio?: boolean;
};

/**
 * YOLO Promo — "A casino without a house"
 * All transitions: hard cuts. No springs. Pure energy.
 */

export const HeroPromo: React.FC<Props> = ({ layout, enableAudio = false }) => {
  const frame = useCurrentFrame();
  const isStory = layout === "story";

  const scanlineOpacity = interpolate(frame, [0, 30], [0, 0.03], {
    extrapolateRight: "clamp",
  });
  const glowPulse = Math.sin(frame * 0.04) * 0.12 + 0.25;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", overflow: "hidden" }}>
      {/* Ambient lime glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse 80% 60% at 50% 40%, rgba(204,255,0,${glowPulse * 0.12}) 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      {/* CRT scanlines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: scanlineOpacity,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)",
          pointerEvents: "none",
          zIndex: 100,
        }}
      />

      {/* ============ AUDIO ============ */}
      {enableAudio && (
        <>
          {/* SFX: intro hit — Scene 1 (hook) */}
          <Sequence from={3}>
            <Audio src={staticFile("audio/intro-hit.mp3")} volume={0.63} />
          </Sequence>

          {/* SFX: intro hit — Scene 2 */}
          <Sequence from={75}>
            <Audio src={staticFile("audio/intro-hit.mp3")} volume={0.63} />
          </Sequence>

          {/* SFX: intro hit — Scene 3 (ROLL screen) */}
          <Sequence from={150}>
            <Audio src={staticFile("audio/intro-hit.mp3")} volume={0.63} />
          </Sequence>

          {/* Upbeat music — drops when ROLL is pressed, plays through to end */}
          <Sequence from={175}>
            <Audio
              src={staticFile("audio/upbeat.mp3")}
              volume={(f) =>
                interpolate(f, [0, 10, 420, 455], [0, 0.5, 0.5, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              }
            />
          </Sequence>

          {/* SFX: beat drop hit on ROLL press */}
          <Sequence from={175}>
            <Audio src={staticFile("audio/beat-drop.mp3")} volume={0.7} />
          </Sequence>

          {/* SFX: tick when each wheel ring stops */}
          <Sequence from={290}>
            <Audio src={staticFile("audio/tick.mp3")} volume={0.42} />
          </Sequence>
          <Sequence from={350}>
            <Audio src={staticFile("audio/tick.mp3")} volume={0.42} />
          </Sequence>
          <Sequence from={420}>
            <Audio src={staticFile("audio/tick.mp3")} volume={0.42} />
          </Sequence>

          {/* SFX: cashout on PnL reveal (Scene 5) */}
          <Sequence from={422}>
            <Audio src={staticFile("audio/cashout.mp3")} volume={0.63} />
          </Sequence>

        </>
      )}

      {/* ============ SCENES ============ */}

      <Sequence from={0} durationInFrames={85}>
        <Scene_Hook isStory={isStory} />
      </Sequence>

      <Sequence from={75} durationInFrames={85}>
        <Scene_WhatIsIt isStory={isStory} />
      </Sequence>

      <Sequence from={150} durationInFrames={70}>
        <Scene_TheMechanic isStory={isStory} />
      </Sequence>

      <Sequence from={210} durationInFrames={220}>
        <Scene_WheelSpin isStory={isStory} />
      </Sequence>

      <Sequence from={420} durationInFrames={100}>
        <Scene_Payoff isStory={isStory} />
      </Sequence>

      <Sequence from={510} durationInFrames={70}>
        <Scene_SocialProof isStory={isStory} />
      </Sequence>

      <Sequence from={570} durationInFrames={60}>
        <Scene_CTA isStory={isStory} />
      </Sequence>

      <CornerAccent position="top-left" />
      <CornerAccent position="bottom-right" />
    </AbsoluteFill>
  );
};

/* ============================================================
   SCENES — all hard cuts, no springs
   ============================================================ */

/** Scene 1 — Hook. Lines smash in, then smash-zoom out. */
const Scene_Hook: React.FC<{ isStory: boolean }> = ({ isStory }) => {
  const frame = useCurrentFrame();

  // Line 1 appears at frame 3, line 2 at frame 12 — hard cut
  const line1Visible = frame >= 3 ? 1 : 0;
  const line2Visible = frame >= 12 ? 1 : 0;

  // Smash-zoom exit (this is a camera move, not a spring — keep it)
  const smashZoom = interpolate(frame, [55, 75], [1, 1.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [60, 80], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        opacity: fadeOut,
        transform: `scale(${smashZoom})`,
      }}
    >
      <div
        style={{
          opacity: line1Visible,
          fontFamily: '"Oswald", sans-serif',
          fontSize: isStory ? 90 : 120,
          fontWeight: 700,
          color: "#fff",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          lineHeight: 1.1,
        }}
      >
        A Casino
      </div>
      <div
        style={{
          opacity: line2Visible,
          fontFamily: '"Oswald", sans-serif',
          fontSize: isStory ? 90 : 120,
          fontWeight: 700,
          color: "#CCFF00",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          lineHeight: 1.1,
          textShadow: "0 0 50px rgba(204,255,0,0.4), 0 0 100px rgba(204,255,0,0.15)",
        }}
      >
        Without a House
      </div>
    </AbsoluteFill>
  );
};

/** Scene 2 — What is it. Hard cut in, slide-down wipe out. */
const Scene_WhatIsIt: React.FC<{ isStory: boolean }> = ({ isStory }) => {
  const frame = useCurrentFrame();

  // Slide-down wipe exit
  const slideOut = interpolate(frame, [65, 85], [0, 1200], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [70, 85], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const assets = [
    { name: "BTC", color: "#FF9500", delay: 5 },
    { name: "ETH", color: "#627EEA", delay: 12 },
    { name: "SOL", color: "#14F195", delay: 19 },
    { name: "USDJPY", color: "#2DD4BF", delay: 26 },
    { name: "GOLD", color: "#FFD700", delay: 33 },
    { name: "SILVER", color: "#C0C0C0", delay: 40 },
  ];

  // Hard cut for main text
  const mainVisible = frame >= 2 ? 1 : 0;
  const subVisible = frame >= 20 ? 1 : 0;

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        opacity: fadeOut,
        transform: `translateY(${slideOut}px)`,
      }}
    >
      {/* Flying asset tickers — these are motion graphics, keep the linear slide */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        {assets.map((asset, i) => {
          const af = Math.max(0, frame - asset.delay);
          const x = interpolate(af, [0, 30], [isStory ? 1200 : 2200, isStory ? -400 : -600], {
            extrapolateRight: "clamp",
          });
          const y = 120 + i * (isStory ? 260 : 150);
          const opacity = interpolate(af, [0, 5, 25, 30], [0, 0.15, 0.15, 0], {
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={asset.name}
              style={{
                position: "absolute",
                top: y,
                left: 0,
                transform: `translateX(${x}px)`,
                fontFamily: '"Oswald", sans-serif',
                fontSize: isStory ? 150 : 200,
                fontWeight: 700,
                color: asset.color,
                opacity,
                letterSpacing: "0.1em",
                whiteSpace: "nowrap",
              }}
            >
              {asset.name}
            </div>
          );
        })}
      </div>

      {/* Main copy — hard cut */}
      <div
        style={{
          opacity: mainVisible,
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily: '"Oswald", sans-serif',
            fontSize: isStory ? 70 : 90,
            fontWeight: 700,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            lineHeight: 1.1,
          }}
        >
          One tap.
        </div>
        <div
          style={{
            fontFamily: '"Oswald", sans-serif',
            fontSize: isStory ? 70 : 90,
            fontWeight: 700,
            color: "#CCFF00",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            lineHeight: 1.1,
            textShadow: "0 0 40px rgba(204,255,0,0.3)",
          }}
        >
          Global markets.
        </div>
      </div>

      {/* Sub text — hard cut */}
      <div
        style={{
          opacity: subVisible,
          fontFamily: '"Outfit", sans-serif',
          fontSize: isStory ? 28 : 35,
          fontWeight: 600,
          color: "rgba(255,255,255,0.5)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          zIndex: 10,
        }}
      >
        Crypto, Gold, Silver — up to 500x
      </div>
    </AbsoluteFill>
  );
};

/** Scene 3 — The mechanic. Hard cut everything. */
const Scene_TheMechanic: React.FC<{ isStory: boolean }> = ({ isStory }) => {
  const frame = useCurrentFrame();

  // Hard cut in/out for the whole scene
  const fadeOut = interpolate(frame, [58, 70], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textVisible = frame >= 3 ? 1 : 0;

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          opacity: textVisible,
          fontFamily: '"Oswald", sans-serif',
          fontSize: isStory ? 60 : 75,
          fontWeight: 700,
          color: "#fff",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          textAlign: "center",
        }}
      >
        Let fate decide.
      </div>

      <RollButton enterFrame={5} pressFrame={25} />

      <div
        style={{
          fontFamily: '"Outfit", sans-serif',
          fontSize: 22,
          color: "rgba(255,255,255,0.35)",
          marginTop: 4,
          opacity: textVisible,
        }}
      >
        Powered by Base
      </div>
    </AbsoluteFill>
  );
};

/** Scene 4 — Wheel spin. Hard cut in, fade out. */
const Scene_WheelSpin: React.FC<{ isStory: boolean }> = ({ isStory }) => {
  const frame = useCurrentFrame();

  const fadeOut = interpolate(frame, [200, 220], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
      }}
    >
      <SpinningWheel spinStartFrame={5} size={isStory ? 450 : 525} />
    </AbsoluteFill>
  );
};

/** Scene 5 — PnL result. Hard cut. */
const Scene_Payoff: React.FC<{ isStory: boolean }> = ({ isStory }) => {
  const frame = useCurrentFrame();

  const fadeOut = interpolate(frame, [85, 100], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadeOut,
      }}
    >
      <PnLDisplay
        enterFrame={0}
        pnlAmount={47.32}
        pnlPercent={473.2}
        asset="BTC"
        assetColor="#FF9500"
        leverage="500x"
        direction="LONG"
        entryPrice="97,241.50"
        currentPrice="97,333.42"
        collateral={10}
      />
      <Confetti enterFrame={5} count={80} />
    </AbsoluteFill>
  );
};

/** Scene 6 — Social proof. Hard cut header, cards still slide (motion graphic). */
const Scene_SocialProof: React.FC<{ isStory: boolean }> = ({ isStory }) => {
  const frame = useCurrentFrame();

  const fadeOut = interpolate(frame, [55, 70], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const headerVisible = frame >= 2 ? 1 : 0;

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        opacity: fadeOut,
        padding: isStory ? "40px" : "40px 160px",
      }}
    >
      <div
        style={{
          opacity: headerVisible,
          fontFamily: '"Oswald", sans-serif',
          fontSize: isStory ? 40 : 50,
          fontWeight: 700,
          color: "#fff",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Every spin is a <span style={{ color: "#CCFF00" }}>real trade</span>
      </div>

      <TradeCardStack enterFrame={4} />
    </AbsoluteFill>
  );
};

/** Scene 7 — CTA. Hard cut. */
const Scene_CTA: React.FC<{ isStory: boolean }> = ({ isStory }) => {
  const frame = useCurrentFrame();

  const logoVisible = frame >= 2 ? 1 : 0;
  const ctaVisible = frame >= 8 ? 1 : 0;

  const ctaGlow = interpolate(Math.sin(frame * 0.15), [-1, 1], [0.25, 0.5]);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: isStory ? 45 : 35,
      }}
    >
      <div style={{ opacity: logoVisible }}>
        <YoloLogo />
      </div>

      <div
        style={{
          opacity: ctaVisible,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <div
          style={{
            background: "linear-gradient(180deg, #CCFF00 0%, #AEEA00 100%)",
            border: "8px solid #000",
            boxShadow: `8px 8px 0px rgba(0,0,0,1), 0 0 50px rgba(204,255,0,${ctaGlow})`,
            padding: "20px 60px",
          }}
        >
          <span
            style={{
              fontFamily: '"Oswald", sans-serif',
              fontSize: isStory ? 40 : 50,
              fontWeight: 700,
              color: "#000",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Trade now
          </span>
        </div>

        <div
          style={{
            fontFamily: '"Outfit", sans-serif',
            fontSize: isStory ? 22 : 28,
            fontWeight: 600,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Zero-fee perpetuals on Base
        </div>

        <div
          style={{
            fontFamily: '"Outfit", sans-serif',
            fontSize: isStory ? 25 : 30,
            fontWeight: 700,
            color: "#CCFF00",
            letterSpacing: "0.04em",
          }}
        >
          tradeyolo.fun
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================
   DECORATIVE
   ============================================================ */

const CornerAccent: React.FC<{ position: "top-left" | "bottom-right" }> = ({
  position,
}) => {
  const frame = useCurrentFrame();

  const isTopLeft = position === "top-left";
  const visible = frame >= 5 ? 1 : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: isTopLeft ? 40 : undefined,
        left: isTopLeft ? 40 : undefined,
        bottom: isTopLeft ? undefined : 40,
        right: isTopLeft ? undefined : 40,
        width: 75,
        height: 75,
        borderTop: isTopLeft ? "8px solid #FF006E" : "none",
        borderLeft: isTopLeft ? "8px solid #FF006E" : "none",
        borderBottom: isTopLeft ? "none" : "8px solid #FF006E",
        borderRight: isTopLeft ? "none" : "8px solid #FF006E",
        opacity: visible * 0.7,
        zIndex: 50,
      }}
    />
  );
};
