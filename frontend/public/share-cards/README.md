# Share card backgrounds (anime / cartoon)

**You only add the art here.** The app draws on top: YOLO logo, taglines, pair/leverage/direction, PnL, %, open/close times, and `tradeonyolo.fun`.

Add **four** images (square works best; cropped with `object-fit: cover`):

| File | When |
|------|------|
| `positive-1.png` | Win — variant A |
| `positive-2.png` | Win — variant B |
| `negative-1.png` | Loss — variant A |
| `negative-2.png` | Loss — variant B |

- Formats: **PNG** or **WebP** (update paths in `frontend/src/lib/shareCardBackgrounds.ts` if `.webp`).
- Recommended: **1080×1080** or larger for sharp PNG exports.
- Leave the **bottom ~35%** a bit calmer if you can — text and PnL sit there (gradient helps either way).

Until these files exist, the card uses a simple lime/pink gradient fallback.
