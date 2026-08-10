import * as THREE from 'three';

// 天体拾取与信息卡：点击恒星/奇点 → 展示物理参数 → 可追踪、收入图鉴
const STAGE = {
  O: '主序蓝星 · 寿命不足千万年',
  B: '蓝白主序星 · 星团灯塔',
  A: '白色主序星 · 氦闪之前',
  F: '黄白主序星 · 温和短暂',
  G: '类日主序星 · 宜居带候选',
  K: '橙矮星 · 长寿的守望者',
  M: '红矮星 · 可燃烧万亿年',
};

const $ = (id) => document.getElementById(id);

export class Inspector {
  constructor({ camera, galaxy, onTrack, stats, toast }) {
    this.camera = camera;
    this.galaxy = galaxy;
    this.onTrack = onTrack;
    this.stats = stats;
    this.toast = toast;
    this._target = null;
    this._v = new THREE.Vector3();

    $('inspect-close').addEventListener('click', () => this.close());
    $('inspect-track').addEventListener('click', () => {
      if (this._target) {
        this.onTrack(this._target.pos, this._target.log);
        this.close();
      }
    });
  }

  // poiScreens: [{ poi, x, y, visible }]
  handleTap(x, y, poiScreens) {
    let poi = null;
    let best = 34;
    for (const ps of poiScreens) {
      if (!ps.visible) continue;
      const d = Math.hypot(ps.x - x, ps.y - y);
      if (d < best) { best = d; poi = ps.poi; }
    }
    if (poi) return this.showPoi(poi);

    let star = null;
    best = 17;
    const arr = this.galaxy.brightStars;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      this._v.set(s.pos[0], s.pos[1], s.pos[2]).project(this.camera);
      if (this._v.z > 1) continue;
      const sx = (this._v.x * 0.5 + 0.5) * innerWidth;
      const sy = (-this._v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(sx - x, sy - y);
      if (d < best) { best = d; star = s; }
    }
    if (star) this.showStar(star);
    else this.close();
  }

  showStar(s) {
    const distLy = Math.round(Math.hypot(s.pos[0], s.pos[1], s.pos[2]) * 1000);
    this._target = { pos: new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]), log: 0.2 };
    $('inspect-kind').textContent = `恒星 · ${s.type} 型`;
    $('inspect-name').textContent = s.name;
    $('inspect-rows').innerHTML =
      `<div class="irow"><span>表面温度</span><b>${s.temp.toLocaleString()} K</b></div>` +
      `<div class="irow"><span>演化阶段</span><b>${STAGE[s.type]}</b></div>` +
      `<div class="irow"><span>距银心</span><b>${distLy.toLocaleString()} 光年</b></div>`;
    $('inspect-desc').textContent = '';
    $('inspect-track').textContent = '追 踪';
    if (this.stats.recordSpectral(s.type)) this.toast(`图鉴 +1 · ${s.type} 型恒星`);
    this.card.classList.add('open');
  }

  showPoi(p) {
    const distLy = Math.round(Math.hypot(p.pos[0], p.pos[1], p.pos[2]) * 1000);
    this._target = { pos: new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]), log: 0.55 };
    $('inspect-kind').textContent = `深空奇点 · ${p.kind}`;
    $('inspect-name').textContent = p.name;
    $('inspect-rows').innerHTML =
      `<div class="irow"><span>类别</span><b>${p.kind}</b></div>` +
      `<div class="irow"><span>距银心</span><b>${distLy.toLocaleString()} 光年</b></div>`;
    $('inspect-desc').textContent = p.desc;
    $('inspect-track').textContent = '前 往';
    if (this.stats.recordPoi(p.id)) this.toast(`图鉴 +1 · ${p.name}`);
    this.card.classList.add('open');
  }

  close() {
    this.card.classList.remove('open');
  }

  get card() { return $('inspect-card'); }
}
