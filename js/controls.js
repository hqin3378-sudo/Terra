import * as THREE from 'three';

// 对数尺度导航：相机距离以 log10 表示，锚点间自动插值注视目标，
// 使滚轮一路拉远时视角自然从母恒星滑向银心。
export class SpaceControls {
  constructor(camera, dom, anchors) {
    this.camera = camera;
    this.dom = dom;
    this.anchors = anchors;

    this.logDist = anchors[0].log;
    this.targetLogDist = this.logDist;
    this.minLog = anchors[0].log;
    this.maxLog = anchors[anchors.length - 1].log;

    const sun = anchors[0].pos;
    this.theta = Math.atan2(sun.z, sun.x);
    this.phi = 1.35;
    this.targetTheta = this.theta;
    this.targetPhi = this.phi;

    this.target = sun.clone();
    this.desiredTarget = sun.clone();
    this.mode = 'anchor';

    this._tmp = new THREE.Vector3();
    this._pointers = new Map();
    this._pinchDist = 0;

    dom.addEventListener('pointerdown', this._onDown, { passive: true });
    dom.addEventListener('pointermove', this._onMove, { passive: true });
    dom.addEventListener('pointerup', this._onUp, { passive: true });
    dom.addEventListener('pointercancel', this._onUp, { passive: true });
    dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _onDown = (e) => {
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      this._pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  _onMove = (e) => {
    const p = this._pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this._pointers.size === 1) {
      this.targetTheta -= dx * 0.005;
      this.targetPhi = THREE.MathUtils.clamp(this.targetPhi - dy * 0.005, 0.08, Math.PI - 0.08);
    } else if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.mode = 'anchor';
      this.targetLogDist = THREE.MathUtils.clamp(
        this.targetLogDist - (d - this._pinchDist) * 0.004, this.minLog, this.maxLog);
      this._pinchDist = d;
    }
  };

  _onUp = (e) => {
    this._pointers.delete(e.pointerId);
    this._pinchDist = 0;
  };

  _onWheel = (e) => {
    e.preventDefault();
    this.mode = 'anchor';
    const step = (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) * 0.0011;
    this.targetLogDist = THREE.MathUtils.clamp(this.targetLogDist + step, this.minLog, this.maxLog);
  };

  // 聚焦到任意世界坐标（如记忆晶体），滚轮/双指后恢复锚点巡航
  focusOn(pos, log = 1.0) {
    this.mode = 'free';
    this.desiredTarget.copy(pos);
    this.targetLogDist = THREE.MathUtils.clamp(log, this.minLog, this.maxLog);
  }

  _interpAnchor(log, out) {
    const A = this.anchors;
    let i = 0;
    while (i < A.length - 2 && log > A[i + 1].log) i++;
    const a = A[i];
    const b = A[i + 1];
    const t = THREE.MathUtils.clamp((log - a.log) / (b.log - a.log), 0, 1);
    return out.copy(a.pos).lerp(b.pos, t);
  }

  update(dt, reduced = false) {
    const k = reduced ? 1 : 1 - Math.exp(-6 * dt);
    this.logDist += (this.targetLogDist - this.logDist) * k;
    this.theta += (this.targetTheta - this.theta) * k;
    this.phi += (this.targetPhi - this.phi) * k;

    if (this.mode === 'anchor') {
      this._interpAnchor(this.targetLogDist, this._tmp);
      this.desiredTarget.copy(this._tmp);
    }
    this.target.lerp(this.desiredTarget, k);

    const dist = Math.pow(10, this.logDist);
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + dist * sp * Math.cos(this.theta),
      this.target.y + dist * Math.cos(this.phi),
      this.target.z + dist * sp * Math.sin(this.theta)
    );
    this.camera.lookAt(this.target);
  }

  get distance() { return Math.pow(10, this.logDist); }
  get targetPoint() { return this.target; }
}
