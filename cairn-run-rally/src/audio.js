import { clamp } from './math.js';
export class AudioManager {
  constructor() { this.ctx=null;this.started=false;this.effectsVolume=.75;this.voiceVolume=.9;this.lastShift=0;this.voice=null; }
  async start() {
    if(this.started){await this.ctx?.resume();return;}
    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
    this.ctx=new Ctx();this.master=this.ctx.createGain();this.master.gain.value=this.effectsVolume;this.master.connect(this.ctx.destination);
    this.engineGain=this.ctx.createGain();this.engineGain.gain.value=.0001;this.filter=this.ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=1100;this.engineGain.connect(this.filter).connect(this.master);
    this.engine1=this.ctx.createOscillator();this.engine1.type='sawtooth';this.engine2=this.ctx.createOscillator();this.engine2.type='triangle';const g2=this.ctx.createGain();g2.gain.value=.42;this.engine2.connect(g2).connect(this.engineGain);this.engine1.connect(this.engineGain);this.engine1.start();this.engine2.start();
    const noiseBuffer=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate),data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(.5+.5*Math.sin(i*.13));
    this.gravel=this.ctx.createBufferSource();this.gravel.buffer=noiseBuffer;this.gravel.loop=true;this.gravelFilter=this.ctx.createBiquadFilter();this.gravelFilter.type='bandpass';this.gravelFilter.frequency.value=700;this.gravelGain=this.ctx.createGain();this.gravelGain.gain.value=.0001;this.gravel.connect(this.gravelFilter).connect(this.gravelGain).connect(this.master);this.gravel.start();
    this.wind=this.ctx.createBufferSource();this.wind.buffer=noiseBuffer;this.wind.loop=true;this.windFilter=this.ctx.createBiquadFilter();this.windFilter.type='highpass';this.windFilter.frequency.value=260;this.windGain=this.ctx.createGain();this.windGain.gain.value=.0001;this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master);this.wind.start();
    this.whine=this.ctx.createOscillator();this.whine.type='sine';this.whineGain=this.ctx.createGain();this.whineGain.gain.value=.0001;this.whine.connect(this.whineGain).connect(this.master);this.whine.start();
    this.started=true;
  }
  setVolumes(effects,voice){this.effectsVolume=effects;this.voiceVolume=voice;if(this.master)this.master.gain.setTargetAtTime(effects,this.ctx.currentTime,.03);}
  update(car,input) {
    if(!this.started)return;const now=this.ctx.currentTime,rpm=clamp(car.rpm,900,7800),base=34+rpm*.018;
    this.engine1.frequency.setTargetAtTime(base,now,.025);this.engine2.frequency.setTargetAtTime(base*2.02,now,.025);this.filter.frequency.setTargetAtTime(560+rpm*.23,now,.04);
    const engineLevel=.035+input.throttle*.115+clamp(car.speed/45,0,1)*.035;this.engineGain.gain.setTargetAtTime(engineLevel,now,.035);
    const gravelLevel=(car.surface==='grass'?.105:car.surface==='loose'?.075:.042)*clamp(car.speed/25,0,1)+car.slipAmount*.075;this.gravelGain.gain.setTargetAtTime(gravelLevel,now,.03);
    const speedRatio=clamp(car.speed/48,0,1);this.windGain.gain.setTargetAtTime(speedRatio*speedRatio*.052,now,.08);this.windFilter.frequency.setTargetAtTime(220+car.speed*15,now,.09);
    this.whine.frequency.setTargetAtTime(110+car.speed*8.5+car.gear*24,now,.04);this.whineGain.gain.setTargetAtTime((.004+input.throttle*.013)*speedRatio,now,.05);
    if(car.shiftPulse>.92&&performance.now()-this.lastShift>180){this.lastShift=performance.now();this.blip(95,.045,.03);}
  }
  blip(frequency=500,duration=.12,volume=.08){if(!this.started)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain(),now=this.ctx.currentTime;o.type='square';o.frequency.setValueAtTime(frequency,now);o.frequency.exponentialRampToValueAtTime(Math.max(30,frequency*.55),now+duration);g.gain.setValueAtTime(volume,now);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g).connect(this.master);o.start(now);o.stop(now+duration+.02);}
  countdown(value){this.blip(value===0?920:610,value===0?.18:.09,value===0?.12:.065);}
  collision(intensity){if(!this.started)return;const size=Math.floor(this.ctx.sampleRate*.23),buffer=this.ctx.createBuffer(1,size,this.ctx.sampleRate),d=buffer.getChannelData(0);for(let i=0;i<size;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/size,2);const source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();filter.type='lowpass';filter.frequency.value=220+intensity*650;gain.gain.value=.12+intensity*.25;source.buffer=buffer;source.connect(filter).connect(gain).connect(this.master);source.start();}
  playPace(note){
    if(this.voice){this.voice.pause();this.voice=null;}
    const file=String(note.id).padStart(2,'0'),audio=new Audio();
    audio.preload='auto';
    audio.src=audio.canPlayType('audio/mpeg')?`./public/audio/pacenotes/note-${file}.mp3`:`./public/audio/pacenotes/note-${file}.ogg`;
    audio.volume=this.voiceVolume;audio.play().catch(()=>{});this.voice=audio;
  }
  stopVoice(){if(this.voice){this.voice.pause();this.voice=null;}}
  mute(muted){if(this.master&&this.ctx)this.master.gain.setTargetAtTime(muted?0:this.effectsVolume,this.ctx.currentTime,.03);if(muted)this.stopVoice();}
}
