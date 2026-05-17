import React from "react";

/**
 * A simplified phone frame to wrap UI screenshots/recreations,
 * giving the promo video a "look at the app" feel.
 */

interface Props {
  children: React.ReactNode;
  width?: number;
  height?: number;
}

export const PhoneFrame: React.FC<Props> = ({
  children,
  width = 380,
  height = 780,
}) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 40,
        border: "4px solid #333",
        background: "#000",
        overflow: "hidden",
        position: "relative",
        boxShadow: "0 20px 60px rgba(0,0,0,0.8), 0 0 0 2px #222",
      }}
    >
      {/* Notch */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 140,
          height: 32,
          background: "#000",
          borderRadius: "0 0 20px 20px",
          zIndex: 10,
          border: "2px solid #222",
          borderTop: "none",
        }}
      />

      {/* Screen content */}
      <div
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {children}
      </div>

      {/* Home indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          width: 120,
          height: 5,
          borderRadius: 3,
          background: "rgba(255,255,255,0.3)",
          zIndex: 10,
        }}
      />
    </div>
  );
};
