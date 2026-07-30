import * as THREE from 'three';
import { createGalaxy } from './galaxy.js';
import { SpaceControls } from './controls.js';
import { AudioEngine } from './audio.js';
import { MemoryVault } from './memory.js';

const canvas = document.getElementById('scene');
const loader = document.getElementById('loader');
const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

const state = {
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  cruising: false,
  lens: 0,
  lensTarget: 0,
};

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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x020207, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.001, 8000);

  // 银河本体
  const galaxy = createGalaxy();
  scene.add(galaxy.points);
  const U = galaxy.uniforms;
  U.uSizeScale.value = renderer.getPixelRatio() * (matchMedia('(pointer: coarse)').matches ? 0.85 : 1);

  const SUN = galaxy.sunPos;
  const CENTER = new THREE.Vector3(0, 0, 0);

  // 母恒星辉光与伴行星：穿越之旅的起点
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

  // 河外星系：深空尺度的视觉锚点
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

  /* ---------------- HUD ---------------- */

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

  const journalEl = $('journal');
  const journalList = $('journal-list');
  function renderJournal() {
    const items = memory.list();
    journalList.innerHTML = '';
    if (items.length === 0) {
      journalList.innerHTML = '<div id="journal-empty">尚无晶体凝结。<br>找一片星域，停下来，<br>让时间把你刻进银河。</div>';
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
        journalEl.classList.remove('open');
        toast('已设定返航坐标');
      });
      journalList.appendChild(btn);
    }
  }

  memory.onCrystal = () => {
    toast('✦ 记忆晶体已凝结');
    if (journalEl.classList.contains('open')) renderJournal();
  };

  $('btn-log').addEventListener('click', () => {
    const open = journalEl.classList.toggle('open');
    $('btn-log').classList.toggle('active', open);
    if (open) renderJournal();
  });
  $('journal-clear').addEventListener('click', () => {
    memory.clear();
    renderJournal();
    toast('所有记忆已遗忘');
  });

  $('btn-motion').addEventListener('click', () => {
    state.reduced = !state.reduced;
    document.body.classList.toggle('reduced', state.reduced);
    $('btn-motion').classList.toggle('active', state.reduced);
    U.uTwinkle.value = state.reduced ? 0 : 0.22;
    toast(state.reduced ? '静谧模式 · 动态已减弱' : '动态已恢复');
  });
  if (state.reduced) {
    document.body.classList.add('reduced');
    $('btn-motion').classList.add('active');
    U.uTwinkle.value = 0;
  }

  $('btn-audio').addEventListener('click', () => {
    const on = audio.toggle();
    $('btn-audio').classList.toggle('active', on);
    toast(on ? '空间声景已开启' : '声景已静默');
  });

  // 尺度穿越：60 秒连续变焦，无加载中断
  const cruise = { t: 0, dur: 60, from: 0, to: 0 };
  $('btn-cruise').addEventListener('click', () => {
    state.cruising = !state.cruising;
    $('btn-cruise').classList.toggle('active', state.cruising);
    if (state.cruising) {
      cruise.t = 0;
      cruise.from = controls.targetLogDist;
      cruise.to = ANCHORS[5].log;
      controls.mode = 'anchor';
      toast('尺度穿越开始 · 可随时接管');
    }
  });

  /* ---------------- 引力透镜交互 ---------------- */

  function updateMouse(e) {
    U.uMouse.value.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  }
  addEventListener('pointermove', (e) => {
    updateMouse(e);
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      state.lensTarget = state.reduced ? 0 : 0.16;
    }
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    updateMouse(e);
    state.lensTarget = state.reduced ? 0.4 : 0.95;
    if (state.cruising) { // 旅者接管，穿越中止
      state.cruising = false;
      $('btn-cruise').classList.remove('active');
    }
  }, { passive: true });
  addEventListener('pointerup', (e) => {
    state.lensTarget = e.pointerType === 'mouse' && !state.reduced ? 0.16 : 0;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { state.lensTarget = 0; }, { passive: true });

  /* ---------------- 尺寸与循环 ---------------- */

  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.getDrawingBufferSize(U.uResolution.value);
  }
  addEventListener('resize', onResize);
  onResize();

  const clock = new THREE.Clock();
  const scaleLabel = $('scale-label');
  const scaleCursor = $('scale-cursor');
  let hudTimer = 0;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    if (state.cruising) {
      cruise.t += dt;
      const p = clamp(cruise.t / cruise.dur, 0, 1);
      const ease = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
      controls.targetLogDist = lerp(cruise.from, cruise.to, ease);
      if (!state.reduced) controls.targetTheta += dt * 0.04;
      if (p >= 1) {
        state.cruising = false;
        $('btn-cruise').classList.remove('active');
        toast('抵达本星系群边缘 · 旅途愉快');
      }
    }

    controls.update(dt, state.reduced);
    const dist = controls.distance;
    const norm = NORM(controls.logDist);

    state.lens += (state.lensTarget - state.lens) * Math.min(1, dt * 6);
    U.uLens.value = state.lens;
    U.uTime.value = state.reduced ? 0 : t;
    U.uExposure.value = 0.75 + norm * 1.1;

    // 母恒星与行星的视觉尺寸随尺度衰减
    const sunScale = clamp(dist * 0.25, 0.004, 1.2);
    sunSprite.scale.setScalar(sunScale * 4);
    sunSprite.material.opacity = clamp(1.2 - norm * 1.1, 0, 0.95);
    planetSprite.scale.setScalar(clamp(dist * 0.06, 0.0008, 0.2));
    planetSprite.material.opacity = clamp(1 - norm * 2.5, 0, 0.9);

    memory.update(dt, controls.targetPoint, dist, t);
    audio.setScale(norm);

    hudTimer += dt;
    if (hudTimer > 0.12) {
      hudTimer = 0;
      scaleLabel.textContent = scaleText(dist);
      scaleCursor.style.left = `${norm * 100}%`;
    }

    renderer.render(scene, camera);
  });

  console.info(`[TERRA] renderer: ${webgl2 ? 'WebGL2' : 'WebGL1'}, stars: ${galaxy.points.geometry.attributes.position.count}`);
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

  $('scale-label').textContent = '兼容模式 · 2D 星野（当前环境不支持 WebGL）';
  for (const id of ['btn-cruise', 'btn-audio', 'btn-log']) $(id).style.display = 'none';
  $('hint').textContent = '你的浏览器未启用 WebGL，已切换为静态星野';
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
