# Braun / Bauhaus Design System

**Date:** 2026-05-16  
**Scope:** Mobile app visual redesign — all three screens  
**Approach:** Token swap + shared UI component layer (Option B)

---

## Design Direction

Redesign the fressh mobile app to reflect the Braun / Bauhaus design philosophy: function determines form, every element earns its place, exactly one accent colour.

Core decisions:
- **Mode:** Light (off-white ground, not dark)
- **Typography:** Barlow (DIN-inspired geometric sans) for all UI text; JetBrains Mono retained for metadata, section labels, and badges
- **Accent:** `#E8500A` — the orange of the Braun ET66 calculator's equals key
- **Emoji removed:** Smart feed labels (`⭐ Starred`, `📬 All Unread`, `🗓 Today`) become plain text (`Starred`, `All Unread`, `Today`)
- **Read state:** Colour change to `textDimmed` (`#BBBBB0`) instead of `opacity: 0.4` — more precise, no grey smear on the background

---

## Design Tokens — `src/constants.ts`

### Colors

| Token | Value | Usage |
|---|---|---|
| `background` | `#F5F5F0` | Screen backgrounds |
| `surface` | `#EBEBEB` | Navigation headers, modals, bottom bar |
| `surfaceAlt` | `#E4E4DF` | Section header rows |
| `border` | `#D0D0C8` | Hairline separators |
| `text` | `#111111` | Primary text |
| `textSecondary` | `#888888` | Meta text, section labels |
| `textDimmed` | `#BBBBB0` | Read article titles and timestamps |
| `accent` | `#E8500A` | Badges, CTAs, tint colour, interactive text |

### Fonts

| Token | Value | Usage |
|---|---|---|
| `FONTS.sans` | `'Barlow-Regular'` | Body, list items |
| `FONTS.sansMedium` | `'Barlow-Medium'` | Row labels (unread state) |
| `FONTS.sansBold` | `'Barlow-Bold'` | Titles, nav headers, buttons |
| `FONTS.mono` | `'JetBrainsMono-Regular'` | Meta text, timestamps |
| `FONTS.monoMedium` | `'JetBrainsMono-Medium'` | Section headers |
| `FONTS.monoBold` | `'JetBrainsMono-Bold'` | Badge counts |

Load Barlow variants (`Regular`, `Medium`, `Bold`) via `expo-font` in `_layout.tsx` alongside the existing JetBrains Mono variants. The `FONTS.regular`, `FONTS.medium`, `FONTS.bold` aliases are replaced by the above semantic names, with all call sites updated accordingly.

### Type Scale

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Article title | Barlow Bold | 22px | 700 | lh 1.35 |
| Nav header | Barlow Bold | 14px | 700 | uppercase, ls 0.07em |
| List item (unread) | Barlow Medium | 14px | 500 | |
| List item (read) | Barlow Regular | 14px | 400 | color: textDimmed |
| Body text | Barlow Regular | 15px | 400 | lh 1.7 |
| Meta / timestamp | JetBrains Mono Regular | 10px | 400 | uppercase, ls 0.12em |
| Section header | JetBrains Mono Medium | 9px | 500 | uppercase, ls 0.18em |
| Badge count | JetBrains Mono Bold | 10px | 700 | |

---

## Shared Components — `src/components/ui/`

Four components extracted from repeated StyleSheet patterns across the three screens.

### `Row.tsx`

```
Props:
  label: string
  meta?: string          — timestamp or subtitle, rendered in mono below label
  badge?: number         — renders Badge if > 0
  dimmed?: boolean       — applies textDimmed color + Regular weight
  onPress: () => void
```

Renders a full-width touchable row with:
- `paddingHorizontal: 16`, `paddingVertical: 13`
- `borderBottomWidth: StyleSheet.hairlineWidth`, `borderBottomColor: COLORS.border`
- `backgroundColor: COLORS.background`
- Label in `FONTS.sansMedium` / `FONTS.sans` depending on `dimmed`
- Badge on the right if `badge > 0`

### `SectionHeader.tsx`

```
Props:
  title: string
```

Renders the grey section bar:
- `backgroundColor: COLORS.surfaceAlt`
- `paddingHorizontal: 16`, `paddingVertical: 5`
- `borderBottomWidth: StyleSheet.hairlineWidth`, `borderBottomColor: COLORS.border`
- Text in `FONTS.monoMedium`, 9px, uppercase, `letterSpacing: 1.62` (= 0.18em × 9px), `color: COLORS.textSecondary`

### `Badge.tsx`

```
Props:
  count: number
```

Renders an orange pill — hidden when `count === 0`:
- `backgroundColor: COLORS.accent`
- `borderRadius: 10`, `paddingHorizontal: 7`, `paddingVertical: 2`
- Text in `FONTS.monoBold`, 10px, `color: '#fff'`

### `NavBar.tsx`

```
Props:
  onPrev: () => void
  onNext: () => void
  prevDisabled: boolean
  nextDisabled: boolean
```

The Prev / Next bottom bar in the article reader:
- `backgroundColor: COLORS.surface`
- `borderTopWidth: StyleSheet.hairlineWidth`, `borderTopColor: COLORS.border`
- Each button: `flex: 1`, text in `FONTS.sansBold`, 15px, `color: COLORS.accent`
- Disabled state: `color: COLORS.textDimmed`
- Centre hairline divider between buttons

---

## Screen Changes

### Feeds list — `app/feeds/index.tsx`

- `SMART_FEEDS` labels: remove emoji prefixes → `'Starred'`, `'All Unread'`, `'Today'`
- `renderFeedRow` and smart feed render: replace inline `TouchableOpacity` + `StyleSheet` row with `<Row>` component
- `renderSectionHeader`: replace with `<SectionHeader>`
- Unread badge: replace with `<Badge count={feed.unread_count} />`
- Header `+` button: `fontSize: 24`, `fontFamily: FONTS.sans`, `fontWeight: '300'`, `color: COLORS.accent`
- Delete swipe action: flat `backgroundColor: '#C0392B'`, label `'Remove'` in `FONTS.sansBold`, white
- Add Feed modal: `backgroundColor: COLORS.surface`, title in `FONTS.sansBold` 18px, input in `FONTS.sans`, confirm button `backgroundColor: COLORS.accent` with `borderRadius: 3`

### Article list — `app/feeds/[feedId]/index.tsx`

- `renderItem`: replace with `<Row label={title} meta={relativeTime} dimmed={item.read} />`
- Starred indicator: prepend `★ ` to label string (no emoji, plain text star)
- "Mark All Read" header button: `color: COLORS.accent`, `FONTS.sansMedium`
- Star swipe action: `backgroundColor: '#B8860B'` (dark gold, not amber)
- Share swipe action: `backgroundColor: '#555555'` (neutral dark grey)
- Read/Unread swipe action: `backgroundColor: COLORS.accent` for marking read, `backgroundColor: '#555555'` for marking unread

### Article reader — `app/feeds/[feedId]/[articleId].tsx`

- Meta line: `FONTS.mono`, 10px, uppercase, `color: COLORS.textSecondary`
- Title: `FONTS.sansBold`, 22px, `color: COLORS.text`, `lineHeight: 30`
- Author: `FONTS.sans`, 12px, `color: COLORS.textSecondary`
- Body: `FONTS.sans`, 15px, `color: COLORS.text`, `lineHeight: 26`
- "Open in Browser" button: `backgroundColor: COLORS.accent`, `borderRadius: 3` (sharp, not rounded), `FONTS.sansBold`
- Star / share header icons: `color: COLORS.accent`
- Replace `<View style={styles.navBar}>` with `<NavBar>` component

### Root layout — `app/_layout.tsx`

- Add Barlow font variants to `useFonts` call
- Update `Stack` `screenOptions`: `headerStyle.backgroundColor: COLORS.surface`, `headerTintColor: COLORS.text`, `headerTitleStyle.fontFamily: FONTS.sansBold`
- Update `COLORS` and `FONTS` imports across all screens to use new token names

---

## Swipe Action Palette

| Action | Colour | Label |
|---|---|---|
| Remove feed | `#C0392B` | `Remove` |
| Star article | `#B8860B` | `Star` / `Unstar` |
| Share article | `#555555` | `Share` |
| Mark read | `#E8500A` (accent) | `Read` |
| Mark unread | `#555555` | `Unread` |

---

## File Structure After Change

```
src/
  constants.ts              — updated tokens (COLORS + FONTS)
  components/
    ui/
      Row.tsx
      SectionHeader.tsx
      Badge.tsx
      NavBar.tsx
app/
  _layout.tsx               — add Barlow fonts
  feeds/
    index.tsx               — use Row, SectionHeader, Badge
    [feedId]/
      index.tsx             — use Row, Badge
      [articleId].tsx       — use NavBar
```

---

## Out of Scope

- Dark mode toggle (light only)
- Navigation structure changes
- New screens or features
- Custom font licensing (Barlow is Apache 2.0, free via Google Fonts / expo-google-fonts)
