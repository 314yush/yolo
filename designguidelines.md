YOLO - Brand & Design GuideBrand IdentityName
YOLO (You Only Live Once)Tagline
"Spin to Win" / "500x or Bust" / "Pure Luck, Zero Skill"Brand Personality

Rebellious - Anti-traditional trading
Playful - It's a game, not serious finance
High-energy - Fast, loud, exciting
Transparent - It's gambling, we own it
Addictive - Designed for dopamine hits
Visual IdentityColor PalettePrimary Colors:
Lime Green (Success/Primary)
#CCFF00 - RGB(204, 255, 0)
Use: Primary CTA, wins, positive states

Hot Pink (Danger/Loss)
#FF006E - RGB(255, 0, 110)
Use: Liquidations, shorts, warnings

True Black (Base)
#000000 - RGB(0, 0, 0)
Use: Backgrounds, borders, text on lightSecondary Colors:
Electric Yellow
#FFD60A - RGB(255, 214, 10)
Use: Medium leverage, highlights, warnings

Bitcoin Orange
#FF9500 - RGB(255, 149, 0)
Use: BTC asset, warm accents

Ethereum Purple
#627EEA - RGB(98, 126, 234)
Use: ETH asset, cool accents

Solana Green
#14F195 - RGB(20, 241, 149)
Use: SOL asset, success states

XRP Blue
#00AAE4 - RGB(0, 170, 228)
Use: XRP asset, info statesNeutral Colors:
White
#FFFFFF - RGB(255, 255, 255)
Use: Text on dark, secondary buttons

Gray 900
#111827 - RGB(17, 24, 39)
Use: Secondary backgrounds

Gray 600
#4B5563 - RGB(75, 85, 99)
Use: Disabled states, bordersTypographyPrimary Font: JetBrains Mono (Monospace)

Headers: 900 weight (Black)
Body: 700 weight (Bold)
Labels: 400 weight (Regular)
Used for: All numbers, data, buttons
Reasoning: Monospace gives retro arcade/terminal vibes, makes numbers feel "technical" and legitimateFont Sizes:
9xl: 128px - Reserved for special moments
8xl: 96px - "WINNER!" / "REKT" 
7xl: 72px - H1 Headlines
6xl: 60px - "YOLO" logo, subheadlines
5xl: 48px - Large stats
4xl: 36px - Medium stats
3xl: 30px - Buttons
2xl: 24px - Cards, chips
xl: 20px - Subtitles
lg: 18px - Body
base: 16px - Default
sm: 14px - Labels
xs: 12px - Fine printLetter Spacing:

Headlines: -0.05em (tracking-tighter)
Everything else: Normal
Design SystemNeobrutalism Principles1. Thick Borders (4-8px)
cssborder: 8px solid #000000;
Everything has a bold black outline. No subtle 1px borders.2. Hard Shadows (No blur)
cssbox-shadow: 8px 8px 0px 0px rgba(0,0,0,1);
box-shadow: 12px 12px 0px 0px rgba(204,255,0,0.5); /* Colored */
Shadows are solid rectangles offset diagonally. Never blurred or soft.3. No Gradients
Flat colors only. Every element is a single solid color.4. No Border Radius (Mostly)
Hard corners everywhere. Exception: Small stat pills can have slight rounding for contrast.5. Slight Rotation
csstransform: rotate(-2deg);
Key elements tilted 2-3° to create playful chaos.6. High Contrast
Every element must be clearly visible. No subtle gray-on-gray.Component StylesButtonsPrimary Button (CTA):
cssbackground: #CCFF00;
color: #000000;
border: 8px solid #000000;
box-shadow: 8px 8px 0px 0px rgba(0,0,0,1);
padding: 24px 48px;
font-size: 30px;
font-weight: 900;
text-transform: uppercase;

/* Hover */
box-shadow: 12px 12px 0px 0px rgba(0,0,0,1);

/* Active (pressed) */
transform: translate(2px, 2px);
box-shadow: none;Secondary Button:
cssbackground: #FFFFFF;
color: #000000;
border: 6px solid #000000;
box-shadow: 6px 6px 0px 0px rgba(0,0,0,1);Disabled:
cssbackground: #4B5563;
color: #9CA3AF;
opacity: 0.5;
cursor: not-allowed;Cards/ChipsAsset/Leverage/Direction Chips:
cssbackground: [Asset color];
color: #000000;
border: 4px solid #000000;
box-shadow: 4px 4px 0px 0px rgba(0,0,0,1);
padding: 12px 24px;
font-size: 20px;
font-weight: 700;Stat Cards:
cssbackground: #111827;
border: 2px solid [Accent color];
border-radius: 4px; /* Slight for contrast */
padding: 8px 16px;Wheel DesignSegments:

3px black borders between segments
4px for jackpot (500x) segments
Solid fill colors (no gradients)
Thick 8px outer border
Pointer:

Triangle shape
Lime green (#CCFF00)
4px black stroke
Positioned at 12 o'clock
Center Hub:

Black circle
4px white stroke
25px radius
Popups/ModalsNear-Miss / Milestone Popups:
cssbackground: #000000;
border: 8px solid [Accent color];
box-shadow: 12px 12px 0px 0px [Accent color with 50% opacity];
padding: 24px 32px;
font-size: 48px;
font-weight: 900;Ticker/Marquee:
cssbackground: #000000;
border: 4px solid #FFD60A;
color: #FFD60A;
font-size: 14px;
animation: scroll 20s linear infinite;Animation PrinciplesSpeed

Fast: 300ms (hover states, color changes)
Medium: 500ms (bounces, scale)
Slow: 2500-7500ms (wheel spins)
Easing
javascript// Wheel deceleration
easing: 1 - Math.pow(1 - progress, 3) // Cubic ease-out

// Bounces
animation: bounce 0.5s ease-out

// Pulse (subtle)
animation: pulse 2s ease-in-out infiniteKey AnimationsBounce (result chips appearing):
css@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}Pulse (important elements):
css@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}Scroll (ticker):
css@keyframes scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}Layout SystemMobile-First (Single Column)
┌─────────────────────┐
│  Ticker (scrolling) │
├─────────────────────┤
│    Stats Bar        │
├─────────────────────┤
│                     │
│    Main Content     │
│   (Wheel/PnL/etc)   │
│                     │
├─────────────────────┤
│   Primary Button    │
├─────────────────────┤
│   Balance / Info    │
└─────────────────────┘Spacing Scale
4px  - Tiny gaps
8px  - Small gaps
16px - Default gaps
24px - Medium gaps
32px - Large gaps
48px - Extra large gapsPadding

Buttons: 24px vertical, 48px horizontal
Cards: 12px vertical, 24px horizontal
Containers: 16px all sides
Screen edges: 16px margin