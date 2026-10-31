// GPU frame time via EXT_disjoint_timer_query_webgl2 (E-05). Owner: core.
// Optional by design: where the browser does not offer the extension (or a query goes wrong) `ms` stays 0 and the governor judges the CPU cost alone.
// One TIME_ELAPSED query wraps the whole frame; results arrive a few frames later and are read without ever stalling the pipeline.
// `live` is what the governor asks (R2-E-01): true once a real reading has arrived. Without one the cost it sees is the CPU's alone, and a GPU-bound
// frame looks cheap, so the governor also judges the frame interval.
export class GpuTimer {
  constructor(gl) {
    this.gl = gl; this.ext = null; this.ms = 0; this.reads = 0; this.pending = []; this.spare = []; this.active = null; this.dead = false;
    try { this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch { this.ext = null; }
  }
  get supported() { return !!this.ext && !this.dead; }
  get live() { return this.supported && this.reads > 0; }
  /** Call before the frame's first GL command. */
  begin() {
    if (!this.supported) return;
    if (this.active) this.end();                          // a frame that threw before end(): close its query first
    try {
      this.poll();
      if (this.pending.length >= 4) return;               // the GPU is several frames behind: do not queue more
      const q = this.spare.pop() || this.gl.createQuery();
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.active = q;
    } catch { this.dead = true; this.active = null; }
  }
  /** Call after the frame's last GL command. */
  end() {
    if (!this.active) return;
    try { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.active); } catch { this.dead = true; }
    this.active = null;
  }
  poll() {
    const gl = this.gl;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      // 5 s, not 1 s: a software renderer or a very weak GPU really does take over a second a frame (R2-E-01); only a garbage reading is dropped.
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) { const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; if (ms > 0 && ms < 5000) { this.ms = ms; this.reads++; } }
      this.spare.push(q);
    }
  }
  dispose() {
    if (this.gl.isContextLost?.()) { this.pending.length = 0; this.spare.length = 0; return; }
    try { for (const q of [...this.pending, ...this.spare, this.active]) if (q) this.gl.deleteQuery(q); } catch { /* gone with the context */ }
    this.pending.length = 0; this.spare.length = 0; this.active = null;
  }
}
