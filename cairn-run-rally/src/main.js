import { CairnRunGame } from './game.js';
try {
  const game=new CairnRunGame();
  const params=new URLSearchParams(window.location.search);
  if(params.has('qa')||params.has('smoke'))window.__game=game;
}
catch (error) {
  console.error(error);
  const target=document.getElementById('fatal-error');
  target.textContent=`CAIRN RUN COULD NOT START\n\n${error?.stack||error}`;
  target.classList.remove('hidden');
  const qa=document.getElementById('qa-status');if(qa)qa.textContent=JSON.stringify({booted:false,errors:[String(error?.stack||error)]});
}
