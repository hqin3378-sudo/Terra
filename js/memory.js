import * as THREE from 'three';

// 记忆晶体：记录旅者在各星域的停留时长，
// 超过阈值的区域凝结出由当地恒星光谱着色的脉动印记，持久保存于本地。
const STORE_KEY = 'terra-galaxy-memory-v1';
const CELL = 8;
const CRYSTAL_TIME = 20; // 秒（演示阈值）

function crystalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 60);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, -58); g.lineTo(30, 0); g.lineTo(0, 58); g.lineTo(-30, 0);
  g.closePath();
  g.fill();
  g.rotate(Math.PI / 4);
  g.globalAlpha = 0.5;
  g.scale(0.7, 0.7);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, -58); g.lineTo(30, 0); g.lineTo(0, 58); g.lineTo(-30, 0);
  g.closePath();
  g.fill();
  return new THREE.CanvasTexture(c);
}

export class MemoryVault {
  constructor(parent, sampleColor) {
    this.sampleColor = sampleColor;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.tex = crystalTexture();
    this.cells = new Map();
    this.onCrystal = null;
    this._saveTimer = 0;
    this._load();
    this._rebuild();
  }

  _keyOf(p) {
    return `${Math.round(p.x / CELL)},${Math.round(p.y / CELL)},${Math.round(p.z / CELL)}`;
  }

  _centerOf(key) {
    const [x, y, z] = key.split(',').map(Number);
    return new THREE.Vector3(x * CELL, y * CELL, z * CELL);
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const [key, c] of Object.entries(data.cells || {})) this.cells.set(key, c);
    } catch { /* 存储不可用时静默降级 */ }
  }

  _save() {
    try {
      const cells = {};
      for (const [key, c] of this.cells) cells[key] = c;
      localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, cells }));
    } catch { /* ignore */ }
  }

  _rebuild() {
    for (const [key, c] of this.cells) {
      if (c.crystal && c.color && c.pos) this._spawnSprite(key, c);
    }
  }

  _spawnSprite(key, c) {
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      color: new THREE.Color(c.color[0], c.color[1], c.color[2]),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(c.pos[0], c.pos[1], c.pos[2]);
    s.scale.setScalar(3.2);
    s.userData = { phase: Math.random() * Math.PI * 2, key };
    this.group.add(s);
    c.sprite = s;
  }

  _crystallize(key, c) {
    const center = this._centerOf(key);
    const col = this.sampleColor(center.x, center.z, CELL) || [0.62, 0.8, 1.0];
    c.crystal = true;
    c.color = col;
    c.pos = center.toArray();
    c.born = Date.now();
    this._spawnSprite(key, c);
    this._save();
    if (this.onCrystal) this.onCrystal(c);
  }

  update(dt, target, dist, time) {
    for (const s of this.group.children) {
      s.material.opacity = 0.34 + 0.22 * Math.sin(time * 1.3 + s.userData.phase);
    }

    if (dist > 120) return; // 只有深入银河内部才留下痕迹
    const key = this._keyOf(target);
    let c = this.cells.get(key);
    if (!c) {
      c = { t: 0, crystal: false };
      this.cells.set(key, c);
    }
    if (!c.crystal) {
      c.t += dt;
      this._saveTimer += dt;
      if (c.t >= CRYSTAL_TIME) {
        this._crystallize(key, c);
      } else if (this._saveTimer > 3) {
        this._saveTimer = 0;
        this._save();
      }
    }
  }

  list() {
    const out = [];
    for (const [key, c] of this.cells) {
      if (c.crystal) out.push({ key, color: c.color, pos: c.pos, born: c.born });
    }
    return out.sort((a, b) => b.born - a.born);
  }

  clear() {
    this.cells.clear();
    for (const s of [...this.group.children]) {
      s.material.dispose();
      this.group.remove(s);
    }
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  }
}
