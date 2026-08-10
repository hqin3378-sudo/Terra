import * as THREE from 'three';
import { createGalaxy } from './galaxy.js';
import { SpaceControls } from './controls.js';
import { AudioEngine } from './audio.js';
import { MemoryVault } from './memory.js';
import { Router } from './router.js';
import { Stats, formatDuration } from './stats.js';
import { POIS, createPoiLayer } from './poi.js';
import { Inspector } from './inspect.js';
import { Atlas } from './atlas.js';
import { renderCodex } from './codex.js';

const canvas = document.getElementById('scene');
const loader = document.getElementById('loader');
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

/* ---------------- 设置持久化 ---------------- */

const SETTINGS_KEY = 'terra-settings-v1';
const settings = (() => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
})();

const state = {
  reduced: settings.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches,
  lensOn: settings.lens ?? true,
  quality: settings.quality ?? 'high',
  cruising: false,
  lens: 0,
  lensTarget: 0,
  route: 'home',
};

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      reduced: state.reduced, lens: state.lensOn, quality: state.quality,
    }));
  } catch { /* ignore */ }
}

/* ---------------- 程序化纹理 ---------------- */

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,250,235,1)');
  grad.addColorStop(0.18, 'rgba(255,240,210,0.55)');
  grad.addColorStop(0.5, 'rgba(255,220,170,0.12)');
  grad.addColorStop(1, 'rgba(255,210,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function makeSpiralTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 700; i++) {
      const t = i / 700;
      const ang = t * 4.2 * Math.PI + arm * Math.PI;
      const r = t * 116;
      const x = Math.cos(ang) * r + (Math.random() - 0.5) * 9 * t;
      const y = Math.sin(ang) * r * 0.62 + (Math.random() - 0.5) * 9 * t;
      g.fillStyle = `rgba(195,212,255,${(1 - t) * 0.5 * Math.random()})`;
      g.beginPath();
      g.arc(x, y, Math.random() * 1.7 + 0.4, 0, 7);
      g.fill();
    }
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 42);
  core.addColorStop(0, 'rgba(255,244,220,0.9)');
  core.addColorStop(1, 'rgba(255,244,220,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, 42, 0, 7);
  g.fill();
  return new THREE.CanvasTexture(c);
}

/* ---------------- 主引导 ---------------- */

function boot(webgl2) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(state.quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x020207, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.001, 8000);

  const galaxy = createGalaxy();
  scene.add(galaxy.points);
  const U = galaxy.uniforms;
  U.uSizeScale.value = renderer.getPixelRatio() * (matchMedia('(pointer: coarse)').matches ? 0.85 : 1);

  const SUN = galaxy.sunPos;
  const CENTER = new THREE.Vector3(0, 0, 0);

  const glowTex = makeGlowTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff2d8, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunSprite.position.copy(SUN);
  scene.add(sunSprite);

  const planetSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x9ecfff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  planetSprite.position.copy(SUN).add(new THREE.Vector3(0.012, 0.002, 0.008));
  scene.add(planetSprite);

  const spiralTex = makeSpiralTexture();
  [
    { p: [330, 90, -260], s: 90, r: [0.6, 0.3, 0.4] },
    { p: [-420, -60, 380], s: 135, r: [-0.4, 0.8, 0.2] },
    { p: [280, -140, 430], s: 70, r: [0.9, -0.5, 0.7] },
  ].forEach(({ p, s, r }) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshBasicMaterial({
        map: spiralTex, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    m.position.set(...p);
    m.rotation.set(...r);
    scene.add(m);
  });

  const poiLayer = createPoiLayer(scene);

  // 尺度锚点：行星轨道 → 恒星系 → 星团 → 旋臂 → 银河全景 → 本星系群
  const ANCHORS = [
    { log: -1.7, pos: SUN },
    { log: -0.2, pos: SUN },
    { log: 1.1, pos: SUN.clone().lerp(CENTER, 0.2) },
    { log: 1.9, pos: SUN.clone().lerp(CENTER, 0.6) },
    { log: 2.45, pos: CENTER },
    { log: 3.0, pos: CENTER },
  ];
  const NORM = (log) => clamp((log - ANCHORS[0].log) / (ANCHORS[5].log - ANCHORS[0].log), 0, 1);

  const controls = new SpaceControls(camera, canvas, ANCHORS);
  const audio = new AudioEngine();
  const memory = new MemoryVault(scene, galaxy.sampleRegionColor);
  const stats = new Stats();

  /* ---------------- HUD 基础 ---------------- */

  const toastEl = $('toast');
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function scaleText(dist) {
    const ly = dist * 1000;
    if (ly < 0.2) return `行星轨道 · ${Math.max(1, Math.round(ly * 63241))} AU`;
    if (ly < 20) return `恒星系 · ${ly.toFixed(1)} 光年`;
    if (ly < 2000) return `星团域 · ${Math.round(ly)} 光年`;
    if (ly < 30000) return `旋臂 · ${(ly / 1000).toFixed(1)} 千光年`;
    if (ly < 400000) return `银河全景 · ${Math.round(ly / 1000)} 千光年`;
    return `本星系群 · ${(ly / 1e6).toFixed(2)} 百万光年`;
  }

  /* ---------------- 巡航 ---------------- */

  const cruise = { t: 0, dur: 60, from: 0, to: 0, toastText: '' };
  function startCruise(to, dur, toastText = '', lightBtn = false) {
    state.cruising = true;
    cruise.t = 0;
    cruise.dur = dur;
    cruise.from = controls.targetLogDist;
    cruise.to = to;
    cruise.toastText = toastText;
    controls.mode = 'anchor';
    if (lightBtn) $('btn-cruise').classList.add('active');
  }
  function stopCruise(silent = true) {
    if (!state.cruising) return;
    state.cruising = false;
    $('btn-cruise').classList.remove('active');
    if (!silent && cruise.toastText) toast(cruise.toastText);
  }

  /* ---------------- 拾取 / 星图 / 路由 ---------------- */

  const inspector = new Inspector({
    camera,
    galaxy,
    stats,
    toast,
    onTrack: (pos, log) => {
      controls.focusOn(pos, log);
      toast('已锁定目标 · 追踪中');
    },
  });

  const atlas = new Atlas({
    canvas: $('atlas-canvas'),
    galaxy,
    pois: POIS,
    memory,
    onJump: (pos) => {
      controls.focusOn(pos, 1.1);
      router.go('observatory');
      toast('跃迁完成 · 已抵达目标星域');
    },
  });

  const router = new Router(onRoute);

  function onRoute(name) {
    state.route = name;
    const rendering = name === 'home' || name === 'observatory';
    renderer.setAnimationLoop(rendering ? loop : null);

    if (name === 'home') {
      // 着陆页：巡航至银河全景作为活背景
      controls.mode = 'anchor';
      controls.targetLogDist = Math.max(controls.targetLogDist, 2.45);
      const snap = stats.snapshot();
      const crystals = memory.list().length;
      if (crystals > 0 || snap.regions > 0) {
        $('btn-continue').hidden = false;
        $('continue-info').textContent = `${crystals} 枚晶体 · ${snap.regions} 处足迹`;
      }
    }
    if (name === 'atlas') atlas.show(controls.targetPoint);
    if (name === 'codex') {
      renderCodex({
        bar: $('codex-bar'), count: $('codex-count'),
        spectral: $('codex-spectral'), pois: $('codex-pois'),
      }, stats, POIS);
    }
    if (name === 'journal') renderJournalPage();
    if (name !== 'observatory') {
      inspector.close();
      gravityRing.classList.remove('show');
    }
  }

  document.querySelectorAll('#tabbar button').forEach((btn) => {
    btn.addEventListener('click', () => router.go(btn.dataset.route));
  });

  $('btn-enter').addEventListener('click', () => {
    router.go('observatory');
    startCruise(-1.7, state.reduced ? 5 : 12, '抵达 · 母恒星轨道');
  });
  $('btn-continue').addEventListener('click', () => {
    router.go('observatory');
    startCruise(-1.7, state.reduced ? 5 : 12, '欢迎回来 · 旅者');
  });

  $('btn-cruise').addEventListener('click', () => {
    if (state.cruising) {
      stopCruise();
      toast('穿越中止 · 由你掌舵');
    } else {
      startCruise(ANCHORS[5].log, 60, '抵达本星系群边缘 · 旅途愉快', true);
      toast('尺度穿越开始 · 可随时接管');
    }
  });

  /* ---------------- 日志页 ---------------- */

  function renderJournalPage() {
    const snap = stats.snapshot();
    const items = memory.list();
    $('stats-grid').innerHTML =
      `<div class="stat-card"><b>${formatDuration(snap.totalTime)}</b><span>累计探索</span></div>` +
      `<div class="stat-card"><b>${formatDuration(snap.sessionTime)}</b><span>本次会话</span></div>` +
      `<div class="stat-card"><b>${snap.regions}</b><span>足迹星域</span></div>` +
      `<div class="stat-card"><b>${items.length}</b><span>记忆晶体</span></div>` +
      `<div class="stat-card"><b>${snap.spectral + snap.pois}/13</b><span>图鉴收集</span></div>`;

    const list = $('journal-list');
    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = '<div id="journal-empty">尚无晶体凝结。<br>找一片星域，停下来，<br>让时间把你刻进银河。</div>';
      return;
    }
    for (const it of items) {
      const btn = document.createElement('button');
      btn.className = 'crystal-item';
      btn.type = 'button';
      const rgb = it.color.map((v) => Math.round(v * 255)).join(',');
      const date = new Date(it.born).toLocaleDateString('zh-CN');
      btn.innerHTML =
        `<span class="crystal-dot" style="color:rgb(${rgb});background:rgb(${rgb})"></span>` +
        `<span>记忆晶体 · ${it.key}<small>凝结于 ${date} · 点击返航</small></span>`;
      btn.addEventListener('click', () => {
        controls.focusOn(new THREE.Vector3(...it.pos), 1.0);
        router.go('observatory');
        toast('已设定返航坐标');
      });
      list.appendChild(btn);
    }
  }

  memory.onCrystal = () => {
    toast('✦ 记忆晶体已凝结');
    if (state.route === 'journal') renderJournalPage();
  };

  /* ---------------- 设置页 ---------------- */

  function syncSettingsUI() {
    $('sw-audio').classList.toggle('on', audio.enabled);
    $('sw-audio').setAttribute('aria-checked', String(audio.enabled));
    $('sw-motion').classList.toggle('on', state.reduced);
    $('sw-motion').setAttribute('aria-checked', String(state.reduced));
    $('sw-lens').classList.toggle('on', state.lensOn);
    $('sw-lens').setAttribute('aria-checked', String(state.lensOn));
    $('sw-quality').classList.toggle('on', state.quality === 'high');
    $('sw-quality').setAttribute('aria-checked', String(state.quality === 'high'));
  }

  function applyReduced(on) {
    state.reduced = on;
    document.body.classList.toggle('reduced', on);
    U.uTwinkle.value = on ? 0 : 0.22;
    saveSettings();
  }

  $('sw-audio').addEventListener('click', () => {
    const on = audio.toggle();
    syncSettingsUI();
    toast(on ? '空间声景已开启' : '声景已静默');
  });
  $('sw-motion').addEventListener('click', () => {
    applyReduced(!state.reduced);
    syncSettingsUI();
    toast(state.reduced ? '静谧模式 · 动态已减弱' : '动态已恢复');
  });
  $('sw-lens').addEventListener('click', () => {
    state.lensOn = !state.lensOn;
    if (!state.lensOn) state.lensTarget = 0;
    saveSettings();
    syncSettingsUI();
    toast(state.lensOn ? '引力透镜已启用' : '引力透镜已关闭');
  });
  $('sw-quality').addEventListener('click', () => {
    state.quality = state.quality === 'high' ? 'low' : 'high';
    renderer.setPixelRatio(state.quality === 'high' ? Math.min(devicePixelRatio, 2) : 1);
    U.uSizeScale.value = renderer.getPixelRatio() * (matchMedia('(pointer: coarse)').matches ? 0.85 : 1);
    onResize();
    saveSettings();
    syncSettingsUI();
    toast(state.quality === 'high' ? '高画质已开启' : '节能画质 · 帧率优先');
  });
  $('btn-wipe').addEventListener('click', () => {
    memory.clear();
    stats.reset();
    for (const k of Object.keys(state)) if (k.startsWith('_poiHint_')) delete state[k];
    toast('所有记忆已遗忘 · 银河重归陌生');
  });

  /* ---------------- POI 屏幕标签 ---------------- */

  const labelWrap = $('poi-labels');
  const poiLabels = poiLayer.entries.map(({ poi, posV }) => {
    const el = document.createElement('button');
    el.className = 'poi-label';
    el.type = 'button';
    el.textContent = poi.name;
    el.style.color = `rgb(${poi.color.map((v) => Math.round(v * 255)).join(',')})`;
    el.addEventListener('click', () => inspector.showPoi(poi));
    labelWrap.appendChild(el);
    return { poi, posV, el, x: 0, y: 0, visible: false };
  });

  const _pv = new THREE.Vector3();
  function updatePoiLabels() {
    for (const L of poiLabels) {
      _pv.copy(L.posV).project(camera);
      const camDist = camera.position.distanceTo(L.posV);
      L.visible = _pv.z < 1 && camDist < 420;
      if (L.visible) {
        L.x = (_pv.x * 0.5 + 0.5) * innerWidth;
        L.y = (-_pv.y * 0.5 + 0.5) * innerHeight;
        L.el.style.left = `${L.x}px`;
        L.el.style.top = `${L.y}px`;
        L.el.style.opacity = clamp(1.8 - camDist / 160, 0.15, 1);
        L.el.style.display = '';
      } else {
        L.el.style.display = 'none';
      }
    }
  }

  /* ---------------- 引力透镜 + 弹射 ---------------- */

  const gravityRing = $('gravity-ring');
  let press = null;

  function updateMouse(e) {
    U.uMouse.value.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  }

  function screenToDisc(x, y) {
    const v = new THREE.Vector3((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    const t = -camera.position.y / dir.y;
    if (!isFinite(t) || t <= 0) return null;
    const p = camera.position.clone().add(dir.multiplyScalar(t));
    const r = Math.hypot(p.x, p.z);
    if (r > 46) { p.x *= 46 / r; p.z *= 46 / r; }
    p.y = 0;
    return p;
  }

  addEventListener('pointermove', (e) => {
    updateMouse(e);
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      state.lensTarget = state.lensOn && !state.reduced ? 0.16 : 0;
    }
  }, { passive: true });

  addEventListener('pointerdown', (e) => {
    if (state.route !== 'observatory') return;
    updateMouse(e);
    press = { t: performance.now(), x: e.clientX, y: e.clientY };
    if (state.lensOn) {
      state.lensTarget = state.reduced ? 0.4 : 0.95;
      gravityRing.style.left = `${e.clientX}px`;
      gravityRing.style.top = `${e.clientY}px`;
      gravityRing.classList.add('show');
    }
    stopCruise();
  }, { passive: true });

  addEventListener('pointerup', (e) => {
    state.lensTarget = state.lensOn && e.pointerType === 'mouse' && !state.reduced ? 0.16 : 0;
    gravityRing.classList.remove('show');
    if (!press || state.route !== 'observatory') { press = null; return; }
    const dt = performance.now() - press.t;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (dt < 350 && moved < 10) {
      inspector.handleTap(e.clientX, e.clientY, poiLabels);
    } else if (dt >= 450 && moved < 12) {
      const p = screenToDisc(e.clientX, e.clientY);
      if (p) {
        controls.focusOn(p, 0.85);
        toast('引力弹射 · 跃迁中');
      }
    }
    press = null;
  }, { passive: true });

  document.addEventListener('pointerleave', () => {
    state.lensTarget = 0;
    gravityRing.classList.remove('show');
    press = null;
  }, { passive: true });

  /* ---------------- 尺寸与循环 ---------------- */

  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.getDrawingBufferSize(U.uResolution.value);
  }
  addEventListener('resize', onResize);
  onResize();

  applyReduced(state.reduced);
  syncSettingsUI();

  const clock = new THREE.Clock();
  const scaleLabel = $('scale-label');
  const scaleCursor = $('scale-cursor');
  let hudTimer = 0;
  let poiTimer = 0;
  let regionTimer = 0;

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    if (state.cruising) {
      cruise.t += dt;
      const p = clamp(cruise.t / cruise.dur, 0, 1);
      const ease = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
      controls.targetLogDist = lerp(cruise.from, cruise.to, ease);
      if (!state.reduced) controls.targetTheta += dt * 0.04;
      if (p >= 1) stopCruise(false);
    }

    controls.update(dt, state.reduced);
    const dist = controls.distance;
    const norm = NORM(controls.logDist);

    state.lens += (state.lensTarget - state.lens) * Math.min(1, dt * 6);
    U.uLens.value = state.lens;
    U.uTime.value = state.reduced ? 0 : t;
    U.uExposure.value = 0.75 + norm * 1.1;

    const sunScale = clamp(dist * 0.25, 0.004, 1.2);
    sunSprite.scale.setScalar(sunScale * 4);
    sunSprite.material.opacity = clamp(1.2 - norm * 1.1, 0, 0.95);
    planetSprite.scale.setScalar(clamp(dist * 0.06, 0.0008, 0.2));
    planetSprite.material.opacity = clamp(1 - norm * 2.5, 0, 0.9);

    poiLayer.update(t, state.reduced);
    if (state.route === 'observatory') updatePoiLabels();

    memory.update(dt, controls.targetPoint, dist, t);
    audio.setScale(norm);
    stats.tick(dt);

    // 奇点接近混音：沃尔夫-拉叶星风 / 脉冲星节律随距离浮现
    poiTimer += dt;
    if (poiTimer > 0.5) {
      poiTimer = 0;
      let best = null;
      let bd = 18;
      for (const { poi, posV } of poiLayer.entries) {
        if (!poi.audio) continue;
        const d = controls.targetPoint.distanceTo(posV);
        if (d < bd) { bd = d; best = poi; }
      }
      audio.setPoiBoost(best ? best.audio : null, best ? 1 - bd / 18 : 0);
      if (best && dist < 15 && !state[`_poiHint_${best.id}`]) {
        state[`_poiHint_${best.id}`] = true;
        toast(`接近 ${best.name} · ${best.kind}`);
      }
    }

    // 足迹星域统计
    regionTimer += dt;
    if (regionTimer > 2 && dist < 120) {
      regionTimer = 0;
      const p = controls.targetPoint;
      stats.recordRegion(`${Math.round(p.x / 10)},${Math.round(p.z / 10)}`);
    }

    hudTimer += dt;
    if (hudTimer > 0.12) {
      hudTimer = 0;
      scaleLabel.textContent = scaleText(dist);
      scaleCursor.style.left = `${norm * 100}%`;
    }

    renderer.render(scene, camera);
  }

  console.info(`[TERRA] renderer: ${webgl2 ? 'WebGL2' : 'WebGL1'}, stars: ${galaxy.points.geometry.attributes.position.count}, bright: ${galaxy.brightStars.length}`);
  router.start();
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 1000);
}

/* ---------------- 2D 降级方案 ---------------- */

function startFallback2D() {
  const ctx = canvas.getContext('2d');
  let stars = [];
  let w = 0, h = 0;

  function resize() {
    w = canvas.width = innerWidth * Math.min(devicePixelRatio, 2);
    h = canvas.height = innerHeight * Math.min(devicePixelRatio, 2);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    stars = [];
    const n = innerWidth < 768 ? 900 : 1800;
    for (let i = 0; i < n; i++) {
      const band = Math.random() < 0.55;
      stars.push({
        x: Math.random() * w,
        y: band
          ? h * 0.5 + (Math.random() + Math.random() - 1) * h * 0.22 + (Math.random() - 0.5) * w * 0.35
          : Math.random() * h,
        r: Math.random() * 1.6 + 0.3,
        p: Math.random() * Math.PI * 2,
        c: Math.random() < 0.12 ? '255,200,150' : Math.random() < 0.3 ? '170,200,255' : '235,240,255',
      });
    }
  }
  addEventListener('resize', resize);
  resize();

  let t = 0;
  (function draw() {
    t += 0.016;
    ctx.fillStyle = '#020207';
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, h * 0.3, w, h * 0.7);
    grad.addColorStop(0, 'rgba(90,110,180,0)');
    grad.addColorStop(0.5, 'rgba(120,140,210,0.10)');
    grad.addColorStop(1, 'rgba(90,110,180,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    for (const s of stars) {
      const a = 0.45 + 0.4 * Math.sin(t * (0.5 + s.r) + s.p);
      ctx.fillStyle = `rgba(${s.c},${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 7);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  })();

  document.body.classList.add('fallback');
  $('btn-enter').textContent = '需要 WebGL · 已切换静态星野';
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 1000);
}

/* ---------------- 入口 ---------------- */

try {
  const test = document.createElement('canvas');
  const gl2 = test.getContext('webgl2');
  const gl1 = gl2 || test.getContext('webgl');
  if (gl1) boot(!!gl2);
  else startFallback2D();
} catch (err) {
  console.error('[TERRA] WebGL 初始化失败，切换 2D 降级', err);
  startFallback2D();
}
