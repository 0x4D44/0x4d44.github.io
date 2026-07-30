(function(){
  const canvas=document.getElementById('demoChart');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const w=canvas.width,h=canvas.height,p=34;
  const series=[-77,-72,-69,-64,-58,-52,-47,-44,-46,-51,-57,-61,-67,-70,-68,-62,-55,-49,-43,-41,-45,-52,-60,-66];
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(184,244,203,.2)';ctx.lineWidth=1;
  for(let i=0;i<7;i++){const y=p+i*(h-p*2)/6;ctx.beginPath();ctx.moveTo(p,y);ctx.lineTo(w-p,y);ctx.stroke();}
  for(let i=0;i<9;i++){const x=p+i*(w-p*2)/8;ctx.beginPath();ctx.moveTo(x,p);ctx.lineTo(x,h-p);ctx.stroke();}
  ctx.strokeStyle='rgba(184,244,203,.92)';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();
  series.forEach((v,i)=>{const x=p+i*(w-p*2)/(series.length-1);const y=h-p-((v+95)/65)*(h-p*2);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  ctx.fillStyle='rgba(184,244,203,.95)';
  series.forEach((v,i)=>{const x=p+i*(w-p*2)/(series.length-1);const y=h-p-((v+95)/65)*(h-p*2);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle='rgba(234,244,223,.85)';ctx.font='16px JetBrains Mono, monospace';ctx.fillText('FieldNotebook RSSI over path',p,24);ctx.font='12px JetBrains Mono, monospace';ctx.fillText('-40 dBm',w-p-60,p+6);ctx.fillText('-95 dBm',w-p-60,h-p);
})();
