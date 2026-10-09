# Mio Studio

使用 **Node.js + TypeScript + React** 製作的 2D 動漫角色工作台。預設角色是 GPT 生成的高品質透明 PNG，日本動漫風格，具有完整的前／中／後髮、衣料與袖子分層。

## 開啟工作台

```sh
npm install
npm run dev
```

開啟終端顯示的 Vite 網址（預設 `http://127.0.0.1:5173`，占用時會改用下一個埠）。Node API 使用 `http://127.0.0.1:4311`。需要 Node.js 22.12 以上。

```sh
npm run build
npm start
```

正式版由 Node 同時提供編輯器與匯出 API，網址為 `http://127.0.0.1:4311`。

## 已實作

- 角色範例選擇器：花音分層動畫，以及櫻咲側身比耶、蒼月叉腰、柚月坐姿閱讀、凜音抬腿敬禮四位原創動漫角色。新角色是完整透明姿勢插畫，支援構圖與光影、PNG、可攜 JSON 及網頁包。
- 14 個圖層：前／中／後髮、頭部與身體、上衣、裙襬、眼睛、嘴型，以及左右上臂、袖子和獨立手掌。袖子補全髮絲遮擋區，上衣保留完整布料。
- 各部件的顯示、鎖定、透明度、位移、旋轉、縮放、排序及 PNG 素材替換；也可匯入配件圖層。
- 左右眼獨立眨眼、視線、嘴巴開合、微笑、轉頭、抬手和呼吸。
- 對稱肩肘骨架、固定臂長與連續肘部權重；手掌獨立旋轉，手指不參與袖子變形，也不交叉淡入不同姿勢。
- 風力、風向、裙襬飄動與袖口擺動；髮絲、衣襬與袖口使用不同的延遲／擺動區域。
- 動作參數採用與影格率無關的平滑過渡；眼睛與嘴巴較快、手臂與風力較慢。
- GPU 網格變形與 Canvas fallback；可顯示網格、拖曳頂點調整造型、設定表情遮罩。
- 關鍵影格時間軸：播放、暫停、跳轉、上一幀／下一幀、新增／刪除影格、11 種動畫預設、調整長度。
- 曝光、光源強度與方向、色溫、陰影、高光控制，保留透明 alpha。
- 麥克風音量對嘴；聲音只在目前瀏覽器中處理，不上傳。
- IndexedDB 自動儲存、可攜式 JSON 專案、復原／重做、透明 PNG 截圖。
- 網頁 ZIP 匯出：PNG 素材、專案 JSON、播放器 JS、完整操作頁與嵌入說明，部署後不需要 Node 或 CDN。

## 使用方式

點擊導覽列的「角色範例」選擇角色，切換後可用復原返回原專案。四位姿勢插畫尚未拆成動畫部件；工作台顯示適用的構圖與光影控制。手機版也可開啟選擇器。

1. **角色製作**：選擇左側圖層，在左下方調整部件或替換 PNG；右側控制表情／姿勢，切換「光影」調整氛圍。
2. **網格綁定**：選取工具下拖曳網格頂點；使用右側滑桿校正左右眼與嘴型遮罩。
3. **動畫編輯**：選擇 11 種動作，包括揮手、點頭、搖頭、眨眼微笑、歪頭、環顧及雙手歡迎，或點擊參數旁菱形新增關鍵影格。點擊時間尺跳轉，雙擊影格刪除。
4. **匯出網頁**：下載 ZIP，把解壓後的整個資料夾部署到靜態網站。麥克風需在 localhost 或 HTTPS 使用。

快捷鍵：`Space` 播放／暫停、`G` 顯示網格、`Ctrl/⌘ S` 下載專案、`Ctrl/⌘ Z` 復原、`Ctrl/⌘ Shift Z` 重做。

## 網頁控制

```html
<canvas id="character" style="width:500px;height:650px"></canvas>
<script src="runtime.js"></script>
<script>
  async function start() {
    const project = await fetch('character.mio.json').then(r => r.json());
    const player = new Mio2D.CharacterPlayer(document.getElementById('character'), project);
    await player.load();
    player.play();
    player.setOptions({ parameters: { armRaise: 0.9, windStrength: 0.6, sleeveSwing: 0.3 } });
    // 清除手動覆寫，重新由時間軸控制：
    // player.setOptions({ parameters: undefined });
  }
  start();
</script>
```

## 驗證與美術來源

```sh
npm test
npm run test:e2e
npm run build
```

瀏覽器測試預設使用 `http://127.0.0.1:5174`；如有不同，可設定 `TEST_BASE_URL`。需先啟動工作台及安裝 Playwright Chromium。`node --import tsx scripts/smoke-export.ts` 會打包預設角色並測試獨立播放器，產出 `outputs/flower-web.zip`、截圖與 QA 報告。

- [元件、參數與專案格式](docs/FORMAT.md)
- [獨立圖層、衣料動態與網格](docs/LAYERS.md)
- [GPT 圖像生成提示與 QA](docs/image-prompts.md)
- [驗證紀錄](docs/VALIDATION.md)
- [四位角色的素材路徑與生成提示](docs/character-example-prompts.md)
- 姿勢範例專案與網頁包：`outputs/character-examples/`；可執行 `node --import tsx scripts/audit-examples.ts` 重建網頁包與檢查報告。
- 逐幀檢視：`outputs/motion-qa/index.html`；可用左右鍵檢查每幀。
- 可直接使用的網頁包：`outputs/flower-web.zip`；完整內嵌素材專案：`outputs/hana.mio.json`。
- 獨立部件：`public/assets/characters/hana/parts-v3/`
- 原畫與表情：`public/assets/characters/hana/`

本專案是獨立的 2D 角色編輯器與播放器，尚未實作完整 Cubism 工具鏈，也不讀寫 `.moc3`。新版補繪了袖子與髮束的遮擋區；左右臂骨架對稱，服裝與髮飾保留原設計細節。網格是整體造型網格，還沒有每個部件獨立的參數權重／多級變形器編輯器。光影為 2D 色彩與漸層效果，無法物理重建原畫的光源；嘴型同步基於音量，尚無音素辨識。

技術參考：[Vite](https://vite.dev/guide/)、[Canvas 2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)。
