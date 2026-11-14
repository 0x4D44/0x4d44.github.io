// The look of a standing person, laid over whatever pose the animation has put on the skeleton: the head (and, less, the neck and upper spine) turned to what they are
// looking at, the chest rising with the breath, and the shake of a laugh. waiting.js decides the angles; this turns the bones.
//
// Like the gait and the phone hold (gait_three.js, hold_three.js) it is an overlay on bones the mixer only rewrites when a clip's value changes, so restore() must be
// called before every mixer update, and before the restore() of the layers underneath it.
const CHAIN = [[/^spine_02$/, 0.10], [/^spine_03$/, 0.17], [/^neck(_01)?$/, 0.28], [/^head$/, 0.45]];   // who takes how much of a turn of the head

export class LookRig {
  constructor(THREE, obj) {
    const T = THREE; this.obj = obj; this.bones = []; this.share = [];
    for (const [re, k] of CHAIN) { let b = null; obj.traverse((o) => { if (!b && o.isBone && re.test(o.name)) b = o; }); if (b) { this.bones.push(b); this.share.push(k); } }
    const tot = this.share.reduce((a, b) => a + b, 0); this.share = this.share.map((k) => k / (tot || 1));
    this.ok = this.bones.length >= 2; this.saved = new Float32Array(this.bones.length * 4); this.applied = false;
    this.qp = new T.Quaternion(); this.qr = new T.Quaternion(); this.qi = new T.Quaternion(); this.qo = new T.Quaternion(); this.up = new T.Vector3(0, 1, 0); this.right = new T.Vector3(); this.fwd = new T.Vector3();
  }
  /** yaw (+ve: to the person's left), pitch (+ve: up), both off the way the body faces; chest: a lean of the upper spine alone (breath, laugh), rad;
   *  spine: how much of its usual share of the turn the spine takes, 0..1 (less for someone holding a phone: the shoulders stay with the hands) */
  apply(yaw, pitch, chest = 0, spine = 1) {
    if (!this.ok) return; const B = this.bones, S = this.saved;
    if (!this.applied) { for (let i = 0; i < B.length; i++) { const q = B[i].quaternion; S[i * 4] = q.x; S[i * 4 + 1] = q.y; S[i * 4 + 2] = q.z; S[i * 4 + 3] = q.w; } this.applied = true; }
    this.obj.getWorldQuaternion(this.qo); this.fwd.set(0, 0, -1).applyQuaternion(this.qo); this.fwd.y = 0; this.fwd.normalize(); this.right.crossVectors(this.fwd, this.up).normalize();   // (people face -z of their own frame; a turn about `right` by +a lifts the gaze)
    for (let i = 0; i < B.length; i++) {
      const b = B[i], last = i === B.length - 1, k = this.share[i] * (i < B.length - 2 ? spine : 1);
      // a rotation R given in the world, applied to a bone under a parent whose world rotation is P:  local' = P^-1 R P local
      this.qr.setFromAxisAngle(this.up, yaw * k); this.qi.setFromAxisAngle(this.right, pitch * k + (i === 1 || (i === 0 && B.length < 3) ? chest : 0) - (last ? chest * 0.6 : 0)); this.qr.multiply(this.qi);
      b.parent.getWorldQuaternion(this.qp);
      this.qi.copy(this.qp).invert().multiply(this.qr).multiply(this.qp);
      b.quaternion.premultiply(this.qi);
    }
  }
  restore() {
    if (!this.ok || !this.applied) return; const S = this.saved, B = this.bones;
    for (let i = 0; i < B.length; i++) B[i].quaternion.set(S[i * 4], S[i * 4 + 1], S[i * 4 + 2], S[i * 4 + 3]);
    this.applied = false;
  }
}
