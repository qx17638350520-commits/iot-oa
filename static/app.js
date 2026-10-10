// Per-key queues make autosave and navigation flush deterministic in HTTP and local modes.
const apiWrites=new Map();
window.api=async function(path,method='GET',data){
  const key=String(path).replace(/^.*\//,''),verb=String(method).toUpperCase();
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))throw new Error('无效的数据类别');
  if(!['GET','POST'].includes(verb))throw new Error('不支持的保存操作');
  // Freeze this call's payload before waiting behind an older save.
  const encoded=verb==='GET'?undefined:JSON.stringify(data);
  if(verb!=='GET'&&encoded===undefined)throw new Error('保存数据不能为空');
  const perform=async()=>{
    if(window.PresetDemo?.enabled)return verb==='GET'?window.PresetDemo.read(key):window.PresetDemo.write(key,JSON.parse(encoded));
    if(location.protocol==='file:'||window.LOCAL_MODE){
      if(verb==='GET')return JSON.parse(localStorage.getItem('iot_'+key)||'null');
      localStorage.setItem('iot_'+key,encoded);return JSON.parse(encoded);
    }
    const response=await fetch('/api/state/'+key,{method:verb,headers:{'Content-Type':'application/json'},...(verb==='GET'?{}:{body:encoded})});
    if(!response.ok)throw new Error('保存失败，请检查本地服务');return response.json();
  };
  if(verb==='GET'){
    const earlier=apiWrites.get(key);if(earlier)await earlier.catch(()=>{});
    return perform();
  }
  const pending=(apiWrites.get(key)||Promise.resolve()).catch(()=>{}).then(perform);
  apiWrites.set(key,pending);
  try{return await pending;}finally{if(apiWrites.get(key)===pending)apiWrites.delete(key);}
};

window.flushApiWrites=()=>Promise.all([...apiWrites.values()]);
window.toast=s=>{const e=document.getElementById('toast');e.textContent=s;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2800)};
window.escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.downloadJSON=(name,data)=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
const names={trainingReplay:'大模型训练回放',multimodal:'多模态应用实验室',transfer:'图像分类训练',learning:'课程学习中心',experiments:'实验任务中心',admin:'教学与数据管理',overview:'工作台',twin:'数字孪生实验室',exams:'题库与考核',annotation:'工业视觉标注',knowledge:'知识图谱与数据'};
let routeGeneration=0,currentRoute='overview';
window.navigate=async function(page,replace=false){const generation=++routeGeneration;const previousArea=document.getElementById('content');previousArea.inert=true;if(!(page in names))page='overview';try{await window.PresetDemo?.stop?.();await window.Twin?.stop?.();window.Exams?.stop?.();await window.Learning?.stop?.();await window.Experiments?.stop?.();await window.Annotation?.stop?.();await window.Knowledge?.stop?.();await window.Transfer?.stop?.();await window.Multimodal?.stop?.();}catch(error){if(generation===routeGeneration){previousArea.inert=false;history.replaceState({},'', '#'+currentRoute);}throw error;}if(generation!==routeGeneration)return;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));currentRoute=page;document.getElementById('breadcrumb').innerHTML='工作空间 <span>/</span> '+names[page];const area=document.getElementById('content');area.innerHTML='';area.inert=false;const c=document.createElement('section');area.appendChild(c);if(location.hash!=='#'+page)history[replace?'replaceState':'pushState']({},'', '#'+page);if(window.PresetDemo?.handles(page))await window.PresetDemo.render(c,page);else if(page==='trainingReplay')await window.PresetReplay.render(c,'knowledge','iot');else if(page==='overview')await overview(c);else {const m={multimodal:window.Multimodal,twin:window.Twin,exams:window.Exams,annotation:window.Annotation,knowledge:window.Knowledge,learning:window.Learning,experiments:window.Experiments,admin:window.Admin,transfer:window.Transfer}[page];if(m)await m.render(c);else c.innerHTML='<div class="card">模块正在加载</div>'};if(generation===routeGeneration)window.scrollTo({top:0,behavior:'instant'})};
window.addEventListener('popstate',()=>navigate(location.hash.slice(1),true));
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
async function overview(c){
  const keys=['questions','results','workspace','learning','experiments','twin','knowledge_workspace','annotation_workspace'];
  const values=await Promise.all(keys.map(key=>api(key)));
  const data=Object.fromEntries(keys.map((key,i)=>[key,values[i]]));
  if(!data.questions)try{data.questions=await fetch('/data/questions.json').then(r=>r.json())}catch{}
  const workspace=data.workspace||{},results=Array.isArray(data.results)?data.results:[];
  const learning=Learning.helpers.normalizeState(data.learning),experiments=Experiments.helpers.normalizeState(data.experiments);
  const courses=Learning.courses, tasks=Experiments.tasks;
  const progress=courses.map(course=>({course,...Learning.helpers.courseProgress(course,learning)}));
  const done=progress.reduce((n,p)=>n+p.done,0),total=progress.reduce((n,p)=>n+p.total,0);
  const reports=tasks.filter(task=>experiments.reports[task.id]).map(task=>({task,record:experiments.reports[task.id],status:Experiments.helpers.reportStatus(task,experiments.reports[task.id])}));
  const submitted=reports.filter(r=>r.status==='已提交').length,pending=results.filter(r=>r.pending).length;
  const date=value=>value&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'尚无记录';
  const pill=(label,kind='gray')=>`<span class="badge ${kind}">${escapeHTML(label)}</span>`;
  const recent=[...reports.map(r=>({title:r.task.title,type:'实验报告',date:r.record.updatedAt||r.record.submittedAt||r.record.startedAt,status:r.status,page:'experiments'})),...results.map(r=>({title:r.title||'考核答卷',type:'考核答卷',date:r.submittedAt,status:r.pending?'待人工评分':'已评分',page:'exams'}))].sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)).slice(0,6);
  c.innerHTML=`<div class="page-head"><div><div class="eyebrow">教学工作台</div><h1>${escapeHTML(workspace.name||'物联网实训工作区')}</h1><p class="muted">${escapeHTML(workspace.className||'课程、实验与考核记录')} · 当前${window.LOCAL_MODE?'浏览器':'本机'}保存的数据</p></div><div class="toolbar"><button class="btn" onclick="navigate('admin')">数据备份</button><button class="btn primary" onclick="navigate('experiments')">进入实验任务</button></div></div>
  <div class="overview-metrics">${[['已完成课时',done,`/ ${total} 节`,'learning'],['进行中实验',reports.length-submitted,'个草稿','experiments'],['已提交报告',submitted,'份本地记录','experiments'],['待人工评分',pending,'份答卷','exams']].map(([label,value,unit,page])=>`<button class="overview-metric" onclick="navigate('${page}')"><span>${label}</span><strong>${value}<small>${unit}</small></strong><span class="metric-link">查看记录 →</span></button>`).join('')}</div>
  <div class="overview-layout"><div class="overview-primary"><section class="card table-card"><div class="section-title"><div><h2>课程进度</h2><p class="muted">按已保存的阅读、实践记录与自检结果统计</p></div><button class="btn" onclick="navigate('learning')">课程中心 →</button></div><div class="table-scroll"><table><thead><tr><th>课程名称</th><th>方向</th><th>完成进度</th><th>状态</th></tr></thead><tbody>${progress.map(p=>`<tr><td><button class="text-button" onclick="navigate('learning')">${escapeHTML(p.course.title)}</button></td><td class="muted">${escapeHTML(p.course.category)}</td><td><div class="progress-cell"><span class="progress-track"><i style="width:${p.percent}%"></i></span><span>${p.done}/${p.total}</span></div></td><td>${pill(p.percent===100?'已完成':p.course.lessons.some(l=>learning.lessons[l.id]?.openedAt)?'进行中':'未开始',p.percent===100?'':'gray')}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="card table-card"><div class="section-title"><div><h2>最近成果记录</h2><p class="muted">实验报告与已提交答卷</p></div><button class="btn" onclick="navigate('exams')">查看考核</button></div>${recent.length?`<div class="table-scroll"><table><thead><tr><th>记录名称</th><th>类型</th><th>状态</th><th>更新时间</th></tr></thead><tbody>${recent.map(r=>`<tr><td><button class="text-button" onclick="navigate('${r.page}')">${escapeHTML(r.title)}</button></td><td>${r.type}</td><td>${pill(r.status,r.status==='待人工评分'?'amber':'gray')}</td><td class="muted">${date(r.date)}</td></tr>`).join('')}</tbody></table></div>`:`<div class="dashboard-empty"><span class="empty-symbol">▤</span><h3>还没有成果记录</h3><p>开始一个实验并保存报告，或完成一次考核，记录就会显示在这里。</p><button class="btn" onclick="navigate('experiments')">查看实验任务</button></div>`}</section></div>
  <div class="overview-secondary"><section class="card"><h2>当前任务</h2><div class="task-line"><span class="task-mark"></span><div><strong>${reports.length-submitted?'继续未完成的实验':'开始一项实验任务'}</strong><p>${reports.length-submitted?`有 ${reports.length-submitted} 份实验草稿尚未提交。`:'选择实验、完成操作步骤并记录观察结果。'}</p><button class="text-button" onclick="navigate('experiments')">进入实验工作台 →</button></div></div>${pending?`<div class="task-line"><span class="task-mark amber"></span><div><strong>完成主观题评分</strong><p>${pending} 份答卷等待人工评分。</p><button class="text-button" onclick="navigate('exams')">查看待评分答卷 →</button></div></div>`:''}<div class="task-line"><span class="task-mark gray"></span><div><strong>导出工作区备份</strong><p>浏览器之间不会自动同步，重要记录请及时导出。</p><button class="text-button" onclick="navigate('admin')">管理数据 →</button></div></div></section>
  <section class="card"><h2>工作区状态</h2><dl class="status-list">${[['题库',`${Array.isArray(data.questions)?data.questions.length:0} 道题`],['数字孪生',data.twin?'已有保存场景':'尚未保存'],['视觉标注',data.annotation_workspace?'已有保存记录':'尚未保存'],['知识数据',data.knowledge_workspace?'已有保存记录':'尚未保存'],['设备连接','未连接 · 本地仿真'],['训练执行','未执行 · 仅准备配置']].map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></section>
  <section class="card"><h2>教学公告</h2><p class="announcement">${escapeHTML(workspace.notice||'暂无教学公告。可在工作区设置中填写课程安排或实验要求。')}</p>${workspace.teacher?`<span class="muted">授课教师：${escapeHTML(workspace.teacher)}</span>`:''}</section></div></div>`;
}

(window.PresetDemo?window.PresetDemo.initialize():Promise.resolve()).then(()=>navigate(location.hash.slice(1) in names?location.hash.slice(1):'overview',true)).catch(e=>toast(e.message));
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);toast('操作未完成：'+(e.reason?.message||'请检查输入并重试'))});
