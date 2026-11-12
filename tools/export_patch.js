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
  const map={};const urls=new Set();

  // 图片来源：DOM 中已渲染的 <img src>，以及 cases 数据里的全部 image 字段
  clone.querySelectorAll('img[src]').forEach(el=>{
    const s=el.getAttribute('src');
    if(s&&!/^(data:|https?:|blob:)/.test(s))urls.add(s);
  });
  try{
    (window.MUSEUM_DATA||[]).forEach(c=>{
      if(c&&typeof c.image==='string'&&!/^(data:|https?:|blob:)/.test(c.image))urls.add(c.image);
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
      const sc=document.createElement('script');
      sc.textContent=code;
      s.replaceWith(sc);
    }catch(e){}
  }

  clone.querySelectorAll('img[src]').forEach(el=>{
    const s=el.getAttribute('src');
    if(map[s])el.setAttribute('src',map[s]);
  });
}
