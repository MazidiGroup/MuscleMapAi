# Muscle Map AI — design system

**Single source of truth: [`frontend/src/theme/tokens.ts`](frontend/src/theme/tokens.ts)**
(palettes, spacing, radii) and [`frontend/src/theme/semantic.ts`](frontend/src/theme/semantic.ts)
(status, typography, elevation, targets). If a value is not in those two files it is not
part of the system. Screens read them through `useTheme()` / `useSemanticTokens()` and
never hard-code colours.

## Palette — graphite + copper

| Role | Night token | Value |
|---|---|---|
| Page | `bg` | `#0d0b0a` |
| Radial glow | `bgRadialFrom → bgRadialTo` | `#2a211b → #0d0b0a` |
| Card (opaque) | `cardSolid` | `#1a1714` |
| Text / body / muted | `text` / `text2` / `textMuted` | `#faf7f4` / `#d6cec6` / `#a2988e` |
| Accent (brand, interactive, selected) | `accent` | `#e39a5c` |
| Brand gradient | `gradFrom → gradTo` | `#f5c08c → #d0783a` |
| Personal record — the only celebratory colour | `pr` | `#a78bfa` |

Day and Dim are the same system on a warm paper / warm dusk ground; their values live
beside Night in `tokens.ts`.

## Colour roles — one hue, one meaning

- **Copper** is the brand. Logo, CTA, selection and links.
- **Violet `pr`** marks a personal record and nothing else.
- **Red `#FF4438`, amber `#FFB020`, green `#3DDC97`** are reserved for recovery-state and
  muscle-role legends. They never identify a muscle group or decorate a header.
- **Status** (`semantic.status`): info is warm copper (`#f2c39a`), not blue. There is no blue
  anywhere in the product.

## Brand mark

`frontend/assets/images/logo-mark.svg` (transparent) and `logo-icon.svg` (on the warm radial
ground) are the masters. Re-export the PNG icons with
`bash frontend/scripts/export-brand-icons.sh` after editing either one.

## Type

System font for all copy; `semantic.type` carries size, weight and line-height only.

## Shape

8 pt spacing grid (`S`). One curve family: cards, panels and 44 pt round controls share
radius 22 (`CARD_RADIUS`, `CONTROL_RADIUS`); sheets use 28. A resting card has no
outline; only a selected or raised surface draws one, in the accent.
