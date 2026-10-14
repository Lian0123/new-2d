# Mio 2D 基礎元件與專案規格

Mio 2D 使用 Node.js、TypeScript 與瀏覽器 Canvas 2D，製作可編輯、可控制、可直接放到網頁的角色。這是獨立的 2D 角色系統，不讀寫 Live2D Cubism 的 `.moc3`、`.model3.json` 或其專有模型格式。

預設角色包含 GPT 生成的原畫、表情來源、頭部與衣裝補繪，以及前髮、中髮、後髮獨立透明素材。上衣、裙襬、左右袖子、上臂與手掌各使用獨立 PNG，眼睛與嘴型由局部表情合成控制。角色具有肩肘腕連續關節、風力與衣料動態、可編輯造型網格及 GPU 變形。尚未提供每個部件獨立的 UV、多級變形器與參數權重編輯器。光影參數調整圖像顏色、陰影與輪廓效果，無法物理重建原畫中的光源。

## 圖像元件規範

| 元件 | 用途 | 基礎要求 |
| --- | --- | --- |
| `neutral` | 原始角色與所有動作的參考 | 透明 RGBA PNG，正面角色，眼睛張開、嘴巴閉合 |
| `blink` | 閉眼表情來源 | 與原畫相同畫布、尺寸、角色位置、服裝與照明 |
| `talk` | 開嘴表情來源 | 與原畫相同畫布，清楚的開嘴區域 |
| `wave` | 揮手動作來源 | 與原畫相同畫布，角色上半身與手掌完整 |
| `armless` | 分離手臂後的身體補繪底圖 | 與原畫相同畫布和照明，右手臂移除並補繪被遮住的身體和服裝 |
| `armRest` | 原始放下手臂的獨立紋理 | 透明 PNG，保留原畫座標，用於手臂骨架 |
| `armWave` | 抬起手掌與袖子的獨立紋理 | 透明 PNG，保留原畫座標，與身體補繪底圖合成 |
| `custom` 圖層 | 髮飾、配件、前景或另行拆分的部件 | 自訂透明 PNG，可獨立移動、旋轉、縮放與調整不透明度 |

透明背景是 PNG 的 alpha 通道；棋盤格是編輯器的顯示背景，不應畫進素材。預設生成圖畫布為 1254 × 1254。自訂角色應盡量保持表情圖的位置一致，再以編輯器的綁定區域對齊眼睛和嘴巴。若要製作更複雜的角色，建議補繪並獨立輸出頭部、左右眼白、瞳孔、上下眼皮、嘴內、上唇、下唇、前髮、後髮、軀幹、上臂、前臂、手掌及服裝配件。這些可作為 PNG 圖層匯入；本版沒有自動把一張完整原畫拆成完整美術部件的功能。

本機專案可使用 `/assets/characters/hana/*.png` 路徑，匯入的 PNG 則儲存為 `data:image/png;base64,…`。匯出的 ZIP 會把所有被使用的圖像複製到 `assets/`，並改寫專案為相對路徑，相同圖像只保存一次。伺服器不下載外部網址，也不讀取 `public/assets/` 以外的檔案。

編輯器的「儲存專案」會將圖片內嵌為 data URL，產生可單獨帶走和重新開啟的 `.mio.json`。ZIP 中的 `character.mio.json` 則使用相對素材路徑，必須和整個 `assets/` 資料夾一起保留；只複製這份 JSON 不會包含角色圖片。手動製作含 `/assets/…` 路徑的 JSON 時，路徑指向目前網站的素材目錄，也不是獨立的單檔專案。

## 專案格式：`character.mio.json`

格式版本為 `1`。`layer.src/part/waveSrc/pivot` 與 `mesh` 可省略；`assets.armless/armRest/armWave` 是一起出現或一起省略的可選組合，其餘核心欄位都是必要欄位。早期專案缺少風力、衣料、左臂或手腕參數時會補入預設值。含獨立手臂素材時，使用補繪底圖與單一手臂骨架變形，避免揮手過渡時疊出兩條手臂。舊的四圖專案仍可使用原有合成方式。匯入時會驗證完整結構並建立新的物件，不執行專案中的程式碼。

```ts
interface Project {
  version: 1;
  id: string;
  name: string;
  canvas: { width: number; height: number };
  assets: {
    neutral: string; blink: string; talk: string; wave: string;
    armless?: string; armRest?: string; armWave?: string;
  };
  parameters: Parameters;
  lighting: Lighting;
  rig: {
    eyeLeft: Rect;
    eyeRight: Rect;
    mouth: Rect;
    headCenter: Point;
    shoulder: Point;
  };
  layers: Layer[];
  timeline: { duration: number; fps: number; tracks: Track[] };
  settings: { autoBlink: boolean; idleMotion: boolean; pointerTracking: boolean };
  mesh?: { columns: number; rows: number; offsets: Point[] };
}
interface Point { x: number; y: number }
interface Rect extends Point { width: number; height: number }
interface Layer {
  id: string;
  name: string;
  kind: 'character' | 'eyes' | 'mouth' | 'arm' | 'hair' | 'clothing' | 'custom';
  visible: boolean;
  locked: boolean;
  opacity: number;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  src?: string;
  part?: 'body' | 'hairBack' | 'hairMiddle' | 'hairFront' | 'bodice' | 'skirt' | 'sleeveLeft' | 'sleeveRight' | 'armRight';
  waveSrc?: string;
  pivot?: Point;
}
interface Track {
  id: string;
  parameter: keyof Parameters;
  keyframes: { time: number; value: number }[];
}
```

畫布寬高為 64–8192 的整數。`id` 最長 100 字，`name` 最長 256 字；圖層和軌道各最多 100 個，ID 不可重複。圖層排列順序保存於陣列中，後方部件排在前面。`locked` 是編輯器操作狀態；`visible` 和 `opacity` 控制顯示。`custom` 與有 `part` 的圖層必須指定 `src`。`waveSrc` 為右手臂與右袖的抬手紋理，`pivot` 為 0–1 正規化樞紐。圖層位移 `x/y` 是畫布像素，範圍 −10000–10000；旋轉為角度 −360–360；縮放為 0.01–10；不透明度為 0–1。

`rig` 使用角色原圖的正規化座標，左上角為 `(0, 0)`、右下角為 `(1, 1)`。眼睛與嘴巴的矩形必須在圖內，寬高至少 0.001；`headCenter` 為轉頭的參考點，`shoulder` 為手臂動作參考點。鏡像方向以畫面中的左右位置為準。

## 動作參數

| 參數 | 範圍 | 初始值 | 控制內容 |
| --- | --- | --- | --- |
| `angleX` | −30–30 | 0 | 左右轉頭 |
| `angleY` | −30–30 | 0 | 抬頭低頭 |
| `angleZ` | −20–20 | 0 | 歪頭 |
| `eyeOpenLeft` | 0–1 | 1 | 左眼開合 |
| `eyeOpenRight` | 0–1 | 1 | 右眼開合 |
| `eyeX` | −1–1 | 0 | 視線左右 |
| `eyeY` | −1–1 | 0 | 視線上下 |
| `mouthOpen` | 0–1 | 0 | 嘴巴張開幅度 |
| `mouthSmile` | −1–1 | 0.25 | 微笑幅度 |
| `browY` | −1–1 | 0 | 眉毛高度 |
| `breath` | 0–1 | 0.35 | 呼吸幅度 |
| `armRaise` | 0–1 | 0 | 右臂抬起 |
| `armRaiseLeft` | 0–1 | 0 | 左臂抬起 |
| `wristWave` | −1–1 | 0 | 右手腕擺動 |
| `wristWaveLeft` | −1–1 | 0 | 左手腕擺動 |
| `hairSway` | −1–1 | 0 | 髮絲擺動 |
| `windStrength` | 0–1 | 0.2 | 風力強度，驅動髮絲與服裝區域動態 |
| `windDirection` | −1–1 | 0.5 | 風向，負值往左、正值往右 |
| `clothSway` | −1–1 | 0 | 裙襬與服裝擺動 |
| `sleeveSwing` | −1–1 | 0 | 袖口擺動 |

參數值必須是範圍內的有限數值。`angleX/Y/Z` 為角度，其餘參數為正規化控制量。雙眼開合分開保存，可以單眼眨眼。嘴型可手動設定、由動畫軌道驅動，或以麥克風音量連續控制；這種對嘴是音量分析，沒有語音辨識或音素嘴型辨識。

風與服裝動態透過角色區域的程序化變形實作。裙襬、袖口與髮絲使用不同的影響範圍和擺動相位；可分開調整擺動量，再搭配風力與風向。這些是 2D 畫面中的柔和變形，並不是具有碰撞、布料網格和材質力學的布料模擬。預設動作使用平滑進出曲線，從目前姿態開始並回復，避免按鈕動作突然跳到另一個姿勢。

## 光影參數

| 參數 | 範圍 | 初始值 | 用途 |
| --- | --- | --- | --- |
| `intensity` | 0–2 | 1 | 整體光源強度 |
| `exposure` | −1–1 | 0 | 畫面曝光 |
| `shadow` | 0–1 | 0.18 | 陰影濃度 |
| `softness` | 0–1 | 0.7 | 光影柔和度 |
| `rimLight` | 0–1 | 0.22 | 輪廓高光 |
| `warmth` | −1–1 | 0.08 | 冷暖色調 |
| `direction` | −180–180 | −35 | 光影方向，角度 |

美術原畫本身的高光與陰影保留在 PNG 中。調整參數會影響渲染的色調、亮度與覆蓋效果。輸出實際效果取決於原始圖像，參數不是物理光照單位。

## 時間軸

`duration` 是秒數，範圍 0.1–600；`fps` 是 12–60 的整數。每條軌道以 `parameter` 對應一個動作參數，關鍵影格的 `time` 必須介於 0 和 `duration` 之間且嚴格遞增。每條軌道最多 10000 個關鍵影格，`value` 使用該動作參數的合法範圍。軌道可選擇 `easing: "smooth"` 使用平滑插值，未指定或 `"linear"` 時為線性插值；首影格前和末影格後使用端點值。空軌道使用專案中的參數值。

```json
{
  "id": "mouth-dialogue",
  "parameter": "mouthOpen",
  "keyframes": [
    { "time": 0, "value": 0 },
    { "time": 0.2, "value": 0.8 },
    { "time": 0.4, "value": 0 }
  ]
}
```

`settings.autoBlink` 啟用自動眨眼，`idleMotion` 啟用待機呼吸和輕微動態，`pointerTracking` 啟用游標追蹤。需要精確檢視手動參數或關鍵影格時，可以關閉相應自動效果。

## 網頁打包與嵌入

`POST /api/export` 接收 JSON `{ "project": Project }`，成功回傳 `application/zip`。ZIP 完整建立後才回傳，內容為：

```text
index.html
character.mio.json
runtime.js
README.md
assets/
  001-neutral.png
  ...
```

API 會限制 JSON 請求為 48 MiB，每張 PNG 為 12 MiB，總素材為 32 MiB，ZIP 為 48 MiB，PNG 單邊最多 8192 像素，所有角色主素材使用相同尺寸的畫布。它檢查 PNG 簽名與圖像標頭，拒絕外部 URL、路徑穿越及指向素材資料夾外的符號連結。專案結構或素材不合法時回傳 HTTP 400；請求過大時回傳 413；執行檔打包失敗時回傳 500。

解壓後將整個資料夾放到靜態網站即可開啟 `index.html`，不需要 Node.js 常駐伺服器或 CDN。請用 HTTP/HTTPS 開啟；`file://` 開啟方式會受到瀏覽器的讀取限制。本機預覽可以使用任何靜態檔案伺服器。麥克風只能在 localhost 或 HTTPS 下，由使用者點擊按鈕並允許後使用；音量資料在瀏覽器中處理，不上傳。

```html
<canvas id="character" width="1254" height="1254"></canvas>
<script src="./runtime.js"></script>
<script>
  async function start() {
    const project = await fetch('./character.mio.json').then(r => r.json());
    const player = new Mio2D.CharacterPlayer(document.getElementById('character'), project);
    await player.load();
    player.play();
    player.setOptions({ parameters: { mouthOpen: 0.6, armRaise: 0.8 } });
    player.setOptions({ lighting: { rimLight: 0.5, warmth: 0.2 } });
    window.character = player;
  }
  start();
</script>
```

| API | 用途 |
| --- | --- |
| `new Mio2D.CharacterPlayer(canvas, project)` | 建立播放器 |
| `await player.load()` | 載入角色和自訂圖層圖像 |
| `player.setProject(project)` | 更新專案參數、圖層、綁定與時間軸 |
| `player.setOptions({ parameters, lighting, autoBlink, idleMotion, pointerTracking })` | 設定目前播放器的參數覆寫與自動動作 |
| `player.setOptions({ parameters: undefined })` | 清除參數覆寫，恢復時間軸和專案中的值；光影覆寫亦可用 `lighting: undefined` 清除 |
| `player.play()` / `player.pause()` | 播放或暫停動畫 |
| `player.seek(seconds)` | 跳至指定時間 |

全域 `Mio2D` 也提供 `createDefaultProject`、`validateProject`、`parameterDefinitions`、`interpolateTrack` 和 `evaluatePose`，供網站控制器或其他 TypeScript 專案使用。

## 後續可擴充的元件

若擴充為完整角色製作工具，下一個格式版本應將以下元件明確存入專案：每個部件獨立的 texture/UV、可編輯頂點和三角形索引、變形器層級、參數對多個部件的權重、遮罩關係、補繪區域、髮絲與衣服物理群組、音素嘴型，以及素材著作權與來源中繼資料。本版資料結構為這些能力提供基本圖層、綁定與參數入口，但不表示這些進階能力已實作。

## 完整姿勢插畫

可選欄位 `renderMode: "illustration"` 表示完整姿勢插畫，缺省時使用既有角色渲染。插畫使用 `assets.neutral`，保留 character 圖層的位移、縮放、旋轉與透明度，支援配件及光影；不套用花音的表情貼片、骨架或整體姿勢變形。四個必填 expression asset 欄位可共同引用同一張 PNG，匯出時只打包一次。可攜 JSON 往返會保留此欄位，匯出控制頁僅顯示適用的光影操作。

`renderMode: "pose"` 是完整原畫的互動模式，必須提供 `poseRig`：`head`、`chest`、`hair`、`cloth` 為 0–1 註冊矩形；`anchor` 是固定支點；`armLeft`、`armRight` 各含 `shoulder`、`wrist`（0–1 座標）、`radius`（0.01–0.3）與 `lift`（-15 至 15 度）。可選 `coupledHands` 矩形讓雙手與持物共同移動。眼睛與嘴巴使用原有 `rig` 中的角色專屬矩形，沿用同一組參數、時間軸、光影、網格與 PNG／網頁匯出。此模式保留原畫姿態，手勢為有限幅度的連續變形，不使用花音的部件骨架。`validateProject` 會驗證並深複製這些欄位。
