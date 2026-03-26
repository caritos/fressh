# fressh Logo Guide

## Image Assets

Located in `docs/assets/`:

- **logo.png** (512x512) - Main logo for README and documentation - **TRANSPARENT BACKGROUND**
- **logo-1024.png** (1024x1024) - High resolution version
- **logo-256.png** (256x256) - Medium size for smaller displays
- **logo-128.png** (128x128) - Icon size for favicons
- **logo-64.png** (64x64) - Tiny icon for notifications
- **logo-original-transparent.png** (1408x768) - Original Gemini-generated file with transparent background

All PNG files have **transparent backgrounds** for clean integration anywhere!

## ASCII Art Versions

Available in `src/logo.ts`:

### CLI_BANNER (Used in daemon startup)
```
     ↗
   ↗  🌱   fressh — Fresh RSS Reader
  —  ╱│╲   Terminal-based RSS daemon
```

### ASCII_LOGO (Full boxed version)
```
   ╔═══════════════════════════════╗
   ║                        ↗      ║
   ║         ╭───╮        ↗        ║
   ║         │ 🌱│      ↗          ║
   ║         │   │    ↗            ║
   ║         ╰───╯   —             ║
   ║                               ║
   ║      f r e s s h              ║
   ║   Fresh RSS Reader            ║
   ╚═══════════════════════════════╝
```

### SIMPLE_LOGO (Compact boxed)
```
  ╭──────────────────╮
  │  🌱 fressh —     │
  │  Fresh RSS Feed  │
  ╰──────────────────╯
```

### TERMINAL_LOGO (Minimal)
```
     ↗
   ↗ 🌱
  — ╱│╲

  fressh
```

### COMPACT_LOGO (One-line)
```
  🌱 fressh — Fresh RSS Reader
```

## Logo Symbolism

- **🌱 Plant sprout** - Fresh, growing RSS feeds
- **↗ Upward arrow** - New content arriving, growth
- **— CLI dash** - Command-line/terminal tool
- **Rounded square** - Modern app icon design
- **Color scheme** - Cyan/green gradient (fresh, alive, tech)
- **Transparent background** - Clean integration on any surface

## Usage

### In Code
```typescript
import { CLI_BANNER, SIMPLE_LOGO, COMPACT_LOGO } from './logo.js';

// Daemon startup
console.log(CLI_BANNER);

// Help screens
console.log(SIMPLE_LOGO);

// Inline branding
console.log(COMPACT_LOGO);
```

### In Markdown
```markdown
<p align="center">
  <img src="docs/assets/logo.png" alt="fressh logo" width="200">
</p>
```

### In HTML
```html
<!-- Light or dark backgrounds - transparent logo works everywhere! -->
<img src="docs/assets/logo.png" alt="fressh" width="128">
```

## File Locations

- PNG assets: `docs/assets/logo*.png` (all with transparent backgrounds)
- ASCII art: `src/logo.ts`
- README logo: Top of `README.md`
- Daemon startup banner: `src/daemon.ts`

## Creating macOS .icns (Optional)

To create a macOS app icon:

```bash
# Create iconset directory
mkdir fressh.iconset

# Copy and rename sizes
cp docs/assets/logo-1024.png fressh.iconset/icon_512x512@2x.png
cp docs/assets/logo.png fressh.iconset/icon_256x256@2x.png
cp docs/assets/logo-256.png fressh.iconset/icon_256x256.png
cp docs/assets/logo-128.png fressh.iconset/icon_128x128.png
cp docs/assets/logo-64.png fressh.iconset/icon_32x32@2x.png

# Generate .icns
iconutil -c icns fressh.iconset
```
