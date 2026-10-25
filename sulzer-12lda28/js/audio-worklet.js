import { EngineSynth } from "./audio-core.js";
class EngineProc extends AudioWorkletProcessor {
  constructor() {
    super();
    this.s = new EngineSynth(sampleRate, 777);
    this.port.onmessage = (e) => this.s.set(e.data);
  }
  process(_, outputs) {
    const out = outputs[0];
    this.s.process(out[0], out[0].length);
    for (let c = 1; c < out.length; c++) out[c].set(out[0]);
    return true;
  }
}
registerProcessor("engine-proc", EngineProc);
