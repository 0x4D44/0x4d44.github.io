# Audio mix for the Conformers video: narration + original synthesised music + Portal-flavoured SFX,
# all generated with numpy/scipy (no samples).  Event times come from cues.json so sound and picture
# share one clock.  Needs narration_raw.wav + cues.json from tts.py, and the Piper lessac voice
# (pitched up) for the turret's two lines.      python3 audio.py   ->  audio.wav
import numpy as np, json, subprocess, wave
from scipy import signal
import scipy.io.wavfile as wf
SR=44100
cues=json.load(open('cues.json'));DUR=cues['duration']+3.0
N=int(DUR*SR)
rng=np.random.default_rng(7)
sc={c['id']:c for c in cues['scenes']}
def tm(scene,sent,off=0.0):
    c=sc[scene];
    return c['sents'][sent]['start']+off
def tscene(scene,off=0.0): return sc[scene]['start']+off
t_=lambda d:np.arange(int(d*SR))/SR
def env_exp(d,tau,att=0.003):
    t=t_(d);e=np.exp(-t/tau);a=np.minimum(1,t/att);return e*a
def lp(x,fc,order=2): b,a=signal.butter(order,fc/(SR/2),'low');return signal.lfilter(b,a,x)
def hp(x,fc,order=2): b,a=signal.butter(order,fc/(SR/2),'high');return signal.lfilter(b,a,x)
def bp(x,f1,f2,order=2): b,a=signal.butter(order,[f1/(SR/2),f2/(SR/2)],'band');return signal.lfilter(b,a,x)
def place(buf,start,sig,gain=1.0,pan=0.0):
    i=int(start*SR)
    if i<0 or i>=len(buf[0]):return
    sig=sig[:len(buf[0])-i]
    l=gain*np.cos((pan+1)*np.pi/4);r=gain*np.sin((pan+1)*np.pi/4)
    buf[0][i:i+len(sig)]+=sig*l;buf[1][i:i+len(sig)]+=sig*r
# ---------- synths ----------
def sine(f,d): return np.sin(2*np.pi*f*t_(d))
def bell(f,d=2.0,tau=0.5):
    t=t_(d);s=np.zeros_like(t)
    for k,(r,a) in enumerate([(1,1),(2.01,.45),(3.97,.22),(5.4,.1)]):s+=a*np.sin(2*np.pi*f*r*t)*np.exp(-t/(tau/(1+.8*k)))
    return s*np.minimum(1,t/0.004)
def marimba(f,d=1.2):
    t=t_(d);return (np.sin(2*np.pi*f*t)*np.exp(-t/.35)+.35*np.sin(2*np.pi*f*4*t)*np.exp(-t/.08))*np.minimum(1,t/.003)
def pluck(f,d=1.5,damp=0.996):
    n=int(SR/f);buf=rng.uniform(-1,1,n);out=np.zeros(int(d*SR))
    for i in range(len(out)):
        out[i]=buf[i%n];buf[i%n]=damp*0.5*(buf[i%n]+buf[(i+1)%n])
    return out
def pad(f,d,att=1.2,rel=1.5):
    t=t_(d);s=np.zeros_like(t)
    for det in(-0.003,0,0.004):s+=np.sin(2*np.pi*f*(1+det)*t)+.3*np.sin(2*np.pi*2*f*(1+det)*t)
    e=np.minimum(1,t/att)*np.minimum(1,(d-t)/rel);return s*e/4
def noise(d): return rng.uniform(-1,1,int(d*SR))
def whoosh(d=0.8,f0=300,f1=3500,up=True):
    x=noise(d);n=len(x);out=np.zeros(n);blk=512
    for i in range(0,n,blk):
        u=i/n;fc=f0*(f1/f0)**(u if up else 1-u)
        b,a=signal.butter(2,[max(60,fc*0.6)/(SR/2),min(0.95,fc*1.5/(SR/2))],'band');out[i:i+blk]=signal.lfilter(b,a,x[i:i+blk])
    e=np.sin(np.pi*np.arange(n)/n)**1.5;return out*e*3
def blip(f=900,d=.12): t=t_(d);return np.sin(2*np.pi*f*t*(1+.3*np.exp(-t/.02)))*np.exp(-t/.04)
def pop(f=420,d=.14): t=t_(d);return np.sin(2*np.pi*f*t*(1-.5*t/d))*np.exp(-t/.03)
def thud(d=.35): t=t_(d);return np.sin(2*np.pi*(55+60*np.exp(-t/.05))*t)*np.exp(-t/.12)
def click(d=.03): return hp(noise(d),2500)*np.exp(-t_(d)/.006)*2
def tick(d=.05,f=1800): t=t_(d);return np.sin(2*np.pi*f*t)*np.exp(-t/.008)+hp(noise(d),3000)*np.exp(-t/.004)*.6
def ding(f=1318,d=1.4): return bell(f,d,.7)
def pa_chime():   # two-tone Aperture-style announcement chime
    a=bell(880,1.6,.8);b=bell(659.3,2.0,1.0);o=np.zeros(int(3.0*SR));o[:len(a)]+=a;o[int(.55*SR):int(.55*SR)+len(b)]+=b;return o*.8
def portal_open(d=1.4):
    t=t_(d);base=np.sin(2*np.pi*(90+40*t/d)*t)+.5*np.sin(2*np.pi*(135+50*t/d)*t)
    sw=whoosh(d,200,2200,True)*.6;shim=np.sin(2*np.pi*(600+1200*(t/d)**2)*t)*(t/d)*.18
    e=np.minimum(1,t/.08)*np.minimum(1,(d-t)/.5);return (base*.5+sw+shim)*e
def servo(d=.8,f0=140,f1=420):
    t=t_(d);ph=2*np.pi*np.cumsum(np.linspace(f0,f1,len(t)))/SR;s=signal.sawtooth(ph)*.5+np.sin(ph*2)*.2
    return lp(s,2500)*np.minimum(1,t/.04)*np.minimum(1,(d-t)/.08)*.5
def zap(d=.25):
    t=t_(d);return bp(noise(d),600,6000)*(1+np.sign(np.sin(2*np.pi*90*t)))*np.exp(-t/.09)*.8
def buzzer(d=.45): t=t_(d);return (signal.square(2*np.pi*155*t)*.5+signal.square(2*np.pi*163*t)*.4)*np.minimum(1,(d-t)/.05)*.45
def ping_turret():  # the turret "target acquired" double ping
    o=np.zeros(int(.5*SR));
    for k,f in enumerate([1568,2093]):
        s=np.sin(2*np.pi*f*t_(.14))*np.exp(-t_(.14)/.05);i=int(k*.16*SR);o[i:i+len(s)]+=s
    return o*.7
def twang(f=110,d=1.0): return pluck(f,d,.9985)
def crackle(d=3.0,dens=40):
    x=np.zeros(int(d*SR));
    for _ in range(int(d*dens)):
        i=rng.integers(0,len(x)-400);x[i:i+300]+=hp(noise(300/SR),1500)*np.exp(-np.arange(300)/60)*rng.uniform(.2,1)
    return x*.7+lp(noise(d),900)*.08
def sparkle(d=1.2):
    o=np.zeros(int(d*SR))
    for k in range(10):
        f=rng.choice([1568,1976,2349,2637,3136]);s=bell(f,.5,.25)*.35;i=int(k*.07*SR);o[i:i+len(s)]+=s[:len(o)-i]
    return o
def mixs(*a):
    n=max(len(x) for x in a);o=np.zeros(n)
    for x in a:o[:len(x)]+=x
    return o
def lockclick(): return mixs(thud(.12)*.6,click(.03)*.8)
def chime_ok(): return mixs(bell(1046.5,1.2,.6)*.6,bell(1568,1.2,.6)*.4)
def clocktick(): return tick(.05,2200)*.6
# ---------- SFX placement ----------
sfx=np.zeros((2,N));VOICE=np.zeros((2,N))
def S(start,fn,g=.5,pan=0.0): place(sfx,start,fn,g,pan)
S(0.0,pa_chime(),.5)
S(0.35,portal_open(1.4),.45,-.6);S(0.75,portal_open(1.4),.45,.6)
for c in cues['scenes'][1:]: S(c['start']-0.02,whoosh(.7,250,3200,True),.35)
# scene 1
S(tm('axles',0,1.6),pop(500),.35);S(tm('axles',1,.9),pop(380),.35);S(tm('axles',2,-.1),pop(420),.35)
S(tm('axles',2,3.2),servo(4.0,120,360),.22);S(tm('axles',2,7.2),buzzer(.3),.18);
S(tm('axles',3,0),whoosh(.5,300,2000),.3);S(tm('axles',3,1.0),thud(.5),.55);S(tm('axles',3,3.5),blip(900),.3);S(tm('axles',3,5.0),lockclick(),.6)
# scene 2
S(tm('conf',0,0),pop(450),.35);S(tm('conf',1,0),pop(520),.35)
for i in range(4): S(tm('conf',0,.6+1.3*i+.4),tick(),.25)
for i in range(4): S(tm('conf',1,.4+1.3*i+.4),tick(),.25)
S(tm('conf',1,5.2),bell(1500,.6,.15),.3,.5);S(tm('conf',1,5.8),bell(1700,.6,.15),.3,.6)
S(tm('conf',2,0),whoosh(.5,300,2200),.25)
for i in range(3): S(tm('conf',2,4+1.2*i),ding(1046.5*(1+i*.12),1.0),.28)
# scene 3
S(tm('strain',1,.3),pop(400),.4);S(tm('strain',1,2.9),pop(440),.4);S(tm('strain',1,5.5),pop(480),.4)
S(tm('strain',1,1.0),zap(.3),.25,-.5);S(tm('strain',1,3.7),thud(.3),.4);S(tm('strain',1,6.3),twang(180,.9),.4,.5)
S(tm('strain',2,0),whoosh(.6,250,2500),.25);S(tm('strain',2,3.0),servo(1.0,200,150),.18);S(tm('strain',2,5.2),chime_ok(),.4)
# scene 4
S(tm('newman',0,1.0),servo(5.5,100,260),.18)
for i,o in enumerate([2,5,5.5]): S(tm('newman',1,o),pop(500+i*60),.25)
S(tm('newman',1,2),blip(1200),.3)
S(tm('newman',2,.2),pop(300),.3)
S(tm('newman',2,3.5),servo(.7,90,320),.4,.6);S(tm('newman',2,4.2),ping_turret(),.45,.6)
# scene 5
S(tm('butane',0,.8),blip(880),.3);S(tm('butane',1,.6),blip(740),.3);S(tm('butane',2,.6),blip(520),.3);S(tm('butane',2,2.2),blip(480),.3)
S(tm('butane',2,8.5),chime_ok(),.35)
# scene 6
S(tm('small',0,.2),whoosh(.5,300,1500),.2)
for i in range(30): S(tm('small',0,.2)+i*.11,tick(.04,1200+rng.integers(0,1400)),.15,rng.uniform(-.7,.7))
S(tm('small',0,2.0),blip(660),.3)
for i in range(5): S(tm('small',1,3.5+i*.8),pop(300+i*40),.4)
for i,o in enumerate([.6,2.2,3.9,6.0]): S(tm('small',2,o),blip(700+i*150),.35)
S(tm('small',2,8.0),thud(.5),.55)
# scene 7 (ring strain; scene id 'baeyer')
for i in range(6): S(tm('baeyer',0,.6+.45*i),pop(380+i*35),.3)
S(tm('baeyer',0,5.0),twang(120,1.2),.55);S(tm('baeyer',1,0.0),crackle(7.0,45),.5)
for i in range(6): S(tm('baeyer',2,.4+i*.85),thud(.3),.4)
S(tm('baeyer',2,7.5),chime_ok(),.4);S(tm('baeyer',3,1.5),servo(4,160,300),.15);S(tm('baeyer',3,6.5),pop(520),.35)
# scene draw
for i in range(4): S(tm('draw',0,1.0+i*1.1),pop(400+i*40),.3)
for k in range(1,5): S(tm('draw',k,.3),blip(700+k*90),.3);S(tm('draw',k,.3),sparkle(.8),.12)
# scene chair
S(tm('chair',0,.0),sparkle(),.2);S(tm('chair',0,4.0),blip(1000),.3);S(tm('chair',1,1.0),pop(450),.35);S(tm('chair',1,5.0),pop(520),.35)
S(tm('chair',2,1.5),pop(430),.35);S(tm('chair',2,5.0),pop(500),.35);S(tm('chair',3,1.0),click(.03),.5);S(tm('chair',3,2.5),pop(430),.35);S(tm('chair',3,6.0),pop(500),.35)
S(tm('chair',4,1.0),servo(8.0,110,290),.2)
for i,o in enumerate([3.0,4.6,6.2]): S(tm('chair',4,o),blip(600+i*120),.3)
S(tm('chair',5,.5),pop(430),.35);S(tm('chair',5,3.0),pop(500),.35)
# scene 9
S(tm('subst',1,3.5),buzzer(.3),.2);S(tm('subst',1,3.5),thud(.5),.5);S(tm('subst',2,4.5),servo(3,130,300),.18);S(tm('subst',2,7.5),chime_ok(),.35)
for i in range(4): S(tm('subst',3,.6+i*1.0),thud(.35),.45)
S(tm('subst',3,5.0),blip(700),.3);S(tm('subst',3,9.0),lockclick(),.7)
# scene 10
for i in range(6): S(tm('toolkit',0,.4+.5*i),pop(400+i*30),.35)
S(tm('toolkit',0,4.0),sparkle(),.25)
S(tm('toolkit',1,0),pa_chime(),.35)
for i in range(3): S(tm('toolkit',1,1.2+.9*i),pop(520),.25)
# ticking during the pause
t0=tm('toolkit',1,5.0);t1=tm('toolkit',2,-0.5)
k=0;tt=t0
while tt<t1: S(tt,clocktick(),.35,-0.3 if k%2 else .3);tt+=.5;k+=1
S(tm('toolkit',2,-1.5),buzzer(.4),.4);S(tm('toolkit',2,-0.45),click(.03),.6)   # the DEADLOCK RESOLUTION button
S(tm('toolkit',2,2.6),chime_ok(),.5)
S(tm('toolkit',3,0),pa_chime(),.35);S(tm('toolkit',3,.1),sparkle(1.5),.35)
# scene 11
for i in range(6): S(tm('outro',0,.5+.5*i),pop(380+i*35),.3)
S(tm('outro',0,0.3),portal_open(1.2),.3,-.6);S(tm('outro',0,.5),portal_open(1.2),.3,.6)
for i in range(26): S(tm('outro',1,1.2+i*.185),click(.03),.35)
S(tm('outro',1,7.0),chime_ok(),.35)
S(tm('outro',2,0.0),sparkle(1.6),.35);S(tm('outro',2,2.0),servo(.7,90,320),.35,.6);S(tm('outro',2,2.8),ping_turret(),.4,.6)
# ---------- turret voice (lessac pitched up) ----------
def turret_voice(text,fn):
    from piper import PiperVoice
    v=PiperVoice.load('en_US-lessac-medium.onnx')
    with wave.open(fn,'wb') as w: v.synthesize_wav(text,w)
    sr,a=wf.read(fn);a=a.astype(np.float32)/32768
    idx=np.where(np.abs(a)>.01)[0];a=a[idx[0]:idx[-1]+1]
    n=int(len(a)/1.42);a=signal.resample(a,n)  # pitch & speed up
    a=bp(np.interp(np.linspace(0,len(a)-1,int(len(a)*SR/sr/1)),np.arange(len(a)),a) if False else signal.resample(a,int(len(a)*SR/sr)),300,5200)
    return a/np.max(np.abs(a))*.8
tv1=turret_voice("Are you still there?",'tv1.wav');tv2=turret_voice("Goodbye.",'tv2.wav')
S(tm('newman',2,4.3),tv1,.9,.6);S(tm('outro',2,3.1),tv2,.9,.6)
# ---------- narration ----------
sr,nv=wf.read('narration_raw.wav');nv=nv.astype(np.float32)/32768
if sr!=SR: nv=signal.resample(nv,int(len(nv)*SR/sr))
nv=nv/np.max(np.abs(nv))*.9
VOICE[0][:len(nv)]=nv;VOICE[1][:len(nv)]=nv
# ---------- music ----------
# Original piece: Dm9 - Bb - F - C, 92 bpm, pad + arpeggiated bells + marimba melody + bass + shaker.
# Per-section instrumentation, key (semitone transposition) and gain vary with the chapters;
# a quiet bridge under the quiz, a bell fanfare on the cake, a quiet outro.
BPM=92;beat=60/BPM
NOTE={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def mf(n):
    nm,o=n[:-1],int(n[-1]);s=NOTE[nm[0]]+(1 if '#' in nm else 0)-(1 if 'b' in nm else 0);return 440*2**((s+12*(o+1)-69)/12)
chords=[('D3',['D3','F3','A3','C4','E4']),('Bb2',['Bb2','D3','F3','A3','C4']),('F2',['F3','A3','C4','E4','G4']),('C3',['C3','G3','D4','E4','G4'])]
melody={0:[(0,'D5',1),(1,'F5',.5),(1.5,'A5',.5),(2,'D6',1.5)],1:[(0,'C6',1),(1,'A5',1),(2,'F5',2)],2:[(0,'D5',1),(1,'F5',1),(2,'Bb5',1.5),(3.5,'A5',.5)],3:[(0,'F5',2),(2,'D5',2)],
        4:[(0,'A5',1),(1,'C6',1),(2,'F6',1.5),(3.5,'E6',.5)],5:[(0,'C6',1),(1,'A5',1),(2,'F5',2)],6:[(0,'E5',1),(1,'G5',1),(2,'C6',1),(3,'G5',1)],7:[(0,'D6',1),(1,'C6',1),(2,'G5',2)]}
mus=np.zeros((2,N))
# sections: (start, end, pad, arp, melody, bass, perc, transpose semitones, gain)
TS=lambda n,k=None:(tm(n,k) if k is not None else tscene(n))
sections=[(0,TS('axles'),1,1,0,0,0,0,.5),(TS('axles'),TS('strain'),1,1,1,0,0,0,.8),(TS('strain'),TS('draw'),1,1,1,1,1,0,1.0),
 (TS('draw'),TS('baeyer'),1,1,1,1,1,2,1.15),(TS('baeyer'),TS('chair'),1,1,1,1,1,0,1.1),(TS('chair'),TS('toolkit'),1,1,1,1,1,2,1.2),
 (TS('toolkit'),TS('toolkit',3),1,0,0,0,0,0,.35),(TS('toolkit',3),TS('outro'),1,1,1,1,1,5,1.5),(TS('outro'),DUR,1,1,1,0,0,0,.55)]
def lvl(t):
    for s in sections:
        if s[0]<=t<s[1]:return s[2:]
    return (1,0,0,0,0,0,.8)
bars=int(DUR/(4*beat))+1
for b in range(bars):
    t0=b*4*beat;ci=(b//2)%4;root,cn=chords[ci];p,ar,me,ba,pe,tr,gn=lvl(t0);TRF=2**(tr/12)
    if p and b%2==0:
        for n in cn: place(mus,t0,pad(mf(n)*TRF,8*beat+1.5),.10*gn,rng.uniform(-.4,.4))
    if ar:
        pat=[0,2,1,3,4,3,1,2]
        for k in range(8):
            f=mf(cn[pat[k]%len(cn)])*(2 if pat[k]<2 else 1)
            place(mus,t0+k*beat/2,bell((f*2 if f<400 else f)*TRF,1.0,.35)*.55,.06*gn,(k%2)*.6-.3)
    if me:
        for (off,n,d) in melody[b%8]:
            place(mus,t0+off*beat,marimba(mf(n)*TRF,1.4),.16*gn,.2)
            if b%16>=8: place(mus,t0+off*beat+beat*.75,marimba(mf(n)*TRF),.05*gn,-.2)
    if ba:
        for k in range(2): place(mus,t0+k*2*beat,np.sin(2*np.pi*mf(root)*TRF*t_(1.6*beat))*np.exp(-t_(1.6*beat)/.5)*.9,.18*gn,0)
    if pe:
        for k in range(8):
            place(mus,t0+k*beat/2,hp(noise(.06),5000)*np.exp(-t_(.06)/.012)*(1.0 if k%2 else .5),.05,.3 if k%2 else -.3)
        for k in (0,2): place(mus,t0+k*beat,thud(.25),.14,0)
# cake fanfare
for k,n in enumerate(['D5','F5','A5','D6','F6','A6']): place(mus,tm('toolkit',3,.05)+k*.12,bell(mf(n),1.6,.7)*.8,.14,(k%3-1)*.4)
place(mus,tm('toolkit',3,.05),thud(.5),.35)
# final cadence: Dm chord ring
place(mus,DUR-7.2,pad(mf('D3'),6,.5,3),.12);place(mus,DUR-7.2,pad(mf('A3'),6,.5,3),.1);place(mus,DUR-7.2,pad(mf('F4'),6,.5,3),.08)
# fade music in/out
fade=np.minimum(1,np.arange(N)/(SR*2))*np.minimum(1,(N-np.arange(N))/(SR*4))
mus*=fade
# sidechain duck by narration, plus a 1-4 kHz dip so the voice sits on top
env=lp(np.abs(VOICE[0]),6,2);env=np.clip(env*6,0,1)
duck=1-0.55*env
mus*=duck
mus=mus-0.45*np.stack([bp(mus[0],1000,4200),bp(mus[1],1000,4200)])*(1-0.0)
# light echo "verb" on music
def verb(x):
    out=x.copy()
    for d,g in((.09,.35),(.19,.25),(.31,.15)):
        k=int(d*SR);out[:,k:]+=g*x[:,:-k]
    return out
mus=verb(mus)
# GLaDOS-ish treat on narration: slight echo
v=VOICE.copy();k=int(.018*SR);v[:,k:]+=.18*VOICE[:,:-k]
mix=v*1.0+mus*0.95+sfx*0.9
peak=np.max(np.abs(mix));mix=mix/peak*0.89
wf.write('audio.wav',SR,(mix.T*32767).astype(np.int16))
print('audio dur',N/SR,'peak',peak, 'voice rms',np.sqrt(np.mean(v**2)),'music rms',np.sqrt(np.mean(mus**2)),'sfx rms',np.sqrt(np.mean(sfx**2)))
