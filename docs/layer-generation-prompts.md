# 分層素材生成提示

使用內建 GPT image_gen，`transparent_background: true`。所有生成檔已複製到 `public/assets/characters/hana/`；程式中使用的註冊素材另存於 `parts/`。`scripts/package-layers.ts` 包裝透明素材，原始生成圖片保留。

## body-base-generated.png

參考與編輯目標：`armless.png`。

```text
Use case: precise-object-edit. This is the edit target, a registered 1254 by 1254 transparent PNG anime character rig repair plate. Create the underpainting BODY BASE texture for independent hair layers. Remove ALL lavender hair, all bangs, all side locks, rear hair, moon hairpin and hair ornaments. Remove the screen-left sleeve/arm/hand as well, so both arms are absent, leaving shoulder ends. Preserve the exact character identity, face, eyes, eyebrows, nose, tiny closed mouth and neck, the exact positions, size, proportions and painted lighting. Reconstruct a complete clean natural rounded forehead and ears and skull outline where hair concealed them; keep feminine cute adult anime face, no hair at all. Preserve the exact ivory blouse/bow and purple skirt/thighs with their rich cel-shaded lighting; carefully reconstruct the clothing where hair lay across it. NOT a new character design, no alternate pose, no replacement outfit, no different framing. The original face and garment positions must match the image exactly pixel for pixel wherever visible. Keep 1254 by 1254 original canvas composition with crown at x630 y12, eye centers at (575,258),(685,252), mouth at (637,325), waist at y725. Genuine transparent alpha outside the character; no floor, no background, no text, no hair. This is a technical layered rig component.
```

## hair-back-generated.png

參考與編輯目標：`neutral.png`。

```text
Use case: precise-object-edit. Edit target is the reference transparent registered anime character. Extract and reconstruct ONLY the BACK HAIR layer for this exact lavender-haired anime girl. No face, no ears, no skin, no blouse, no skirt, no arms, no hands, no jewelry. Only beautiful long rear hair rooted at original crown x630 y12, spreading behind the skull from x420 to800 and long curls spreading x150 to1110 down to y1020. Reconstruct continuous fully painted lavender locks where the body/face used to cover them, especially behind the neck and shoulders, because this is a true back-hair rig layer. Keep identical original lavender hue, finely drawn shaded glossy locks and bright cool pearlescent highlights. Same original 1254 by1254 square canvas, exact placement scale of the original hair. Back hair excludes the foreground fringe/bangs and excludes the two long shoulder-front face-framing strands. Genuine transparent alpha all else, not checkerboard and no scene, no labels. Production quality original art.
```

## hair-front-generated.png

參考與編輯目標：`neutral.png`。

```text
Use case: precise-object-edit. Isolate ONLY the FOREGROUND FRINGE/BANGS AND TOP CROWN hair layer of the exact reference anime woman. Output a transparent rig component on SAME full1254x1254 canvas, same positioning: crown x630y12, top hair from x470to816 y12to210, then delicate original bangs draping over forehead down to y252 between x520and740. Include original moon hair ornament at x764y123. Keep all original painted hair pixels, lighting, colors and scale unchanged. Remove all face, eyes, ears, skin, clothes, body, hands and ALL LONG SIDE/BACK hair beyond the bang shape. This layer is a isolated top crown cap and bang silhouette, not a wig of all hair, there must be NO long locks under y300. Front fringe border follows its strand shapes and transparent spaces. True alpha background, no text or new design. High-quality finely shaded lavender glossy anime hair.
```

## hair-middle-generated.png

參考與編輯目標：`neutral.png`。

```text
Use case: precise-object-edit. Isolate ONLY TWO FRONT SIDE HAIR LOCKS / middle hair layer for this exact lavender-haired anime woman, transparent independent rig part. Keep original same1254x1254 registered canvas, exact positions and finely painted colors. Two long face-framing strands emerge beside temples at approximately(x505,y208) and(x755,y199), curve beside cheek/neck/shoulders then lie over the ivory blouse down to approximately(x460,y745) and(x797,y735). Include the original curled tip and silky detailed pearlescent lighting. Exclude ALL central fringe/bangs/crown above y170; exclude ALL long rear hair spreading to far-left/right; exclude face eyes ears neck skin blouse skirt arms hands and ornaments. Only the two elegant side-front locks with fully drawn volume and beautiful soft cool highlights. Background actual transparent alpha. The empty middle between the two locks must stay fully transparent. Do not alter design, color or placement. No text, no background.
```

生成結果沒有全部遵守註冊縮放，因此包裝腳本把新髮束對齊原角色的頭頂與臉旁；沒有偽稱生成結果是逐像素一致的拆圖。組裝後已目視驗證，表情來源保持原始像素對位。袖子仍有原圖髮絲遮擋的畫筆痕跡，極端變形需要美術接縫微調。
