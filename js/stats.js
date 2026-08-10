// 旅程统计：探索时长、足迹星域、图鉴收集，本地持久化
const KEY = 'terra-stats-v1';

export class Stats {
  constructor() {
    this.sessionTime = 0;
    this._unsaved = 0;
    this._acc = 0;
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* ignore */ }
    this.totalTime = d.totalTime || 0;
    this.regions = new Set(d.regions || []);
    this.spectral = new Set(d.spectral || []);
    this.pois = new Set(d.pois || []);
  }

  tick(dt) {
    this.sessionTime += dt;
    this._unsaved += dt;
    this._acc += dt;
    if (this._acc > 6) {
      this._acc = 0;
      this._save();
    }
  }

  recordRegion(key) {
    const before = this.regions.size;
    this.regions.add(key);
    return this.regions.size > before;
  }

  recordSpectral(type) {
    if (this.spectral.has(type)) return false;
    this.spectral.add(type);
    this._save();
    return true;
  }

  recordPoi(id) {
    if (this.pois.has(id)) return false;
    this.pois.add(id);
    this._save();
    return true;
  }

  snapshot() {
    return {
      totalTime: this.totalTime + this._unsaved,
      sessionTime: this.sessionTime,
      regions: this.regions.size,
      spectral: this.spectral.size,
      pois: this.pois.size,
    };
  }

  _save() {
    this.totalTime += this._unsaved;
    this._unsaved = 0;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        totalTime: this.totalTime,
        regions: [...this.regions].slice(-400),
        spectral: [...this.spectral],
        pois: [...this.pois],
      }));
    } catch { /* ignore */ }
  }

  reset() {
    this.totalTime = 0;
    this._unsaved = 0;
    this.sessionTime = 0;
    this.regions.clear();
    this.spectral.clear();
    this.pois.clear();
    this._save();
  }
}

export function formatDuration(sec) {
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
