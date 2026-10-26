// Cab TMS screen + speedo drawn to canvases that become the textures of cab_screen / cab_speedo.
export class Tms {
  constructor(THREE) {
    this.THREE = THREE;
    this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 320;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.flipY = false;
    this.c2 = document.createElement('canvas'); this.c2.width = 256; this.c2.height = 170;
    this.g2 = this.c2.getContext('2d'); this.tex2 = new THREE.CanvasTexture(this.c2); this.tex2.colorSpace = THREE.SRGBColorSpace; this.tex2.flipY = false;
    this.acc = 0;
  }
  attach(trainView) {
    const THREE = this.THREE;
    const apply = (node, tex) => {
      if (!node) return;
      node.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); } });
    };
    apply(trainView.cabScreen, this.tex); apply(trainView.cabSpeedo, this.tex2);
  }
  update(dt, info, mode) {
    this.acc += dt; if (this.acc < 0.1) return; this.acc = 0;
    const g = this.g, W = 512, H = 320;
    g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
    const over = info.kmh > info.limitKmh + 1;
    g.fillStyle = '#0b1522'; g.fillRect(8, 8, W - 16, 56);
    g.fillStyle = '#7fd4ff'; g.font = '600 28px monospace'; g.textBaseline = 'middle';
    g.fillText((info.phase === 'station' ? 'STOPPED  ' : 'NEXT  ') + info.nextName.toUpperCase().slice(0, 22), 20, 36);
    // speed
    g.fillStyle = over ? '#ff5a4a' : '#e8fff0'; g.font = '700 110px monospace'; g.textAlign = 'right';
    g.fillText(String(Math.round(info.kmh)).padStart(2, ' '), 300, 150); g.textAlign = 'left';
    g.font = '24px monospace'; g.fillStyle = '#9ab'; g.fillText('km/h', 308, 170);
    // limit roundel
    g.beginPath(); g.arc(420, 130, 52, 0, 7); g.fillStyle = '#fff'; g.fill(); g.beginPath(); g.arc(420, 130, 44, 0, 7); g.strokeStyle = '#d22'; g.lineWidth = 9; g.stroke();
    g.fillStyle = '#111'; g.font = '700 46px sans-serif'; g.textAlign = 'center'; g.fillText(String(Math.round(info.limitKmh)), 420, 133); g.textAlign = 'left';
    // distance bar
    const d = Math.max(0, info.distToStop);
    g.fillStyle = '#0b1522'; g.fillRect(8, 196, W - 16, 38);
    g.fillStyle = '#ffd89a'; g.font = '24px monospace'; g.fillText(d >= 1000 ? (d / 1000).toFixed(2) + ' km' : Math.round(d) + ' m to stop', 20, 216);
    // notch + brake pressure
    const nn = info.ato ? 'ATO' : { '-3': 'B3', '-2': 'B2', '-1': 'B1', '0': 'COAST', '1': 'P1', '2': 'P2', '3': 'P3' }[info.lever];
    g.fillStyle = info.ato ? '#7dffa0' : '#fff'; g.font = '700 34px monospace'; g.fillText(nn, 20, 266);
    g.fillStyle = '#334'; g.fillRect(160, 252, 200, 22); g.fillStyle = '#f2a33a'; g.fillRect(160, 252, 200 * Math.min(1, info.brakeBar / 4), 22);
    g.fillStyle = '#9ab'; g.font = '16px monospace'; g.fillText('BP ' + info.brakeBar.toFixed(1) + ' bar', 370, 264);
    // doors
    const dc = info.doorsClosed;
    g.fillStyle = dc ? '#1d7a3a' : '#c33'; g.fillRect(20, 286, 150, 26); g.fillStyle = '#fff'; g.font = '18px monospace'; g.fillText(dc ? 'DOORS CLOSED' : 'DOORS OPEN', 28, 300);
    g.fillStyle = info.signalGreen ? '#1d7a3a' : '#7a1d1d'; g.fillRect(180, 286, 120, 26); g.fillStyle = '#fff'; g.fillText(info.signalGreen ? 'SIGNAL CLEAR' : 'SIGNAL RED', 186, 300);
    g.fillStyle = '#9ab'; g.fillText(mode === 'drive' ? 'PLAT ' + (info.platSide > 0 ? 'R' : 'L') : '', 320, 300);
    this.tex.needsUpdate = true;
    const h = this.g2; h.fillStyle = '#05070b'; h.fillRect(0, 0, 256, 170);
    h.fillStyle = over ? '#ff5a4a' : '#9dffb0'; h.font = '700 96px monospace'; h.textAlign = 'center'; h.textBaseline = 'middle'; h.fillText(String(Math.round(info.kmh)), 128, 80); h.textAlign = 'left';
    this.tex2.needsUpdate = true;
  }
}
