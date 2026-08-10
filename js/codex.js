// 天体图鉴：光谱型七阶 + 深空奇点，收集进度持久于 Stats
const SPECTRAL_INFO = [
  { type: 'O', temp: '≥ 30000 K', color: '#9bb0ff', desc: '蓝色巨兽，数百万年便燃尽一生' },
  { type: 'B', temp: '10000–30000 K', color: '#aabfff', desc: '蓝白主序星，星团中的灯塔' },
  { type: 'A', temp: '7500–10000 K', color: '#cad7ff', desc: '白色恒星，如织女星般明亮' },
  { type: 'F', temp: '6000–7500 K', color: '#f8f7ff', desc: '黄白恒星，温和而短暂' },
  { type: 'G', temp: '5200–6000 K', color: '#fff4ea', desc: '类日恒星，宜居带的希望' },
  { type: 'K', temp: '3700–5200 K', color: '#ffd2a1', desc: '橙色矮星，长寿的守望者' },
  { type: 'M', temp: '2400–3700 K', color: '#ffb56b', desc: '红矮星，银河最多数的居民' },
];

export function renderCodex(els, stats, pois) {
  const snap = stats.snapshot();
  const total = SPECTRAL_INFO.length + pois.length;
  const found = snap.spectral + snap.pois;

  els.bar.style.width = `${(found / total) * 100}%`;
  els.count.textContent = `${found} / ${total}`;

  els.spectral.innerHTML = '';
  for (const info of SPECTRAL_INFO) {
    const unlocked = stats.spectral.has(info.type);
    const card = document.createElement('div');
    card.className = `codex-card${unlocked ? '' : ' locked'}`;
    card.innerHTML = unlocked
      ? `<div class="cc-type" style="color:${info.color}">${info.type}</div>` +
        `<div class="cc-name">${info.type} 型恒星</div>` +
        `<div class="cc-temp">${info.temp}</div>` +
        `<div class="cc-desc">${info.desc}</div>`
      : `<div class="cc-type">?</div>` +
        `<div class="cc-name">未发现</div>` +
        `<div class="cc-desc">在观测台点击一颗恒星，将它收入图鉴</div>`;
    els.spectral.appendChild(card);
  }

  els.pois.innerHTML = '';
  for (const poi of pois) {
    const unlocked = stats.pois.has(poi.id);
    const rgb = poi.color.map((v) => Math.round(v * 255)).join(',');
    const card = document.createElement('div');
    card.className = `codex-card${unlocked ? '' : ' locked'}`;
    card.innerHTML = unlocked
      ? `<div class="cc-type" style="color:rgb(${rgb})">◈</div>` +
        `<div class="cc-name">${poi.name}</div>` +
        `<div class="cc-temp">${poi.kind}</div>` +
        `<div class="cc-desc">${poi.desc}</div>`
      : `<div class="cc-type">?</div>` +
        `<div class="cc-name">尚未邂逅</div>` +
        `<div class="cc-desc">银河深处，某个奇点正等待你的到访</div>`;
    els.pois.appendChild(card);
  }
}
