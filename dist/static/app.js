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
    if(location.protocol==='file:'||window.LOCAL_MODE){
      if(verb==='GET')return JSON.parse(localStorage.getItem('logistics_v1_'+key)||'null');
      localStorage.setItem('logistics_v1_'+key,encoded);return JSON.parse(encoded);
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

window.toast=s=>{const e=document.getElementById('toast');e.textContent=s;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2800)};
window.escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.downloadJSON=(name,data)=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
const names={application:'应用开发实验台',wiring:'端子与射频实验',transfer:'图像迁移学习',overview:'物流作业工作台',warehouse:'仓储与库存',transport:'运输调度',coldchain:'冷链监控',alarms:'告警处置',drone:'低空物流仿真',analytics:'消费行为分析',labs:'技术实训台',neural:'神经网络实验',cases:'综合实践案例',reports:'实训证据与报告',calendar:'教学日历',learning:'物联网基础课程',experiments:'基础实验任务',admin:'教学与数据管理',twin:'数字孪生实验室',exams:'题库与考核',annotation:'视觉检测与标注',knowledge:'知识图谱与数据'};
let routeGeneration=0,currentRoute='overview';
window.navigate=async function(page,replace=false){const generation=++routeGeneration;const previousArea=document.getElementById('content');previousArea.inert=true;if(!(page in names))page='overview';try{await window.Logistics?.stop?.();await window.HardwareLab?.stop?.();await window.Transfer?.stop?.();await window.ApplicationLab?.stop?.();await window.Extras?.stop?.();await window.Twin?.stop?.();window.Exams?.stop?.();await window.Learning?.stop?.();await window.Experiments?.stop?.();await window.Annotation?.stop?.();await window.Knowledge?.stop?.();}catch(error){if(generation===routeGeneration){previousArea.inert=false;history.replaceState({},'', '#'+currentRoute);}throw error;}if(generation!==routeGeneration)return;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));currentRoute=page;document.getElementById('breadcrumb').textContent='现代物流实训 / '+names[page];const area=document.getElementById('content');area.innerHTML='';area.inert=false;const c=document.createElement('section');area.appendChild(c);if(location.hash!=='#'+page)history[replace?'replaceState':'pushState']({},'', '#'+page);if(page==='application')await ApplicationLab.render(c);else if(page==='wiring')await HardwareLab.render(c);else if(page==='transfer')await Transfer.render(c);else if(['overview','warehouse','transport','coldchain','alarms','reports','calendar','cases'].includes(page))await Logistics.render(c,page);else if(['drone','analytics','labs','neural'].includes(page))await Extras.render(c,page);else {const m={twin:window.Twin,exams:window.Exams,annotation:window.Annotation,knowledge:window.Knowledge,learning:window.Learning,experiments:window.Experiments,admin:window.Admin}[page];if(m)await m.render(c)}if(generation===routeGeneration)window.scrollTo({top:0,behavior:'instant'})};
window.addEventListener('popstate',()=>navigate(location.hash.slice(1),true));document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
navigate(location.hash.slice(1) in names?location.hash.slice(1):'overview',true).catch(e=>toast(e.message));window.addEventListener('unhandledrejection',e=>{console.error(e.reason);toast('操作未完成：'+(e.reason?.message||'请检查输入并重试'))});
