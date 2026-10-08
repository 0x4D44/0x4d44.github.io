# Synthesise the narration with a community GLaDOS-style Piper voice, one wav per
# sentence, then stitch them (speed-up 1.15x) and write cues.json: the per-sentence
# and per-scene timings that drive BOTH the visuals and the audio mix.
#   python3 tts.py     ->  narration_raw.wav, cues.json
import wave,json,subprocess,os,numpy as np
from piper import PiperVoice, SynthesisConfig
from script import SCENES
SR=22050
v=PiperVoice.load('en_US-glados.onnx')
os.makedirs('wav',exist_ok=True)
out=[];cues=[];t=0.0
GAP=0.22;SGAP=0.45
# extra silence (seconds, pre-speed-up) after a sentence: the quiz "I'll wait" pause
EXTRA={('toolkit',1):3.4*1.15,('title',0):0.6}
for si,(sid,sents) in enumerate(SCENES):
    sc={'id':sid,'start':t,'sents':[]}
    for k,s in enumerate(sents):
        fn=f'wav/{si:02d}_{k:02d}.wav'
        with wave.open(fn,'wb') as w:
            v.synthesize_wav(s,w,syn_config=SynthesisConfig(length_scale=0.9))
        with wave.open(fn) as w: a=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768
        idx=np.where(np.abs(a)>0.01)[0]; a=a[idx[0]:idx[-1]+1]   # trim silence at the ends
        d=len(a)/SR
        sc['sents'].append({'start':t,'end':t+d,'text':s})
        ex=EXTRA.get((sid,k),0)
        out.append(a);out.append(np.zeros(int(SR*(GAP+ex))));t+=d+GAP+ex
    t+=SGAP-GAP;out.append(np.zeros(int(SR*(SGAP-GAP))))
    sc['end']=t;cues.append(sc)
a=np.concatenate(out)
TEMPO=1.15
import scipy.io.wavfile as wf
wf.write('narration_pre.wav',SR,(a*32767).astype(np.int16))
subprocess.run(['ffmpeg','-y','-loglevel','error','-i','narration_pre.wav','-af','atempo=1.15','narration_raw.wav'],check=True)
for c in cues:
    c['start']/=TEMPO;c['end']/=TEMPO
    for q in c['sents']: q['start']/=TEMPO;q['end']/=TEMPO
t/=TEMPO
json.dump({'duration':t,'scenes':cues},open('cues.json','w'),indent=1)
print('total',t)
for c in cues: print(c['id'],round(c['start'],1),round(c['end']-c['start'],1))
