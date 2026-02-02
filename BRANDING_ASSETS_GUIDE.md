# Branding Assets Generation Guide

This guide outlines all the image assets needed for YOLO's public launch and how to generate them.

## Design Specifications

### Brand Colors
- **Primary Accent**: `#CCFF00` (Lime Green)
- **Background**: `#000000` (Black)
- **Secondary**: `#FF006E` (Pink/Magenta)
- **Asset Colors**:
  - BTC: `#FF9500` (Orange)
  - ETH: `#627EEA` (Blue)
  - SOL: `#14F195` (Green)
  - XRP: `#00AAE4` (Cyan)

### Typography
- **Font**: Space Mono / JetBrains Mono (Monospace)
- **Style**: Bold, uppercase for headings
- **Tagline**: "Spin the wheel, open a trade. Zero-fee perpetuals on Base."

### Design Style
- Neo-brutalist: Bold, sharp edges, high contrast
- Gaming/trading aesthetic
- Dark theme with vibrant accents

---

## Required Assets

### 1. Favicon Files (`/frontend/public/`)

#### `favicon.ico`
- **Size**: Multi-resolution ICO file containing 16x16, 32x32, 48x48
- **Format**: ICO
- **Design**: YOLO logo/icon, readable at 16x16
- **Background**: Transparent or black
- **Tools**: Use [favicon.io](https://favicon.io) or [RealFaviconGenerator](https://realfavicongenerator.net/)

#### `favicon-16x16.png`
- **Size**: 16x16px
- **Format**: PNG
- **Purpose**: Fallback for modern browsers

#### `favicon-32x32.png`
- **Size**: 32x32px
- **Format**: PNG
- **Purpose**: Standard favicon size

#### `favicon-96x96.png`
- **Size**: 96x96px
- **Format**: PNG
- **Purpose**: Android Chrome

---

### 2. Apple Touch Icons (`/frontend/public/`)

**Important**: iOS icons need padding (safe area) - content should not touch edges. Leave ~10% padding.

#### `apple-touch-icon.png` (Required)
- **Size**: 180x180px
- **Format**: PNG
- **Purpose**: iOS home screen icon
- **Design**: YOLO logo with padding around edges

#### Legacy iOS Icons (Optional but recommended)
- `apple-touch-icon-57x57.png` - iOS 6 and earlier
- `apple-touch-icon-60x60.png` - iOS 7
- `apple-touch-icon-72x72.png` - iPad
- `apple-touch-icon-76x76.png` - iPad
- `apple-touch-icon-114x114.png` - iPhone Retina
- `apple-touch-icon-120x120.png` - iPhone Retina
- `apple-touch-icon-144x144.png` - iPad Retina
- `apple-touch-icon-152x152.png` - iPad Retina

---

### 3. PWA Icons (`/frontend/public/icons/`)

**Important**: These icons should be "maskable" - keep important content within 80% of the icon area (safe zone) for adaptive masking on Android.

#### Required Sizes:
- `icon-72x72.png` - 72x72px
- `icon-96x96.png` - 96x96px
- `icon-128x128.png` - 128x128px
- `icon-144x144.png` - 144x144px
- `icon-152x152.png` - 152x152px
- `icon-192x192.png` - 192x192px (Required minimum)
- `icon-384x384.png` - 384x384px
- `icon-512x512.png` - 512x512px (Required minimum)

#### Shortcut Icon:
- `roll-icon.png` - 96x96px
- **Purpose**: Icon for the "Roll" shortcut in PWA manifest
- **Design**: Wheel or dice icon representing the spin action

---

### 4. Social Media Sharing Images (`/frontend/public/`)

#### `og-image.png` (Open Graph)
- **Size**: 1200x630px
- **Format**: PNG or JPG
- **Purpose**: Facebook, LinkedIn, general social sharing
- **Design Elements**:
  - Black background (#000000)
  - Large "YOLO" text in lime green (#CCFF00) - top left
  - Tagline: "Spin the wheel, open a trade" - below title
  - Stylized trading wheel (colorful segments) - center-right
  - "Zero-fee perpetuals on Base" - bottom
  - Neo-brutalist style with bold borders
  - Subtle glow effects around wheel

#### `twitter-image.png` (Twitter Card)
- **Size**: 1200x630px
- **Format**: PNG or JPG
- **Purpose**: Twitter/X sharing
- **Design**: Can reuse og-image.png or create Twitter-specific version
- **Note**: Twitter uses `summary_large_image` card type

#### `og-image-square.png` (Optional)
- **Size**: 1200x1200px
- **Format**: PNG
- **Purpose**: Some platforms prefer square images
- **Design**: Square version of og-image

---

### 5. Windows Tiles (`/frontend/public/`)

#### Required Sizes:
- `mstile-70x70.png` - 70x70px
- `mstile-144x144.png` - 144x144px
- `mstile-150x150.png` - 150x150px
- `mstile-310x150.png` - 310x150px (Wide tile)
- `mstile-310x310.png` - 310x310px (Square tile)

**Design**: YOLO logo/icon, centered, with black background

---

### 6. Safari Pinned Tab (`/frontend/public/`)

#### `safari-pinned-tab.svg`
- **Format**: SVG (monochrome)
- **Purpose**: Safari pinned tab icon
- **Design**: Single-color YOLO logo/icon (will be tinted by Safari)
- **Color**: Should be black or dark - Safari applies its own tint

---

## Generation Tools & Resources

### Online Favicon Generators
1. **favicon.io** - https://favicon.io
   - Upload image or generate from text
   - Generates all favicon sizes
   - Free

2. **RealFaviconGenerator** - https://realfavicongenerator.net/
   - Comprehensive favicon generator
   - Generates all formats including iOS, Android, Windows
   - Provides HTML code snippets

3. **Favicon Generator** - https://www.favicon-generator.org/
   - Simple upload and generate

### Design Tools
- **Figma** - Create designs, export at exact sizes
- **Adobe Illustrator/Photoshop** - Professional design tools
- **Canva** - Quick social media image creation
- **GIMP** - Free alternative to Photoshop

### Icon Design Tips
1. Start with a high-resolution base (1024x1024px minimum)
2. Design for the smallest size first (16x16) to ensure readability
3. Use high contrast (lime green on black)
4. Keep designs simple - details get lost at small sizes
5. Test icons at actual sizes before finalizing

---

## Quick Generation Workflow

### Step 1: Create Base Icon Design
1. Design YOLO icon/logo at 1024x1024px
2. Ensure it works on black background
3. Test at 16x16px to verify readability

### Step 2: Generate Favicons
1. Upload base design to favicon.io or RealFaviconGenerator
2. Download generated favicon.ico
3. Extract individual PNG sizes if needed

### Step 3: Generate Apple Touch Icons
1. Create 180x180px version with padding (safe area)
2. Use RealFaviconGenerator to generate all iOS sizes
3. Or manually resize maintaining aspect ratio

### Step 4: Generate PWA Icons
1. Create 512x512px version (maskable - keep content in 80% safe zone)
2. Resize to all required sizes: 72, 96, 128, 144, 152, 192, 384, 512
3. Ensure all maintain quality

### Step 5: Create Social Media Images
1. Design 1200x630px image in design tool
2. Include all key elements (logo, tagline, visual)
3. Export as PNG (better quality) or JPG (smaller file)
4. Optimize file size (aim for <200KB)

### Step 6: Generate Windows Tiles
1. Create 310x310px base design
2. Resize to all required sizes
3. Create wide tile (310x150px) version

---

## File Organization

```
frontend/public/
├── favicon.ico
├── favicon-16x16.png
├── favicon-32x32.png
├── favicon-96x96.png
├── apple-touch-icon.png
├── apple-touch-icon-*.png (legacy sizes)
├── og-image.png
├── twitter-image.png
├── og-image-square.png (optional)
├── mstile-*.png (Windows tiles)
├── safari-pinned-tab.svg
├── browserconfig.xml (already created)
├── robots.txt (already created)
└── icons/
    ├── icon-72x72.png
    ├── icon-96x96.png
    ├── icon-128x128.png
    ├── icon-144x144.png
    ├── icon-152x152.png
    ├── icon-192x192.png
    ├── icon-384x384.png
    ├── icon-512x512.png
    └── roll-icon.png
```

---

## Testing Checklist

After generating all assets:

- [ ] Favicon appears in browser tab
- [ ] Apple touch icon works on iOS devices (test on actual device)
- [ ] PWA install shows correct icons on Android
- [ ] Open Graph preview works (test with [Facebook Debugger](https://developers.facebook.com/tools/debug/))
- [ ] Twitter Card preview works (test with [Twitter Card Validator](https://cards-dev.twitter.com/validator))
- [ ] Icons display correctly on Android home screen
- [ ] Windows tiles work (if applicable)
- [ ] All icon paths resolve correctly (check browser console)
- [ ] robots.txt is accessible at `/robots.txt`
- [ ] Manifest validates correctly (check browser DevTools > Application > Manifest)

---

## Design Inspiration

Reference the existing `yolo-logo.svg` for brand consistency:
- Location: `/frontend/public/yolo-logo.svg`
- Current design: Text-based "YOLO" in lime green (#CCFF00)
- Style: Bold, monospace font

Consider creating an icon version that:
- Works at small sizes (16x16)
- Maintains brand recognition
- Incorporates wheel/trading elements if possible
- Stays true to neo-brutalist aesthetic

---

## Notes

- **Production URL**: Update `NEXT_PUBLIC_SITE_URL` environment variable with your actual domain
- **Twitter Handle**: Update `@yolo` in layout.tsx with actual Twitter handle
- **File Sizes**: Optimize images for web (use tools like TinyPNG or ImageOptim)
- **Accessibility**: Ensure sufficient contrast in all designs
- **Consistency**: All icons should maintain visual consistency with the YOLO brand

---

## Quick Reference: Required Sizes Summary

| Asset | Size | Format | Location |
|-------|------|--------|----------|
| Favicon | 16x16, 32x32, 48x48 | ICO | `/public/favicon.ico` |
| Favicon PNGs | 16, 32, 96 | PNG | `/public/` |
| Apple Touch | 180x180 | PNG | `/public/apple-touch-icon.png` |
| PWA Icons | 72, 96, 128, 144, 152, 192, 384, 512 | PNG | `/public/icons/` |
| OG Image | 1200x630 | PNG/JPG | `/public/og-image.png` |
| Twitter Image | 1200x630 | PNG/JPG | `/public/twitter-image.png` |
| Windows Tiles | 70, 144, 150, 310x150, 310x310 | PNG | `/public/mstile-*.png` |

---

## Next Steps

1. Design base icon/logo (1024x1024px)
2. Generate all favicon sizes using online tool
3. Create social media images (1200x630px)
4. Generate PWA icons (all sizes)
5. Create Windows tiles
6. Test all assets across platforms
7. Update production URL in environment variables
8. Deploy and verify
