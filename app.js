const D=window.APP_DATA;
const $=s=>document.querySelector(s);
let state={focus:'',answers:{},clarifiers:{},scores:null,rank:null,lowInfoMain:false};
let currentQuestionIndex=0;
let pendingResult=null;
let currentSlideIndex=0;
let currentSlideRole=null;
const screens=['home','focus','quiz','clarify','lowinfo','loading','reveal','result'];
const quizChapters=[
  '第一章 · 你如何进入世界',
  '第二章 · 你如何面对未知',
  '第三章 · 你如何回应他人',
  '第四章 · 你如何安排生活',
  '第五章 · 你如何守住自己'
];
function show(id){screens.forEach(x=>{const el=$('#'+x);if(!el)return;const on=x===id;el.classList.toggle('active',on);el.hidden=!on});document.body.dataset.screen=id;requestAnimationFrame(()=>scrollTo(0,0))}
function save(){localStorage.setItem('bookPersonaState',JSON.stringify(state))}
function esc(s){return String(s||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function start(){localStorage.removeItem('bookPersonaState');state={focus:'',answers:{},clarifiers:{},scores:null,rank:null,lowInfoMain:false};pendingResult=null;const rb=$('#resumeBtn');if(rb)rb.hidden=true;show('focus');renderFocus()}
function renderFocus(){
  const box=$('#focusOptions');box.innerHTML='';
  D.life_prompts.forEach(t=>{
    let b=document.createElement('button');b.className='prompt';b.textContent=t;
    b.onclick=()=>{state.focus=t;save();renderQuestion(0);show('quiz')};box.appendChild(b)
  })
}
function renderQuestion(idx){
  currentQuestionIndex=idx;
  const q=D.questions[idx];
  $('#qIndex').textContent=`${idx+1} / ${D.questions.length}`;
  $('#prog').style.width=`${(idx+1)/D.questions.length*100}%`;
  $('#qChapter').textContent=quizChapters[Math.min(4,Math.floor(idx/4))];
  $('#qTitle').textContent=`第 ${String(idx+1).padStart(2,'0')} 页 · ${q.title}`;
  $('#qText').textContent=q.text;
  const back=$('#qBack'); back.style.display=idx>0?'inline-block':'none'; back.onclick=()=>renderQuestion(Math.max(0,idx-1));
  const box=$('#scale');box.innerHTML='';
  Object.entries(D.response_scale).forEach(([v,l])=>{
    let b=document.createElement('button');b.textContent=l;
    if(state.answers[q.id]===+v){b.style.borderColor='#a77a31';b.style.background='#fff8e9'}
    b.onclick=()=>{state.answers[q.id]=+v;save();if(idx<D.questions.length-1)renderQuestion(idx+1);else finishMain()};
    box.appendChild(b)
  })
}
function answerValues(extra=false){
  let vals=D.questions.map(q=>state.answers[q.id]).filter(v=>v!=null);
  if(extra)vals=vals.concat(D.clarifiers.map((_,i)=>state.clarifiers[i]).filter(v=>v!=null));
  return vals
}
function responseQuality(extra=false){
  const vals=answerValues(extra);
  if(!vals.length)return{low:true,std:0,modeShare:1,neutralShare:1};
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
  const std=Math.sqrt(vals.reduce((s,v)=>s+(v-mean)**2,0)/vals.length);
  const counts={};vals.forEach(v=>counts[v]=(counts[v]||0)+1);
  const modeShare=Math.max(...Object.values(counts))/vals.length;
  const neutralShare=(counts[3]||0)/vals.length;
  const cfg=D.scoring.response_quality||{mode_share_warn:.80,stddev_warn:.55,neutral_share_warn:.70};
  return{low:modeShare>=cfg.mode_share_warn||std<cfg.stddev_warn||neutralShare>=cfg.neutral_share_warn,std,modeShare,neutralShare}
}
function rawScores(extra=false){
  const buckets={O:[],C:[],E:[],A:[],S:[]};
  D.questions.forEach(q=>{let v=state.answers[q.id];if(v==null)return;if(q.reverse)v=6-v;buckets[q.dimension].push(v)});
  if(extra)D.clarifiers.forEach((q,i)=>{let v=state.clarifiers[i];if(v==null)return;if(q.reverse)v=6-v;buckets[q.dimension].push(v)});
  const out={};Object.keys(buckets).forEach(k=>{const a=buckets[k];const mean=a.reduce((x,y)=>x+y,0)/a.length;out[k]=Math.round((mean-1)/4*100)});return out
}
function cosineCentered(a,b){
  const ks=D.dimensions,va=ks.map(k=>a[k]-50),vb=ks.map(k=>b[k]-50);
  const dot=va.reduce((s,x,i)=>s+x*vb[i],0),na=Math.sqrt(va.reduce((s,x)=>s+x*x,0)),nb=Math.sqrt(vb.reduce((s,x)=>s+x*x,0));
  return(!na||!nb)?0:dot/(na*nb)
}
function match(scores){
  const maxD=100*Math.sqrt(5);
  return D.roles.map(r=>{const cos=cosineCentered(scores,r.prototype);const e=Math.sqrt(D.dimensions.reduce((s,k)=>s+(scores[k]-r.prototype[k])**2,0));const score=.70*((cos+1)/2)+.30*(1-e/maxD);return{...r,match:score}}).sort((a,b)=>b.match-a.match)
}
function finishMain(){
  const scores=rawScores(false),rank=match(scores),gap=rank[0].match-rank[1].match,quality=responseQuality(false);
  state.lowInfoMain=quality.low;state.scores=scores;state.rank=rank.map(x=>({id:x.id,match:x.match}));save();
  if(quality.low||gap<D.scoring.confidence_gap.clarify_below){
    $('#clarifyTitle').textContent=quality.low?'你的答案比较集中，再补 5 道更有区分度的题。':'你的两个文学原型非常接近，再补一页。';
    renderClarifier(0);show('clarify')
  }else generate(scores,rank)
}
function renderClarifier(i){
  const q=D.clarifiers[i];$('#cIndex').textContent=`补测 ${i+1} / ${D.clarifiers.length}`;$('#cText').textContent=q.text;
  const box=$('#cScale');box.innerHTML='';
  Object.entries(D.response_scale).forEach(([v,l])=>{let b=document.createElement('button');b.textContent=l;b.onclick=()=>{state.clarifiers[i]=+v;save();if(i<D.clarifiers.length-1)renderClarifier(i+1);else{const quality=responseQuality(true);if(quality.low)showLowInfo(quality);else{const s=rawScores(true),r=match(s);generate(s,r)}}};box.appendChild(b)})
}
function showLowInfo(q){
  const pct=Math.round(q.modeShare*100);$('#lowInfoDetail').textContent=`这次答卷中相同选项约占 ${pct}% ，区分度仍不足。为了不把一个随机角色硬贴给你，系统选择暂不出结果。重新作答时，请按过去半年“多数时候的真实状态”区分选择。`;show('lowinfo')
}
function generate(scores,rank){
  state.scores=scores;state.rank=rank.map(x=>({id:x.id,match:x.match}));save();pendingResult={primary:rank[0],second:rank[1],scores};
  show('loading');
  setTimeout(()=>{const r=rank[0];$('#revealHint').textContent=`你的答案最终汇向一种“${r.subtitle}”式的力量。翻开这一页，看见它的名字。`;show('reveal')},1100)
}
function revealPending(){if(!pendingResult)return;renderResult(pendingResult.primary,pendingResult.second,pendingResult.scores);show('result')}
function radarSVG(scores){
  const cx=160,cy=155,R=105,ks=D.dimensions;
  const pts=vals=>ks.map((k,i)=>{const a=-Math.PI/2+i*2*Math.PI/5,rr=R*(vals[k]/100);return[cx+rr*Math.cos(a),cy+rr*Math.sin(a)]});
  let grid='';[.25,.5,.75,1].forEach(fr=>{const o={};ks.forEach(k=>o[k]=fr*100);grid+=`<polygon points="${pts(o).map(p=>p.join(',')).join(' ')}" fill="none" stroke="#d4c7b3" stroke-width="1"/>`});
  const poly=pts(scores).map(p=>p.join(',')).join(' ');
  const labels=ks.map((k,i)=>{const a=-Math.PI/2+i*2*Math.PI/5,x=cx+(R+30)*Math.cos(a),y=cy+(R+30)*Math.sin(a);return`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#50544f">${k} ${scores[k]}</text>`}).join('');
  return`<svg viewBox="0 0 320 310" class="radar">${grid}<polygon points="${poly}" fill="rgba(167,122,49,.28)" stroke="#a77a31" stroke-width="2"/>${labels}</svg>`
}
function affirmationFor(r){
  const map={
    1:'你的边界不是冷漠。它只是说明，你希望爱与尊严同时存在。',2:'你的敏感不是多余。它让你看见那些容易被忽略的温柔与意义。',3:'你的想象力不是逃避现实。它是你把普通日子重新点亮的方式。',4:'你的克制不是缺少感情。它只是让深情有了分寸与重量。',5:'你的不服从不是任性。你只是需要知道，人生为什么值得这样走。',6:'你的清醒没有削弱浪漫。它让你的心动仍然保有判断和尊严。',7:'你的好奇不是分心。它是你不断为世界找到新入口的天赋。',8:'你的理想主义不是幼稚。真正的成长，是让理想学会落地。',9:'你的认真不是过度。你只是习惯把重要的事真正放在心上。',10:'你的理性不是无情。它只是你理解混乱、保护清晰的一种方式。',11:'你的原则不是僵硬。它让你在复杂局面里仍知道什么值得守住。',12:'你的沉稳不是没有野心。你只是更愿意用承担证明自己。',13:'你的平凡不是微小。可靠、陪伴和善意，本身就是稀缺的力量。',14:'你的过去不能替你定义余生。你始终拥有重新选择自己的能力。',15:'你的温柔不是软弱。能在风暴里仍选择善意，本身就是力量。',16:'你的纯真不是无知。经历复杂以后仍愿意相信，是一种更难得的勇气。',17:'你的求生欲不是自私。你只是拥有一种从废墟里重新站起来的生命力。',18:'你的疏离不是缺陷。诚实面对自己的感受，也是一种不迎合的勇气。',19:'你的思考不是软弱。只是需要让思考最终通向选择，而不是困住自己。',20:'你的谨慎不是迟疑。经历以后仍能重新安排命运，是一种成熟的力量。',21:'你的克制不是冷淡。真正的深情，有时更愿意通过长期行动被看见。',22:'你的独处不是逃离。你需要一片自己的海，才能保存完整的思想与理想。',23:'你的复杂不是负担。承认不完美以后仍愿意爱，是更成熟的勇敢。',24:'你的热烈不是肤浅。只是别忘了，真正的爱也需要时间替它长出根。'};
  return map[r.id]||'你的特点不是缺点，它只是需要被放在适合的位置。'
}
function renderResult(r,second,scores){
  $('#rId').textContent=`PERSONA ID · BOOK-${String(r.id).padStart(2,'0')}`;
  $('#rName').textContent=r.name+'型人格';$('#rWork').textContent=r.work;$('#rSub').textContent=r.subtitle;$('#rJudge').textContent=r.judgement||'你的特点不是缺点，它只是需要被放在适合的位置。';
  $('#rChips').innerHTML=r.keywords.map(k=>`<span class="chip">${esc(k)}</span>`).join('');
  const gap=r.match-second.match;$('#confidence').textContent=gap>=.035?'主型特征较清晰':gap>=.015?'主副型相邻':'复合型倾向';$('#second').textContent=`副型 · ${second.name} · ${second.subtitle}`;
  $('#affirmation').textContent=affirmationFor(r);
  $('#radar').innerHTML=radarSVG(scores);$('#scoreLegend').innerHTML=D.dimensions.map(k=>`<div class="score-row"><div>${D.dimension_names[k]} <b>${scores[k]}</b></div><div class="bar"><i style="width:${scores[k]}%"></i></div></div>`).join('');
  currentSlideRole=r;renderPosterBlock();
  $('#report').innerHTML=r.report_html;$('#focusEcho').textContent=state.focus?`你进入测试时最想知道的是：“${state.focus}”。带着这个问题继续读，你会更容易看见哪些段落真正属于你。`:'';
  $('#methodRank').textContent=`主型 ${r.name} / 副型 ${second.name}。两者匹配分差 ${(gap*100).toFixed(1)} 个百分点。`;
  window.currentRole=r;window.currentSecond=second
}
function renderPosterBlock(){
  if(!currentSlideRole)return;
  const src=currentSlideRole.images[0];
  const lead=currentSlideRole.image_lead || currentSlideRole.judgement || '';
  $('#slides').innerHTML=`<article class="poster-card">
    <blockquote class="poster-lead">${esc(lead)}</blockquote>
    <div class="slide long-poster"><img src="${src}" alt="${esc(currentSlideRole.name)}文学人格长图档案"></div>
    <a class="page-download" href="${src}" download="书中人_${esc(currentSlideRole.name)}_文学人格长图.png">↓ 保存这张长图</a>
  </article>`;
}
function restart(){localStorage.removeItem('bookPersonaState');state={focus:'',answers:{},clarifiers:{},scores:null,rank:null,lowInfoMain:false};pendingResult=null;const rb=$('#resumeBtn');if(rb)rb.hidden=true;show('home')}
function copyShare(){
  const r=window.currentRole;const t=`我测到的文学人格是「${r.name}型人格 · ${r.subtitle}」\n${r.judgement}\n副型：${window.currentSecond.name} · ${window.currentSecond.subtitle}\n\n原来有些我以为的“缺点”，只是没有被放在适合的位置。\n#书中人 #文学人格`;
  if(navigator.clipboard)navigator.clipboard.writeText(t).then(()=>alert('分享文案已复制')).catch(()=>fallbackCopy(t));else fallbackCopy(t)
}
function fallbackCopy(t){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert('分享文案已复制')}
async function downloadShare(){
  const r=window.currentRole,s=state.scores,c=document.createElement('canvas');c.width=1080;c.height=1440;const x=c.getContext('2d');
  x.fillStyle='#f5eee1';x.fillRect(0,0,c.width,c.height);
  const img=new Image();img.crossOrigin='anonymous';
  try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=r.images[0]});
    x.save();roundedRect(x,60,70,390,690,28);x.clip();x.drawImage(img,60,70,390,690);x.restore();
  }catch(e){x.fillStyle='#ded2bf';x.fillRect(60,70,390,690)}
  x.fillStyle='#14211d';x.font='30px serif';x.fillText('书中人 · 文学人格身份证',500,110);
  x.fillStyle='#9a7235';x.font='24px serif';x.fillText(`BOOK-${String(r.id).padStart(2,'0')} · ${r.work}`,500,158);
  x.fillStyle='#14211d';x.font='bold 64px serif';wrapText(x,r.name+'型人格',500,255,500,72);
  x.font='36px serif';x.fillStyle='#9a7235';x.fillText(r.subtitle,500,350);
  x.fillStyle='#14211d';x.font='30px serif';wrapText(x,r.judgement,500,430,480,48);
  x.strokeStyle='#cfb98f';x.beginPath();x.moveTo(500,625);x.lineTo(980,625);x.stroke();
  x.font='26px serif';x.fillStyle='#555d58';x.fillText('你的五维星图',500,690);
  let y=745;D.dimensions.forEach(k=>{x.fillStyle='#14211d';x.fillText(`${D.dimension_names[k]}  ${s[k]}`,500,y);x.fillStyle='#ded2bf';x.fillRect(710,y-22,250,18);x.fillStyle='#aa7b35';x.fillRect(710,y-22,250*s[k]/100,18);y+=62});
  x.fillStyle='#14211d';x.font='30px serif';wrapText(x,affirmationFor(r),70,900,930,48);
  x.font='25px serif';x.fillStyle='#6f736d';x.fillText('副型：'+window.currentSecond.name+' · '+window.currentSecond.subtitle,70,1150);
  x.fillText('20题 · 五维连续人格分数 · 24个文学原型映射',70,1210);
  x.font='22px serif';x.fillText('娱乐性自我探索，不替代专业心理评估',70,1330);
  x.font='22px serif';x.fillStyle='#9a7235';x.fillText('THE CHARACTER WITHIN · 书中人',70,1380);
  const a=document.createElement('a');a.download=`我的文学人格_${r.name}.png`;a.href=c.toDataURL('image/png');a.click()
}
function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function wrapText(ctx,text,x,y,maxWidth,lineHeight){let line='';for(const ch of [...text]){const test=line+ch;if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);line=ch;y+=lineHeight}else line=test}if(line)ctx.fillText(line,x,y)}
function openMethod(){$('#methodModal').classList.add('open')}function closeMethod(){$('#methodModal').classList.remove('open')}
function directRole(id){
  const target=D.roles.find(x=>x.id==id);if(!target)return;const scores={...target.prototype},ranked=match(scores),primary=ranked.find(x=>x.id===target.id)||ranked[0],second=ranked.find(x=>x.id!==target.id)||ranked[1];state.scores=scores;state.rank=ranked.map(x=>({id:x.id,match:x.match}));renderResult(primary,second,scores);show('result')
}

function restoreSavedState(){
  try{
    const raw=localStorage.getItem('bookPersonaState');if(!raw)return false;
    const saved=JSON.parse(raw);if(!saved||!saved.answers)return false;state={...state,...saved};
    const mainCount=Object.keys(state.answers||{}).length;const clarCount=Object.keys(state.clarifiers||{}).length;
    const btn=$('#resumeBtn');if(!btn)return false;
    btn.hidden=false;btn.textContent=mainCount>=D.questions.length?'继续查看我的档案':'继续上次测试';
    btn.onclick=()=>{
      if(mainCount<D.questions.length){let idx=D.questions.findIndex(q=>state.answers[q.id]==null);if(idx<0)idx=0;renderQuestion(idx);show('quiz');return}
      if(clarCount>0&&clarCount<D.clarifiers.length){let i=D.clarifiers.findIndex((_,j)=>state.clarifiers[j]==null);if(i<0)i=0;renderClarifier(i);show('clarify');return}
      const scores=state.scores||rawScores(clarCount===D.clarifiers.length);const ranked=match(scores);renderResult(ranked[0],ranked[1],scores);show('result')
    };return true
  }catch(e){return false}
}

window.addEventListener('DOMContentLoaded',()=>{
  show('home');$('#startBtn').onclick=start;restoreSavedState();$('#restart').onclick=restart;$('#lowRestart').onclick=restart;$('#copyShare').onclick=copyShare;$('#downloadShare').onclick=downloadShare;$('#methodBtn').onclick=openMethod;$('#closeMethod').onclick=closeMethod;$('#revealBtn').onclick=revealPending;
  const q=new URLSearchParams(location.search);if(q.get('role'))directRole(+q.get('role'))
});
