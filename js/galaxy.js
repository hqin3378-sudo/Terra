import * as THREE from 'three';

// 光谱型 → 黑体近似色 / 相对尺寸 / 出现频率（依据恒星初始质量函数近似）
const SPECTRAL = [
  { type: 'O', color: [0.61, 0.69, 1.00], size: 2.3, w: 0.0003 },
  { type: 'B', color: [0.67, 0.75, 1.00], size: 1.8, w: 0.003 },
  { type: 'A', color: [0.79, 0.84, 1.00], size: 1.4, w: 0.015 },
  { type: 'F', color: [0.97, 0.97, 1.00], size: 1.15, w: 0.03 },
  { type: 'G', color: [1.00, 0.96, 0.92], size: 1.0, w: 0.08 },
  { type: 'K', color: [1.00, 0.82, 0.63], size: 0.85, w: 0.12 },
  { type: 'M', color: [1.00, 0.71, 0.42], size: 0.62, w: 0.7517 },
];

// 光谱型 → 表面温度（K），供拾取信息卡展示
const TEMP = { O: 35000, B: 18000, A: 8600, F: 6800, G: 5600, K: 4400, M: 3100 };

// 确定性随机源：每次访问生成同一条银河，记忆晶体才能对齐坐标
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function pickSpectral(rng) {
  let r = rng();
  for (const s of SPECTRAL) {
    if ((r -= s.w) <= 0) return s;
  }
  return SPECTRAL[6];
}

const VERT = /* glsl */`
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
uniform float uTime;
uniform vec2 uMouse;
uniform float uLens;
uniform vec2 uResolution;
uniform float uSizeScale;
uniform float uTwinkle;
varying vec3 vColor;
varying float vTw;
varying float vLens;

void main() {
  vColor = aColor;
  float tw = sin(uTime * (0.5 + aSeed * 2.4) + aSeed * 628.3);
  vTw = 1.0 + tw * uTwinkle;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float psize = aSize * uSizeScale * (120.0 / max(-mv.z, 0.001));
  vec4 clip = projectionMatrix * mv;

  // 引力透镜：屏幕空间内向光标弯曲，并按弯曲量增亮
  float pull = 0.0;
  if (uLens > 0.0001) {
    vec2 ndc = clip.xy / clip.w;
    vec2 px = (ndc * 0.5 + 0.5) * uResolution;
    vec2 mpx = (uMouse * 0.5 + 0.5) * uResolution;
    vec2 delta = mpx - px;
    float d2 = dot(delta, delta);
    pull = uLens * exp(-d2 / 51200.0); // sigma = 160px
    px += delta * pull * 0.85;
    ndc = px / uResolution * 2.0 - 1.0;
    clip.xy = ndc * clip.w;
  }
  vLens = pull;
  gl_PointSize = clamp(psize * (1.0 + pull * 1.2), 1.0, 90.0);
  gl_Position = clip;
}
`;

const FRAG = /* glsl */`
precision highp float;
uniform float uExposure;
varying vec3 vColor;
varying float vTw;
varying float vLens;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float core = smoothstep(0.55, 0.0, d);
  float halo = smoothstep(1.0, 0.15, d) * 0.35;
  float a = core + halo;
  if (a < 0.012) discard;
  vec3 col = vColor * vTw * (1.0 + vLens * 1.6);
  gl_FragColor = vec4(col * uExposure, a * (0.5 + 0.5 * core));
}
`;

export function createGalaxy(options = {}) {
  const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 768;
  const {
    count = isMobile ? 45000 : 130000,
    radius = 50,          // 1 unit = 1000 光年 → 银河半径 5 万光年
    branches = 4,
    spin = 3.6,
    seed = 20260730,
  } = options;

  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const brightStars = []; // 可拾取的亮星子集

  for (let i = 0; i < count; i++) {
    const roll = rng();
    let x, y, z, dimBase = 1;

    if (roll < 0.83) {
      // 银盘：对数螺旋臂 + 随半径增大的散布
      const branchAngle = ((i % branches) / branches) * Math.PI * 2;
      const r = Math.pow(rng(), 0.7) * radius;
      const theta = branchAngle + (r / radius) * spin;
      const spread = 0.4 + (r / radius) * 1.6;
      x = Math.cos(theta) * r + gaussian(rng) * spread;
      z = Math.sin(theta) * r + gaussian(rng) * spread;
      y = gaussian(rng) * (1.7 - (r / radius) * 1.3);
    } else if (roll < 0.95) {
      // 中央凸起：年老恒星，偏黄，球状压扁分布
      const s = 6.2;
      x = gaussian(rng) * s;
      y = gaussian(rng) * s * 0.65;
      z = gaussian(rng) * s;
      dimBase = 1.1;
    } else {
      // 银晕：稀疏、暗淡、偏蓝的老年星
      const s = 30;
      x = gaussian(rng) * s;
      y = gaussian(rng) * s;
      z = gaussian(rng) * s;
      dimBase = 0.4;
    }

    let cr, cg, cb, size, spType = null;
    if (roll < 0.83 && rng() < 0.004) {
      // 发射星云斑点：沿旋臂点缀的柔和云气
      cr = 1.0; cg = 0.42; cb = 0.62;
      size = 5.5 + rng() * 5;
      dimBase = 0.16;
    } else {
      const sp = pickSpectral(rng);
      spType = sp.type;
      const jitter = 0.92 + rng() * 0.16;
      cr = sp.color[0] * jitter;
      cg = sp.color[1] * jitter;
      cb = sp.color[2] * jitter;
      size = sp.size * (0.55 + rng() * 0.9);
      if (roll >= 0.95) { cr = 0.75; cg = 0.82; cb = 1.0; }
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3] = cr * dimBase;
    colors[i * 3 + 1] = cg * dimBase;
    colors[i * 3 + 2] = cb * dimBase;
    sizes[i] = size;
    seeds[i] = rng();

    // 收集可拾取亮星：O/B/A/F 全收 + 其余稀疏采样（不含暗晕星与星云）
    if (spType && roll < 0.95 && brightStars.length < 3000 && (size >= 1.15 || i % 211 === 0)) {
      brightStars.push({
        pos: [x, y, z],
        type: spType,
        temp: TEMP[spType],
        name: `TIC ${1000 + Math.floor(rng() * 9000)}-${String(brightStars.length).padStart(4, '0')}`,
      });
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uLens: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uSizeScale: { value: 1 },
    uExposure: { value: 1 },
    uTwinkle: { value: 0.22 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  // 采样某区域主导光谱色，作为记忆晶体的颜色来源
  function sampleRegionColor(cx, cz, r) {
    let sr = 0, sg = 0, sb = 0, n = 0;
    const r2 = r * r;
    for (let i = 0; i < count; i += 37) {
      const dx = positions[i * 3] - cx;
      const dz = positions[i * 3 + 2] - cz;
      if (dx * dx + dz * dz < r2) {
        sr += colors[i * 3]; sg += colors[i * 3 + 1]; sb += colors[i * 3 + 2];
        n++;
      }
    }
    if (n === 0) return null;
    const m = Math.max(sr, sg, sb, 0.001);
    return [sr / m, sg / m, sb / m];
  }

  // 太阳位置：第一条旋臂上距银心 2.6 万光年处的一颗 G 型星
  const sunTheta = (26 / radius) * spin;
  const sunPos = new THREE.Vector3(Math.cos(sunTheta) * 26, 0.3, Math.sin(sunTheta) * 26);

  return { points, uniforms, sampleRegionColor, sunPos, radius, brightStars };
}
