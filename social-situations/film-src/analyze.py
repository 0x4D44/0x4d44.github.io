import json, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.io import wavfile
from scipy.signal import spectrogram
ev=json.load(open('events.json'))
fig,ax=plt.subplots(3,1,figsize=(20,11),sharex=True)
for k,(f,name) in enumerate([('music.wav','music stem'),('sfx.wav','sfx stem'),('mix.wav','final mix')]):
    sr,x=wavfile.read(f); x=x.mean(1)/32768
    if k<2:
        fr,t,S=spectrogram(x,sr,nperseg=4096,noverlap=3072)
        ax[k].pcolormesh(t,fr,10*np.log10(S+1e-12),shading='auto',vmin=-120,vmax=-40,cmap='magma'); ax[k].set_yscale('symlog',linthresh=200); ax[k].set_ylim(40,16000)
    else:
        w=int(sr*0.05); r=np.sqrt(np.convolve(x**2,np.ones(w)/w,'same')); tt=np.arange(len(x))/sr
        ax[k].plot(tt[::200],20*np.log10(r[::200]+1e-6)); ax[k].set_ylim(-60,0); ax[k].set_ylabel('RMS dBFS')
    ax[k].set_title(name)
    for s in ev['scenes']:
        ax[k].axvline(s['start'],color='cyan'); ax[k].text(s['start']+0.2,ax[k].get_ylim()[1]*0.8 if k<2 else -5,s['name'],color='cyan' if k<2 else 'b')
for e in ev['events']:
    ax[1].plot(e['t'],60,'w|',ms=10)
plt.tight_layout(); plt.savefig('audio_analysis.png',dpi=70)
