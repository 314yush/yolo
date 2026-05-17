import { Composition } from "remotion";
import { HeroPromo } from "./compositions/HeroPromo";
import "./global.css";

export const Root: React.FC = () => {
  return (
    <>
      {/* Landscape (16:9) — default */}
      <Composition
        id="HeroPromo"
        component={HeroPromo}
        durationInFrames={630}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ layout: "landscape" as const, enableAudio: true }}
      />
      {/* Vertical / Story (9:16) */}
      <Composition
        id="HeroPromoStory"
        component={HeroPromo}
        durationInFrames={630}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ layout: "story" as const, enableAudio: true }}
      />
    </>
  );
};
