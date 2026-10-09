# Hana character generation

最新的前／中／後髮與無髮衣裝補繪，詳見 [分層生成提示](layer-generation-prompts.md)；目前圖層規格見 [LAYERS.md](LAYERS.md)。以下保留原畫、表情與手臂素材的生成紀錄。

Generated with the built-in GPT image generation tool on 2026-10-05 for this project. All final PNGs are copied into the repository; the app does not depend on files under `~/.codex`.

## Final assets

| Asset | Purpose | Canvas | Alpha | Bytes |
| --- | --- | --- | --- | ---: |
| `public/assets/characters/hana/neutral.png` | Base neutral character | 1254 × 1254 | RGBA, 0–255 | 1,683,594 |
| `public/assets/characters/hana/blink.png` | Closed-eye expression source | 1254 × 1254 | RGBA, 0–255 | 1,633,710 |
| `public/assets/characters/hana/talk.png` | Open-mouth expression source | 1254 × 1254 | RGBA, 0–255 | 1,644,041 |
| `public/assets/characters/hana/wave.png` | Raised-hand pose source | 1254 × 1254 | RGBA, 0–255 | 1,678,311 |

## Visual and alpha QA

- Every image was opened and visually reviewed. Same original adult character identity, costume, frame and face placement are retained.
- PNG inspection confirmed genuine alpha channels, fully transparent backgrounds and alpha extrema of 0 and 255 in every asset. Fully transparent pixels comprise 50.3–52.1% of each canvas.
- Facial overlays are taken from the blink and talk images rather than exchanging the full body, avoiding small generative drift outside the edited face region.
- The generated asset canvas is 1254 × 1254, despite a requested 1536 × 1536. No fake upscaling was applied.
- Crown and lower thighs touch the vertical frame limits. The runtime should fit the complete canvas and add stage padding.
- Some RGB values in practically invisible alpha pixels are saturated magenta/blue. In neutral, all such identified pixels have alpha 1–4/255. Normal browser alpha compositing preserves the intended silhouette. Do not process these PNGs as RGB-only images.
- This is a set of transparent character raster frames and editable rig metadata, not a source PSD or a Cubism model. Native drawImage rendering and face crop overlays preserve the assets' alpha.

## Recommended feature crops

Coordinates are in source pixels; all images use the same canvas.

| Feature | x | y | width | height | Normalized rectangle |
| --- | ---: | ---: | ---: | ---: | --- |
| Eyes | 520 | 222 | 212 | 67 | [0.414673, 0.177033, 0.169059, 0.053429] |
| Mouth | 594 | 303 | 75 | 44 | [0.473684, 0.241627, 0.059809, 0.035088] |

## Final prompt set

### neutral.png

```text
Use case: stylized-concept
Asset type: production transparent 2D anime character sprite for a browser-based Live2D-style rig editor.
Primary request: Create exactly one exquisitely polished original Japanese anime young adult woman, age 22, cute and warm, standing squarely front-facing, from top of hair through upper thighs, neutral relaxed pose. Long silky lavender hair, artfully segmented bangs, flowing side locks reaching upper thighs, a delicate silver crescent hair ornament on screen-left, large luminous aqua eyes with violet lower gradients, closed small gentle smile, subtle peach blush. Tasteful elegant pale lilac/ivory long-sleeve blouse with a lavender ribbon bow, deep violet pleated skirt, silver small accents.
Composition/framing: 1536 x 1536 square canvas. Head centered at x=768, crown near y=135, eyes around y=435, chin near y=555. Upper thighs end near y=1420. Centered symmetric frontal body. Both hands fully visible near hip height around y=1100; arms slightly spaced from torso and bent very slightly, with transparent air gaps to make arms easy to isolate. Hair full silhouette, entire hands, skirt corners all comfortably inside canvas. Keep 100 pixels clear margin on every edge.
Style/medium: high-end Japanese anime illustration, crisp clean fine linework, refined high-detail cel shading, luminous satin hair highlights, layered soft skin light, rich fold shadows. Production character-sheet quality, refined and adorable, no chibi proportions.
Lighting/mood: soft key light upper screen-left, delicate cool rim light at screen-right, readable shadow shapes; warm friendly expression. Hair should show several long pearlescent highlight streaks.
Scene/backdrop: TRUE TRANSPARENT ALPHA BACKGROUND, every pixel outside the character transparent. No environment, no floor, no checkerboard painted into image, no background glow, no drop shadow.
Constraints: one character only, direct front view, visible hands with five elegant anatomically correct fingers, closed mouth, open eyes. Preserve natural adult proportions. No text, logos, watermark, border, cropped extremities, props, explicit clothing, weapons, additional character. Asset must be genuinely transparent PNG with clean antialiased edges.
```

### blink.png

```text
Use case: identity-preserve
Asset type: blink expression variant for 2D character rig editor.
Input image: edit target is the attached neutral character asset.
Primary request: Change ONLY both eyes from open to gently closed blinking eyes. Keep the original character artwork and all pixels as close to identical as possible everywhere outside the eyelids. Draw fine dark curved closed upper eyelash lines following existing eye widths, preserve surrounding eyebrows, blush, nose, mouth, fringe, jewelry. The exact same original cute adult anime woman, lavender hair and ivory lilac costume.
Composition/framing: Exact same 1254x1254 square canvas, camera, crop, character scale and location as reference. Eyes remain centered near x=570 and x=680, y=255. Full frontal body and relaxed downward arms unchanged.
Scene/backdrop: True transparent alpha background, preserve original transparency; no painted checkerboard or environment.
Constraints: Change only the eye expression to a natural blink. Mouth remains same small closed smile. Keep same head pose, facial proportions, colors, highlights, shadows, hair contours, arm pose, clothing and body position. No zoom, no rearranging, no new adornments, no text, no watermark. Retain clean alpha edges.
```

### talk.png

```text
Use case: identity-preserve
Asset type: open-mouth speaking expression variant for 2D character rig editor.
Input image: edit target is the attached neutral character asset.
Primary request: Change ONLY the small closed smile into a charming small open speaking mouth. A neat dark peach inside mouth with a subtle pink tongue and a tiny visible hint of upper teeth; mouth opening approximately 25 pixels wide and 15 pixels tall, located at the original mouth center near (630,322). Keep neutral open aqua violet eyes. This is a soft friendly talking expression.
Composition/framing: Exact same 1254x1254 square canvas, camera, crop, character scale and location as original. Keep face, eyes, nose, eyebrows, blush, hair, crescent ornament, jewelry, costume, skirt, hands, arm pose, thighs and alpha silhouette unchanged. Same original adult anime woman.
Scene/backdrop: True transparent alpha background; preserve original background transparency and clean cutout. No checkerboard or environment.
Constraints: Change only the mouth to a natural small open speaking mouth. Do not change eye expression, body pose, face proportions, head angle, all hair contours, colors, highlights, shadows or costume details. No zoom, no rearranging, no new adornments, no text, no watermark. This is a carefully registered animation frame derived from the exact original image.
```

### wave.png

```text
Use case: identity-preserve
Asset type: waving pose variant for the same transparent 2D anime character.
Input image: attached neutral artwork is the exact identity, costume, face, hair, shading and frame reference and the edit target.
Primary request: Change ONLY the arm on SCREEN-RIGHT: raise her left arm in a friendly wave. Her forearm should point upward, hand with five anatomically correct softly spread fingers and palm facing viewer, next to her face on screen-right around x=1000,y=375. Sleeve remains the identical ornate ivory long sleeve. Elbow at x=975,y=700. Preserve the unchanged screen-left arm down by her hip. Preserve original neutral open eyes and closed small smile exactly.
Composition/framing: Exact same 1254x1254 square canvas, character scale, head location and torso and skirt positions as reference. The waving hand MUST be fully inside the square frame; keep within x=860..1110 and y=235..470 with at least 100 pixels outside margin. Crown and lower thigh crop stay exactly like original. No zoom or crop changes.
Style/medium: Same exquisite high-quality original anime rendering, lavender silky long hair, shiny aqua violet eyes, ivory lavender blouse and violet pleated skirt, fine crisp linework, detailed luminous cel shading. Same adult character, age 22.
Scene/backdrop: TRUE TRANSPARENT ALPHA BACKGROUND, absolutely no environment or painted checkerboard. Clean pristine antialiased edges with NO magenta, blue or white fringe, NO isolated stray pixels or stray paint outside silhouette. Transparency only outside character.
Constraints: Only screen-right arm and the immediately occluded hair area may change. Keep face, expression, head angle, all hair elsewhere, clothing torso, crescent jewelry, screen-left arm, skirt and thigh contours unchanged. Five fingers, friendly natural hand. No extra arm, no doubled hands, no prop, no text, no watermark, no backdrop.
```

## Articulated right arm and wind support

A registered right-arm-less repair plate was generated as a new sibling asset after motion QA revealed that blending the two original full poses can produce two visible limb silhouettes. It restores the lavender hair hidden behind the resting sleeve. The original four PNGs are unchanged.

| Asset | Role |
| --- | --- |
| `public/assets/characters/hana/armless.png` | GPT-generated registered repair plate with the screen-right arm removed and hair restored |
| `public/assets/characters/hana/arm-rest.png` | Registered source texture packaged from neutral through a reviewed alpha polygon |
| `public/assets/characters/hana/arm-wave.png` | Registered source texture packaged from wave through a reviewed alpha polygon |
| `arm-rest-mask.svg`, `arm-wave-mask.svg` | Source-space vector alpha stencils used for sprite packaging |
| `arm-rig.json` | Source-space and normalized polygons, shoulder/elbow/wrist joints |

Every image remains 1254 × 1254 RGBA, with real transparent outside pixels. Arm components preserve the original source pixels and colors. Some original lavender strands cross the ivory sleeves; the packaged arm textures retain these painted occlusion details. They are faithful raster extractions, not fully repainted art layers.

Suggested continuous articulation uses shoulder (797, 474), resting elbow (856, 746), resting wrist (956, 989), raised elbow (929, 710), raised wrist (908, 497). Move a single visible arm contour along joint-angle arcs. Blend resting/raised textures only after both are mapped to the same target geometry. Keep the restored body/hair static behind the arm.

For garment wind, pin the waist around normalized y = 0.56; increase cloth displacement toward the pleated hem around y = 0.83–0.89 and pin the thighs below y = 0.90. A subtle upward hem displacement around 0.015 of source height (19 pixels) gives readable lift while keeping the original outfit coverage. Sleeve wind should be pinned at its shoulder/seam and increase toward the puffed cuff, with lagging spring motion rather than independent full-image transforms.

### armless.png prompt

```text
Use case: precise-object-edit
Asset type: registered repair plate for an original 2D anime character rig, to provide restored background hair behind the screen-right arm.
Input image: the attached neutral character is the exact EDIT TARGET.
Primary request: Remove the entire arm on SCREEN-RIGHT ONLY, including exposed upper arm skin, ivory puffed sleeve, cuff, wrist and hand. Restore the long lavender hair silhouette and hair strands that were naturally behind that removed arm. At the screen-right shoulder, retain the shoulder/top blouse neckline and tiny attachment area, but no upper arm. The body torso blouse and skirt remain perfectly intact. The arm on SCREEN-LEFT remains fully unchanged. This is a technical rigging texture repair plate, not a finished portrait; exactly one arm is intentionally removed.
Repair region: On screen-right from source x=778..1040, y=427..1170. Remove the sleeve and hand that run diagonally down from the shoulder around (797,474) through elbow(856,746), wrist(956,989), hand(984,1092). Fill former arm areas with the matching lavender long hair that flows behind it where appropriate and transparent background where outside the hair silhouette. Keep the original screen-right hair shape with no new elaborate designs.
Composition/framing: EXACT SAME 1254×1254 canvas. Exact same character position, scale, crop, top of head, face, eyes, neutral closed mouth, crescent ornament, neck, torso, skirt, thigh and entire screen-left side. All pixels outside the stated screen-right arm region should remain identical.
Style: Exact original illustration style, detailed pearlescent lavender hair highlights and fine linework. Continue existing hair lighting; no anatomy below removed arm; no extra hand, no new sleeve.
Background: Genuine transparent alpha background. No checkerboard, no environment, no text, no shadow outside character.
Constraints: Remove only screen-right arm; do not replace with another arm, do not change pose elsewhere, do not change outfit torso, no cropped canvas.
```

