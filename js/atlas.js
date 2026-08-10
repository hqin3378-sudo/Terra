import * as THREE from 'three';

// 星图页：银河俯视 2D 投影，奇点/晶体/当前位置标注，点击跃迁
export class Atlas {
  constructor({ canvas, galaxy, pois, memory, onJump }) {
    this.canvas = canvas;
    this.galaxy = galaxy;
    this.pois = pois;
    this.memory = memory;
    this.onJump = onJump;

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      const { cx, cy, scale } = this._view();
      const wx = (px - cx) / scale;
      const wz = (py - cy) / scale;
      if (Math.hypot(wx, wz) > 58) return;
      this.onJump(new THREE.Vector3(wx, 0, wz));
    });
  }

  _view() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    return { cx: w / 2, cy: h / 2, scale: Math.min(w, h) / 2 / 60 };
  }

  show(current) {
    const dpr = Math.min(devicePixelRatio, 2);
    const cw = this.canvas.clientWidth || (innerWidth - 40);
    const ch = this.canvas.clientHeight || innerHeight * 0.56;
    this.canvas.width = cw * dpr;
    this.canvas.height = ch * dpr;

    const ctx = this.canvas.getContext('2d');
    const { cx, cy, scale } = this._view();
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#030309';
    ctx.fillRect(0, 0, w, h);

    // 银河星尘（采样投影）
    const pos = this.galaxy.points.geometry.attributes.position.array;
    const col = this.galaxy.points.geometry.attributes.aColor.array;
    const count = this.galaxy.points.geometry.attributes.position.count;
    for (let i = 0; i < count; i += 11) {
      const x = cx + pos[i * 3] * scale;
      const y = cy + pos[i * 3 + 2] * scale;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const r = Math.min(255, Math.round(col[i * 3] * 255));
      const g = Math.min(255, Math.round(col[i * 3 + 1] * 255));
      const b = Math.min(255, Math.round(col[i * 3 + 2] * 255));
      ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
      ctx.fillRect(x, y, dpr, dpr);
    }

    // 银心标记
    ctx.strokeStyle = 'rgba(255,216,160,0.5)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, 6 * dpr, 0, Math.PI * 2);
    ctx.stroke();

    // 深空奇点
    ctx.font = `${10 * dpr}px monospace`;
    for (const poi of this.pois) {
      const x = cx + poi.pos[0] * scale;
      const y = cy + poi.pos[2] * scale;
      const rgb = poi.color.map((v) => Math.round(v * 255)).join(',');
      ctx.strokeStyle = `rgba(${rgb},0.9)`;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${rgb},0.95)`;
      ctx.fillText(poi.name, x + 9 * dpr, y + 3 * dpr);
    }

    // 记忆晶体
    for (const c of this.memory.list()) {
      const x = cx + c.pos[0] * scale;
      const y = cy + c.pos[2] * scale;
      const rgb = c.color.map((v) => Math.round(v * 255)).join(',');
      ctx.fillStyle = `rgba(${rgb},0.95)`;
      const s = 3.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.fill();
    }

    // 当前位置
    if (current) {
      const x = cx + current.x * scale;
      const y = cy + current.z * scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(x, y, 7 * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 2 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }
}
