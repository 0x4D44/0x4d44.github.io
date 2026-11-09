// Capture-owned detached process groups. A killed harness must not leave GPU workers behind.
import {rm} from 'node:fs/promises';

export function createCaptureLifetime({timeoutMs=720000,graceMs=1000,processImpl=process,
  kill=(pid,signal)=>process.kill(pid,signal),setTimer=setTimeout,clearTimer=clearTimeout,onStop=()=>{}}={}) {
  let child,stopped=null,force;
  const signalGroup=signal=>{if(child?.pid)try{kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}};
  const stop=reason=>{
    if(stopped)return;
    stopped=reason;processImpl.exitCode=reason==='deadline'?124:reason==='SIGINT'?130:143;
    signalGroup('SIGTERM');
    force=setTimer(()=>signalGroup('SIGKILL'),graceMs);
    onStop(reason);
  };
  const term=()=>stop('SIGTERM'),interrupt=()=>stop('SIGINT');
  processImpl.on('SIGTERM',term);processImpl.on('SIGINT',interrupt);
  const deadline=setTimer(()=>stop('deadline'),timeoutMs);
  return {
    attach(value){child=value;if(stopped)signalGroup('SIGKILL');},
    reason:()=>stopped,
    check(){if(stopped)throw new Error(`capture stopped: ${stopped}`);},
    dispose(){clearTimer(deadline);if(force)clearTimer(force);processImpl.removeListener('SIGTERM',term);processImpl.removeListener('SIGINT',interrupt);},
  };
}

/** Wait for the browser AND its whole detached group before removing the profile. */
export async function cleanupCaptureBrowser(child,profile,{kill=(pid,signal)=>process.kill(pid,signal),remove=rm,
  now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=2000,warn=console.warn}={}) {
  const warnings=[];const note=s=>{warnings.push(s);warn(s);};
  const alive=()=>{if(!child?.pid)return false;try{kill(-child.pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
  let exited=false;
  try {
    for(const signal of ['SIGTERM','SIGKILL']) {
      if(child?.pid)try{kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}
      const end=now()+timeoutMs;
      do {
        const parentExited=!child||child.pid===undefined||child.exitCode!==null&&child.exitCode!==undefined||child.signalCode!==null&&child.signalCode!==undefined;
        if(parentExited&&!alive()){exited=true;break;}
        await sleep(25);
      }while(now()<end);
      if(exited)break;
    }
    if(!exited)note(`Chrome process group did not exit; profile retained at ${profile}`);
    else if(profile)try{await remove(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
    catch(error){note(`Profile cleanup failed (${error.code??error.message}); retained at ${profile}`);}
  }catch(error){note(`Browser group cleanup failed (${error.code??error.message}); profile retained at ${profile}`);}
  return {exited,profileRetained:profile&&(!exited||warnings.length)?profile:null,warnings};
}
