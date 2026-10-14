# GitHub Pages Demo

## 操作示意

1. 開啟展示頁，等待左下方出現「角色已載入・動畫可操作」。預設花音會循環播放「揮手招呼」。
2. 點暫停，將時間軸拖曳至 `2.00 s`，檢視抬臂與手腕姿勢；回到 `0.00 s` 可比較原始姿態。
3. 切換「風吹衣襬」或「眨眼微笑」，按播放觀察衣料、髮絲與表情。開啟「顯示網格」可看到變形網格。
4. 勾選「視線跟隨游標」，在角色畫布上移動游標。
5. 調整曝光與色溫，點「下載透明 PNG」取得當前姿勢，透明背景會保留。
6. 選擇其他四位角色時，頁面標示「姿勢插畫」，停用動畫控制；光影與 PNG 下載仍可使用。切回花音即可再次播放。
7. 點右上重設圖示，恢復預設動作、光影與控制；角色選擇保留。

## 實際瀏覽器截圖

桌面：1440px 視窗，花音的揮手動作暫停於 `2.00 s`。

![桌面 Demo](demo/desktop.png)

手機：390px 視窗，舞台、播放控制與參數面板依序排列。

![手機 Demo](demo/mobile.png)

## 本機與部署驗證

```sh
npm ci
npx playwright install chromium
npm test
npm run build
npm run build:demo
npm run test:demo
```

測試會自動啟動 `dist-demo/` 的靜態預覽，使用 `/new-2d/` 子路徑測試：

- 載入成功、時間前進、暫停及跳轉，並比較 Canvas 像素確認動作改變。
- 切換動畫、網格與游標追蹤、曝光改變畫面、重設控制。
- 下載真正的 1254 × 1254 RGBA PNG，檢查透明與可見像素。
- 五位角色均渲染可見像素，插畫角色的動畫控制停用。
- 390px 手機版沒有水平溢出，仍能操作與切換角色。
- 素材請求失敗時顯示錯誤並停用下載；恢復素材後可重試。

2026-10-14 本機驗證：25 項單元測試、工作台建置、Demo 建置及 4 項瀏覽器測試全部通過。以上截圖來自這次成功的瀏覽器測試；尚未以線上 GitHub Pages 網址驗證。
- 正常互動流程沒有 JavaScript 錯誤、失敗的素材請求或 `/api` 請求。

測試截圖儲存在 `test-results/`。CI 會將截圖與失敗時的 trace 上傳為 `demo-browser-qa` artifact，供檢查每次變更。GitHub Pages 發布需先在 repository Settings → Pages 將 Source 設為 GitHub Actions；本機測試通過不能替代實際線上部署驗證。

## 檔案與範圍

- `demo/index.html`：獨立展示頁入口。
- `src/demo/`：展示控制、樣式，以及依 `BASE_URL` 解析既有素材路徑。
- `vite.config.ts`：`demo` 模式輸出 `dist-demo/`；一般模式仍輸出工作台到 `dist/`。
- `.github/workflows/pages.yml`：測試成功才發布，PR 只執行驗證。
- `playwright.demo.config.ts` 與 `tests/demo/`：純靜態 demo 驗證。

Demo 不含本機工作台的專案儲存、麥克風與 ZIP 匯出。這些功能的操作方式見主 README。
