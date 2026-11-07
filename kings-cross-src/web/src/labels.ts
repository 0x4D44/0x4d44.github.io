// Platform number signs, drawn on a canvas and shown as sprites that always face the camera.
import * as THREE from 'three';

function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#10161f';
  g.beginPath();
  g.roundRect(6, 6, 116, 116, 18);
  g.fill();
  g.strokeStyle = '#f2c94c';
  g.lineWidth = 7;
  g.stroke();
  g.fillStyle = '#f7f3e3';
  g.font = `700 ${text.length > 1 ? 70 : 88}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A sign `size` metres square, centred on `at`. */
export function platformSign(ref: string, at: [number, number, number], size = 2.4): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(ref), depthTest: true, fog: false }));
  s.scale.set(size, size, 1);
  s.position.set(...at);
  s.name = `platform-${ref}`;
  return s;
}
