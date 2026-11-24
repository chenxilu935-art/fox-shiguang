(() => {
'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentSource=SHIGUANG_SOURCE,items=SHIGUANG_ITEMS,topicSnapshot=SHIGUANG_TOPICS;
let firstSource=true;
let state={view:'library',tab:currentSource.page==='bookmarks'?'selected':'all',category:'全部',sort:'title'};
let topicRequest=0,topicPending=null,assignmentItem=null,deleteTopic=null,activeKey=null,requestNumber=0,toastTimer,busy=false;
const originals=new Map(),readRequests=new Map();
const topicKey=item=>item.topicKey;
const topicIds=item=>topicSnapshot.data.assignments[topicKey(item)]||[];
const topicNames=item=>topicSnapshot.data.categories.filter(t=>topicIds(item).includes(t.id)).map(t=>t.name);
const post=(type,data={})=>parent.postMessage({type,token:SHIGUANG_TOKEN,...data},'*');
const real=()=>true;
  const paths = {
    home:'m3 10 9-7 9 7v10H3z M9 20v-7h6v7',
    book:'M3 4h7l2 2 2-2h7v16h-7l-2 1-2-1H3z M12 6v15 M6 8h3 M15 8h3',
    house:'m3 11 9-8 9 8 M5 10v11h14V10 M10 21v-7h4v7',
    folder:'M3 6h7l2 2h9v13H3z M3 6V4h7l2 2',
    sparkles:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z M20 2v4 M18 4h4',
    trash:'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
    refresh:'M20 8a8 8 0 0 0-14-3L3 8 M3 3v5h5 M4 16a8 8 0 0 0 14 3l3-3 M21 21v-5h-5',
    document:'M5 3h12l3 3v15H5z M8 7h6 M8 11h9 M8 15h9 M8 18h6',
    tag:'M3 3h9l9 9-9 9-9-9z M7 7h.01',
    info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    bulb:'M8 15c-6-5-2-12 4-12s10 7 4 12l-1 3H9z M9 21h6 M10 18v3 M14 18v3',
    link:'m9 15 6-6 M8 17l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0 M16 7l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-5 0',
    route:'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6 M18 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6 M6 9v6a4 4 0 0 0 4 4h5 M18 15V9a4 4 0 0 0-4-4h-5'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.sparkles}"></path></svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => el.outerHTML = icon(el.dataset.icon));

const selected=()=>items.filter(x=>x.selected);
const image=(item,extra='')=>`<div class="thumb real-thumb ${extra}">${item.coverUrl?.startsWith('data:image/')?`<img class="real-cover" src="${esc(item.coverUrl)}" alt="" draggable="false" loading="lazy">`:'<span class="cover-fallback">暂无本地封面</span>'}</div>`;
const tags=(item,count=2)=>{const names=topicNames(item);return `<div class="tag-row topic-labels">${(names.length?names:['未分类']).slice(0,count).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}${names.length>count?`<span class="tag">+${names.length-count}</span>`:''}</div>`;};
const source=item=>`<p class="source">${esc(item.source||item.author||'')}</p>`;
function toast(message){$('room-toast').textContent=message;$('room-toast').hidden=false;if($('desk-view').open){$('preview-feedback').textContent=message;$('preview-feedback').hidden=false;}clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('room-toast').hidden=true;$('preview-feedback').hidden=true;},5000);}
function toggle(id){const item=items.find(x=>x.id===id);if(item)item.selected=!item.selected;render();}
function remove(id){const item=items.find(x=>x.id===id);if(item)item.selected=false;render();}
  function card(item) {
    return `<article class="collection-entry"><button class="collection-card" data-select="${esc(item.id)}" aria-pressed="${item.selected}" aria-label="${item.selected?'取消选择':'选择'}：${esc(item.title)}">${image(item)}<span class="selection-tick" aria-hidden="true">✓</span><div class="card-copy"><h3>${esc(item.title)}</h3>${source(item)}<p class="card-summary">${esc(item.summary)}</p>${tags(item)}</div></button><div class="topic-card-actions"><button data-topic-item="${esc(item.id)}" aria-label="为${esc(item.title)}设置主题">设置主题</button><button data-preview="${esc(item.id)}">森林书桌</button>${item.knowledgePath?`<button data-open-knowledge="${esc(item.id)}">已入库 ↗</button>`:''}<button data-topic-metadata="${esc(item.id)}">来源与标签</button></div></article>`;
  }

function renderLibrary(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===state.tab)));
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===currentSource.page));
  $('all-count').textContent=currentSource.counts.inbox;$('tab-count').textContent=currentSource.counts.bookmarks;
  const cats=[{id:'全部',name:'全部'},...topicSnapshot.data.categories,{id:'未分类',name:'未分类'}];
  if(!cats.some(t=>t.id===state.category))state.category='全部';
  $('filters').innerHTML=cats.map(c=>`<button data-category="${esc(c.id)}" aria-pressed="${state.category===c.id}">${esc(c.name)}</button>`).join('');
  $('filters').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;renderLibrary();});
  let list=items.filter(x=>state.category==='全部'||(state.category==='未分类'?topicIds(x).length===0:topicIds(x).includes(state.category)));
  const query=$('topic-search').value.trim().toLocaleLowerCase();
  if(query)list=list.filter(x=>[x.title,x.source,x.author,...x.tags].join(' ').toLocaleLowerCase().includes(query));
  if(state.sort==='title')list.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
  if(state.sort==='title-desc')list.sort((a,b)=>b.title.localeCompare(a.title,'zh-CN'));
  $('collection-grid').innerHTML=list.length?list.map(card).join(''):`<div class="empty-state">${esc(currentSource.error||(query||state.category!=='全部'?'没有符合条件的收藏':'此目录暂无收藏'))}</div>`;
  for(const [attribute,fn] of [['select',toggle],['preview',showDesk],['topic-item',openAssignment],['topic-metadata',openMetadata]])$('collection-grid').querySelectorAll('[data-'+attribute+']').forEach(b=>b.onclick=()=>fn(b.getAttribute('data-'+attribute)));
  $('collection-grid').querySelectorAll('[data-open-knowledge]').forEach(b=>b.onclick=()=>post('fox-shiguang-open-knowledge',{key:b.dataset.openKnowledge}));
  $('browse-status').textContent=(currentSource.warnings||[]).join('；');
  $('topic-store-status').textContent=topicSnapshot.error||'';$('topic-store-status').hidden=!topicSnapshot.error;
  const chosen=selected();$('selection-count').textContent=chosen.length;
  for(const id of ['clear-selection','enter-desk','trash-selection'])$(id).disabled=busy||!chosen.length;
  $('retain-selection').hidden=currentSource.page==='bookmarks';$('retain-selection').disabled=busy||!chosen.length;
  $('selected-list').innerHTML=chosen.length?chosen.map(x=>`<div class="selected-item">${image(x)}<div class="item-copy"><p class="item-title">${esc(x.title)}</p>${tags(x)}</div><button class="remove-button" data-remove="${esc(x.id)}" aria-label="取消选择${esc(x.title)}">×</button></div>`).join(''):'<p class="empty-state">尚未选择</p>';
  $('selected-list').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>remove(b.dataset.remove));
  $('ai-panel').hidden=!currentSource.ai;document.querySelector('[data-tab="ai"]').hidden=!currentSource.ai;
}
function releaseOriginals(){for(const original of originals.values())for(const media of original.media||[])if(media.url)URL.revokeObjectURL(media.url);originals.clear();}
addEventListener('pagehide',releaseOriginals);
function renderReading(){
  const item=items.find(x=>topicKey(x)===activeKey);if(!item)return;
  $('desk-note-title').textContent=item.title;$('preview-source').textContent=item.source||'';
  const original=originals.get(activeKey);
  $('original-content').innerHTML=original?.html||`<p class="subtle">${esc(original?.error||'正在读取原文…')}</p>`;
  $('original-metadata').innerHTML=`<p>${esc(original?.author||item.author||'')}</p><div class="raw-tags">${(original?.tags||item.tags).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`;
  $('open-original-source').hidden=!original?.url;
  for(const media of original?.media||[]){
    if(!media.url&&media.bytes){media.url=URL.createObjectURL(new Blob([media.bytes],{type:media.mime}));delete media.bytes;}
    for(const el of [...$('original-content').querySelectorAll('[data-local-media]')].filter(e=>e.dataset.localMedia===media.id)){
      if(media.url)el.src=media.url;else{el.hidden=true;const failure=el.closest('figure')?.querySelector('.media-failure');if(failure){failure.hidden=false;failure.textContent=media.error||'本地媒体读取失败';}}
    }
  }
  $('original-content').querySelectorAll('img,video,audio').forEach(el=>el.addEventListener('error',()=>{el.hidden=true;const error=el.closest('figure')?.querySelector('.media-failure');if(error)error.hidden=false;}));
  $('original-content').querySelectorAll('[data-reader-url]').forEach(a=>a.onclick=e=>{e.preventDefault();post('fox-shiguang-open-reader-link',{key:activeKey,url:a.dataset.readerUrl});});
}
function renderDesk(){
  const item=items.find(x=>topicKey(x)===activeKey),list=selected(),choices=item&&!list.includes(item)?[item,...list]:list;
  $('desk-count').textContent=list.length;
  $('preview-note').innerHTML=choices.map(x=>`<option value="${esc(topicKey(x))}">${esc(x.title)}</option>`).join('');$('preview-note').value=activeKey||'';
  if(state.view==='desk')renderReading();
}
function render(){renderLibrary();renderDesk();}
async function showLibrary(){if(!await desk.flush())return false;desk.hideCapture();state.view='library';if($('desk-view').open){await desk.animateClose();$('desk-view').close();}document.documentElement.classList.remove('preview-open');releaseOriginals();readRequests.clear();desk.animateReturn();return true;}
async function showDesk(id){if(!await desk.flush())return;const item=items.find(x=>x.id===id)||selected()[0];if(!item)return;
 activeKey=topicKey(item);state.view='desk';desk.ensure(item);if(!originals.has(activeKey)){originals.set(activeKey,{loading:true});const request=++requestNumber;readRequests.set(activeKey,request);post('fox-shiguang-read-original',{key:activeKey,request,revision:topicSnapshot.data.revision});}renderDesk();
 if(!$('desk-view').open){$('desk-view').showModal();desk.animateOpen(item);document.documentElement.classList.add('preview-open');}
}
async function switchPage(page){if(page===currentSource.page)return;if(!await showLibrary())return;post('fox-shiguang-switch-page',{page});}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(b.dataset.tab==='ai'){toast('尚未连接 AI 服务');return;}switchPage(b.dataset.tab==='selected'?'bookmarks':'inbox');});
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>switchPage(b.dataset.page));
document.querySelectorAll('[data-library]').forEach(b=>b.onclick=showLibrary);
$('sort').insertAdjacentHTML('beforeend','<option value="title-desc">标题倒序</option>');$('sort').value='title';$('sort').onchange=()=>{state.sort=$('sort').value;renderLibrary();};
$('clear-selection').onclick=()=>{items.forEach(x=>x.selected=false);render();};$('enter-desk').onclick=()=>showDesk();$('close-preview').onclick=showLibrary;
$('desk-view').addEventListener('cancel',e=>{e.preventDefault();showLibrary();});$('preview-note').onchange=()=>showDesk(items.find(x=>topicKey(x)===$('preview-note').value)?.id);
$('open-original-source').onclick=()=>{const original=originals.get(activeKey);if(original?.url)post('fox-shiguang-open-reader-link',{key:activeKey,url:original.url});};
function collectionAction(action){if(busy||!selected().length)return;if(action==='trash'&&!confirm('将所选 Markdown 移到回收站？媒体文件会保留。'))return;busy=true;post('fox-shiguang-collection-action',{action,keys:selected().map(topicKey),revision:topicSnapshot.data.revision});render();}
$('retain-selection').onclick=()=>collectionAction('retain');$('trash-selection').onclick=()=>collectionAction('trash');
addEventListener('message',event=>{
 const m=event.data;if(event.source!==parent||m?.token!==SHIGUANG_TOKEN)return;
 if(m.type==='fox-shiguang-collection-result'){busy=false;render();toast(m.error||`已处理 ${m.completed?.length||0} 篇${m.failed?.length?'；'+m.failed.map(x=>x.error).join('；'):''}`);if(m.undoRetain){const undo=document.createElement('button');undo.textContent='撤销保留';undo.onclick=()=>post('fox-shiguang-undo-retain');$('room-toast').append(' · ',undo);}}
 if(m.type==='fox-shiguang-retain-undone')toast('已撤销保留');
 if(m.type==='fox-shiguang-original-result'&&readRequests.get(m.key)===m.request){originals.set(m.key,m.error?{error:m.error}:m.result);if(activeKey===m.key&&state.view==='desk')renderReading();}
 if(m.type==='fox-shiguang-topics-result'&&m.snapshot?.data){topicSnapshot=m.snapshot;if(topicPending&&m.request===topicPending.request){const pending=topicPending;topicPending=null;$(pending.target).textContent=m.error||'已保存';if(m.error)toast(m.error);else{if(pending.close)$('topic-assignment-dialog').close();if(pending.clear)$('new-topic-name').value='';deleteTopic=null;$('topic-delete-confirm').hidden=true;}}render();renderTopicManager();updateTopicBusy();}
 if(m.type==='fox-shiguang-source'){
  const before=items.find(x=>topicKey(x)===activeKey)?.fingerprint;
  const chosen=new Set(items.filter(x=>x.selected).map(x=>x.id)),same=currentSource.page===m.info.page;
  const sortChanged=currentSource.sort!==m.info.sort;currentSource=m.info;if(firstSource||sortChanged){state.sort=m.info.sort==='name-desc'?'title-desc':'title';$('sort').value=state.sort;firstSource=false;}items=m.items.map(x=>({...x,selected:chosen.has(x.id)}));topicSnapshot=m.topics;
  state.tab=currentSource.page==='bookmarks'?'selected':'all';
  if(!same){$('topic-search').value='';state.category='全部';showLibrary();}
  else if(state.view==='desk'){const active=items.find(x=>topicKey(x)===activeKey);if(!active)showLibrary();else if(before!==active.fingerprint||readRequests.has(activeKey)&&originals.get(activeKey)?.loading){releaseOriginals();readRequests.clear();showDesk(active.id);}}
  render();
 }
});
  function updateTopicBusy(){
    const disabled=!!topicPending||!!topicSnapshot.error;
    document.querySelectorAll('#topics-dialog button:not([data-close-topic-dialog]), #topics-dialog input, #topic-assignment-dialog button:not([data-close-topic-dialog]), #topic-assignment-options input').forEach(el=>{
      const i=topicSnapshot.data.categories.findIndex(t=>t.id===el.dataset.topicMove);
      el.disabled=disabled||(i>=0&&(el.dataset.direction==='up'?i===0:i===topicSnapshot.data.categories.length-1));
    });
  }
  function sendTopic(action,target,options={}){
    if(topicPending||topicSnapshot.error)return;
    const request=++topicRequest;topicPending={request,target,...options};$(target).textContent='正在保存…';updateTopicBusy();
    parent.postMessage({type:'fox-shiguang-topics',token:SHIGUANG_TOKEN,request,revision:topicSnapshot.data.revision,action},'*');
  }
  function renderTopicManager(){
    if(!$('topics-dialog').open)return;
    const focus=document.activeElement?.dataset.topicRename,selection=document.activeElement?.selectionStart;
    const drafts=new Map([...$('topic-manager-list').querySelectorAll('[data-topic-rename]')].map(el=>[el.dataset.topicRename,el.value]));
    $('topic-manager-list').innerHTML=topicSnapshot.data.categories.map((t,i)=>`<div class="topic-manager-row"><input data-topic-rename="${esc(t.id)}" aria-label="重命名${esc(t.name)}" maxlength="32" value="${esc(drafts.get(t.id)??t.name)}"><button data-topic-rename-save="${esc(t.id)}">改名</button><button data-topic-move="${esc(t.id)}" data-direction="up" aria-label="上移${esc(t.name)}" ${i===0?'disabled':''}>↑</button><button data-topic-move="${esc(t.id)}" data-direction="down" aria-label="下移${esc(t.name)}" ${i===topicSnapshot.data.categories.length-1?'disabled':''}>↓</button><button data-topic-delete="${esc(t.id)}" aria-label="删除${esc(t.name)}">删除</button></div>`).join('')||'<p class="subtle">暂时没有主题。可以从一个你喜欢的名字开始。</p>';
    $('topic-manager-list').querySelectorAll('[data-topic-rename-save]').forEach(b=>b.onclick=()=>{const id=b.dataset.topicRenameSave;sendTopic({type:'rename',id,name:[...$('topic-manager-list').querySelectorAll('[data-topic-rename]')].find(el=>el.dataset.topicRename===id).value},'topic-manager-error');});
    $('topic-manager-list').querySelectorAll('[data-topic-move]').forEach(b=>b.onclick=()=>sendTopic({type:'move',id:b.dataset.topicMove,direction:b.dataset.direction},'topic-manager-error'));
    $('topic-manager-list').querySelectorAll('[data-topic-delete]').forEach(b=>b.onclick=()=>{deleteTopic=b.dataset.topicDelete;const t=topicSnapshot.data.categories.find(t=>t.id===deleteTopic);$('topic-delete-message').textContent=`删除「${t.name}」的分类定义？原笔记属性、收藏和图片都会保留。`;$('topic-delete-confirm').hidden=false;});
    if(focus){const input=[...$('topic-manager-list').querySelectorAll('[data-topic-rename]')].find(el=>el.dataset.topicRename===focus);input?.focus();if(input&&selection!==null)input.setSelectionRange(selection,selection);}
    updateTopicBusy();
  }
  function openAssignment(id){
    assignmentItem=items.find(x=>x.id===id);if(!assignmentItem)return;
    if(assignmentItem.invalid){toast('文章主题格式有误或原帖 ID 重复，请先在笔记中处理。');return;}if(!topicKey(assignmentItem)){toast('来源标识待处理，不会猜测关联。');return;}
    $('topic-assignment-name').textContent=assignmentItem.title;$('topic-assignment-error').textContent=topicSnapshot.error||'';
    $('topic-assignment-options').innerHTML=topicSnapshot.data.categories.map(t=>`<label class="topic-checkbox"><input type="checkbox" value="${esc(t.id)}" ${topicIds(assignmentItem).includes(t.id)?'checked':''}><span>${esc(t.name)}</span></label>`).join('')||'<p class="subtle">请先在「管理分类」中新建主题，也可以保持未分类。</p>';
    $('topic-assignment-dialog').showModal();updateTopicBusy();
  }
  function openMetadata(id){
    const item=items.find(x=>x.id===id);if(!item)return;
    $('topic-metadata-content').innerHTML=`<h3>${esc(item.title)}</h3><p>${esc(item.source)}</p><p>原帖 ID：${esc(item.noteId||'')}</p><p class="metadata-link">${esc(item.sourceUrl||'无来源链接')}</p><h3>原始标签</h3><div class="raw-tags">${item.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')||'无原始标签'}</div>`;
    $('topic-metadata-dialog').showModal();
  }
  $('manage-topics').onclick=()=>{$('topic-manager-error').textContent=topicSnapshot.error||'';$('topic-delete-confirm').hidden=true;$('topics-dialog').showModal();renderTopicManager();};
  $('topic-create-form').querySelector('button').onclick=()=>sendTopic({type:'create',name:$('new-topic-name').value},'topic-manager-error',{clear:true});
  $('new-topic-name').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('topic-create-form').querySelector('button').click();}};
  $('topic-delete-cancel').onclick=()=>{deleteTopic=null;$('topic-delete-confirm').hidden=true;};
  $('topic-delete-accept').onclick=()=>{if(deleteTopic)sendTopic({type:'delete',id:deleteTopic},'topic-manager-error');};
  $('topic-assignment-save').onclick=()=>{if(assignmentItem)sendTopic({type:'assign',key:topicKey(assignmentItem),ids:[...$('topic-assignment-options').querySelectorAll('input:checked')].map(el=>el.value)},'topic-assignment-error',{close:true});};
  document.querySelectorAll('[data-close-topic-dialog]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $('topic-search').oninput=()=>renderLibrary();

/*DESK_CODE*/
render();
})();
