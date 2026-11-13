
const cases=window.MUSEUM_DATA;  // 数据已抽离到 js/data.jslet current=0;
/* 模板插值转义：data.js 的文案进 innerHTML 前先转义，避免内容里的 < > & 破坏结构或注入标签。 */
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function render(i){current=i;const c=cases[i];document.querySelectorAll('[role=tab]').forEach((b,j)=>{b.classList.toggle('active',j===i);b.setAttribute('aria-selected',j===i);b.setAttribute('tabindex',j===i?'0':'-1')});const panel=document.getElementById('content');if(panel)panel.setAttribute('aria-labelledby','tab'+i);document.getElementById('content').innerHTML=`<article><div class="hero"><div class="photo"><img src="${esc(c.image)}" srcset="${esc(c.imageSrcset)}" sizes="${esc(c.imageSizes)}" width="${c.imageW}" height="${c.imageH}" decoding="async" fetchpriority="high" alt="${esc(c.en)}现场作品"><button onclick="zoom()">查看作品原图 ↗</button><div class="caption">作品现场实拍 · 点击放大查看展板细节</div></div><div><div class="tag">案例 0${i+1} / ${esc(c.tag)}</div><h2>${esc(c.title)}</h2><p class="en">${esc(c.en)}</p><div class="meta"><span>Our Changing Climate</span><span>${esc(c.track)}</span></div><p class="intro">${esc(c.intro)}</p></div></div><nav class="nav"><a href="#research">研究内容</a><a href="#reading">案例解读</a><a href="#checklist">作品自查</a></nav><section id="research"><div class="sectionhead"><b>研究内容</b><span>Understanding the research</span></div><div class="researchlead"><h3>研究背景</h3><p>${esc(c.background)}</p></div><div class="rq"><div class="eyebrow" style="color:#b9ceb7">RESEARCH QUESTION${i===1?' · 展板原文':i===2?' · 据展板转录':''}</div><p>${esc(c.rq)}</p><div class="cn">${esc(c.cn)}</div>${c.rqRevision?`<div class="rq-revision"><strong>建议改写</strong><div>${esc(c.rqRevision[0])}</div><div>${esc(c.rqRevision[1])}</div></div>`:''}</div><div class="researchlead"><h3>研究重点</h3><p>${esc(c.focus)}</p></div><h3 class="subhead">研究分析：团队如何回答问题</h3><div class="analysis-layout"><div class="poster-map"><div class="poster-map-title"><strong>学生作品对应位置</strong><div>点击编号查看对应分析</div></div><div class="poster-map-image"><img src="${esc(c.image)}" srcset="${esc(c.imageSrcset)}" sizes="${esc(c.imageSizes)}" width="${c.imageW}" height="${c.imageH}" loading="lazy" decoding="async" alt="${esc(c.en)} 学生展板全图">${c.analysis.map((a,j)=>`<button type="button" class="map-hotspot" data-map-index="${j}" style="left:${c.analysisRegions[j][0]}%;top:${c.analysisRegions[j][1]}%;width:${c.analysisRegions[j][2]}%;height:${c.analysisRegions[j][3]}%" onclick="selectAnalysis(${j})" aria-label="放大展板区域 0${j+1}"></button>`).join('')}${c.analysis.map((a,j)=>`<button type="button" class="map-pin" data-map-index="${j}" style="left:${c.analysisPositions[j][0]}%;top:${c.analysisPositions[j][1]}%" onclick="selectAnalysis(${j})" aria-label="放大分析 0${j+1}">${j+1}</button>`).join('')}</div><div class="poster-map-caption" id="mapCaption">点击展板上的编号或区域，或点击分析卡中的按钮，可放大原文并查看对应分析。</div></div><div class="analysis-cards">${c.analysis.map((a,j)=>`<div class="card analysis-card" data-analysis-index="${j}" data-target="${esc(c.analysisTargets[j])}" role="button" tabindex="0" onclick="selectAnalysis(${j})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectAnalysis(${j})}"><div class="small" style="color:var(--accent);margin-bottom:8px">ANALYSIS 0${j+1}</div><h3>${esc(a[0])}</h3><p>${esc(a[1])}</p><div class="analysis-target"><strong>对应展板内容</strong><div>${esc(c.analysisTargets[j])}</div></div><button type="button" class="zoom-trigger" onclick="event.stopPropagation();selectAnalysis(${j})">放大查看展板原文 ↗</button></div>`).join('')}</div></div><div class="researchlead result"><h3>研究结论与讨论</h3><p>${esc(c.result)}</p></div>${c.evidenceNote?`<div class="evidence-note"><strong>证据阅读提示</strong><div>${esc(c.evidenceNote)}</div></div>`:''}</section><section id="reading"><div class="sectionhead"><b>案例解读</b><span>Case analysis</span></div><div class="overview"><h3>解读概览</h3><p>${esc(c.overview)}</p></div>${c.dims.map((d,j)=>`<div class="dim"><aside><div class="num">0${j+1}</div><div><h3>${esc(d.name)}</h3><div class="small" style="letter-spacing:0">${esc(d.en)}</div></div></aside><div><h4>这个维度关注什么？</h4><div class="point">${esc(d.point)}</div><div class="detail"><div class="label">案例表现</div><p>${esc(d.performance)}</p></div><div class="detail"><div class="label">值得借鉴之处</div><p>${esc(d.strength)}</p></div>${d.improve?`<div class="detail improve"><div class="label">问题与提升建议</div><p>${esc(d.improve)}</p></div>`:''}<div class="learn"><strong>维度要点</strong><ul>${d.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div></div></div>`).join('')}</section></article>`;if(typeof editorReady!=='undefined'&&editorReady)bindCaseEdits();}
function zoom(){document.getElementById('full').src=cases[current].image;document.getElementById('viewer').showModal()}
/* 裁剪源必须是全分辨率原图。
   展板图走 srcset 取缩略版后，屏幕上的那张只有 640~1280 px 宽，
   直接拿它裁剪会把展板小字糊掉 —— 点热点时再单独拉一次原图。 */
let fullResImage=null;
function loadFullRes(cb){const src=cases[current].image;if(fullResImage&&fullResImage.dataset.src===src){cb(fullResImage);return;}const im=new Image();im.dataset.src=src;im.onload=()=>{fullResImage=im;cb(im);};im.onerror=()=>{cb(document.querySelector('.poster-map-image img'));};im.src=src;}
function selectAnalysis(index){const cards=[...document.querySelectorAll('.analysis-card')],pins=[...document.querySelectorAll('.map-pin')];cards.forEach((el,j)=>el.classList.toggle('active',j===index));pins.forEach((el,j)=>el.classList.toggle('active',j===index));document.querySelectorAll('.map-hotspot').forEach((el,j)=>el.classList.toggle('active',j===index));const card=cards[index],caption=document.getElementById('mapCaption');if(!card)return;if(caption)caption.textContent=`0${index+1} 对应展板内容：${card.dataset.target}`;const region=cases[current].analysisRegions[index];if(!region)return;loadFullRes(source=>{if(!source)return;const sx=Math.round(source.naturalWidth*region[0]/100),sy=Math.round(source.naturalHeight*region[1]/100),sw=Math.min(source.naturalWidth-sx,Math.round(source.naturalWidth*region[2]/100)),sh=Math.min(source.naturalHeight-sy,Math.round(source.naturalHeight*region[3]/100)),canvas=document.createElement('canvas');canvas.width=sw;canvas.height=sh;const ctx=canvas.getContext('2d');ctx.drawImage(source,sx,sy,sw,sh,0,0,sw,sh);document.getElementById('zoomPosterCrop').src=canvas.toDataURL('image/jpeg',0.94);document.getElementById('zoomAnalysisTitle').textContent=card.querySelector('h3').textContent;document.getElementById('zoomTarget').textContent=card.dataset.target;document.getElementById('zoomAnalysisText').textContent=card.querySelector('p').textContent;const zoomDialog=document.getElementById('analysisZoomDialog');if(typeof zoomDialog.showModal==='function')zoomDialog.showModal();else zoomDialog.setAttribute('open','');});}
const groups=[
['选题与研究问题',[
['主题关联','研究问题是否紧密围绕年度主题？'],
['具体问题','是否提出具体、有探究价值的问题，让观众一眼看出研究重点？']]],
['研究分析与结论',[
['证据与推理','是否用相关论据和数据支持观点，并解释“这些材料说明了什么”？'],
['机制与跨学科','是否解释为什么、如何发生，并结合不同学科进行分析？'],
['结论与洞见','结论是否回应研究问题，讨论发现、意义以及必要的局限或取舍？']]],
['内容组织与学术规范',[
['结构完整','是否形成背景、问题、分析、结论与延伸的连贯阅读路径？'],
['英文内容','英文正文是否扎实、清楚，并达到超过500字的准备要求？'],
['资料引用','论据、数据和参考内容是否可追溯？参考文献优先采用APA格式。']]],
['视觉表达与互动',[
['版面分区','是否采用清晰的模块化布局与拼贴，而非将整张大海报直接铺满展板？'],
['图表呈现','是否有帮助理解的图表，而非仅用图片装饰？'],
['字体与配色','配色是否辅助信息传达？字体、字号是否适中，层级是否清晰？'],
['阅读与美化','是否使用小标题或条目提高可读性，保持版面整洁，并让创意装饰服务主题？'],
['辅助展示','是否准备能帮助解释研究内容的桌面模型、实物或互动？']]]];
let saved=[];try{saved=JSON.parse(localStorage.getItem('museum-checks-v2')||'[]')}catch(e){}let index=0;document.getElementById('checks').innerHTML=groups.map((g,j)=>`<div class="checkgroup"><h3><span style="color:var(--accent);font-family:Georgia">0${j+1}</span>　${g[0]}</h3>${g[1].map(t=>{let k=index++;return `<label class="check"><input type="checkbox" ${saved.includes(k)?'checked':''} onchange="update()"><span><strong>${t[0]}</strong><span class="checktext">${t[1]}</span></span></label>`}).join('')}</div>`).join('');function update(){const inputs=[...document.querySelectorAll('.check input')];const selected=inputs.flatMap((e,i)=>e.checked?[i]:[]);document.getElementById('progress').textContent=`已检查 ${selected.length} / ${inputs.length} 项`;try{localStorage.setItem('museum-checks-v2',JSON.stringify(selected))}catch(e){}}render(caseFromUrl());update();document.getElementById('viewer').addEventListener('click',e=>{if(e.target.tagName==='DIALOG')e.target.close()});document.getElementById('analysisZoomDialog').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close()});

var editorReady=true;let editing=false,toastTimer=null,saveTimer=null;
const embedded=JSON.parse(document.getElementById('editorData').textContent);
embedded.originals=embedded.originals||{};let edits={...embedded.edits},saveAvailable=true;
try{const stored=localStorage.getItem(embedded.storageId);if(stored){const parsed=JSON.parse(stored);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))edits={...edits,...parsed};}}catch(e){saveAvailable=false;}
const editableSelector='h1,h2,h3,h4,p,.label,.point,.tag,.cn,.caption,.eyebrow,.meta span,.small,.learn li,.sectionhead b,.sectionhead>span,.check strong,.checktext,.editable-footer';
function bindScope(root,scope){
 const candidates=[...(root.matches(editableSelector)?[root]:[]),...root.querySelectorAll(editableSelector)].filter(el=>!el.closest('button,nav,script,dialog'));
 const leaves=candidates.filter(el=>!candidates.some(other=>other!==el&&el.contains(other)));
 leaves.forEach((el,index)=>{const key=scope+':'+index;el.dataset.editKey=key;if(!Object.prototype.hasOwnProperty.call(embedded.originals,key))embedded.originals[key]=el.textContent;if(Object.prototype.hasOwnProperty.call(edits,key))el.textContent=edits[key];el.contentEditable=editing?'true':'false';el.spellcheck=false;});
}
function bindCaseEdits(){bindScope(document.getElementById('content'),'case'+current);}
function bindStaticEdits(){bindScope(document.querySelector('header'),'header');bindScope(document.getElementById('checklist'),'checklist');document.querySelector('footer').classList.add('editable-footer');bindScope(document.querySelector('footer'),'footer');}
function statusText(){document.getElementById('editStatus').textContent=editing?(saveAvailable?'编辑模式 · 修改自动保存':'编辑模式 · 请导出文件保存修改'):'阅读模式'+(Object.keys(edits).length?' · 已载入修改':'');}
function flushEdits(){if(saveTimer){clearTimeout(saveTimer);saveTimer=null;}try{localStorage.setItem(embedded.storageId,JSON.stringify(edits));saveAvailable=true;}catch(e){saveAvailable=false;}statusText();}
function toggleEdit(){editing=!editing;document.body.classList.toggle('editing',editing);document.getElementById('editorDrawer').open=editing;document.getElementById('editToggle').textContent=editing?'完成编辑':'编辑文字';document.getElementById('editToggle').setAttribute('aria-pressed',String(editing));document.querySelectorAll('[data-edit-key]').forEach(el=>el.contentEditable=editing?'true':'false');if(!editing)flushEdits();statusText();}
function toast(message){let el=document.getElementById('editorToast');if(!el){el=document.createElement('div');el.id='editorToast';el.className='editor-toast';el.setAttribute('role','status');document.body.appendChild(el);}el.textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),4000);}
document.addEventListener('input',event=>{const el=event.target.closest('[data-edit-key]');if(!editing||!el)return;edits[el.dataset.editKey]=el.innerText.replace(/\r\n/g,'\n');document.getElementById('editStatus').textContent='正在保存…';clearTimeout(saveTimer);saveTimer=setTimeout(flushEdits,250);});
document.addEventListener('paste',event=>{const el=event.target.closest('[data-edit-key]');if(!editing||!el)return;event.preventDefault();const text=event.clipboardData.getData('text/plain');const selection=window.getSelection();if(!selection.rangeCount)return;const range=selection.getRangeAt(0);if(!el.contains(range.commonAncestorContainer))return;range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);el.dispatchEvent(new Event('input',{bubbles:true}));});
document.addEventListener('keydown',event=>{const el=event.target.closest('[data-edit-key]');if(editing&&el&&event.key==='Enter'){event.preventDefault();document.execCommand('insertLineBreak');}});window.addEventListener('beforeunload',()=>flushEdits());
/* 新版 exportHTML + inlineAssets
 *
 * 背景：站点从「单文件自包含」拆分为「index.html + css/ + js/ + img/」后，
 * 原导出逻辑 clone.outerHTML 会把 <link> / <script src> / <img src="img/...">
 * 一起写进下载的 HTML，而那些外部文件并不在用户下载目录里 —— 导出的文件在
 * 微信里双击打开会是「无样式、无脚本、图片裂图」的白页。
 *
 * 方案：导出前把 CSS / JS / 图片全部重新内联（图片转 data URI），
 * 保证「导出 HTML」这个既有产品能力在拆分后依然产出可独立分发的单文件。
 *
 * 已知降级：fetch() 在 file:// 协议下会被 CORS 拦截，此时内联失败，
 * 导出的文件会保留外部引用 —— 正常使用请通过 http(s) 打开后再导出。
 */

async function exportHTML(){
  flushEdits();
  const clone=document.documentElement.cloneNode(true);
  const payload={storageId:'museum-editor-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),edits,originals:embedded.originals};
  clone.querySelector('#editorData').textContent=JSON.stringify(payload).replace(/</g,'\\u003c');
  clone.querySelector('body').classList.remove('editing');clone.querySelector('#editorDrawer')?.removeAttribute('open');
  clone.querySelectorAll('[data-edit-key]').forEach(el=>{el.removeAttribute('contenteditable');el.removeAttribute('spellcheck');});
  const toggle=clone.querySelector('#editToggle');toggle.textContent='编辑文字';toggle.setAttribute('aria-pressed','false');clone.querySelector('#editStatus').textContent='阅读模式 · 已载入修改';
  clone.querySelector('#editorToast')?.remove();clone.querySelectorAll('dialog[open]').forEach(el=>el.removeAttribute('open'));
  await inlineAssets(clone);
  const html='<!doctype html>\n'+clone.outerHTML;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='博雅博物馆_优秀案例解读_编辑版_'+new Date().toISOString().slice(0,10)+'.html';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('已导出新版 HTML；可在浏览器下载列表中查看。');
}

/* 把 clone 里的外部资源重新内联：CSS → <style>，JS → <script>，图片 → data URI */
async function inlineAssets(clone){
  const map={};const urls=new Set();const srcsets=new Set();

  // 图片来源：DOM 中已渲染的 <img src>，以及 cases 数据里的全部 image 字段
  clone.querySelectorAll('img[src]').forEach(el=>{
    const s=el.getAttribute('src');
    if(s&&!/^(data:|https?:|blob:)/.test(s))urls.add(s);
  });
  // srcset 指向的是响应式变体，导出件里没有这些文件 —— 统一置空，回落到内联的 src
  clone.querySelectorAll('img[srcset]').forEach(el=>{
    const s=el.getAttribute('srcset');
    if(s)srcsets.add(s);
  });
  try{
    (window.MUSEUM_DATA||[]).forEach(c=>{
      if(!c)return;
      if(typeof c.image==='string'&&!/^(data:|https?:|blob:)/.test(c.image))urls.add(c.image);
      if(typeof c.imageSrcset==='string')srcsets.add(c.imageSrcset);
    });
  }catch(e){}

  for(const s of urls){
    try{
      const b=await (await fetch(s)).blob();
      map[s]=await new Promise((res,rej)=>{
        const fr=new FileReader();
        fr.onload=()=>res(fr.result);
        fr.onerror=rej;
        fr.readAsDataURL(b);
      });
    }catch(e){}
  }

  const links=[...clone.querySelectorAll('link[rel="stylesheet"]')];
  for(const l of links){
    try{
      const css=await (await fetch(l.getAttribute('href'))).text();
      const st=document.createElement('style');
      st.textContent=css;
      l.replaceWith(st);
    }catch(e){}
  }

  const scripts=[...clone.querySelectorAll('script[src]')];
  for(const s of scripts){
    try{
      let code=await (await fetch(s.getAttribute('src'))).text();
      // 把 JS 里引用的图片相对路径替换成 data URI
      for(const k in map){code=code.split('"'+k+'"').join('"'+map[k]+'"');}
      // srcset 里的变体文件不在下载目录里，置空后浏览器回落到已内联的 src
      for(const s of srcsets){code=code.split('"'+s+'"').join('""');}
      const sc=document.createElement('script');
      sc.textContent=code;
      s.replaceWith(sc);
    }catch(e){}
  }

  clone.querySelectorAll('img[src]').forEach(el=>{
    const s=el.getAttribute('src');
    if(map[s])el.setAttribute('src',map[s]);
  });
  clone.querySelectorAll('img[srcset]').forEach(el=>{el.removeAttribute('srcset');el.removeAttribute('sizes');});
}

function openReset(){document.getElementById('resetEditor').showModal();}
function resetOriginal(){clearTimeout(saveTimer);saveTimer=null;edits={};embedded.edits={};try{localStorage.removeItem(embedded.storageId);}catch(e){}document.querySelectorAll('[data-edit-key]').forEach(el=>{const key=el.dataset.editKey;if(Object.prototype.hasOwnProperty.call(embedded.originals,key))el.textContent=embedded.originals[key];});render(current);document.getElementById('resetEditor').close();flushEdits();toast('已恢复全部原文。');}
/* 切案例会整段替换正文，沿用旧滚动位置会让用户对着错位的内容读，故回到内容起点。 */
function scrollToContent(){const el=document.getElementById('content');if(!el)return;const y=el.getBoundingClientRect().top+window.scrollY-64;window.scrollTo({top:y,behavior:'smooth'});}
/* URL 带 ?case=N，刷新与分享落到同一案例；file:// 下 replaceState 抛错，忽略。 */
function syncCaseUrl(i){try{history.replaceState(null,'',location.pathname+'?case='+(i+1));}catch(e){}}
function caseFromUrl(){const m=/[?&]case=(\d+)/.exec(location.search);const n=m?parseInt(m[1],10)-1:0;return (n>=0&&n<cases.length)?n:0;}
function selectCase(i){render(i);syncCaseUrl(i);scrollToContent();}
document.querySelector('.tabs').addEventListener('keydown',e=>{const t=e.target.closest('[role=tab]');if(!t)return;const tabs=[...document.querySelectorAll('[role=tab]')];const at=tabs.indexOf(t);let to=-1;if(e.key==='ArrowRight'||e.key==='ArrowDown')to=(at+1)%tabs.length;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')to=(at-1+tabs.length)%tabs.length;else if(e.key==='Home')to=0;else if(e.key==='End')to=tabs.length-1;else return;e.preventDefault();selectCase(to);tabs[to].focus();});
bindCaseEdits();bindStaticEdits();statusText();
