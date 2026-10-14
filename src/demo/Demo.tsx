import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ExternalLink, Grid2X2, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import { characterExamples } from '../core/examples';
import { motionNames } from '../core/motions';
import { CharacterPlayer } from '../core/player';
import { createDemoProject, demoAsset } from './project';

export default function Demo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<CharacterPlayer | null>(null);
  const [character, setCharacter] = useState('hana');
  const [motion, setMotion] = useState('揮手招呼');
  const [playing, setPlaying] = useState(true);
  const [mesh, setMesh] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [exposure, setExposure] = useState(0);
  const [warmth, setWarmth] = useState(0.08);
  const [time, setTime] = useState(0);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const project = useMemo(() => createDemoProject(character, motion), [character, motion]);
  const example = characterExamples.find(item => item.id === character)!;
  const animated = example.layered;

  useEffect(() => {
    let active = true;
    setStatus('loading'); setError(''); setNotice(''); setTime(0); setFps(0);
    try {
      const instance = new CharacterPlayer(canvas.current!, project, {
        onFrame: (current, rate) => { if (active) { setTime(current); setFps(rate); } },
      });
      player.current = instance;
      instance.setOptions({ background: 'transparent', playing: false });
      void instance.load().then(() => { if (active) setStatus('ready'); }).catch(reason => {
        if (active) { setError(String(reason instanceof Error ? reason.message : reason)); setStatus('error'); }
      });
      return () => { active = false; instance.dispose(); if (player.current === instance) player.current = null; };
    } catch (reason) {
      setError(String(reason instanceof Error ? reason.message : reason)); setStatus('error');
    }
  }, [character, retry]);

  useEffect(() => {
    player.current?.setProject(project);
    player.current?.seek(0);
  }, [project]);

  useEffect(() => {
    player.current?.setOptions({ playing: status === 'ready' && animated && playing, mesh: animated && mesh,
      pointerTracking: animated && tracking, lighting: { exposure, warmth } });
  }, [status, animated, playing, mesh, tracking, exposure, warmth]);

  async function downloadPng() {
    setExporting(true); setNotice('');
    try {
      const blob = await player.current!.capture();
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `mio-${character}.png`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice('透明 PNG 已下載');
    } catch (reason) { setNotice(`下載失敗：${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { setExporting(false); }
  }

  function reset() {
    setMotion('揮手招呼'); setPlaying(true); setMesh(false); setTracking(false);
    setExposure(0); setWarmth(0.08); player.current?.seek(0); setTime(0);
  }

  return <div className="demo-page">
    <header className="site-header">
      <a className="brand" href={import.meta.env.BASE_URL}><span className="brand-mark"><Sparkles size={21} /></span>Mio <span>Studio</span><small>DEMO</small></a>
      <a className="source-link" href="https://github.com/Lian0123/new-2d" target="_blank" rel="noreferrer">GitHub 原始碼 <ExternalLink size={14} /></a>
    </header>
    <main>
      <section className="intro">
        <div><div className="eyebrow">2D CHARACTER PLAYGROUND</div><h1>讓角色，<em>動起來。</em></h1><p>從一張插畫到一個招呼。試試表情、動作與光影，找到角色的生命力。</p></div>
        <span className="intro-tag"><span />直接在瀏覽器體驗</span>
      </section>
      <section className="playground" aria-label="角色互動展示">
        <div className="stage-column">
          <div className="stage">
            <div className="stage-top"><span className="stage-pill">{animated ? 'LIVE · 分層角色' : 'ART · 姿勢插畫'}</span><span className="stage-index">0{characterExamples.findIndex(item => item.id === character) + 1} / 05</span></div>
            <div className="stage-glow" />
            <canvas ref={canvas} aria-label={`${example.name}角色預覽`} data-testid="character-canvas" />
            {status !== 'ready' && <div className="stage-message" role={status === 'error' ? 'alert' : 'status'}>
              {status === 'loading' ? <><span className="spinner" />角色素材載入中…</> : <><strong>角色載入失敗</strong><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>重新載入</button></>}
            </div>}
            <div className="stage-caption"><div><span>{example.english.toUpperCase()}</span><h2>{example.name}<small>{example.style}</small></h2></div><span className="stage-hint">{animated ? '眨眼・呼吸・衣料動態' : example.pose}</span></div>
          </div>
          <div className="transport">
            <button className="play-button" aria-label={playing && animated ? '暫停動畫' : '播放動畫'} disabled={status !== 'ready' || !animated} onClick={() => setPlaying(value => !value)}>{playing && animated ? <Pause size={18} /> : <Play size={18} />}</button>
            <input type="range" aria-label="播放時間" min="0" max="6" step="0.01" value={time} disabled={status !== 'ready' || !animated} onChange={event => { setPlaying(false); player.current?.pause(); player.current?.seek(Number(event.target.value)); }} />
            <output data-testid="playback-time">{time.toFixed(2)}<span> / 6.00 s</span></output>
          </div>
          <div className="runtime-status" role="status" data-testid="runtime-status" data-state={status}><span className={`status-dot ${status}`} />{status === 'ready' ? (animated ? '角色已載入・動畫可操作' : '插畫已載入・光影可操作') : status === 'loading' ? '正在準備展示' : '素材載入失敗'}<span>{status === 'ready' && animated ? `${fps} FPS` : 'Canvas 2D'}</span></div>
        </div>
        <aside className="controls" aria-label="展示控制">
          <div className="panel-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2>試著玩玩看</h2></div><button className="icon-button" aria-label="重設展示" onClick={reset}><RotateCcw size={17} /></button></div>
          <div className="control-section"><h3><span>01</span> 選擇角色</h3>
            <div className="character-picker">{characterExamples.map(item => <button key={item.id} aria-label={`選擇${item.name}`} aria-pressed={character === item.id} onClick={() => setCharacter(item.id)}><img src={demoAsset(item.src)} alt="" /><span>{item.name}</span></button>)}</div>
            <p className="helper">{animated ? '花音有 14 個圖層，可體驗表情與骨架動畫。' : `${example.name}是完整姿勢插畫，可調整光影並匯出 PNG。`}</p>
          </div>
          <fieldset disabled={!animated || status !== 'ready'} className="control-section"><legend><span>02</span> 動作與表情</legend>
            <label className="select-label">動畫預設<select aria-label="動畫預設" value={motion} onChange={event => { setMotion(event.target.value); setPlaying(true); }}>{motionNames.map(name => <option key={name}>{name}</option>)}</select></label>
            <div className="toggle-row"><label><input type="checkbox" checked={tracking} onChange={event => setTracking(event.target.checked)} />視線跟隨游標</label><label><input type="checkbox" checked={mesh} onChange={event => setMesh(event.target.checked)} /><Grid2X2 size={13} />顯示網格</label></div>
          </fieldset>
          <fieldset className="control-section" disabled={status !== 'ready'}><legend><span>03</span> 調整光影</legend>
            <label className="range-label">曝光<output>{exposure.toFixed(1)}</output><input aria-label="曝光" type="range" min="-1" max="1" step="0.1" value={exposure} onChange={event => setExposure(Number(event.target.value))} /></label>
            <label className="range-label">色溫<output>{warmth < 0 ? '冷色' : warmth > 0.2 ? '暖色' : '自然'}</output><input aria-label="色溫" type="range" min="-1" max="1" step="0.01" value={warmth} onChange={event => setWarmth(Number(event.target.value))} /></label>
          </fieldset>
          <button className="download-button" disabled={status !== 'ready' || exporting} onClick={() => void downloadPng()}><ArrowDownToLine size={17} />{exporting ? '正在產生 PNG…' : '下載透明 PNG'}</button>
          <p className="download-note" role="status">{notice || '保留透明背景，帶走你喜歡的畫面。'}</p>
        </aside>
      </section>
      <section className="how-it-works" aria-label="操作示意"><div><span className="eyebrow">QUICK START</span><h2>三步，感受角色的動態</h2></div><ol><li><b>1</b><div><strong>挑選花音</strong><p>花音提供分層動畫，其他角色展示完整插畫。</p></div></li><li><b>2</b><div><strong>換個動作</strong><p>選「揮手招呼」或「風吹衣襬」，暫停後拖曳時間軸檢視每一刻。</p></div></li><li><b>3</b><div><strong>調光，再帶走</strong><p>調整曝光與色溫，下載目前姿勢的透明 PNG。</p></div></li></ol></section>
    </main>
    <footer><span>Mio Studio <span className="footer-dot">·</span> 2D 角色互動示範</span><span>完整編輯、專案與 ZIP 匯出請使用<a href="https://github.com/Lian0123/new-2d#開啟工作台" target="_blank" rel="noreferrer">本機工作台 <ExternalLink size={12} /></a></span></footer>
  </div>;
}
