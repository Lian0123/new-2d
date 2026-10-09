# v3 補繪素材與提示紀錄

2026-10-09。使用內建 `image_gen.imagegen`，四次均為 `precise-object-edit`，`transparent_background: true`。原畫未覆寫；生成結果先保存在 Codex 的 generated_images，選定版本另複製到專案。

| 編輯目標 | 保存的生成圖 | 實際使用的註冊素材 |
| --- | --- | --- |
| `arm-rest.png` | `public/assets/characters/hana/arm-clean-v3.png` | `parts-v3/arm-upper.png`、`parts-v3/sleeve.png` |
| `parts/hair-back.png` | `public/assets/characters/hana/hair-back-clean-v3.png` | `parts-v3/hair-back.png` |
| `parts/arm-right-wave.png` | `public/assets/characters/hana/hand-clean-v3.png` | `parts-v3/hand-open.png` |
| `parts/hair-middle.png` | `public/assets/characters/hana/hair-middle-clean-v3.png` | `parts-v3/hair-middle.png` |

`parts-v3` 的完整路徑為 `public/assets/characters/hana/parts-v3/`。生成器未完全遵守座標，故 `scripts/package-layers-v3.ts` 依目視確認的肩、袖口、手腕與髮根進行縮放和註冊；沒有假稱生成結果逐像素保持原畫。左右手臂由播放器鏡像共用來源，美術生成本身不負責骨骼對稱。

## 乾淨袖臂

```text
Use case: precise-object-edit. Edit target: transparent full1254x1254 isolated screen-right resting arm texture for this lavender anime character. Keep exact source placement, size, diagonal hanging pose, shoulder at(797,474), elbow around(856,746), wrist(956,989), fingers down to y1173. Reconstruct a COMPLETE CLEAN independently usable arm AND ivory chiffon balloon sleeve where purple HAIR strands cross it: remove absolutely every lavender hair strand and reconstruct matching uninterrupted ivory fabric, embroidery and skin beneath. Preserve purple small sleeve bows and cuff ornament. Keep five anatomical fingers and the original relaxed downward hand, do not spread the hand. Correct outer clipping of shoulder by reconstructing a softly round upper arm joint cap centered(797,474). Fabric should be fully painted and opaque, including shaded pixels and embroidery; NO holes inside sleeve. This is one isolated arm and sleeve not a full character. Same square canvas, arm remains on right side with large transparent space elsewhere, do not enlarge or recenter. Keep beautiful original high detail anime rendering and identical clothing design. True transparent alpha outside silhouette. No hair, no text, no background.
```

生成圖的原有下垂手掌保留在原始生成檔，正式綁定使用另外補繪的獨立五指手掌。

## 後髮

```text
Use case: precise-object-edit. This edit target is an isolated rear lavender hair rig component on1254x1254 transparent square canvas. Repair to a BILATERALLY SYMMETRIC complete back-hair layer, center axis x627, crown centered x627 y12, outer curls within x135..1119 ending around y1030. Preserve glossy finely shaded pearlescent lavender strands and curls of original design, coherent flowing strand detail. Reconstruct any accidental missing paint inside solid hair locks; opaque continuous painted central hair mass behind where head, torso, shoulder and arms would be. NO silhouette shaped holes for face or clothes. Natural small transparent gaps BETWEEN separate curled outer locks are okay. Each left lock has a matching right lock with matching volume, silhouette and length; internally coherent symmetric construction. No foreground bangs, no forehead fringe, no side locks intended over chest; rear hair only. No face no skin no body no clothing no accessories. Maintain original full square canvas placement and original scale, don't zoom to fill, true transparent alpha outside hair. No background or text.
```

## 手掌

```text
Use case: precise-object-edit. Edit target is full1254x1254 transparent isolated anime arm wave component. Produce ONLY this exact OPEN HAND AND WRIST as independent rig sprite. Keep hand exact size and canvas placement: fingers between x815..1000 y260..390, palm center around(905,390), wrist center(908,497), end of wrist y510. Preserve beautiful soft peach skin shading of original anime artwork. FIVE fingers: one thumb pointing screen left, four slender separated fingers upward. Fix the thumb by removing ALL lavender hair visible beside it and reconstruct clean anatomical thumb edge. Remove ALL sleeve, shoulder, upper arm, fabric, cuff, bows, hair; no pixels below y515. Wrist has smooth rounded end with skin continuing underneath cuff for attachment overlap. Exact original hand identity, proportions and pose; no recentering or zoom, full square1254x1254 canvas remains otherwise transparent. True transparent alpha, no background no text, no extra fingers or distorted fingers.
```

## 中髮

```text
Use case: precise-object-edit. Isolated lavender front-side hair-lock pair for an anime rig, edit this target. Make the two locks structurally bilateral SYMMETRIC around x627 of1254x1254 canvas: equal length, matching width, matching S-curves and volume, both rooted at temples near(505,208) and(749,208), falling beside face and across shoulders to around(458,750),(796,750). Keep exquisite lavender glossy cel shading pearl highlights silky strand strokes, fully painted continuous locks with no accidental missing pixels inside strand volume; only natural transparent gaps between separated curls. Keep transparent central space: face, neck and chest area MUST remain empty. NO skin clothing face rear hair or fringe, only these two foreground hair locks. Maintain exact original scale and full canvas positioning, do not zoom. True alpha transparency no background no text.
```
