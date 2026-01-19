# Social Media Preview Image Guide

## Required Image

Create a social media preview image with these specifications:

### Dimensions
- **Size:** 1200×630 pixels (required for Facebook, Twitter, Discord, Reddit)
- **Format:** PNG or JPG
- **File size:** Under 5MB (recommended under 1MB)
- **Filename:** `og-image.png` or `og-image.jpg`

### Design Guidelines

**Content:**
- Main title: "CAISSA Chess AI"
- Subtitle: "Fritz-Style Board + Stockfish"
- Visual: Chess board with pieces (Fritz classic style)
- Colors: Match the Fritz Classic theme (#2c5f9e, #f0d9b5, #b58863)

**Layout:**
```
┌────────────────────────────────────────────┐
│                                            │
│         ♞ CAISSA Chess AI                  │
│                                            │
│   Fritz-Style Board + Stockfish Engine    │
│                                            │
│   [Chess Board Visual - Fritz Theme]      │
│                                            │
│   www.caissa-chess.org                    │
│                                            │
└────────────────────────────────────────────┘
```

### Quick Creation Options

#### Option 1: Canva (Easiest)
1. Go to https://www.canva.com
2. Create custom size: 1200×630px
3. Design with:
   - Background: #2c5f9e (Fritz blue)
   - Title: "CAISSA Chess AI" (large, white, bold)
   - Subtitle: "Fritz-Style Board + Stockfish"
   - Add chess board screenshot or chess piece icons
4. Export as PNG

#### Option 2: Figma
1. Create 1200×630 frame
2. Design with brand colors
3. Export as PNG

#### Option 3: Screenshot + Edit
1. Take screenshot of CAISSA Chess board
2. Use any image editor to resize to 1200×630
3. Add text overlay: "CAISSA Chess AI"
4. Save as PNG

#### Option 4: Use Placeholder
For testing, use this placeholder generator:
```
https://via.placeholder.com/1200x630/2c5f9e/FFFFFF?text=CAISSA+Chess+AI
```

### Where to Save

**Save the file as:**
```
public/og-image.png
```

Or if using JPG:
```
public/og-image.jpg
```

The file will be accessible at:
```
https://www.caissa-chess.org/og-image.png
```

### Testing

After creating the image:

1. **Validate size:**
   ```bash
   # Should output: 1200x630
   file public/og-image.png
   ```

2. **Check file size:**
   ```bash
   # Should be under 1MB
   ls -lh public/og-image.png
   ```

3. **Test URL:**
   Open in browser:
   ```
   https://www.caissa-chess.org/og-image.png
   ```

### Recommended Tools

- **Canva:** https://www.canva.com (easiest)
- **Figma:** https://www.figma.com (professional)
- **GIMP:** https://www.gimp.org (free desktop)
- **Photopea:** https://www.photopea.com (free online Photoshop)

### Example Design

```css
Background: Linear gradient (#2c5f9e → #5a8fc4)
Title: "CAISSA Chess AI"
  - Font: Bold, 72px
  - Color: White
  - Position: Center top
Subtitle: "Fritz-Style Board + Stockfish Engine"
  - Font: Regular, 36px
  - Color: White
  - Position: Below title
Visual: Chess board thumbnail
  - Position: Center
  - Size: 500×500px
Footer: "www.caissa-chess.org"
  - Font: Regular, 24px
  - Color: White
  - Position: Bottom center
```

### Quick Placeholder (Temporary)

Until you create the proper image, use this temporary placeholder:

1. Download any 1200×630 chess-themed image
2. Rename to `og-image.png`
3. Place in `public/` folder
4. Replace later with branded design

Or use an online generator:
- https://ogimage.xyz
- https://www.opengraph.xyz
- https://og-playground.vercel.app

### Important Notes

- Image must be publicly accessible (not behind login)
- Must be served over HTTPS
- Reddit crawler requires image to load quickly (< 2 seconds)
- Avoid transparent backgrounds (use solid color or gradient)
- Text should be readable in thumbnail size (LinkedIn, Reddit preview)
