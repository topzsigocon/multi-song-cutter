(() => {
'use strict';
const $ = id => document.getElementById(id);
const fileInput=$('audioFile'), player=$('player'), canvas=$('wave'), ctx=canvas.getContext('2d');
let audioBuffer=null, objectUrl=null, cuts=[], audioName='audio', busy=false;
const setStatus = s => $('status').textContent=s;
const fmt = n => {n=Math.max(0,Number(n)||0);const m=Math.floor(n/60),s=Math.floor(n%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`};
const dur = () => audioBuffer ? audioBuffer.duration : 0;
function enabled(on){['playBtn','silenceBtn','smartBtn','addBtn','exportBtn'].forEach(id=>$(id).disabled=!on)}
enabled(false);
fileInput.addEventListener('change', async e=>{
 const file=e.target.files?.[0]; if(!file)return;
 setStatus('Loading and decoding audio…'); enabled(false);
 try{
  const array=await file.arrayBuffer();
  const AC=window.AudioContext||window.webkitAudioContext;
  const ac=new AC();
  audioBuffer=await ac.decodeAudioData(array.slice(0));
  await ac.close();
  audioName=file.name.replace(/\.[^.]+$/,'')||'audio';
  if(objectUrl)URL.revokeObjectURL(objectUrl);
  objectUrl=URL.createObjectURL(file);player.src=objectUrl;player.hidden=false;
  $('fileName').textContent=`${file.name} · ${fmt(audioBuffer.duration)} · ${audioBuffer.numberOfChannels} channel(s)`;
  cuts=[{name:'Song 01',start:0,end:audioBuffer.duration}];
  drawWave();renderCuts();enabled(true);
  setStatus('Audio ready. Choose a detection mode or edit the cut manually.');
 }catch(err){audioBuffer=null;enabled(false);setStatus('Could not decode this audio file. Try a standard MP3 or WAV file. Details: '+err.message)}
});
$('playBtn').onclick=()=>player.paused?player.play():player.pause();
canvas.addEventListener('click',e=>{if(!audioBuffer)return;const r=canvas.getBoundingClientRect();player.currentTime=Math.max(0,Math.min(dur(),(e.clientX-r.left)/r.width*dur()));});
function drawWave(){
 const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0d121c';ctx.fillRect(0,0,w,h);
 if(!audioBuffer)return;
 const data=audioBuffer.getChannelData(0), step=Math.max(1,Math.floor(data.length/w)), mid=h/2;
 ctx.strokeStyle='#77e0c0';ctx.lineWidth=1;
 ctx.beginPath();
 for(let x=0;x<w;x++){let min=1,max=-1;for(let j=x*step;j<Math.min(data.length,(x+1)*step);j+=1){const v=data[j];if(v<min)min=v;if(v>max)max=v;}ctx.moveTo(x,mid+min*mid*.9);ctx.lineTo(x,mid+max*mid*.9);}
 ctx.stroke();
 cuts.forEach(c=>{ctx.strokeStyle='#ffbd69';[c.start,c.end].forEach(t=>{const x=t/dur()*w;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()})});
}
function rmsDb(data,start,end){let sum=0,n=0;for(let i=start;i<end;i+=1){sum+=data[i]*data[i];n++}return n?10*Math.log10(sum/n+1e-12):-120}
function findSilence(){
 const data=audioBuffer.getChannelData(0), sr=audioBuffer.sampleRate;
 const frame=Math.max(1,Math.floor(sr*.1)), threshold=Number($('threshold').value)||-38;
 const minSil=Math.max(.2,Number($('minSilence').value)||.8), minSong=Math.max(5,Number($('minSong').value)||45);
 let spans=[], quietStart=-1;
 for(let i=0;i<data.length;i+=frame){
  const db=rmsDb(data,i,Math.min(data.length,i+frame));
  if(db<threshold){if(quietStart<0)quietStart=i/sr;}
  else if(quietStart>=0){const end=i/sr;if(end-quietStart>=minSil)spans.push({start:quietStart,end});quietStart=-1;}
 }
 if(quietStart>=0&&dur()-quietStart>=minSil)spans.push({start:quietStart,end:dur()});
 const boundaries=[0];
 spans.forEach(s=>{const point=(s.start+s.end)/2;if(point-boundaries[boundaries.length-1]>=minSong && dur()-point>=minSong)boundaries.push(point)});
 if(dur()-boundaries[boundaries.length-1]>1)boundaries.push(dur());
 return boundariesToCuts(boundaries);
}
function smartBoundaries(){
 const data=audioBuffer.getChannelData(0), sr=audioBuffer.sampleRate;
 const frame=Math.max(1,Math.floor(sr*.25)), features=[];
 let prev=0;
 for(let i=0;i<data.length;i+=frame){
  const end=Math.min(data.length,i+frame);let sum=0,cross=0,last=data[i]||0,n=0;
  for(let j=i;j<end;j++){const v=data[j];sum+=v*v;if((v>=0&&last<0)||(v<0&&last>=0))cross++;last=v;n++}
  const rms=Math.sqrt(sum/Math.max(1,n));
  const zcr=cross/Math.max(1,n);
  features.push({t:i/sr,rms,zcr});
 }
 const sensitivity=$('sensitivity').value;
 const minSong=Math.max(10,Number($('minSong').value)||45);
 const minGap=sensitivity==='high'?Math.max(15,minSong*.5):sensitivity==='low'?Math.max(60,minSong):Math.max(30,minSong*.75);
 const candidates=[];
 for(let i=2;i<features.length-2;i++){
  const a=features[i-2],b=features[i-1],c=features[i],d=features[i+1],e=features[i+2];
  const before=(a.rms+b.rms)/2,after=(d.rms+e.rms)/2;
  const loudChange=Math.abs(Math.log((after+1e-5)/(before+1e-5)));
  const zBefore=(a.zcr+b.zcr)/2,zAfter=(d.zcr+e.zcr)/2;
  const zChange=Math.abs(zAfter-zBefore);
  const score=loudChange+zChange*5;
  const cutoff=sensitivity==='high'?.42:sensitivity==='low'?.9:.62;
  if(score>cutoff && c.t>=minSong && dur()-c.t>=minSong){
   if(!candidates.length||c.t-candidates[candidates.length-1].t>=minGap)candidates.push({t:c.t,score});
   else if(score>candidates[candidates.length-1].score)candidates[candidates.length-1]={t:c.t,score};
  }
 }
 const boundaries=[0,...candidates.map(x=>x.t),dur()].sort((a,b)=>a-b);
 return boundariesToCuts(boundaries);
}
function boundariesToCuts(b){
 const clean=[0];
 b.slice(1,-1).forEach(t=>{if(t-clean[clean.length-1]>1 && dur()-t>1)clean.push(t)});
 clean.push(dur());
 return clean.slice(0,-1).map((s,i)=>({name:`Song ${String(i+1).padStart(2,'0')}`,start:s,end:clean[i+1]}));
}
$('silenceBtn').onclick=()=>{if(!audioBuffer)return;cuts=findSilence();renderCuts();drawWave();setStatus(`Silence detection suggested ${cuts.length} clip(s). Review the boundaries before exporting.`)};
$('smartBtn').onclick=()=>{if(!audioBuffer)return;cuts=smartBoundaries();renderCuts();drawWave();setStatus(`Smart detection suggested ${cuts.length} clip(s). These are rough suggestions—review and adjust them.`)};
$('addBtn').onclick=()=>{if(!audioBuffer)return;const start=cuts.length?cuts[cuts.length-1].end:0;cuts.push({name:`Song ${String(cuts.length+1).padStart(2,'0')}`,start:Math.min(start,dur()),end:dur()});renderCuts();drawWave()};
function renderCuts(){
 const box=$('cuts');box.innerHTML='';
 cuts.forEach((c,i)=>{
  const row=document.createElement('div');row.className='cutrow';
  row.innerHTML=`<input class="name" type="text" aria-label="Clip name" value="${c.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" data-i="${i}" data-k="name"><div><label class="small muted">Start (sec)</label><input type="number" min="0" step=".01" value="${c.start.toFixed(2)}" data-i="${i}" data-k="start"></div><div><label class="small muted">End (sec)</label><input type="number" min="0" step=".01" value="${c.end.toFixed(2)}" data-i="${i}" data-k="end"></div><button class="danger" data-remove="${i}">Remove</button>`;
  box.appendChild(row);
 });
 box.querySelectorAll('input').forEach(inp=>inp.addEventListener('change',()=>{
  const i=Number(inp.dataset.i),k=inp.dataset.k;
  if(k==='name')cuts[i].name=inp.value||`Song ${i+1}`;
  else cuts[i][k]=Math.max(0,Math.min(dur(),Number(inp.value)||0));
  if(cuts[i].end<cuts[i].start)cuts[i].end=cuts[i].start;
  drawWave();
 }));
 box.querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=()=>{cuts.splice(Number(btn.dataset.remove),1);renderCuts();drawWave()});
}
function floatToInt16(floatData){
 const out=new Int16Array(floatData.length);
 for(let i=0;i<floatData.length;i++){const s=Math.max(-1,Math.min(1,floatData[i]));out[i]=s<0?s*32768:s*32767}
 return out;
}
function resampleChannels(buffer,start,end,targetRate=44100,stereo=true){
 const sr=buffer.sampleRate, channels=stereo?Math.min(2,buffer.numberOfChannels):1;
 const startI=Math.max(0,Math.floor(start*sr)),endI=Math.min(buffer.length,Math.floor(end*sr));
 const length=Math.max(0,endI-startI), ratio=sr/targetRate;
 const source=[];
 if(stereo && buffer.numberOfChannels>=2){
  source.push(buffer.getChannelData(0).slice(startI,endI),buffer.getChannelData(1).slice(startI,endI));
 } else {
  const mono=new Float32Array(length);
  for(let ch=0;ch<buffer.numberOfChannels;ch++){
   const d=buffer.getChannelData(ch);
   for(let i=0;i<length;i++)mono[i]+=d[startI+i]/buffer.numberOfChannels;
  }
  source.push(mono);
  if(stereo)source.push(mono); // Mono input becomes dual-mono stereo; no true stereo information can be restored.
 }
 if(sr===targetRate)return source;
 const outLen=Math.floor(length*targetRate/sr);
 return source.map(mono=>{
  const out=new Float32Array(outLen);
  for(let i=0;i<outLen;i++){
   const pos=i*ratio,idx=Math.floor(pos),frac=pos-idx;
   out[i]=(mono[idx]||0)*(1-frac)+(mono[Math.min(idx+1,mono.length-1)]||0)*frac;
  }
  return out;
 });
}
$('exportBtn').onclick=async()=>{
 if(!audioBuffer||busy)return;
 if(!window.lamejs){setStatus('MP3 encoder did not load. Connect to the internet and reload the page.');return}
 const valid=cuts.filter(c=>c.end>c.start+.05);
 if(!valid.length){setStatus('No valid clips. Check each start/end time.');return}
 busy=true;$('exportBtn').disabled=true;
 const bitrate=Number($('bitrate').value)||192;
 const stereo=$('channels').value==='stereo';
 try{
  for(let i=0;i<valid.length;i++){
   const c=valid[i];setStatus(`Encoding ${i+1}/${valid.length}: ${c.name} (${stereo?'stereo':'mono'}, ${bitrate} kbps)`);
   await new Promise(resolve=>setTimeout(resolve,30));
   const channels=resampleChannels(audioBuffer,c.start,c.end,44100,stereo);
   const encoder=new lamejs.Mp3Encoder(channels.length,44100,bitrate),chunk=1152,parts=[];
   for(let p=0;p<channels[0].length;p+=chunk){
    const left=floatToInt16(channels[0].subarray(p,Math.min(channels[0].length,p+chunk)));
    let bytes;
    if(channels.length===2){
     const right=floatToInt16(channels[1].subarray(p,Math.min(channels[1].length,p+chunk)));
     bytes=encoder.encodeBuffer(left,right);
    }else bytes=encoder.encodeBuffer(left);
    if(bytes.length)parts.push(new Uint8Array(bytes));
   }
   const endBytes=encoder.flush();if(endBytes.length)parts.push(new Uint8Array(endBytes));
   const blob=new Blob(parts,{type:'audio/mpeg'});
   const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${String(i+1).padStart(2,'0')}_${safeName(c.name)}.mp3`;document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(a.href),60000);
   await new Promise(resolve=>setTimeout(resolve,350));
  }
  setStatus(`Finished exporting ${valid.length} MP3 clip(s) at ${bitrate} kbps (${stereo?'stereo':'mono'}). Check your Downloads folder. The original file was not changed.`);
 }catch(err){setStatus('Export failed: '+err.message+'. Try a shorter file or fewer clips.')}
 finally{busy=false;$('exportBtn').disabled=false}
};
if('serviceWorker' in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
})();