import * as THREE from 'three';

// 深空奇点：手工安放于银河坐标系的特殊天体（单位：千光年）
export const POIS = [
  {
    id: 'sgr', name: '人马座 A*', kind: '超大质量黑洞',
    pos: [0, 0.6, 0], color: [1.0, 0.82, 0.45], audio: null,
    desc: '430 万个太阳的质量，蜷缩在比水星轨道还小的区域里。星光在此弯折成环，时间在此放慢脚步。',
  },
  {
    id: 'wr', name: '维兰之光', kind: '沃尔夫-拉叶星',
    pos: [-25.1, 0.5, 23.0], color: [1.0, 0.6, 0.3], audio: 'wind',
    desc: '一颗正在死去的巨星，以每秒数千公里的速度抛洒自己的大气。这星风，是超新星爆发前最后的呐喊。',
  },
  {
    id: 'pulsar', name: '灯塔脉冲星', kind: '毫秒脉冲星',
    pos: [8.4, -0.4, -15.9], color: [0.5, 0.9, 1.0], audio: 'pulsar',
    desc: '直径仅二十公里的中子星，自转快过厨房里的搅拌机。它的射电波束扫过虚空，是银河最精准的时钟。',
  },
  {
    id: 'nebula', name: '玫瑰星云', kind: '发射星云',
    pos: [18.7, 0.8, 23.5], color: [1.0, 0.45, 0.65], audio: null,
    desc: '氢气在年轻恒星的紫外辐射中电离发光。这里既是恒星的育婴房，也将是它们的坟场。',
  },
  {
    id: 'cluster', name: '猎人星团', kind: '球状星团',
    pos: [-15.0, 7.0, -17.4], color: [0.9, 0.9, 1.0], audio: null,
    desc: '十万颗恒星被引力凝聚成球，悬于银盘之上。它们诞生于银河的幼年，是 120 亿岁的活化石。',
  },
  {
    id: 'icegiant', name: '冰焰', kind: '蓝超巨星',
    pos: [-40.6, 0.3, -10.7], color: [0.6, 0.75, 1.0], audio: null,
    desc: '表面温度超过两万度的蓝色火焰。它燃烧得如此炽烈，注定英年早逝。',
  },
];

function makeRingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 3;
  g.shadowColor = 'rgba(255,255,255,0.8)';
  g.shadowBlur = 10;
  g.beginPath();
  g.arc(64, 64, 40, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(64, 64, 4, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}

export function createPoiLayer(scene) {
  const group = new THREE.Group();
  const tex = makeRingTexture();
  const entries = POIS.map((poi) => {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color(poi.color[0], poi.color[1], poi.color[2]),
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(poi.pos[0], poi.pos[1], poi.pos[2]);
    sprite.scale.setScalar(2.8);
    group.add(sprite);
    return { poi, sprite, posV: new THREE.Vector3(poi.pos[0], poi.pos[1], poi.pos[2]) };
  });
  scene.add(group);

  return {
    group,
    entries,
    update(t, reduced) {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        e.sprite.material.opacity = reduced ? 0.55 : 0.42 + 0.3 * Math.sin(t * 1.6 + i * 1.1);
        const s = reduced ? 2.8 : 2.8 + 0.35 * Math.sin(t * 1.6 + i * 1.1);
        e.sprite.scale.setScalar(s);
      }
    },
  };
}
