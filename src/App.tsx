import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Diamond, Download, Eye, EyeOff, FilePlus2, FolderOpen, Grid2X2, Grip, Hand, ImagePlus, Layers3, LockKeyhole, Maximize, Mic, MicOff, MousePointer2, Move, Pause, Play, Plus, RotateCcw, Save, Settings2, SlidersHorizontal, Sparkles, Sun, Trash2, Undo2, Redo2, Upload, WandSparkles, X, ZoomIn, ZoomOut } from 'lucide-react';
import { CharacterPlayer } from './core/player';
import { createDefaultProject, evaluatePose, parameterDefinitions, validateProject, type Project, type ParameterId } from './core/model';
import { applyMotionPreset, motionNames } from './core/motions';
import { readCachedProject, writeCachedProject } from './storage';
import { characterExamples, createExampleProject, findCharacterExample } from './core/examples';

type Tab = 'model' | 'rig' | 'animate';
const STORAGE = 'mio-studio-project-v1';
const LANG = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
const layerIcons: Record<string, typeof Layers3> = { character: Layers3, eyes: Eye, mouth: Activity, arm: Hand, hair: WandSparkles, clothing: Grip, custom: ImagePlus };
const faces: ParameterId[] = ['eyeOpenLeft', 'eyeOpenRight', 'eyeX', 'eyeY', 'mouthOpen', 'mouthSmile', 'browY'];
const body: ParameterId[] = ['angleX', 'angleY', 'angleZ', 'breath', 'armRaise', 'armRaiseLeft', 'wristWave', 'wristWaveLeft', 'hairSway'];
const clothing: ParameterId[] = ['windStrength', 'windDirection', 'clothSway', 'sleeveSwing'];

function initialProject(): Project {
  try {
    const value = localStorage.getItem(STORAGE);
    if (value) {
      const saved = validateProject(JSON.parse(value));
      return migrateProject(saved);
    }
  } catch { /* malformed saved projects fall back to the starter */ }
  return createDefaultProject();
}

function migrateProject(saved: Project): Project {
  const bundled = saved.id === 'hana-default' || saved.id === 'hana-layered-v2';
  if (!bundled || saved.layers.some(layer => layer.part && layer.src && !layer.src.startsWith('/assets/characters/hana/parts/'))) return saved;
  const fresh = createDefaultProject();
  const layers = fresh.layers.map(layer => {
    const previous = saved.layers.find(old => old.id === layer.id);
    return previous ? { ...layer, visible: previous.visible, locked: previous.locked, opacity: previous.opacity, x: previous.x, y: previous.y, rotation: previous.rotation, scale: previous.scale } : layer;
  });
  return { ...saved, id: fresh.id, assets: fresh.assets, rig: fresh.rig, layers: [...layers, ...saved.layers.filter(layer => layer.kind === 'custom')] };
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Slider({ label, value, min, max, step = 0.01, onChange, suffix = '', onKeyframe, disabled = false }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; suffix?: string; onKeyframe?: () => void; disabled?: boolean }) {
  const progress = Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
  return <div className="parameter"><div className="parameter-label"><span>{label}</span><div><span className="number">{LANG.format(value)}{suffix}</span>{onKeyframe && <button className="diamond-button" title={`新增「${label}」關鍵影格`} aria-label={`新增「${label}」關鍵影格`} onClick={onKeyframe}><Diamond size={10} /></button>}</div></div><input disabled={disabled} aria-label={label} type="range" min={min} max={max} step={step} value={value} style={{ '--progress': `${progress}%` } as CSSProperties} onChange={e => onChange(Number(e.target.value))} /></div>;
}

function Toggle({ label, checked, onChange, detail }: { label: string; checked: boolean; onChange: (checked: boolean) => void; detail?: string }) {
  return <label className="toggle-row"><span>{label}{detail && <small>{detail}</small>}</span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="switch" /></label>;
}

function App() {
  const [project, setProject] = useState(initialProject);
  const projectRef = useRef(project);
  const past = useRef<Project[]>([]), future = useRef<Project[]>([]);
  const [, forceHistory] = useState(0);
  const [tab, setTab] = useState<Tab>('model');
  const [rightTab, setRightTab] = useState<'parameters' | 'lighting'>('parameters');
  const [selected, setSelected] = useState(project.layers[0]?.id ?? '');
  const [mesh, setMesh] = useState(false);
  const [background, setBackground] = useState<'studio' | 'transparent' | 'dark'>('studio');
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [fps, setFps] = useState(60);
  const [animatedParameters, setAnimatedParameters] = useState(project.parameters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [gallery, setGallery] = useState(false);
  const galleryDialog = useRef<HTMLDialogElement>(null);
  const illustration = project.renderMode === 'illustration';
  const example = findCharacterExample(project);
  const [dialog, setDialog] = useState<'export' | 'help' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [mic, setMic] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const micToken = useRef(0);
  const [preset, setPreset] = useState('自訂動畫');
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<CharacterPlayer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null), imageInput = useRef<HTMLInputElement>(null);
  const imageImportTarget = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const manualOverrides = useRef<Partial<Project['parameters']>>({});
  const actionRestore = useRef<(() => void) | null>(null);
  const micCleanup = useRef<(() => void) | null>(null);
  const pointer = useRef<{ x: number; y: number; pan: { x: number; y: number }; mesh?: { index: number; origin: { x: number; y: number }; scaleX: number; scaleY: number } } | null>(null);
  const preview = new URLSearchParams(window.location.search).has('preview');

  useEffect(() => { const node = galleryDialog.current; if (gallery && node && !node.open) node.showModal(); else if (!gallery && node?.open) node.close(); }, [gallery]);

  const notify = useCallback((message: string) => setToast(message), []);
  const cancelActions = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; actionRestore.current?.(); actionRestore.current = null; }, []);
  const clearOverrides = useCallback(() => { cancelActions(); manualOverrides.current = {}; player.current?.setOptions({ parameters: undefined }); }, [cancelActions]);
  const update = useCallback((change: Project | ((p: Project) => Project), history = true) => {
    const current = projectRef.current;
    const next = typeof change === 'function' ? change(current) : change;
    if (history) { past.current.push(current); if (past.current.length > 60) past.current.shift(); future.current = []; }
    projectRef.current = next; setProject(next); setSaved(false);
  }, []);
  const param = useCallback((id: ParameterId, value: number, history = true) => {
    cancelActions(); manualOverrides.current[id] = value;
    update(p => ({ ...p, parameters: { ...p.parameters, [id]: value } }), history);
    player.current?.setOptions({ parameters: { ...manualOverrides.current } });
  }, [update, cancelActions]);
  const stopMic = useCallback(() => { micToken.current++; micCleanup.current?.(); micCleanup.current = null; setMic(false); setMicPending(false); }, []);

  useEffect(() => {
    if (!canvas.current) return;
    setLoading(true); setError('');
    let last = 0, disposed = false;
    const instance = new CharacterPlayer(canvas.current, projectRef.current, {
      onFrame: (clock, frameRate) => { const now = performance.now(); if (now - last > 90) { setTime(clock); setFps(Math.round(frameRate)); setAnimatedParameters(player.current?.getFrame().parameters ?? projectRef.current.parameters); last = now; } },
      onError: e => { if (!disposed) { setError(e.message); setLoading(false); } },
    });
    player.current = instance;
    instance.load().then(() => { if (!disposed) setLoading(false); }).catch(e => { if (!disposed) { setError(e instanceof Error ? e.message : '素材載入失敗'); setLoading(false); } });
    return () => { disposed = true; instance.dispose(); if (player.current === instance) player.current = null; };
  }, [project.id]);
  useEffect(() => { player.current?.setProject(project); }, [project]);
  useEffect(() => {
    let alive = true;
    void readCachedProject().then(value => {
      if (!alive) return;
      if (value && !past.current.length) { const restored = migrateProject(validateProject(value)); projectRef.current = restored; setProject(restored); setSelected(restored.layers[0]?.id ?? ''); }
      setHydrated(true);
    }).catch(() => { if (alive) setHydrated(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { player.current?.setOptions({ mesh: mesh || tab === 'rig', background: 'transparent', zoom, pan, selectedLayer: selected, editing: tab === 'rig', pointerTracking: tab === 'rig' ? false : undefined, playing }); }, [mesh, tab, background, zoom, pan, selected, playing, project.id]);
  useEffect(() => { if (playing) clearOverrides(); }, [playing, project.id, clearOverrides]);
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void writeCachedProject(project).then(() => { if (projectRef.current === project) setSaved(true); }).catch(() => { if (projectRef.current === project) setSaved(false); });
      // A lightweight fallback for browsers that disable IndexedDB. Large inline
      // projects use IndexedDB rather than exceeding localStorage's small quota.
      try { const serialized = JSON.stringify(project); if (serialized.length < 1_500_000) localStorage.setItem(STORAGE, serialized); else localStorage.removeItem(STORAGE); } catch { /* IndexedDB remains the primary save. */ }
    }, 700);
    return () => clearTimeout(timer);
  }, [project, hydrated]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 3600); return () => clearTimeout(id); }, [toast]);
  useEffect(() => () => { micToken.current++; micCleanup.current?.(); timers.current.forEach(clearTimeout); }, []);

  const undo = useCallback(() => { const value = past.current.pop(); if (!value) return; stopMic(); clearOverrides(); future.current.push(projectRef.current); update(value, false); forceHistory(n => n + 1); }, [update, clearOverrides, stopMic]);
  const redo = useCallback(() => { const value = future.current.pop(); if (!value) return; stopMic(); clearOverrides(); past.current.push(projectRef.current); update(value, false); forceHistory(n => n + 1); }, [update, clearOverrides, stopMic]);
  const saveProject = useCallback(async () => {
    try {
      const portable = structuredClone(projectRef.current);
      const cache = new Map<string, Promise<string>>();
      const inline = (src: string): Promise<string> => {
        if (src.startsWith('data:')) return Promise.resolve(src);
        let existing = cache.get(src);
        if (!existing) { existing = (async () => { const response = await fetch(src); if (!response.ok) throw new Error(`無法讀取素材 ${src}`); const blob = await response.blob(); return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('素材讀取失敗')); reader.readAsDataURL(blob); }); })(); cache.set(src, existing); }
        return existing;
      };
      await Promise.all(Object.entries(portable.assets).map(async ([key, src]) => { if (src) (portable.assets as Record<string, string>)[key] = await inline(src); }));
      await Promise.all(portable.layers.map(async layer => { if (layer.src) layer.src = await inline(layer.src); if (layer.waveSrc) layer.waveSrc = await inline(layer.waveSrc); }));
      validateProject(portable);
      download(new Blob([JSON.stringify(portable)], { type: 'application/json' }), `${portable.name}.mio.json`);
      notify('專案已下載，包含完整圖片、參數、圖層與動畫。');
    } catch (e) { notify(`專案儲存失敗：${e instanceof Error ? e.message : '素材無法讀取'}`); }
  }, [notify]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches('input,textarea,select')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if (event.code === 'Space') { event.preventDefault(); setPlaying(p => !p); }
      if (event.key.toLowerCase() === 'g') setMesh(m => !m);
      if (event.key === 'Escape') setDialog(null);
    };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  }, [undo, redo, saveProject]);

  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 60 * 1024 * 1024) throw new Error('專案檔案需小於 60 MB');
      const next = validateProject(JSON.parse(await file.text()));
      stopMic(); clearOverrides(); update(next); setSelected(next.layers[0]?.id ?? ''); setPan({ x: 0, y: 0 }); setZoom(1); player.current?.seek(0); setTime(0); setError('');
      notify(`已開啟 ${next.name}`);
    } catch (e) { notify(`無法開啟：${e instanceof Error ? e.message : '專案格式不正確'}`); }
  }
  async function importImage(file?: File) {
    if (!file) return;
    try {
      if (file.type !== 'image/png' || file.size > 10 * 1024 * 1024) throw new Error('請使用 10 MB 以內的 PNG 素材');
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      const image = new Image(); image.src = data; await image.decode();
      const target = imageImportTarget.current; imageImportTarget.current = null;
      if (target) {
        if (image.naturalWidth !== projectRef.current.canvas.width || image.naturalHeight !== projectRef.current.canvas.height) throw new Error(`部件 PNG 需保持 ${projectRef.current.canvas.width} × ${projectRef.current.canvas.height}，才能和原圖對位。`);
        update(p => ({ ...p, layers: p.layers.map(layer => layer.id === target ? { ...layer, src: data } : layer) }));
        notify('已替換獨立部件素材，保留綁定與圖層設定。'); return;
      }
      const id = crypto.randomUUID();
      update(p => ({ ...p, layers: [...p.layers, { id, name: file.name.replace(/\.png$/i, ''), kind: 'custom', visible: true, locked: false, opacity: 1, x: 0, y: 0, rotation: 0, scale: 1, src: data }] }));
      setSelected(id); notify('已匯入 PNG 圖層，可調整位置、縮放與透明度。');
    } catch (e) { notify(e instanceof Error ? e.message : '素材無法載入'); }
  }
  function addKeyframe(id: ParameterId, value = manualOverrides.current[id] ?? player.current?.getFrame().parameters[id] ?? projectRef.current.parameters[id]) {
    const t = Math.round(Math.min(time, projectRef.current.timeline.duration) * 100) / 100;
    update(p => {
      const tracks = p.timeline.tracks.map(track => ({ ...track, keyframes: [...track.keyframes] }));
      let track = tracks.find(track => track.parameter === id);
      if (!track) { track = { id: crypto.randomUUID(), parameter: id, keyframes: [] }; tracks.push(track); }
      const index = track.keyframes.findIndex(k => Math.abs(k.time - t) < 0.025);
      if (index >= 0) track.keyframes[index] = { time: t, value }; else track.keyframes.push({ time: t, value });
      track.keyframes.sort((a, b) => a.time - b.time);
      return { ...p, timeline: { ...p.timeline, tracks } };
    });
    setTab('animate'); notify(`已在 ${t.toFixed(2)} 秒新增關鍵影格`);
  }
  function applyPreset(name: string) {
    update(p => applyMotionPreset(p, name));
    clearOverrides(); player.current?.seek(0); setTime(0); setPreset(name); setPlaying(true); notify(`已套用「${name}」動畫`);
  }
  function quickAction(action: 'blink' | 'wave' | 'talk') {
    if (mic && action === 'talk') { notify('麥克風已在控制嘴型，請先停用麥克風。'); return; }
    cancelActions();
    const restore = () => { player.current?.setOptions({ parameters: undefined }); if (Object.keys(manualOverrides.current).length) player.current?.setOptions({ parameters: { ...manualOverrides.current } }); };
    actionRestore.current = restore;
    const frame = (values: Partial<Project['parameters']>) => player.current?.setOptions({ parameters: values });
    const complete = () => { restore(); actionRestore.current = null; timers.current = []; };
    if (action === 'blink') {
      frame({ eyeOpenLeft: 0, eyeOpenRight: 0 });
      timers.current.push(setTimeout(complete, 250));
    } else if (action === 'wave') {
      const motion = applyMotionPreset(projectRef.current, '揮手招呼');
      for (let i = 0; i <= 147; i++) timers.current.push(setTimeout(() => {
        const pose = evaluatePose(motion, i / 30);
        frame({ armRaise: pose.armRaise, wristWave: pose.wristWave, angleZ: pose.angleZ });
      }, i * 1000 / 30));
      timers.current.push(setTimeout(complete, 5000));
    } else {
      for (let i = 0; i < 14; i++) timers.current.push(setTimeout(() => frame({ mouthOpen: [0.1, 0.8, 0.35, 1, 0][i % 5] }), i * 130));
      timers.current.push(setTimeout(complete, 1900));
    }
  }
  function stepFrame(direction: number) {
    clearOverrides(); setPlaying(false);
    const fps = projectRef.current.timeline.fps;
    const next = Math.max(0, Math.min(projectRef.current.timeline.duration, (Math.round(time * fps) + direction) / fps));
    player.current?.seek(next); setTime(next);
  }
  async function toggleMic() {
    if (micPending) return;
    if (mic) { stopMic(); param('mouthOpen', 0, false); return; }
    if (!navigator.mediaDevices?.getUserMedia) { notify('目前瀏覽器沒有麥克風功能，請在 localhost 或 HTTPS 開啟。'); return; }
    const token = ++micToken.current; setMicPending(true);
    let stream: MediaStream | undefined, audio: AudioContext | undefined;
    try {
      // Resume in the click gesture, before the permission prompt loses activation.
      audio = new AudioContext();
      const ready = audio.resume(); void ready.catch(() => {});
      const pendingAudio = audio;
      micCleanup.current = () => { if (pendingAudio.state !== 'closed') void pendingAudio.close(); };
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== micToken.current) { stream.getTracks().forEach(track => track.stop()); return; }
      await ready;
      if (token !== micToken.current) { stream.getTracks().forEach(track => track.stop()); if (audio.state !== 'closed') await audio.close(); return; }
      const analyser = audio.createAnalyser(); analyser.fftSize = 512;
      const source = audio.createMediaStreamSource(stream); source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize); let raf = 0, last = 0;
      const tick = (now: number) => { if (now - last > 45) { analyser.getFloatTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length); param('mouthOpen', Math.min(1, Math.max(0, (rms - 0.012) * 12)), false); last = now; } raf = requestAnimationFrame(tick); };
      const activeStream = stream, activeAudio = audio;
      micCleanup.current = () => { cancelAnimationFrame(raf); source.disconnect(); activeStream.getTracks().forEach(track => track.stop()); void activeAudio.close(); };
      setPlaying(false); setMic(true); raf = requestAnimationFrame(tick); notify('麥克風已啟用，說話時嘴型會跟隨音量。');
    } catch (e) { stream?.getTracks().forEach(track => track.stop()); if (audio && audio.state !== 'closed') void audio.close(); if (token === micToken.current) { stopMic(); notify(`麥克風無法啟用：${e instanceof Error ? e.message : '請檢查瀏覽器權限'}`); } }
    finally { if (token === micToken.current) setMicPending(false); }
  }
  async function exportWeb() {
    setExporting(true);
    try {
      const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: projectRef.current }) });
      if (!response.ok) { const result = await response.json().catch(() => ({ error: '匯出服務無法連線' })); throw new Error(result.error ?? '匯出失敗'); }
      download(await response.blob(), `${projectRef.current.name}-web.zip`); setDialog(null); notify('網頁播放包已下載，解壓後放到靜態網站即可使用。');
    } catch (e) { notify(`匯出失敗：${e instanceof Error ? e.message : '請確認 Node.js 服務已啟動'}`); }
    finally { setExporting(false); }
  }
  async function capture() { try { const blob = await player.current?.capture(); if (blob) { download(blob, `${projectRef.current.name}.png`); notify('已下載透明背景角色 PNG'); } } catch { notify('角色 PNG 無法輸出，請確認素材已載入。'); } }
  async function previewWeb() {
    const popup = window.open('about:blank', '_blank');
    if (!popup) { notify('瀏覽器阻擋了預覽視窗，請允許此網站開啟新分頁。'); return; }
    popup.opener = null;
    try { await writeCachedProject(projectRef.current); popup.location.href = `${window.location.origin}${window.location.pathname}?preview=1`; }
    catch { popup.close(); notify('預覽無法儲存專案，請使用網頁匯出。'); }
  }
  function chooseExample(id: string) {
    stopMic(); clearOverrides(); const next = createExampleProject(id);
    update(next); setSelected(next.layers[0].id); setTab('model'); setRightTab(next.renderMode ? 'lighting' : 'parameters');
    setPlaying(!next.renderMode); setMesh(false); setPan({ x: 0, y: 0 }); setZoom(1); setTime(0); setPreset('自訂動畫'); setError(''); setGallery(false);
    notify(`已載入 ${next.name}，可用復原返回先前專案。`);
  }
  const layer = project.layers.find(l => l.id === selected);
  const selectImage = (target: string | null = null) => { imageImportTarget.current = target; imageInput.current?.click(); };
  const moveLayer = (direction: number) => update(p => {
    const layers = [...p.layers]; const index = layers.findIndex(l => l.id === selected); const next = index + direction;
    if (index < 0 || next < 0 || next >= layers.length) return p;
    [layers[index], layers[next]] = [layers[next], layers[index]];
    return { ...p, layers };
  });
  const updateLayer = (change: Partial<Project['layers'][number]>) => update(p => ({ ...p, layers: p.layers.map(l => l.id === selected ? { ...l, ...change } : l) }));
  const keyframeControls = (ids: ParameterId[]) => ids.map(id => {
    const d = parameterDefinitions.find(def => def.id === id); if (!d) return null;
    return <Slider key={id} label={d.label} value={manualOverrides.current[id] ?? animatedParameters[id] ?? project.parameters[id]} min={d.min} max={d.max} step={d.max > 5 ? 0.1 : 0.01} onChange={value => { setPlaying(false); param(id, value); }} onKeyframe={() => addKeyframe(id)} suffix={id.startsWith('angle') ? '°' : ''} />;
  });

  return <div className={`studio ${preview ? 'preview-mode' : ''}`}>
    <input ref={fileInput} type="file" accept=".json,.mio" hidden onChange={e => { void importProject(e.target.files?.[0]); e.target.value = ''; }} />
    <input ref={imageInput} type="file" accept="image/png" hidden onChange={e => { void importImage(e.target.files?.[0]); e.target.value = ''; }} />
    <header className="topbar">
      <a className="brand" href="/" aria-label="Mio Studio 首頁"><span className="brand-mark"><svg viewBox="0 0 32 32"><path d="M6 23V11l5 7 5-10 5 10 5-7v12" /></svg></span><strong>mio<span>studio</span></strong><span className="beta">BETA</span></a>
      <div className="project-title"><span className="project-dot" /><input aria-label="專案名稱" value={project.name} maxLength={80} onBlur={() => { if (!projectRef.current.name.trim()) update(p => ({ ...p, name: "未命名角色" })); }} onChange={e => update(p => ({ ...p, name: e.target.value }))} /><ChevronDown size={12} /><span className="saved-label">{saved ? <Check size={12} /> : <span className="unsaved-dot" />}{saved ? '已自動儲存' : '尚未儲存'}</span></div>
      <div className="top-actions">{!preview && <><button className="icon-button header-icon" onClick={() => setDialog('help')} title="使用說明" aria-label="使用說明"><CircleHelp size={17} /></button><button className="quiet-button" onClick={saveProject}><Save size={14} /><span>儲存專案</span></button><button className="outline-button" onClick={previewWeb}><Play size={13} fill="currentColor" />預覽</button><button className="primary-button" onClick={() => setDialog('export')}><ArrowUpRight size={15} />匯出網頁</button></>}{preview && <a className="outline-button" href="/"><ArrowLeft size={14} />返回工作台</a>}</div>
    </header>
    {!preview && <nav className="workspace-nav"><div className="workspace-tabs">{([['model', '角色製作', Layers3], ['rig', '網格綁定', Grid2X2], ['animate', '動畫編輯', Activity]] as const).map(([id, name, Icon]) => <button key={id} className={tab === id ? 'active' : ''} disabled={illustration && id !== 'model'} onClick={() => setTab(id)}><Icon size={14} />{name}</button>)}</div><div className="workspace-nav-right"><button className="examples-button" onClick={() => setGallery(true)}><Sparkles size={14} />角色範例</button><span><span className="online-dot" />本機工作空間</span><button className="icon-button" title="復原 ⌘Z" aria-label="復原" disabled={!past.current.length} onClick={undo}><Undo2 size={15} /></button><button className="icon-button" title="重做 ⌘⇧Z" aria-label="重做" disabled={!future.current.length} onClick={redo}><Redo2 size={15} /></button></div></nav>}
    <main className="workspace">
      {!preview && <aside className="left-panel">
        <div className="panel-heading"><span><Layers3 size={14} />圖層</span><button className="icon-button" title="匯入 PNG 圖層" aria-label="匯入 PNG 圖層" onClick={() => selectImage()}><Plus size={16} /></button></div>
        <div className="character-card"><img src={project.assets.neutral} alt={`${example?.name ?? project.name}角色縮圖`} /><div><strong>{example ? `${example.english} · ${example.name}` : project.name}</strong><span>{illustration ? example?.pose ?? "姿勢插畫" : "原創動漫角色"}</span><small><span className="online-dot" />{project.layers.length} 個可編輯圖層</small></div></div>
        <div className="layers-section"><div className="section-eyebrow">角色結構 <span>PNG / RGBA</span></div><div className="layer-group"><ChevronDown size={12} /><FolderOpen size={14} /><span>{project.name}</span></div>
          {[...project.layers].reverse().map(l => { const Icon = layerIcons[l.kind] ?? Layers3; return <div className={`layer-row ${selected === l.id ? 'selected' : ''} ${!l.visible ? 'hidden-layer' : ''}`} key={l.id}><button className="layer-select" onClick={() => setSelected(l.id)}><Icon size={14} /><span>{l.name}</span></button><button className="icon-button" aria-label={`${l.visible ? '隱藏' : '顯示'} ${l.name}`} title={l.visible ? '隱藏圖層' : '顯示圖層'} onClick={() => update(p => ({ ...p, layers: p.layers.map(row => row.id === l.id ? { ...row, visible: !row.visible } : row) }))}>{l.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button><button className={`icon-button layer-lock ${l.locked ? 'locked' : ''}`} title="鎖定圖層" aria-label={`鎖定 ${l.name}`} onClick={() => update(p => ({ ...p, layers: p.layers.map(row => row.id === l.id ? { ...row, locked: !row.locked } : row) }))}><LockKeyhole size={11} /></button></div>; })}
        </div>
        {layer && <div className="layer-properties"><div className="section-eyebrow">圖層屬性 <Settings2 size={12} /></div><div className="layer-property-title"><span className="tiny-purple" />{layer.name}</div>{layer.src && <div className="part-preview"><img src={layer.src} alt={layer.name + "獨立透明部件"} /><div><span>獨立 PNG 部件</span><small>透明素材 · 保持原圖座標</small><button disabled={layer.locked} onClick={() => selectImage(layer.id)}><ImagePlus size={11} />替換素材</button></div></div>}<Slider label="透明度" min={0} max={1} value={layer.opacity} onChange={opacity => updateLayer({ opacity })} disabled={layer.locked} />{(layer.src || layer.kind === 'character') && <><div className="coordinate-inputs"><label>X<input aria-label="圖層 X 位置" type="number" value={layer.x} disabled={layer.locked} step={1} min={-10000} max={10000} onChange={e => updateLayer({ x: Math.max(-10000, Math.min(10000, Number(e.target.value))) })} /></label><label>Y<input aria-label="圖層 Y 位置" type="number" value={layer.y} disabled={layer.locked} step={1} min={-10000} max={10000} onChange={e => updateLayer({ y: Math.max(-10000, Math.min(10000, Number(e.target.value))) })} /></label></div><Slider label="縮放" min={0.1} max={3} value={layer.scale} onChange={scale => updateLayer({ scale })} disabled={layer.locked} /><Slider label="旋轉" min={-180} max={180} step={1} value={layer.rotation} onChange={rotation => updateLayer({ rotation })} suffix="°" disabled={layer.locked} /></>}<div className="layer-order"><button disabled={layer.locked || project.layers.at(-1)?.id === selected} onClick={() => moveLayer(1)}><ArrowUpRight size={12} />往前一層</button><button disabled={layer.locked || project.layers[0]?.id === selected} onClick={() => moveLayer(-1)}><ArrowDownToLine size={12} />往後一層</button></div>{layer.kind === 'custom' && <button className="danger-text" disabled={layer.locked} onClick={() => { update(p => ({ ...p, layers: p.layers.filter(row => row.id !== selected) })); setSelected(project.layers[0].id); }}><Trash2 size={12} />刪除此圖層</button>}</div>}
        <div className="left-spacer" /><div className="asset-tip"><Sparkles size={16} /><strong>從一個想法，到一個角色。</strong><p>透明素材、細緻表情，讓每個小動作都有生命。</p><button onClick={() => selectImage()}>匯入你的 PNG 素材 <ArrowUpRight size={12} /></button></div>
        <div className="left-footer"><button onClick={() => fileInput.current?.click()}><FolderOpen size={14} />開啟專案</button><button aria-label="建立新專案" title="建立新專案" onClick={() => { stopMic(); clearOverrides(); const fresh = createDefaultProject(); fresh.id = crypto.randomUUID(); update(fresh); setSelected(fresh.layers[0].id); player.current?.seek(0); notify('已建立新專案，可用復原返回原專案。'); }}><FilePlus2 size={14} /></button></div>
      </aside>}
      <section className={`viewport viewport-${background}`}>
        <div className="canvas-toolbar"><div className="canvas-tools"><button aria-label="選取工具" title="選取工具" className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')}><MousePointer2 size={15} /></button><button aria-label="移動畫布" title="移動畫布" className={tool === 'hand' ? 'active' : ''} onClick={() => setTool('hand')}><Hand size={15} /></button><span className="tool-divider" /><button aria-label="顯示網格" title="網格 G" className={mesh ? 'active' : ''} onClick={() => setMesh(!mesh)}><Grid2X2 size={15} /></button><button aria-label="切換透明背景" title="透明背景" className={background === 'transparent' ? 'active' : ''} onClick={() => setBackground(b => b === 'transparent' ? 'studio' : 'transparent')}><Grid2X2 size={15} strokeWidth={1} /></button><button aria-label="切換深色背景" title="深色背景" className={background === 'dark' ? 'active' : ''} onClick={() => setBackground(b => b === 'dark' ? 'studio' : 'dark')}><Sun size={15} /></button></div><span className="canvas-mode">{preview ? '網頁播放器' : tab === 'rig' ? '變形網格 / 表情遮罩' : '角色畫布'}<span className="canvas-badge">2D</span></span><button className="canvas-export" onClick={capture} title="下載透明 PNG"><ArrowDownToLine size={14} /><span>PNG</span></button></div>
        <div className={`canvas-container ${tool === 'hand' ? 'grab' : ''}`} onPointerDown={e => { if (tool === 'hand') { pointer.current = { x: e.clientX, y: e.clientY, pan }; e.currentTarget.setPointerCapture(e.pointerId); } else if (tab === 'rig' && project.mesh && !layer?.locked) { const index = player.current?.pickMeshPoint(e.clientX, e.clientY); const view = player.current?.getRigViewport(); if (index != null && view) { setPlaying(false); past.current.push(projectRef.current); future.current = []; pointer.current = { x: e.clientX, y: e.clientY, pan, mesh: { index, origin: { ...project.mesh.offsets[index] }, scaleX: view.fit * view.width, scaleY: view.fit * view.height } }; e.currentTarget.setPointerCapture(e.pointerId); } } }} onPointerMove={e => { const drag = pointer.current; if (!drag) return; if (drag.mesh) { const point = drag.mesh; update(p => { if (!p.mesh) return p; const offsets = [...p.mesh.offsets]; offsets[point.index] = { x: Math.max(-0.3, Math.min(0.3, point.origin.x + (e.clientX - drag.x) / point.scaleX)), y: Math.max(-0.3, Math.min(0.3, point.origin.y + (e.clientY - drag.y) / point.scaleY)) }; return { ...p, mesh: { ...p.mesh, offsets } }; }, false); } else setPan({ x: drag.pan.x + e.clientX - drag.x, y: drag.pan.y + e.clientY - drag.y }); }} onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }}>
          <div className="stage-orbit" /><div className="stage-caption"><span>MEET YOUR CHARACTER</span><strong>{example?.english ?? "Original"}<span>{example?.name ?? project.name}</span></strong></div>
          <canvas ref={canvas} aria-label="互動角色畫布" />
          {loading && <div className="canvas-loading"><span className="spinner" /><span>正在準備角色素材…</span></div>}
          {error && <div className="canvas-error"><ImagePlus size={25} /><strong>素材尚未載入</strong><p>{error}</p><button onClick={() => { setLoading(true); player.current?.load().then(() => { setError(''); setLoading(false); }).catch(e => { setError(String(e)); setLoading(false); }); }}>重新載入</button></div>}
          <div className="viewport-top-note"><span className="tiny-purple" />{project.canvas.width} × {project.canvas.height}<span>透明角色素材</span></div>
          {!illustration && <div className="quick-actions"><span>試試動作</span><button onClick={() => quickAction('blink')}><Eye size={14} />眨眼</button><button onClick={() => quickAction('wave')}><Hand size={14} />揮手</button><button onClick={() => quickAction('talk')}><Activity size={14} />說話</button></div>}
          <div className="viewport-bottom"><span><span className="online-dot" />{fps > 0 ? Math.min(120, fps) : '—'} FPS <span className="render-quality">高品質渲染</span></span><div><button aria-label="縮小" onClick={() => setZoom(z => Math.max(0.35, z - 0.1))}><ZoomOut size={14} /></button><button className="zoom-value" title="重設縮放" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{Math.round(zoom * 100)}%<ChevronDown size={10} /></button><button aria-label="放大" onClick={() => setZoom(z => Math.min(3, z + 0.1))}><ZoomIn size={14} /></button><span /><button aria-label="符合畫布" title="符合畫布" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize size={13} /></button></div></div>
        </div>
      </section>
      <aside className="right-panel">
        <div className="inspector-tabs"><button className={rightTab === 'parameters' ? 'active' : ''} onClick={() => setRightTab('parameters')}><SlidersHorizontal size={13} />{tab === 'rig' ? '綁定' : '參數'}</button><button className={rightTab === 'lighting' ? 'active' : ''} onClick={() => setRightTab('lighting')}><Sun size={13} />光影</button></div>
        <div className="inspector-scroll">
          {rightTab === 'parameters' && illustration && <><div className="inspector-heading"><span className="section-eyebrow">CHARACTER POSE</span><h2>{example?.pose ?? '姿勢插畫'}</h2></div><div className="info-note"><ImagePlus size={16} /><p>完整姿勢插畫。調整構圖與光影，再下載透明 PNG；支援儲存專案與網頁匯出。</p></div>{layer && <div className="parameter-group"><h3><Move size={14} />構圖調整</h3><Slider label="水平位置" min={-500} max={500} value={layer.x} disabled={layer.locked} onChange={x => updateLayer({x})} /><Slider label="垂直位置" min={-500} max={500} value={layer.y} disabled={layer.locked} onChange={y => updateLayer({y})} /><Slider label="角色縮放" min={0.1} max={2} value={layer.scale} disabled={layer.locked} onChange={scale => updateLayer({scale})} /><Slider label="角色旋轉" min={-30} max={30} value={layer.rotation} disabled={layer.locked} suffix="°" onChange={rotation => updateLayer({rotation})} /></div>}</>}
          {rightTab === 'parameters' && !illustration && <>
            <div className="inspector-heading"><div><span className="section-eyebrow">CHARACTER PARAMETERS</span><h2>{tab === 'rig' ? '精準綁定每個表情' : '細節，讓角色鮮活。'}</h2></div><button className="icon-button" title="重設角色參數" aria-label="重設角色參數" onClick={() => { stopMic(); clearOverrides(); setPlaying(false); update(p => ({ ...p, parameters: createDefaultProject().parameters })); }}><RotateCcw size={14} /></button></div>
            {tab === 'rig' ? <><div className="info-note"><Grid2X2 size={16} /><p>拖曳畫布上的網格頂點可調整造型。下方可校正眼睛與嘴型遮罩；數值以素材寬高比例表示。</p></div>{(['eyeLeft', 'eyeRight', 'mouth'] as const).map((id, index) => <div className="parameter-group" key={id}><h3><span className="tiny-purple" />{['左眼遮罩', '右眼遮罩', '嘴型遮罩'][index]}</h3>{(['x', 'y', 'width', 'height'] as const).map((key, i) => <Slider key={key} label={['水平位置', '垂直位置', '寬度', '高度'][i]} min={key === 'width' || key === 'height' ? 0.01 : 0} max={key === 'width' || key === 'height' ? 0.3 : 1} step={0.001} value={project.rig[id][key]} onChange={value => update(p => { const rect = p.rig[id]; const limit = key === "x" ? 1 - rect.width : key === "y" ? 1 - rect.height : key === "width" ? 1 - rect.x : 1 - rect.y; return { ...p, rig: { ...p.rig, [id]: { ...rect, [key]: Math.max(key === "width" || key === "height" ? 0.01 : 0, Math.min(value, limit)) } } }; })} />)}</div>)}<button className="wide-outline" onClick={() => update(p => ({ ...p, rig: createDefaultProject().rig, mesh: createDefaultProject().mesh }))}><RotateCcw size={14} />恢復綁定與網格</button></> : <>
              <div className="parameter-group"><h3><Eye size={14} />臉部與表情<span>07</span></h3>{keyframeControls(faces)}</div>
              <div className="parameter-group"><h3><Move size={14} />姿態與動作<span>06</span></h3>{keyframeControls(body)}</div>
              <div className="parameter-group"><h3><WandSparkles size={14} />衣料與風<span>04</span></h3>{keyframeControls(clothing)}<div className="clothing-note">風力帶動髮絲、裙襬與袖口；動作過渡會柔和收束。</div></div><div className="parameter-group motion-settings"><h3><Sparkles size={14} />自然動態</h3><Toggle label="自動眨眼" detail="自然間隔，柔和閉合" checked={project.settings.autoBlink} onChange={autoBlink => update(p => ({ ...p, settings: { ...p.settings, autoBlink } }))} /><Toggle label="呼吸與髮絲" checked={project.settings.idleMotion} onChange={idleMotion => update(p => ({ ...p, settings: { ...p.settings, idleMotion } }))} /><Toggle label="視線跟隨游標" checked={project.settings.pointerTracking} onChange={pointerTracking => update(p => ({ ...p, settings: { ...p.settings, pointerTracking } }))} /><button className={`mic-button ${mic ? 'recording' : ''}`} disabled={micPending} onClick={() => void toggleMic()}>{mic ? <MicOff size={14} /> : <Mic size={14} />}{micPending ? '正在啟用麥克風…' : mic ? '停用麥克風' : '麥克風嘴型同步'}<span>{mic ? 'LIVE' : '啟用'}</span></button></div>
            </>}
          </>}
          {rightTab === 'lighting' && <><div className="inspector-heading"><div><span className="section-eyebrow">LIGHT & ATMOSPHERE</span><h2>一點光，無限氛圍。</h2></div><Sun size={18} className="lavender" /></div><div className="lighting-preview"><div className="light-orb" /><span>柔和棚拍光</span><small>即時調整 · 保留透明背景</small></div><div className="light-presets">{([['柔光', { intensity: 1, exposure: 0, shadow: 0.2, softness: 0.7, rimLight: 0.25, warmth: 0, direction: -35 }], ['暖陽', { intensity: 1.15, exposure: 0.1, shadow: 0.25, softness: 0.8, rimLight: 0.4, warmth: 0.55, direction: -50 }], ['月光', { intensity: 0.8, exposure: -0.1, shadow: 0.55, softness: 0.5, rimLight: 0.65, warmth: -0.6, direction: 45 }]] as const).map(([name, lighting]) => <button key={name} onClick={() => update(p => ({ ...p, lighting: { ...lighting } }))}><span className={`preset-swatch ${name === '暖陽' ? 'warm' : name === '月光' ? 'moon' : ''}`} />{name}</button>)}</div><div className="parameter-group"><h3><Sun size={14} />主光源</h3>{([{ id: 'intensity', label: '光源強度', min: 0, max: 2 }, { id: 'exposure', label: '曝光', min: -1, max: 1 }, { id: 'direction', label: '光線方向', min: -180, max: 180 }, { id: 'warmth', label: '色溫', min: -1, max: 1 }] as const).map(d => <Slider key={d.id} label={d.label} value={project.lighting[d.id]} min={d.min} max={d.max} suffix={d.id === 'direction' ? '°' : ''} onChange={value => update(p => ({ ...p, lighting: { ...p.lighting, [d.id]: value } }))} />)}</div><div className="parameter-group"><h3><Sparkles size={14} />高光與陰影</h3>{([{ id: 'rimLight', label: '輪廓高光', min: 0, max: 1 }, { id: 'shadow', label: '陰影深度', min: 0, max: 1 }, { id: 'softness', label: '陰影柔和度', min: 0, max: 1 }] as const).map(d => <Slider key={d.id} label={d.label} value={project.lighting[d.id]} min={d.min} max={d.max} onChange={value => update(p => ({ ...p, lighting: { ...p.lighting, [d.id]: value } }))} />)}</div><div className="info-note"><Sparkles size={16} /><p>光影調整會儲存在專案中，匯出的網頁播放器也能即時控制。</p></div></>}
        </div><div className="inspector-footer"><span className="tiny-purple" />{rightTab === 'lighting' ? '光影效果已同步至畫布' : '拖動滑桿即時預覽'}<span>●</span></div>
      </aside>
    </main>
    {!preview && !illustration && <section className="timeline">
      <div className="timeline-toolbar"><div className="timeline-title"><Activity size={14} /><strong>動畫時間軸</strong><span className="timeline-divider" /><select aria-label="動畫預設" value={preset} onChange={e => applyPreset(e.target.value)}><option value="自訂動畫" disabled>自訂動畫</option>{motionNames.map(name => <option key={name}>{name}</option>)}</select><ChevronDown size={11} /></div><div className="transport"><button aria-label="返回動畫起點" onClick={() => { clearOverrides(); player.current?.seek(0); setTime(0); }}><RotateCcw size={13} /></button><button className="play-button" aria-label={playing ? '暫停動畫' : '播放動畫'} onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button><button aria-label="上一影格" title="上一影格" onClick={() => stepFrame(-1)}><ArrowLeft size={13} /></button><button aria-label="下一影格" title="下一影格" onClick={() => stepFrame(1)}><ChevronRight size={13} /></button><span>{time.toFixed(2)}<small> / {project.timeline.duration.toFixed(2)} s</small></span></div><div className="timeline-settings"><button onClick={() => { setPlaying(false); addKeyframe('angleZ'); }}><Plus size={12} />關鍵影格</button><label>長度<input aria-label="動畫長度" type="number" min={1} max={60} step={1} value={project.timeline.duration} onChange={e => { const duration = Math.min(60, Math.max(1, Number(e.target.value))); update(p => ({ ...p, timeline: { ...p.timeline, duration, tracks: p.timeline.tracks.map(track => ({ ...track, keyframes: track.keyframes.filter(k => k.time <= duration) })) } })); }} />s</label><span>{project.timeline.fps} FPS</span></div></div>
      <div className="timeline-content"><div className="track-names"><div className="track-label-heading">參數軌道 <button className="icon-button" title="清除動畫軌道" aria-label="清除動畫軌道" onClick={() => { update(p => ({ ...p, timeline: { ...p.timeline, tracks: [] } })); setPreset('自訂動畫'); }}><Trash2 size={12} /></button></div>{project.timeline.tracks.map(track => <div className="track-name" key={track.id}><Diamond size={9} /><span>{parameterDefinitions.find(d => d.id === track.parameter)?.label ?? track.parameter}</span><button aria-label={`刪除 ${track.parameter} 軌道`} onClick={() => update(p => ({ ...p, timeline: { ...p.timeline, tracks: p.timeline.tracks.filter(t => t.id !== track.id) } }))}><X size={11} /></button></div>)}{project.timeline.tracks.length === 0 && <div className="track-empty">還沒有動畫軌道</div>}</div><div className="track-grid"><div className="time-ruler" onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); const t = Math.max(0, Math.min(project.timeline.duration, (e.clientX - rect.left) / rect.width * project.timeline.duration)); clearOverrides(); player.current?.seek(t); setTime(t); setPlaying(false); }}>{Array.from({ length: 7 }, (_, i) => <span key={i}>{(project.timeline.duration * i / 6).toFixed(1)}<small>s</small></span>)}</div>{project.timeline.tracks.map(track => <div className="track-line" key={track.id}>{track.keyframes.map((key, index) => <button className="keyframe" key={index} style={{ left: `${key.time / project.timeline.duration * 100}%` }} aria-label={`${track.parameter} ${key.time} 秒關鍵影格`} title={`${key.time.toFixed(2)}s · ${LANG.format(key.value)}；雙擊刪除`} onClick={() => { clearOverrides(); player.current?.seek(key.time); setTime(key.time); setPlaying(false); }} onDoubleClick={() => update(p => ({ ...p, timeline: { ...p.timeline, tracks: p.timeline.tracks.map(t => t.id === track.id ? { ...t, keyframes: t.keyframes.filter((_, i) => i !== index) } : t) } }))}><Diamond size={9} fill="currentColor" /></button>)}</div>)}{project.timeline.tracks.length === 0 && <div className="timeline-empty"><Sparkles size={15} />選擇動畫預設，或點擊參數旁的菱形新增關鍵影格。</div>}<div className="playhead" style={{ left: `${time / project.timeline.duration * 100}%` }}><span /></div></div></div>
    </section>}
    <footer className="statusbar"><span><span className="status-logo">m</span>讓想像，有自己的動作。</span><span>Canvas 2D<span className="status-divider" />{project.layers.filter(l => l.visible).length} 個可見圖層<span className="status-divider" />Mio Runtime v1.0</span></footer>
    <dialog ref={galleryDialog} className="modal gallery-dialog" aria-label="角色範例" onCancel={e => { e.preventDefault(); setGallery(false); }}><button className="modal-close icon-button" aria-label="關閉角色範例" onClick={() => setGallery(false)}><X size={18} /></button><span className="section-eyebrow">CHARACTER COLLECTION</span><h2>挑一位角色，試試不同姿勢。</h2><p>四位原創動漫美少女姿勢插畫，以及花音的分層動畫範例。</p><div className="example-grid">{characterExamples.map(item => <button key={item.id} className="example-card" aria-label={`載入${item.name} · ${item.pose}`} onClick={() => chooseExample(item.id)}><div className="example-art"><img src={item.src} alt={`${item.name} · ${item.pose}`} /></div><strong>{item.name}<small>{item.english}</small></strong><span>{item.pose}</span><small>{item.style} · {item.layered ? '14 圖層' : '完整姿勢插畫'}</small></button>)}</div><div className="gallery-note"><Undo2 size={14} />切換會載入範例專案，可用復原返回目前作品。</div></dialog>
    {toast && <div className="toast" role="status"><Check size={15} /><span>{toast}</span><button aria-label="關閉通知" onClick={() => setToast('')}><X size={13} /></button></div>}
    {dialog && <div className="modal-backdrop" onClick={() => !exporting && setDialog(null)}><section className="modal" role="dialog" aria-modal="true" aria-label={dialog === 'export' ? '匯出網頁' : '使用說明'} onClick={e => e.stopPropagation()}><button className="modal-close icon-button" disabled={exporting} aria-label="關閉" onClick={() => setDialog(null)}><X size={18} /></button>{dialog === 'export' ? <><div className="modal-icon"><ArrowUpRight size={26} /></div><span className="section-eyebrow">READY FOR THE WEB</span><h2>把你的角色，帶到網頁。</h2><p>包含所有角色素材、動畫資料與 TypeScript 編譯的播放器。解壓後即可部署到靜態網站。</p><div className="export-files"><div><FolderOpen size={15} /><strong>{project.name}-web.zip</strong><span>完整作品</span></div>{['index.html · 互動展示頁', 'runtime.js · 可嵌入播放器', 'character.mio.json · 參數與動畫', 'assets/ · 透明 PNG 角色素材'].map(item => <span key={item}><Check size={12} />{item}</span>)}</div><div className="export-note"><Check size={13} />保留表情控制、麥克風嘴型與即時光影</div><button className="primary-button export-button" disabled={exporting} onClick={() => void exportWeb()}>{exporting ? <span className="spinner" /> : <Download size={16} />}{exporting ? '正在打包角色…' : '下載網頁播放包'}</button><button className="wide-quiet" disabled={exporting} onClick={saveProject}><Save size={14} />只下載專案 JSON</button></> : <><div className="modal-icon"><WandSparkles size={26} /></div><span className="section-eyebrow">A LITTLE GUIDE</span><h2>你好，歡迎來到 Mio。</h2><p>這是一個獨立的 2D 角色編輯工具。以透明 PNG 與表情素材，製作能在網頁互動的角色。</p><ol className="help-list"><li><strong>製作角色</strong><span>切換圖層，調整眼睛、嘴型、姿態與光影。</span></li><li><strong>調整綁定</strong><span>開啟網格，校正眼睛與嘴型遮罩位置。</span></li><li><strong>編輯動畫</strong><span>選擇預設或點擊參數旁的菱形，在時間軸加入關鍵影格。</span></li><li><strong>匯出到網頁</strong><span>下載 ZIP，部署到靜態網站，使用 Mio2D API 控制動作。</span></li></ol><div className="shortcut-list"><span><kbd>Space</kbd>播放 / 暫停</span><span><kbd>G</kbd>網格</span><span><kbd>⌘ S</kbd>儲存專案</span><span><kbd>⌘ Z</kbd>復原</span></div><button className="primary-button export-button" onClick={() => setDialog(null)}>開始創作 <ArrowUpRight size={16} /></button></>}</section></div>}
  </div>;
}

export default App;
