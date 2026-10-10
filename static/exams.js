/* IoT Academy exam workbench. Self-contained, dependency-free demonstration module.
 * Local assignment: audience {mode:'all'|'assigned',classIds:[],studentIds:[]};
 * opensAt/closesAt are ISO timestamps. Profiles filter UI and are not authentication.
 * compound.items: objective/custom child questions with positive weight; child points
 * are derived proportionally from the parent total. No nested compound questions.
 * custom.fields: {id,label,kind:'text'|'multiline'|'number',required};
 * custom.rubric: {id,label,weight,fieldId?}. Every custom criterion is manual.
 * Missing compound.items or custom.fields/rubric preserves legacy manual grading.
 */
(() => {
  'use strict';
  const TYPES = { single: '单选题', multiple: '多选题', truefalse: '判断题', fill: '填空题', compound: '组合题', custom: '自定义题' };
  const LEVELS = ['初级', '中级', '高级'];
  const DRAFT_KEY = window.PresetDemo?.enabled?window.PresetDemo.storageKey('exam_draft'):'iot-academy-exam-draft-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const copy = value => JSON.parse(JSON.stringify(value));
  const normalize = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const say = message => window.toast ? window.toast(message) : window.alert(message);
  const sum = rows => round(rows.reduce((n, q) => n + Number(q.points || 0), 0));
  const date = value => new Date(value).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const letters = index => String.fromCharCode(65 + index);
  const structured = q => q.type === 'compound' && Array.isArray(q.items) && q.items.length > 0;
  const isManual = q => q.type === 'custom' || (q.type === 'compound' && (!structured(q) || q.items.some(isManual)));
  const round = n => Math.round((Number(n) + Number.EPSILON) * 1000000) / 1000000;
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_\-:.]{1,120}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
  const PROFILE_KEY = window.PresetDemo?.enabled?window.PresetDemo.storageKey('exam_profile'):'iot-academy-local-student-v1';
  function weightedPoints(rows, points) {
    const total=rows.reduce((n,row)=>n+Number(row.weight),0);let used=0;
    return rows.map((row,i)=>{const part=i===rows.length-1?round(points-used):round(points*row.weight/total);used=round(used+part);return part;});
  }
  function normalizeRoster(raw) {
    const w=object(raw)?raw:{},classes=Array.isArray(w.classes)&&w.classes.length?w.classes.filter(c=>object(c)&&typeof c.id==='string'&&typeof c.name==='string').map(c=>({id:c.id,name:c.name})):[{id:'class-default',name:String(w.className||'默认班级')}];
    return {classes,students:(Array.isArray(w.students)?w.students:[]).filter(s=>object(s)&&typeof s.id==='string'&&typeof s.name==='string').map(s=>({id:s.id,name:s.name,group:String(s.group||''),classId:String(s.classId||'class-default')}))};
  }
  function validateExamAssignment(raw={}) {
    const source=raw.audience==null?{mode:'all'}:raw.audience;
    if(!object(source)||!['all','assigned'].includes(source.mode))throw Error('分配范围须为 all 或 assigned。');
    const ids=key=>{const rows=source[key]??[];if(!Array.isArray(rows)||rows.length>5000||rows.some(id=>typeof id!=='string'||!id.trim()||id.length>120))throw Error('班级或学员 ID 列表无效。');return [...new Set(rows)];};
    const audience={mode:source.mode,classIds:ids('classIds'),studentIds:ids('studentIds')};
    if(audience.mode==='assigned'&&!audience.classIds.length&&!audience.studentIds.length)throw Error('请至少分配一个班级或一名学员。');
    if(audience.mode==='all'){audience.classIds=[];audience.studentIds=[];}
    const time=key=>{if(raw[key]==null||raw[key]==='')return '';if(typeof raw[key]!=='string'||!Number.isFinite(Date.parse(raw[key])))throw Error('考试开放/截止时间无效。');return new Date(raw[key]).toISOString();};
    const opensAt=time('opensAt'),closesAt=time('closesAt');
    if(opensAt&&closesAt&&Date.parse(closesAt)<=Date.parse(opensAt))throw Error('截止时间必须晚于开放时间。');
    return {audience,opensAt,closesAt};
  }
  function examAvailability(exam, student, now=Date.now()) {
    let assignment;try{assignment=validateExamAssignment(exam);}catch(_){return {visible:false,canStart:false,reason:'分配设置无效'};}
    const matched=assignment.audience.mode==='all'||!!student&&(assignment.audience.studentIds.includes(student.id)||assignment.audience.classIds.includes(student.classId));
    if(!exam.published||!matched)return {visible:false,canStart:false,reason:!exam.published?'尚未发布':'未分配给当前学员'};
    if(assignment.opensAt&&now<Date.parse(assignment.opensAt))return {visible:true,canStart:false,reason:'尚未开放'};
    if(assignment.closesAt&&now>=Date.parse(assignment.closesAt))return {visible:true,canStart:false,reason:'已截止'};
    return {visible:true,canStart:true,reason:'可参加'};
  }
  function selectedStudent(){return roster.students.find(s=>s.id===profileId)||null;}
  function studentSelector(field='profile') {return `<select aria-label="本地学员档案" data-field="${field}"><option value="">访客（仅公开考试）</option>${roster.students.map(s=>`<option value="${esc(s.id)}" ${profileId===s.id?'selected':''}>${esc(s.name)} · ${esc(s.id)} · ${esc(roster.classes.find(c=>c.id===s.classId)?.name||s.classId)}</option>`).join('')}</select>`;}
  function resultRows(){return role==='teacher'?results:results.filter(r=>profileId?r.studentId===profileId:!r.studentId);}
  function assignmentLabel(e){const a=e.audience;if(!a||a.mode==='all')return '全部本地学员 / 访客';return [...(a.classIds||[]).map(id=>roster.classes.find(c=>c.id===id)?.name||`班级 ${id}`),...(a.studentIds||[]).map(id=>roster.students.find(s=>s.id===id)?.name||`学员 ${id}`)].join('、');}
  function assignmentFields(value) {
    const a=value.audience||{mode:'all',classIds:[],studentIds:[]};
    const localTime=v=>{if(!v)return '';const d=new Date(v);if(!Number.isFinite(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
    return `<label class="ex-field">考试分配范围<select data-audience-mode><option value="all" ${a.mode==='all'?'selected':''}>全部本地学员 / 访客</option><option value="assigned" ${a.mode==='assigned'?'selected':''}>指定班级 / 学员（任一匹配）</option></select></label>${a.mode==='assigned'?`<div class="ex-answer-note"><strong>班级</strong>${roster.classes.map(c=>`<label class="ex-flex"><input type="checkbox" data-audience-class="${esc(c.id)}" ${(a.classIds||[]).includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')}<strong>学员</strong>${roster.students.map(s=>`<label class="ex-flex"><input type="checkbox" data-audience-student="${esc(s.id)}" ${(a.studentIds||[]).includes(s.id)?'checked':''}>${esc(s.name)} · ${esc(s.id)}</label>`).join('')||'<p>请先在教学管理录入学员。</p>'}</div>`:''}<label class="ex-field">开放时间（本机时区，可留空）<input type="datetime-local" data-assignment-time="opensAt" value="${esc(localTime(value.opensAt))}"></label><label class="ex-field">截止时间（本机时区，可留空）<input type="datetime-local" data-assignment-time="closesAt" value="${esc(localTime(value.closesAt))}"></label><p class="ex-hint">本地名单筛选，不是登录或权限认证。截止时间到达会结束本次作答。</p>`;
  }

  let host, questions = [], exams = [], results = [], loaded = false, loading = null, active = false;
  let tab = 'exams', role = 'teacher', search = '', filterType = '', filterCategory = '', editor = null;
  let builder = null, attempt = null, report = null, ticker = null, submitting = false, renderToken = 0;
  let roster={classes:[],students:[]},profileId='';
  try {profileId=localStorage.getItem(PROFILE_KEY)||'';} catch(_) {}

  const style = `<style>
  .ex-workbench{--ex-blue:#2563eb;--ex-ink:#172b4d;color:var(--ex-ink);font-size:14px}.ex-workbench *{box-sizing:border-box}.ex-workbench button{font:inherit;cursor:pointer}.ex-workbench input,.ex-workbench select,.ex-workbench textarea{font:inherit}.ex-workbench button:disabled{cursor:not-allowed;opacity:.5}.ex-toolbar,.ex-flex,.ex-card-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.ex-toolbar{justify-content:space-between;margin:0 0 22px}.ex-tabs{display:flex;gap:7px;flex-wrap:wrap}.ex-tabs button,.ex-role button{border:0;background:transparent;padding:10px 16px;border-radius:9px;color:#61718a}.ex-tabs button.active{background:#eaf1ff;color:#2563eb;font-weight:650}.ex-role{display:flex;background:#eff3f8;border-radius:10px;padding:3px}.ex-role button{padding:7px 13px;font-size:12px}.ex-role button.active{background:white;color:#1f3f67;box-shadow:0 1px 4px #162c4510}.ex-banner{display:flex;justify-content:space-between;gap:22px;border:1px solid #dbe7fc;background:linear-gradient(105deg,#f0f6ff,#f7faff);border-radius:15px;padding:25px 28px;margin-bottom:22px;align-items:center}.ex-banner h2{margin:4px 0 9px;font-size:24px;letter-spacing:-.5px}.ex-kicker{font-size:12px;letter-spacing:1.8px;color:#5a7daa;font-weight:700}.ex-banner p{margin:0;color:#728098;font-size:13px;line-height:1.8}.ex-orbit{width:76px;height:76px;flex-shrink:0;background:#fff;border:1px solid #e0eafa;border-radius:22px;display:grid;place-items:center;font-size:34px;color:#2563eb;box-shadow:0 8px 30px #2762bf0a}.ex-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin:0 0 24px}.ex-stat{border:1px solid #e5ebf3;border-radius:12px;background:#fff;padding:17px 19px}.ex-stat small{display:block;color:#8490a3;font-size:12px}.ex-stat strong{display:block;font-size:27px;font-weight:650;margin:9px 0 3px}.ex-stat span{font-size:12px;color:#7c8ba0}.ex-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.ex-exam-card{background:#fff;border:1px solid #e3eaf3;border-radius:14px;padding:23px;transition:transform .15s,box-shadow .15s}.ex-exam-card:hover{transform:translateY(-2px);box-shadow:0 8px 26px #2642660b}.ex-card-top{justify-content:space-between;margin-bottom:20px}.ex-type-icon{background:#edf3ff;width:42px;height:42px;display:grid;place-items:center;border-radius:12px;font-size:21px;color:#4777ce}.ex-exam-card h3{font-size:17px;margin:0 0 9px}.ex-exam-card p{color:#8090a5;font-size:12px;line-height:1.75;min-height:21px}.ex-meta{display:flex;gap:18px;color:#7b899e;font-size:12px;margin:22px 0;padding-bottom:20px;border-bottom:1px solid #f0f3f8}.ex-bottom{display:flex;gap:9px;align-items:center;justify-content:space-between;flex-wrap:wrap}.ex-pill{font-size:12px;padding:5px 9px;border-radius:6px;background:#f0f4fa;color:#77869c;white-space:nowrap}.ex-pill.blue{background:#edf3ff;color:#4e7ac4}.ex-pill.green{background:#eaf8f2;color:#2e9570}.ex-pill.orange{background:#fff4e8;color:#c98b3a}.ex-empty{text-align:center;padding:55px 20px;border:1px dashed #d9e2ef;border-radius:13px;color:#8a99ae;background:#fafcfe}.ex-empty strong{display:block;color:#536781;font-size:16px;margin-bottom:8px}.ex-hint{font-size:12px;line-height:1.75;color:#8190a4;margin:15px 0}.ex-filter{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.ex-filter input{flex:1;min-width:180px}.ex-workbench input:not([type=checkbox]):not([type=radio]),.ex-workbench select,.ex-workbench textarea{border:1px solid #dfe6ef;border-radius:8px;padding:10px 12px;background:#fff;color:#3f526f;outline:none}.ex-workbench input:focus,.ex-workbench textarea:focus,.ex-workbench select:focus{border-color:#8bb0f8;box-shadow:0 0 0 3px #edf3ff}.ex-workbench input[type=checkbox],.ex-workbench input[type=radio]{accent-color:#2563eb;width:16px;height:16px;flex-shrink:0}.ex-workbench .btn{border:1px solid #dfe7f1;border-radius:8px;background:white;color:#546780;padding:9px 14px;display:inline-flex;align-items:center;justify-content:center;gap:7px;text-decoration:none}.ex-workbench .btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.ex-workbench .btn.small{font-size:12px;padding:6px 10px}.ex-workbench .btn.danger{color:#c25d60;border-color:#f0dadd}.ex-bank{border:1px solid #e2e9f2;border-radius:13px;background:#fff;overflow:hidden}.ex-qrow{display:flex;gap:13px;padding:19px 21px;border-bottom:1px solid #edf1f6;align-items:flex-start}.ex-qrow:last-child{border-bottom:0}.ex-qbody{flex:1;min-width:0}.ex-qbody h4{margin:8px 0 5px;font-size:14px;font-weight:550;line-height:1.7}.ex-qtags{display:flex;gap:8px;align-items:center;font-size:12px;color:#95a1b2}.ex-qindex{color:#97a5b9;font-size:12px;min-width:23px;padding-top:6px}.ex-qactions{display:flex;gap:7px;padding-top:3px}.ex-modal-backdrop{position:fixed;inset:0;background:#10213a61;z-index:1100;display:flex;align-items:center;justify-content:center;padding:22px;backdrop-filter:blur(3px)}.ex-modal{background:#fff;border-radius:17px;width:min(760px,100%);max-height:90vh;overflow:auto;padding:28px;box-shadow:0 24px 80px #10213a30}.ex-modal h2{font-size:21px;margin:0}.ex-modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:12px}.ex-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}.ex-field{display:flex;flex-direction:column;gap:7px;font-size:12px;color:#75869d}.ex-field.full{grid-column:1/-1}.ex-field input,.ex-field textarea,.ex-field select{width:100%}.ex-modal-footer{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.ex-builder{display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:20px}.ex-builder-side{background:#fff;border:1px solid #e3eaf2;border-radius:13px;padding:20px;align-self:start;position:sticky;top:22px}.ex-builder-side .ex-field{margin-bottom:16px}.ex-builder-side h3{margin:0 0 18px}.ex-quiz{display:grid;grid-template-columns:minmax(0,1fr) 238px;gap:22px}.ex-question{background:#fff;border:1px solid #e4eaf3;border-radius:13px;padding:23px;margin:0 0 17px;scroll-margin-top:24px}.ex-question h3{font-size:15px;font-weight:550;line-height:1.9;margin:13px 0 18px}.ex-option{display:flex;align-items:center;gap:11px;border:1px solid #e6ebf3;border-radius:9px;padding:13px 15px;margin-top:9px;line-height:1.7;cursor:pointer;transition:border-color .15s}.ex-option:has(input:checked){border-color:#9bbbfa;background:#f5f8ff}.ex-option>span{color:#6f86a4;font-size:12px}.ex-answer-text{width:100%;min-height:110px;resize:vertical}.ex-quiz-side{position:sticky;top:22px;align-self:start;padding:23px;background:#fff;border:1px solid #e4eaf3;border-radius:13px}.ex-clock{font-size:31px;font-variant-numeric:tabular-nums;color:#2563eb;letter-spacing:1px;margin:8px 0 21px}.ex-map{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:17px 0}.ex-map button{border:1px solid #e0e7f1;background:#fff;border-radius:6px;padding:7px 0;color:#8a97a9;font-size:12px}.ex-map button.answered{color:#2563eb;background:#edf3ff;border-color:#b8cefa}.ex-progress{height:5px;background:#edf1f7;border-radius:5px;overflow:hidden;margin:12px 0}.ex-progress span{display:block;height:100%;background:#5a86e1;transition:width .2s}.ex-score{display:flex;gap:28px;align-items:center;background:linear-gradient(120deg,#f0f6ff,#fafcff);border:1px solid #dce8fc;padding:29px;border-radius:14px;margin-bottom:24px}.ex-score-circle{width:116px;height:116px;border:7px solid #dce9ff;background:#fff;border-radius:50%;display:flex;flex-direction:column;justify-content:center;align-items:center;flex-shrink:0}.ex-score-circle strong{font-size:30px;color:#2e66c5}.ex-score-circle small{color:#8798ae;font-size:12px}.ex-score h2{margin:0 0 9px;font-size:22px}.ex-answer-note{padding:13px 16px;background:#f5f8fc;border-radius:9px;margin-top:14px;line-height:1.8;font-size:12px;color:#6e809a;white-space:pre-wrap}.ex-answer-note.correct{background:#f0faf5;color:#4e8e72}.ex-answer-note.wrong{background:#fff5f3;color:#b57d70}.ex-table-wrap{overflow:auto;border:1px solid #e4eaf3;border-radius:13px;background:#fff}.ex-workbench table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}.ex-workbench th{background:#f7f9fc;color:#8190a5;font-size:12px;letter-spacing:.3px;font-weight:550;text-align:left;padding:14px 18px}.ex-workbench td{padding:17px 18px;border-top:1px solid #eef2f6;color:#5c708e}.ex-breakdown{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:22px}.ex-breakdown-card{background:#fff;padding:20px;border:1px solid #e4eaf3;border-radius:12px}.ex-breakdown-card h3{font-size:14px;margin:0 0 18px}.ex-bar-row{margin-top:12px;display:grid;grid-template-columns:90px 1fr 43px;align-items:center;gap:12px;font-size:12px;color:#7c8da6}.ex-bar-row i{height:7px;border-radius:5px;background:#edf2fa;overflow:hidden}.ex-bar-row i span{display:block;height:100%;background:#7b9de4;border-radius:5px}.ex-message{padding:17px 20px;border:1px solid #dce7fa;background:#f4f8ff;border-radius:12px;line-height:1.8;font-size:13px;color:#6f87a8;margin-bottom:20px}.ex-workbench .ex-hidden{display:none}.ex-question pre{white-space:pre-wrap;font:inherit}.ex-grading{display:flex;gap:12px;align-items:center;margin-top:15px}.ex-grading input{max-width:100px}.ex-grading label{font-size:12px;color:#7c8da5}@media(max-width:1000px){.ex-builder,.ex-quiz{grid-template-columns:1fr}.ex-builder-side,.ex-quiz-side{position:static}.ex-quiz-side{order:-1}.ex-map{grid-template-columns:repeat(10,1fr)}.ex-grid{grid-template-columns:1fr}.ex-stats{gap:9px}.ex-stat{padding:14px}}@media(max-width:600px){.ex-stats{grid-template-columns:repeat(2,1fr)}.ex-fields,.ex-breakdown{grid-template-columns:1fr}.ex-field.full{grid-column:auto}.ex-banner{padding:20px}.ex-orbit{display:none}.ex-banner h2{font-size:21px}.ex-toolbar{gap:15px}.ex-score{gap:17px;padding:20px}.ex-score-circle{width:87px;height:87px}.ex-score h2{font-size:18px}.ex-qrow{padding:15px 12px}.ex-qactions{flex-direction:column}.ex-modal{padding:22px}.ex-tabs button{padding:8px 12px}.ex-meta{gap:12px;font-size:12px}}
  </style>`;

  function mergeSupplement(existing, incoming) {
    if(!Array.isArray(existing)||!Array.isArray(incoming))throw Error('增量题库格式错误');
    const additions=incoming.map(q=>validateQuestion(q));
    if(new Set(additions.map(q=>q.id)).size!==additions.length||additions.some(q=>!/^iot-(?:ext|p2)-/.test(q.id)))throw Error('增量题库 ID 无效');
    const ids=new Set(existing.map(q=>q.id)),titles=new Set(existing.map(q=>normalize(q.title))),added=[],conflicts=[];
    for(const q of additions){if(ids.has(q.id)||titles.has(normalize(q.title))){conflicts.push(q.id);continue;}ids.add(q.id);titles.add(normalize(q.title));added.push(q);}
    return {questions:[...existing,...added],added:added.length,conflicts};
  }
  async function installSupplement() {
    const key='question_bank_update_20261010';
    try {
      const applied=await api('/api/state/'+key);if(applied?.completed)return;
      const response=await fetch('/static/question-bank/supplement.json');if(!response.ok)return;
      const batch=await response.json();if(batch.schema!=='iot-question-supplement/v1')return;
      const merged=mergeSupplement(questions,batch.questions);
      const backupKey=key+'_backup';
      if(merged.added&&!await api('/api/state/'+backupKey))await api('/api/state/'+backupKey,'POST',questions);
      if(merged.added){await api('/api/state/questions','POST',merged.questions);questions=merged.questions;}
      await api('/api/state/'+key,'POST',{completed:true,version:batch.version,added:merged.added,conflicts:merged.conflicts,backupKey});
    } catch(error){say('原创增量题库暂未加载，已有题目保留：'+error.message);}
  }
  function canonicalQuestion(value){if(Array.isArray(value))return '['+value.map(canonicalQuestion).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalQuestion(value[k])).join(',')+'}';return JSON.stringify(value);}
  async function applySeedCorrections(existing,corrections){
    const rows=copy(existing),changed=[],preserved=[];
    for(const correction of corrections||[]){
      if(correction.before?.id!==correction.after?.id||correction.before?.id!=='iot-q035')throw Error('种子更正 ID 无效');
      const index=rows.findIndex(q=>q.id===correction.before.id);if(index<0)continue;
      if(canonicalQuestion(rows[index])===canonicalQuestion(validateQuestion(correction.after)))continue;
      if(canonicalQuestion(rows[index])!==canonicalQuestion(correction.before)){preserved.push(rows[index].id);continue;}
      if(!globalThis.crypto?.subtle)throw Error('当前浏览器不支持安全摘要，保留原题并稍后重试');
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalQuestion(rows[index])));
      const hash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
      if(hash!==correction.beforeCanonicalSha256)throw Error('原题摘要不匹配，已阻止更正');
      rows[index]=validateQuestion(correction.after);changed.push(rows[index].id);
    }
    return {questions:rows,changed,preserved};
  }
  async function installPhase2(){
    const key='question_bank_update_20261010_phase2_v1';
    try{
      if((await api('/api/state/'+key))?.completed)return;
      const response=await fetch('/static/question-bank/phase2/supplement.json');if(!response.ok)throw Error('无法读取第二阶段题库文件');
      const batch=await response.json();if(batch.schema!=='iot-question-supplement/v2'||batch.version!=='20261010_phase2_v1'||!Array.isArray(batch.questions)||batch.questions.some(q=>!String(q.id).startsWith('iot-p2-')))throw Error('第二阶段题库清单无效');
      const corrected=await applySeedCorrections(questions,batch.seedCorrections);
      const merged=mergeSupplement(corrected.questions,batch.questions),backupKey=key+'_backup';
      if((merged.added||corrected.changed.length)&&!await api('/api/state/'+backupKey))await api('/api/state/'+backupKey,'POST',questions);
      if(merged.added||corrected.changed.length){await api('/api/state/questions','POST',merged.questions);questions=merged.questions;}
      await api('/api/state/'+key,'POST',{completed:true,version:batch.version,added:merged.added,conflicts:merged.conflicts,corrected:corrected.changed,preservedEdits:corrected.preserved,backupKey});
    }catch(error){say('第二阶段原创题库更新未完成，原有数据保留：'+error.message);}
  }
  async function initialize() {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      const values = await Promise.all(['questions','exams','results'].map(key => api(`/api/state/${key}`)));
      questions = values[0]; exams = values[1]; results = values[2];
      if (!Array.isArray(questions)) {
        const response = await fetch('/data/questions.json');
        if (!response.ok) throw new Error('示例题库加载失败');
        questions = await response.json();
        await api('/api/state/questions','POST',questions);
      }
      await installSupplement();
      await installPhase2();
      if (!Array.isArray(exams)) {
        exams = [
          {id:'exam-foundation',title:'物联网基础能力测评',description:'从感知到连接，检验你的物联网基础知识。',duration:30,passRate:60,published:true,createdAt:new Date().toISOString(),questions:copy(questions.filter(q => ['iot-q001','iot-q002','iot-q003','iot-q005','iot-q006','iot-q008','iot-q010','iot-q011','iot-q013','iot-q025','iot-q026','iot-q033'].includes(q.id)))},
          {id:'exam-engineering',title:'物联网工程实践进阶',description:'围绕嵌入式开发、可靠通信与设备安全的综合练习。',duration:45,passRate:60,published:true,createdAt:new Date().toISOString(),questions:copy(questions.filter(q => ['iot-q007','iot-q009','iot-q012','iot-q014','iot-q015','iot-q018','iot-q020','iot-q021','iot-q024','iot-q035','iot-q039'].includes(q.id)))}
        ].filter(e => e.questions.length);
        await api('/api/state/exams','POST',exams);
      }
      if (!Array.isArray(results)) results = [];
      loaded = true;
    })();
    try { await loading; } finally { loading = null; }
  }
  function stats() {
    const rows=resultRows(),graded = rows.filter(r => !r.pending);
    const avg = graded.length ? Math.round(graded.reduce((n,r) => n + r.score / r.maxScore * 100,0) / graded.length) : null;
    return `<div class="ex-stats"><div class="ex-stat"><small>原创示例题库</small><strong>${questions.length}<span> 道</span></strong><span>6 种题型 · 增量草稿待教师审核</span></div><div class="ex-stat"><small>已发布试卷</small><strong>${exams.filter(e=>role==='teacher'?e.published:examAvailability(e,selectedStudent()).visible).length}<span> 份</span></strong><span>自主组卷 · 在线作答</span></div><div class="ex-stat"><small>答卷记录</small><strong>${rows.length}<span> 份</span></strong><span>${rows.filter(r=>r.pending).length} 份待人工评分</span></div><div class="ex-stat"><small>平均得分率</small><strong>${avg === null ? '—' : avg + '<span>%</span>'}</strong><span>仅统计已完成评分的答卷</span></div></div>`;
  }
  function shell(content) {
    return `${style}<div class="ex-workbench"><div class="ex-toolbar"><div class="ex-tabs"><button data-action="tab" data-tab="exams" class="${tab==='exams'?'active':''}">考试中心</button><button data-action="tab" data-tab="bank" class="${tab==='bank'?'active':''}">题库管理</button><button data-action="tab" data-tab="results" class="${tab==='results'?'active':''}">成绩分析</button></div><div class="ex-flex"><span class="ex-hint" style="margin:0">角色视图</span><div class="ex-role"><button data-action="role" data-role="teacher" class="${role==='teacher'?'active':''}">教师</button><button data-action="role" data-role="student" class="${role==='student'?'active':''}">学生</button></div></div></div>${content}<p class="ex-hint">本地教学演示：角色及学员档案切换不是登录或权限认证。客观题和结构化组合题中的客观小题自动评分；自定义题、旧版文本组合题由教师评分。</p>${editor ? editorMarkup() : ''}</div>`;
  }
  function draw() {
    if (!active || !host || !host.isConnected) return;
    clearInterval(ticker); ticker = null;
    host.innerHTML = shell(attempt ? quizMarkup() : report ? reportMarkup() : builder ? builderMarkup() : tab === 'bank' ? bankMarkup() : tab === 'results' ? resultsMarkup() : examsMarkup());
    if (attempt) startTimer();
  }
  function filterQuestions() {
    const needle = search.trim().toLowerCase();
    return questions.filter(q=>(!filterType||q.type===filterType)&&(!filterCategory||q.category===filterCategory)&&(!needle||`${q.title} ${q.category} ${q.id}`.toLowerCase().includes(needle)));
  }
  function filters() {
    return `<div class="ex-filter"><input aria-label="搜索题目" data-field="search" placeholder="搜索题目内容或知识领域…" value="${esc(search)}"><select aria-label="题型筛选" data-field="filterType"><option value="">全部题型</option>${Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${filterType===k?'selected':''}>${v}</option>`).join('')}</select><select aria-label="知识领域筛选" data-field="filterCategory"><option value="">全部知识领域</option>${[...new Set(questions.map(q=>q.category))].map(v=>`<option ${filterCategory===v?'selected':''}>${esc(v)}</option>`).join('')}</select></div>`;
  }
  function readDraft() { try { const raw=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null'); if(!object(raw)||!raw.id||typeof raw.name!=='string'||!Number.isFinite(raw.startedAt)||!Number.isFinite(raw.deadline)||!object(raw.answers))return null; const exam=validateExam(raw.exam);for(const [key,value] of Object.entries(raw.answers)){if(!/^(0|[1-9][0-9]*)$/.test(key)||!exam.questions[Number(key)])return null;validateAnswer(exam.questions[Number(key)],value);}return {...raw,exam}; } catch (_) {return null;} }
  function saveDraft() { if(attempt) {try { localStorage.setItem(DRAFT_KEY,JSON.stringify(attempt)); } catch (_) { /* An unavailable local store does not block the active exam. */ } } }
  function clearDraft() { try {localStorage.removeItem(DRAFT_KEY);} catch (_) {} }
  function examsMarkup() {
    const student=selectedStudent(),visible=exams.filter(e=>role==='teacher'||examAvailability(e,student).visible),draft=readDraft();
    return `<div class="ex-banner"><div><span class="ex-kicker">KNOWLEDGE INTO PRACTICE</span><h2>检验所学，向进阶出发</h2><p>从基础概念到工程实践，用每一次练习看见自己的成长。</p></div><div class="ex-orbit">◎</div></div>${stats()}${role==='student'?`<div class="ex-filter"><label class="ex-field">选择本地学员档案${studentSelector()}</label><p class="ex-hint">名单来自教学与工作区管理。这里只筛选教学记录，不验证身份。</p></div>`:''}<div class="ex-toolbar"><div><h3 style="font-size:17px;margin:0">${role==='teacher'?'我的试卷':'分配给我的考试'}</h3><p class="ex-hint" style="margin:6px 0 0">${role==='teacher'?'从题库自由选题，分配给班级或学员，并设置开放时间。':'仅显示已发布且分配范围匹配当前本地档案的试卷。'}</p></div>${role==='teacher'?'<button class="btn primary" data-action="build">＋ 创建试卷</button>':''}</div>${visible.length?`<div class="ex-grid">${visible.map(e=>{const availability=examAvailability(e,student),ownDraft=draft?.exam.id===e.id&&(draft.studentId||'')===profileId,canResume=ownDraft&&availability.visible&&availability.reason==='已截止';return `<article class="ex-exam-card"><div class="ex-card-top"><span class="ex-type-icon">▤</span><span class="ex-pill ${e.published?'green':'orange'}">${e.published?'已发布':'草稿'}</span></div><h3>${esc(e.title)}</h3><p>${esc(e.description||'自定义知识测评')}</p><p>分配：${esc(assignmentLabel(e))}<br>${e.opensAt?`${date(e.opensAt)} 开放`:'随时开放'} · ${e.closesAt?`${date(e.closesAt)} 截止`:'无固定截止时间'}</p><div class="ex-meta"><span>◷ ${e.duration} 分钟</span><span>▤ ${e.questions.length} 道题</span><span>◎ ${sum(e.questions)} 分</span></div><div class="ex-bottom"><span class="ex-pill blue">${e.passRate}% 及格${e.questions.some(isManual)?' · 含人工评分':''}</span><div class="ex-flex">${role==='teacher'?`<button class="btn small" data-action="assignment" data-id="${esc(e.id)}">分配设置</button><button class="btn small" data-action="publish" data-id="${esc(e.id)}">${e.published?'撤回':'发布'}</button><button class="btn small" data-action="exportExam" data-id="${esc(e.id)}">导出</button>`:''}${e.published?`<button class="btn primary small" data-action="start" data-id="${esc(e.id)}" ${role==='student'&&!availability.canStart&&!canResume?'disabled':''}>${canResume?'提交到期答卷':role==='student'&&!availability.canStart?availability.reason:ownDraft?'继续答题':'开始答题'} ↗</button>`:''}</div></div></article>`;}).join('')}</div>`:'<div class="ex-empty"><strong>当前档案没有已发布的考试</strong>可选择其他本地档案，或由教师创建并分配试卷。</div>'}`;
  }
  function answerControls(q,index,value) {
    const key=esc(index);
    if(structured(q))return q.items.map((child,i)=>`<section class="ex-answer-note"><div class="ex-qtags"><span class="ex-pill blue">小题 ${i+1} · ${TYPES[child.type]}</span><span>${child.points} 分 · 权重 ${child.weight}</span></div><h3>${esc(child.title)}</h3>${answerControls(child,`${index}.${i}`,object(value)?value[child.id]:undefined)}</section>`).join('');
    if(q.fields)return `<p class="ex-hint">自定义题各字段均由教师按评分标准评阅，数值字段也不自动判分。</p>${q.fields.map((f,i)=>`<label class="ex-field" style="margin:14px 0">${esc(f.label)}${f.required?'（需填写）':''}${f.kind==='multiline'?`<textarea class="ex-answer-text" data-answer="${key}" data-answer-field="${esc(f.id)}" maxlength="10000">${esc(object(value)?value[f.id]||'':'')}</textarea>`:`<input type="${f.kind==='number'?'number':'text'}" ${f.kind==='number'?'step="any"':''} data-answer="${key}" data-answer-field="${esc(f.id)}" maxlength="2000" value="${esc(object(value)?value[f.id]||'':'')}">`}</label>`).join('')}${rubricMarkup(q)}`;
    if(q.type==='single'||q.type==='multiple') return (q.options||[]).map((option,i)=>{const letter=letters(i),checked=Array.isArray(value)?value.includes(letter):value===letter;return `<label class="ex-option"><input type="${q.type==='multiple'?'checkbox':'radio'}" name="answer-${key}" data-answer="${key}" value="${letter}" ${checked?'checked':''}><span>${letter}</span>${esc(option)}</label>`;}).join('');
    if(q.type==='truefalse') return [['true','正确'],['false','错误']].map(([keyValue,label])=>`<label class="ex-option"><input type="radio" name="answer-${key}" data-answer="${key}" value="${keyValue}" ${value===keyValue?'checked':''}>${label}</label>`).join('');
    return isManual(q)?`<textarea class="ex-answer-text" data-answer="${key}" maxlength="10000" placeholder="请结合题目情境，清楚说明你的思路与依据…">${esc(value||'')}</textarea>`:`<input style="width:100%" data-answer="${key}" value="${esc(value||'')}" maxlength="2000" placeholder="输入答案（忽略首尾空格及英文大小写）">`;
  }
  function rubricMarkup(q) {return q.rubric?`<div class="ex-answer-note">评分标准（人工）：${q.rubric.map((r,i)=>`<br>${esc(r.label)} · 权重 ${r.weight} · 最高 ${weightedPoints(q.rubric,q.points)[i]} 分`).join('')}</div>`:'';}
  function formatAnswer(q,answer) {
    if(structured(q))return q.items.map((child,i)=>`${i+1}. ${child.title}\n${formatAnswer(child,object(answer)?answer[child.id]:answer===q.answer?child.answer:undefined)}`).join('\n\n');
    if(q.fields&&object(answer))return q.fields.map(f=>`${f.label}：${answer[f.id]||'未作答'}`).join('\n');
    if(q.type==='truefalse')return answer==='true'?'正确':answer==='false'?'错误':'未作答';
    if(Array.isArray(answer))return answer.length?answer.join(q.type==='fill'?' / ':'、'):'未作答';
    return String(answer||'未作答');
  }
  function questionDetail(q) {
    if(structured(q))return (q.provenance?`<p class="ex-hint">原创 AI 草稿 · 待教师审核 · ${esc(q.objective||'')}</p>`:'')+q.items.map((child,i)=>`<div class="ex-answer-note"><strong>小题 ${i+1} · ${TYPES[child.type]} · ${child.points} 分 · 权重 ${child.weight}</strong><p>${esc(child.title)}</p>${questionDetail(child)}<p>参考答案：${esc(formatAnswer(child,child.answer))}</p></div>`).join('');
    return `${q.provenance?`<p class="ex-hint">来源：${esc(q.provenance.kind)} · 审核状态：${esc(q.provenance.reviewStatus)} · ${esc((q.tags||[]).join(" / "))}<br>学习目标：${esc(q.objective||"未标注")} · 参考标识：${esc(q.provenance.referenceIds.join(", "))}</p>`:""}${q.options?`<p class="ex-hint">${q.options.map((o,i)=>`${letters(i)}. ${esc(o)}`).join('<br>')}</p>`:''}${q.fields?`<p class="ex-hint">作答字段：${q.fields.map(f=>`${esc(f.label)}（${esc(f.kind)}${f.required?'，需填写':''}）`).join('、')}</p>`:''}${rubricMarkup(q)}`;
  }
  function reportItemMarkup(item,path,label) {
    const q=item.question;
    const grading=q.rubric?`<div class="ex-answer-note">${q.rubric.map((criterion,i)=>{const max=weightedPoints(q.rubric,q.points)[i],score=item.criteria?.find(c=>c.id===criterion.id)?.score;return `<div class="ex-grading"><label for="ex-grade-${path}-${i}">${esc(criterion.label)} · 权重 ${criterion.weight}</label>${role==='teacher'?`<input id="ex-grade-${path}-${i}" type="number" data-grade="${path}" data-criterion="${esc(criterion.id)}" min="0" max="${max}" step="any" value="${score??''}" placeholder="0–${max}">`:`<span>${score??'待评分'}</span>`}<label>/ ${max} 分</label></div>`;}).join('')}</div>`:isManual(q)&&role==='teacher'?`<div class="ex-grading"><label for="ex-grade-${path}">教师评分</label><input id="ex-grade-${path}" type="number" data-grade="${path}" min="0" max="${q.points}" step="any" value="${item.pending?'':item.score}" placeholder="0–${q.points}"><label>满分 ${q.points} 分</label></div>`:'';
    return `<article class="ex-question"><div class="ex-qtags"><span class="ex-pill blue">${label} · ${TYPES[q.type]}</span><span class="ex-pill ${item.pending?'orange':item.correct===true?'green':item.correct===false?'orange':''}">${item.pending?`${item.score} / ${q.points} 分 · 待评分`:`${item.score} / ${q.points} 分`}</span></div><h3>${esc(q.title)}</h3>${structured(q)?(item.items||gradeQuestion(q,item.answer).items).map((child,i)=>reportItemMarkup(child,`${path}.${i}`,`小题 ${i+1}`)).join(''):`${questionDetail(q)}<div class="ex-answer-note ${item.correct===true?'correct':item.correct===false?'wrong':''}">你的答案：${esc(formatAnswer(q,item.answer))}</div><div class="ex-answer-note">${isManual(q)?'参考要点':'参考答案'}：${esc(formatAnswer(q,q.answer))}\n\n解析：${esc(q.explanation||'暂无解析')}</div>${grading}`}</article>`;
  }
  function reportMarkup() {
    const r=report,rate=r.maxScore?Math.round(r.score/r.maxScore*100):0,passed=rate>=r.passRate;
    return `<div class="ex-toolbar"><button class="btn small" data-action="closeReport">← 返回成绩列表</button><button class="btn" data-action="exportResult" data-id="${esc(r.id)}">↓ 导出答卷 JSON</button></div><div class="ex-score"><div class="ex-score-circle"><strong>${r.score}</strong><small>/ ${r.maxScore} 分${r.pending?' · 暂定':''}</small></div><div><span class="ex-pill ${r.pending?'orange':passed?'green':'orange'}">${r.pending?'待人工评分':passed?'通过测评':'继续加油'}</span><h2 style="margin-top:12px">${esc(r.title)}</h2><span class="ex-hint">${esc(r.name)}${r.studentId?' · '+esc(r.studentId):''}${r.className?' · '+esc(r.className):''} · ${date(r.submittedAt)} · 用时 ${Math.floor(r.durationSeconds/60)} 分 ${r.durationSeconds%60} 秒</span></div></div>${r.pending?`<div class="ex-message">客观题及组合题中的客观小题已自动评分。${r.items.filter(x=>x.pending).length} 道题含待人工评分内容，当前分数不是最终成绩。${role==='teacher'?'请在下方逐题或逐项输入分数并保存。':''}</div>`:''}${r.items.map((item,i)=>reportItemMarkup(item,String(i),`第 ${i+1} 题`)).join('')}${r.items.some(x=>isManual(x.question))&&role==='teacher'?'<div style="text-align:right"><button class="btn primary" data-action="saveGrades">保存教师评分</button></div>':''}`;
  }
  function bankMarkup() {
    const list=filterQuestions();
    return `<div class="ex-toolbar"><div><h2 style="font-size:23px;margin:0 0 8px">题库管理</h2><span class="ex-hint">${questions.length} 道实际题目 · ${Object.keys(TYPES).length} 种题型 · 支持 JSON 导入导出</span></div><div class="ex-flex"><button class="btn" data-action="exportBank">↓ 导出题库</button>${role==='teacher'?'<button class="btn" data-action="import">↑ 导入 JSON</button><input type="file" accept="application/json,.json" id="ex-import-file" class="ex-hidden"><button class="btn primary" data-action="addQuestion">＋ 新建题目</button>':''}</div></div><p class="ex-hint">新增题为原创 AI 草稿，待教师学科审核；机器校验与 AI 检查不等于教师审核。题库默认种子已扩展至 1500 道主问题，教师审核尚未完成。<a href="/static/question-bank/references.json" download>下载参考来源</a> · <a href="/static/question-bank/validation-report.json" download>下载校验报告</a> · <a href="/static/question-bank/phase2/quality-summary.json" download>1500题质量清单</a> · <a href="/static/question-bank/phase2/references.json" download>新增题参考资料</a></p>${filters()}<div class="ex-toolbar"><span class="ex-hint" style="margin:0">共找到 ${list.length} 道题目${list.length>100?'，当前显示前 100 道，请用搜索缩小范围':''}</span><span class="ex-hint" style="margin:0">导出文件可作为导入格式模板</span></div><div class="ex-bank">${list.slice(0,100).map((q,i)=>`<div class="ex-qrow"><span class="ex-qindex">${String(i+1).padStart(2,'0')}</span><div class="ex-qbody"><div class="ex-qtags"><span class="ex-pill blue">${TYPES[q.type]}</span><span>${esc(q.category)}</span><span>·</span><span>${esc(q.difficulty)}</span><span>· ${q.points} 分</span></div><h4>${esc(q.title)}</h4></div><div class="ex-qactions"><button class="btn small" data-action="previewQuestion" data-id="${esc(q.id)}">查看</button>${role==='teacher'?`<button class="btn small" data-action="editQuestion" data-id="${esc(q.id)}">编辑</button>`:''}</div></div>`).join('')||'<div class="ex-empty"><strong>没有符合条件的题目</strong>试试其他关键词或筛选条件。</div>'}</div>`;
  }
  function newBuilder() {
    builder={title:'',description:'',duration:30,passRate:60,published:true,selected:new Set(),points:'',audience:{mode:'all',classIds:[],studentIds:[]},opensAt:'',closesAt:''};
    search='';filterType='';filterCategory='';report=null;attempt=null;editor=null;tab='exams';draw();
  }
  function builderMarkup() {
    const list=filterQuestions(), selected=questions.filter(q=>builder.selected.has(q.id));
    const total=builder.points?selected.length*Number(builder.points):sum(selected);
    return `<div class="ex-toolbar"><div><button class="btn small" data-action="closeBuilder">← 返回试卷</button><h2 style="font-size:23px;margin-bottom:0">创建一份新试卷</h2></div><span class="ex-hint">试卷保存题目快照，后续编辑题库不会影响已创建试卷。</span></div><div class="ex-builder"><div>${filters()}<div class="ex-toolbar"><span class="ex-hint" style="margin:0">${list.length} 道可选题目${list.length>100?'（显示前 100 道）':''}</span><div class="ex-flex"><button class="btn small" data-action="randomSelect">随机选 10 题</button><button class="btn small" data-action="clearSelect">清空选择</button></div></div><div class="ex-bank">${list.slice(0,100).map(q=>`<label class="ex-qrow" style="cursor:pointer"><input type="checkbox" data-select-question="${esc(q.id)}" ${builder.selected.has(q.id)?'checked':''}><div class="ex-qbody"><div class="ex-qtags"><span class="ex-pill blue">${TYPES[q.type]}</span><span>${esc(q.category)} · ${q.points} 分</span></div><h4>${esc(q.title)}</h4></div></label>`).join('')||'<div class="ex-empty">没有符合条件的题目</div>'}</div></div><aside class="ex-builder-side"><h3>试卷设置</h3><label class="ex-field">试卷名称<input data-builder="title" value="${esc(builder.title)}" maxlength="100" placeholder="例如：第一章综合测评"></label><label class="ex-field">说明<textarea data-builder="description" maxlength="500" rows="2" placeholder="本次考试的学习目标">${esc(builder.description)}</textarea></label><label class="ex-field">考试时长（分钟）<input type="number" data-builder="duration" min="1" max="300" value="${builder.duration}"></label><label class="ex-field">及格得分率（%）<input type="number" data-builder="passRate" min="1" max="100" value="${builder.passRate}"></label><label class="ex-field">统一每题分数（可选）<input type="number" data-builder="points" min="1" max="100" value="${esc(builder.points)}" placeholder="留空则沿用题目分值"></label><label class="ex-flex" style="font-size:12px;color:#7687a0"><input type="checkbox" data-builder="published" ${builder.published?'checked':''}>创建后立即发布</label>${assignmentFields(builder)}<div class="ex-answer-note">已选 <strong id="ex-selected-count">${selected.length}</strong> 道题<br>总分 <strong id="ex-selected-points">${total}</strong> 分</div><button style="width:100%;margin-top:20px" class="btn primary" data-action="saveExam">创建试卷</button></aside></div>`;
  }
  function hasAnswer(value) {return Array.isArray(value)?value.length>0:object(value)?Object.values(value).some(hasAnswer):String(value??'').trim().length>0;}
  function answerComplete(q,value) {if(structured(q))return q.items.every(child=>answerComplete(child,object(value)?value[child.id]:undefined));if(q.fields){const required=q.fields.filter(f=>f.required);return object(value)&&(required.length?required.every(f=>hasAnswer(value[f.id])):Object.values(value).some(hasAnswer));}return hasAnswer(value);}
  function quizMarkup() {
    const e=attempt.exam, count=attempt.exam.questions.filter((q,i)=>answerComplete(q,attempt.answers[i])).length;
    return `<div class="ex-toolbar"><div><span class="ex-kicker">ASSESSMENT IN PROGRESS</span><h2 style="font-size:23px;margin:8px 0">${esc(e.title)}</h2><span class="ex-hint">${esc(attempt.name)} · ${e.questions.length} 题 · 满分 ${sum(e.questions)} 分 · ${e.passRate}% 及格</span></div><button class="btn" data-action="pause">保存并离开</button></div><div class="ex-quiz"><div>${e.questions.map((q,i)=>`<article class="ex-question" id="ex-question-${i}"><div class="ex-qtags"><span class="ex-pill blue">第 ${i+1} 题 · ${TYPES[q.type]}</span><span>${q.points} 分</span>${isManual(q)?'<span class="ex-pill orange">教师评分</span>':''}</div><h3>${esc(q.title)}</h3>${answerControls(q,i,attempt.answers[i])}${q.type==='multiple'?'<p class="ex-hint">多选题：全部选对得分，多选、少选、错选不得分。</p>':''}</article>`).join('')}</div><aside class="ex-quiz-side"><span class="ex-hint" style="margin:0">剩余时间</span><div class="ex-clock" id="ex-clock">—</div><div class="ex-flex" style="justify-content:space-between;font-size:12px;color:#8190a5"><span>作答进度</span><span id="ex-progress-label">${count} / ${e.questions.length}</span></div><div class="ex-progress"><span id="ex-progress-fill" style="width:${count/e.questions.length*100}%"></span></div><div class="ex-map">${e.questions.map((q,i)=>`<button data-action="jump" data-index="${i}" class="${answerComplete(q,attempt.answers[i])?'answered':''}" aria-label="跳到第 ${i+1} 题">${i+1}</button>`).join('')}</div><p class="ex-hint">答案保存在当前浏览器。离开页面后计时继续，到时重新进入会提交已有答案。</p><button class="btn primary" style="width:100%" data-action="submit">提交答卷</button></aside></div>`;
  }
  function updateAttemptProgress() {
    const count=attempt.exam.questions.filter((q,i)=>answerComplete(q,attempt.answers[i])).length;
    const label=host.querySelector('#ex-progress-label'), fill=host.querySelector('#ex-progress-fill');
    if(label)label.textContent=`${count} / ${attempt.exam.questions.length}`;
    if(fill)fill.style.width=`${count/attempt.exam.questions.length*100}%`;
    host.querySelectorAll('[data-action="jump"]').forEach(el=>el.classList.toggle('answered',answerComplete(attempt.exam.questions[el.dataset.index],attempt.answers[el.dataset.index])));
  }
  function startTimer() {
    function tick() {
      if(!attempt || !host?.isConnected) {clearInterval(ticker);return;}
      const seconds=Math.max(0,Math.ceil((attempt.deadline-Date.now())/1000));
      const clock=host.querySelector('#ex-clock');if(clock){clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;clock.style.color=seconds<300?'#c77e35':'#2563eb';}
      if(seconds===0&&!submitting) submitAttempt(true).catch(error=>say(error.message));
    }
    ticker=setInterval(tick,1000);tick();
  }
  async function submitAttempt(timedOut=false) {
    if(!attempt||submitting)return;
    const missing=attempt.exam.questions.filter((q,i)=>!answerComplete(q,attempt.answers[i])).length;
    if(!timedOut&&!window.confirm(missing?`还有 ${missing} 道题未作答，确认提交？`:'确认提交答卷？提交后不能修改答案。'))return;
    submitting=true;const button=host.querySelector('[data-action="submit"]');if(button){button.disabled=true;button.textContent='正在提交…';}
    try {
      const a=copy(attempt),items=a.exam.questions.map((q,i)=>({question:q,answer:a.answers[i]??(structured(q)||q.fields?{}:q.type==='multiple'?[]:''),...gradeQuestion(q,a.answers[i])}));
      const r={id:a.id,examId:a.exam.id,title:a.exam.title,name:a.name,studentId:a.studentId||'',classId:a.classId||'',className:a.className||'',startedAt:new Date(a.startedAt).toISOString(),submittedAt:new Date().toISOString(),durationSeconds:Math.max(0,Math.floor((Math.min(Date.now(),a.deadline)-a.startedAt)/1000)),passRate:a.exam.passRate,maxScore:sum(a.exam.questions),score:round(items.reduce((n,x)=>n+x.score,0)),pending:items.some(x=>x.pending),timedOut,items};
      const latest=await api('/api/state/results');results=Array.isArray(latest)?latest:results;
      if(!results.some(existing=>existing.id===r.id)){results=[r,...results];await api('/api/state/results','POST',results);}
      clearInterval(ticker);clearDraft();attempt=null;report=r;tab='results';draw();say(timedOut?'考试时间已结束，已提交现有答案。':'答卷已提交并保存。');
    } finally {submitting=false;if(button){button.disabled=false;button.textContent='提交答卷';}}
  }
  function resultsMarkup() {
    const rows=resultRows(),completed=rows.filter(r=>!r.pending),pending=rows.filter(r=>r.pending);
    const groups=[...new Set(questions.map(q=>q.category))].map(category=>{const items=completed.flatMap(r=>r.items).filter(x=>x.question.category===category);return {category,rate:items.length?Math.round(items.reduce((s,x)=>s+x.score,0)/sum(items.map(x=>x.question))*100):null};});
    return `<div class="ex-toolbar"><div><h2 style="font-size:23px;margin:0 0 8px">成绩与评分</h2><span class="ex-hint">${role==='student'?`当前本地档案：${esc(selectedStudent()?.name||'演示访客')} · `:''}真实提交记录、逐题解析与知识领域表现</span></div>${rows.length?'<button class="btn" data-action="exportResults">↓ 导出成绩 CSV</button>':''}</div>${stats()}${completed.length?`<div class="ex-breakdown"><div class="ex-breakdown-card"><h3>知识领域得分率</h3>${groups.map(g=>`<div class="ex-bar-row"><span>${esc(g.category)}</span><i><span style="width:${g.rate||0}%"></span></i><span>${g.rate===null?'—':g.rate+'%'}</span></div>`).join('')}</div><div class="ex-breakdown-card"><h3>测评概况</h3><div style="font-size:35px;color:#386ccb;margin:20px 0">${Math.round(completed.filter(r=>r.score/r.maxScore*100>=r.passRate).length/completed.length*100)}<span style="font-size:16px">%</span></div><span class="ex-hint">已评分答卷通过率</span><p class="ex-hint">${completed.length} 份完成评分 · ${pending.length} 份待人工评分<br>重复作答按独立答卷统计，数据仅来自当前工作区。</p></div></div>`:''}${rows.length?`<div class="ex-table-wrap"><table><thead><tr><th>学员</th><th>考试名称</th><th>提交时间</th><th>得分</th><th>状态</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.title)}</td><td>${date(r.submittedAt)}</td><td><strong>${r.score}</strong> / ${r.maxScore}</td><td><span class="ex-pill ${r.pending?'orange':r.score/r.maxScore*100>=r.passRate?'green':''}">${r.pending?'待人工评分':r.score/r.maxScore*100>=r.passRate?'已通过':'未通过'}</span></td><td><button class="btn small" data-action="report" data-id="${esc(r.id)}">${r.pending&&role==='teacher'?'查看与评分':'查看答卷'} ↗</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="ex-empty"><strong>第一份成绩，等你开启</strong>前往考试中心完成一份试卷，成绩与学习表现将在这里呈现。<br><button class="btn primary" data-action="tab" data-tab="exams" style="margin-top:20px">前往考试中心 ↗</button></div>'}`;
  }
  function structureTemplate(type) {
    if(type==='compound')return {title:'环境监测节点的采集与通信',answer:'分别按各小题标准答案或评分标准评分。',items:[{id:'sensor',type:'single',title:'采集室内温度应使用哪种传感器？',options:['温度传感器','光照传感器'],answer:'A',weight:2},{id:'protocol',type:'fill',title:'常用于轻量级发布/订阅消息传输的协议是？',answer:['MQTT'],weight:3},{id:'design',type:'custom',title:'提出一项网络断开时避免采样数据丢失的方案。',answer:'可使用带容量与重试边界的本地缓冲，并在网络恢复后补传。',weight:5,fields:[{id:'plan',label:'方案与边界',kind:'multiline',required:true}],rubric:[{id:'buffer',label:'说明本地缓冲或持久化方法',weight:3,fieldId:'plan'},{id:'limits',label:'说明容量、重试或去重边界',weight:2,fieldId:'plan'}]}]};
    return {title:'设计传感器数据异常处理方案',answer:'指出合理异常条件，并说明校验、隔离或重采样方法及可能代价。',fields:[{id:'condition',label:'异常判断条件',kind:'text',required:true},{id:'strategy',label:'处理步骤与理由',kind:'multiline',required:true}],rubric:[{id:'detection',label:'异常条件具体且可检验',weight:2,fieldId:'condition'},{id:'handling',label:'处理步骤合理并说明依据',weight:3,fieldId:'strategy'}]};
  }
  function editorMarkup() {
    if(editor.mode==='assignment')return `<div class="ex-modal-backdrop"><section class="ex-modal" role="dialog" aria-modal="true" aria-labelledby="ex-assignment-title" style="max-width:580px"><div class="ex-modal-header"><h2 id="ex-assignment-title">分配与开放时间</h2><button class="btn small" data-action="closeEditor" aria-label="关闭">×</button></div><h3>${esc(editor.exam.title)}</h3>${assignmentFields(editor.assignment)}<div class="ex-modal-footer"><button class="btn" data-action="closeEditor">取消</button><button class="btn primary" data-action="saveAssignment">保存设置</button></div></section></div>`;
    if(editor.mode==='start')return `<div class="ex-modal-backdrop"><section class="ex-modal" role="dialog" aria-modal="true" aria-labelledby="ex-start-title" style="max-width:490px"><div class="ex-modal-header"><h2 id="ex-start-title">准备好开始了吗？</h2><button class="btn small" data-action="closeEditor" aria-label="关闭">×</button></div><p class="ex-hint">${esc(editor.exam.title)}<br>${editor.exam.duration} 分钟 · ${editor.exam.questions.length} 道题 · 开始后计时不会暂停${editor.exam.closesAt?'<br>最迟于 '+date(editor.exam.closesAt)+' 结束':''}</p><label class="ex-field">本地学员档案${studentSelector('startProfile')}</label>${selectedStudent()?`<p class="ex-hint">答卷将记录为 ${esc(selectedStudent().name)} · ${esc(selectedStudent().id)}。档案选择不验证身份。</p>`:'<label class="ex-field" style="margin-top:16px">访客姓名<input id="ex-student-name" maxlength="50" placeholder="输入姓名或学号" value="演示学员"></label>'}<div class="ex-modal-footer"><button class="btn" data-action="closeEditor">取消</button><button class="btn primary" data-action="begin">开始考试 ↗</button></div></section></div>`;
    const q=editor.question;
    if(editor.mode==='preview')return `<div class="ex-modal-backdrop"><section class="ex-modal" role="dialog" aria-modal="true" aria-labelledby="ex-preview-title"><div class="ex-modal-header"><h2 id="ex-preview-title">题目详情</h2><button class="btn small" data-action="closeEditor" aria-label="关闭">×</button></div><div class="ex-qtags"><span class="ex-pill blue">${TYPES[q.type]}</span><span>${esc(q.category)} · ${esc(q.difficulty)} · ${q.points} 分</span></div><h3 style="line-height:1.9;font-size:16px">${esc(q.title)}</h3>${questionDetail(q)}<div class="ex-answer-note">${isManual(q)?'参考要点':'正确答案'}：${esc(formatAnswer(q,q.answer))}\n\n解析：${esc(q.explanation||'暂无解析')}</div><div class="ex-modal-footer"><button class="btn primary" data-action="closeEditor">知道了</button></div></section></div>`;
    const optionText=(q.options||[]).join('\n'),answer=Array.isArray(q.answer)?q.answer.join(q.type==='multiple'?',':'|'):q.answer,hasStructure=structured(q)||q.fields;
    return `<div class="ex-modal-backdrop"><form class="ex-modal" id="ex-question-form" role="dialog" aria-modal="true" aria-labelledby="ex-editor-title"><div class="ex-modal-header"><h2 id="ex-editor-title">${editor.mode==='edit'?'编辑题目':'新建题目'}</h2><button type="button" class="btn small" data-action="closeEditor" aria-label="关闭">×</button></div><div class="ex-fields"><label class="ex-field">题型<select name="type" data-field="editorType">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${q.type===k?'selected':''}>${v}</option>`).join('')}</select></label><label class="ex-field">知识领域<input name="category" value="${esc(q.category)}" maxlength="50" required></label><label class="ex-field">难度<select name="difficulty">${LEVELS.map(v=>`<option ${q.difficulty===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="ex-field">总分（子项按权重分配）<input name="points" type="number" min="1" max="100" step="0.5" value="${q.points}" required></label><label class="ex-field full">题目<textarea name="title" rows="3" maxlength="2000" required>${esc(q.title)}</textarea></label>${['single','multiple'].includes(q.type)?`<label class="ex-field full">选项（每行一个，2–10 项，不用填写 A/B 编号）<textarea name="options" rows="4" required>${esc(optionText)}</textarea></label>`:''}${['compound','custom'].includes(q.type)?`<div class="ex-field full"><span>${hasStructure?'结构化题目':'旧版文本题目：保留原数据，整题人工评分'}</span><button type="button" class="btn" data-action="structureTemplate">${hasStructure?'填入结构示例（替换当前结构）':'使用结构化示例'}</button></div>`:''}${hasStructure?`<label class="ex-field full">${q.type==='compound'?'小题 JSON 数组：2–20 项，weight 为权重；支持 single / multiple / truefalse / fill / custom':'自定义结构 JSON：fields 为作答字段，rubric 为人工评分标准'}<textarea name="structure" rows="13" spellcheck="false" required>${esc(JSON.stringify(q.type==='compound'?q.items:{fields:q.fields,rubric:q.rubric},null,2))}</textarea></label><p class="ex-hint ex-field full">保存时校验结构及权重。小题和评分项的满分按权重分配，总分不变；自定义题的文本和数值字段均由教师逐项评分。导入导出保留全部结构。</p>`:''}<label class="ex-field full">${q.type==='single'?'正确答案（填写 A、B 等单个字母）':q.type==='multiple'?'正确答案（多个字母用英文逗号分隔，如 A,C）':q.type==='truefalse'?'正确答案（true 表示正确，false 表示错误）':q.type==='fill'?'可接受答案（多个等价答案用 | 分隔）':'参考答案／评分要点'}<textarea name="answer" rows="${isManual(q)?'4':'2'}" maxlength="10000" ${structured(q)?'':'required'}>${esc(answer||'')}</textarea></label><label class="ex-field full">解析<textarea name="explanation" rows="3" maxlength="10000">${esc(q.explanation||'')}</textarea></label></div><div class="ex-modal-footer"><button type="button" class="btn" data-action="closeEditor">取消</button><button type="submit" class="btn primary">保存题目</button></div></form></div>`;
  }
  function readQuestionForm(form) {
    const data=Object.fromEntries(new FormData(form)),type=data.type;
    const raw={...data,id:editor.question.id||uid('q'),options:String(data.options||'').split('\n').map(s=>s.trim()),answer:type==='multiple'?String(data.answer||'').split(/[,，、\s]+/).filter(Boolean):type==='fill'?String(data.answer||'').split('|'):data.answer};
    if(data.structure){let structure;try{structure=JSON.parse(data.structure);}catch(_){throw Error('结构 JSON 格式错误，请检查逗号、引号及括号。');}if(type==='compound')raw.items=structure;else if(type==='custom'){if(!object(structure))throw Error('自定义结构须为包含 fields 与 rubric 的对象。');raw.fields=structure.fields;raw.rubric=structure.rubric;}}
    return raw;
  }
  function validateQuestion(raw, depth=0) {
    if(!object(raw)||!Object.hasOwn(TYPES,raw.type))throw new Error('题型须为 single、multiple、truefalse、fill、compound 或 custom。');
    if(depth>1||depth&&raw.type==='compound')throw Error('组合题只支持一层小题；小题可为客观题或自定义题。');
    const q={id:String(raw.id||uid('q')),type:raw.type,category:String(raw.category||'未分类').trim(),difficulty:LEVELS.includes(raw.difficulty)?raw.difficulty:'中级',title:String(raw.title||'').trim(),points:Number(raw.points??2),answer:raw.answer,explanation:String(raw.explanation||'')};
    if(raw.tags!==undefined){if(!Array.isArray(raw.tags)||raw.tags.length>20||raw.tags.some(v=>typeof v!=='string'||v.length>80))throw Error('tags 必须为至多20个短文本标签');q.tags=[...raw.tags];}
    if(raw.objective!==undefined){if(typeof raw.objective!=='string'||raw.objective.length>500)throw Error('学习目标无效');q.objective=raw.objective;}
    if(raw.provenance!==undefined){const p=raw.provenance;if(!object(p)||typeof p.kind!=='string'||p.kind.length>80||typeof p.reviewStatus!=='string'||p.reviewStatus.length>80||!Array.isArray(p.referenceIds)||p.referenceIds.length>30||p.referenceIds.some(v=>typeof v!=='string'||v.length>120))throw Error('来源元数据无效');q.provenance={kind:p.kind,reviewStatus:p.reviewStatus,referenceIds:[...p.referenceIds]};if(p.authoredAt!==undefined){if(typeof p.authoredAt!=='string'||p.authoredAt.length>40)throw Error('编写日期无效');q.provenance.authoredAt=p.authoredAt;}}
    if(!q.id||q.id.length>120||['__proto__','constructor','prototype'].includes(q.id))throw Error('题目 ID 无效。');
    if(!q.title||q.title.length>2000)throw new Error('题目不能为空，且不得超过 2000 字。');
    if(!q.category||q.category.length>50)throw new Error('知识领域应为 1–50 字。');
    if(!Number.isFinite(q.points)||q.points<(depth?0.000001:1)||q.points>100)throw new Error(depth?'小题分值必须为正数且不超过 100。':'每题分值须在 1–100 之间。');
    if(raw.items!==undefined&&q.type!=='compound')throw Error('只有组合题可以包含 items 小题。');
    if((raw.fields!==undefined||raw.rubric!==undefined)&&q.type!=='custom')throw Error('fields 和 rubric 仅用于自定义题。');
    if(q.type==='compound'&&raw.items!==undefined) {
      if(!Array.isArray(raw.items)||raw.items.length<2||raw.items.length>20)throw Error('结构化组合题需要 2–20 个小题。');
      const weighted=raw.items.map((item,i)=>{if(!object(item)||item.type==='compound')throw Error(`第 ${i+1} 小题须为客观题或自定义题。`);const weight=Number(item.weight??item.points??1);if(!Number.isFinite(weight)||weight<=0||weight>1000)throw Error('小题权重必须大于 0 且不超过 1000。');return {...item,id:item.id||`part-${i+1}`,weight};});
      if(weighted.some(x=>!safeId(x.id))||new Set(weighted.map(x=>x.id)).size!==weighted.length)throw Error('小题 ID 须唯一，并只含字母、数字、下划线、短横线、点或冒号。');
      const points=weightedPoints(weighted,q.points);
      q.items=weighted.map((item,i)=>({...validateQuestion({...item,category:item.category||q.category,difficulty:item.difficulty||q.difficulty,points:points[i]},1),weight:item.weight}));
      q.answer=String(raw.answer||'各小题答案及评分要点见小题。').trim();
    } else if(['single','multiple'].includes(q.type)) {
      q.options=Array.isArray(raw.options)?raw.options.map(o=>String(o).trim()):[];
      if(q.options.length<2||q.options.length>10||q.options.some(o=>!o||o.length>2000))throw new Error('选择题需要 2–10 个非空选项，每项不超过 2000 字。');
      const allowed=q.options.map((_,i)=>letters(i));
      if(q.type==='single'){q.answer=String(q.answer||'').trim().toUpperCase();if(!allowed.includes(q.answer))throw new Error('单选答案须为已有选项字母。');}
      else {q.answer=Array.isArray(q.answer)?[...new Set(q.answer.map(a=>String(a).trim().toUpperCase()))]:[];if(!q.answer.length||q.answer.some(a=>!allowed.includes(a)))throw new Error('多选答案须为已有选项字母组成的非空数组。');}
    } else if(q.type==='truefalse') {q.answer=String(q.answer).trim().toLowerCase();if(!['true','false'].includes(q.answer))throw new Error('判断题答案须为 true 或 false。');}
    else if(q.type==='fill') {q.answer=(Array.isArray(q.answer)?q.answer:[q.answer]).map(a=>String(a??'').trim());if(!q.answer.length||q.answer.some(a=>!a||a.length>2000))throw new Error('填空题须提供至少一个非空标准答案。');}
    else {q.answer=String(q.answer||'').trim();if(!q.answer)throw new Error('主观题须提供参考答案或评分要点。');}
    if(q.type==='custom'&&(raw.fields!==undefined||raw.rubric!==undefined)) {
      if(!Array.isArray(raw.fields)||!raw.fields.length||raw.fields.length>12||!Array.isArray(raw.rubric)||!raw.rubric.length||raw.rubric.length>20)throw Error('自定义题须包含 1–12 个作答字段及 1–20 项评分标准。');
      q.fields=raw.fields.map(f=>{if(!object(f)||!safeId(f.id)||typeof f.label!=='string'||!f.label.trim()||f.label.length>200||!['text','multiline','number'].includes(f.kind)||f.required!==undefined&&typeof f.required!=='boolean')throw Error('自定义作答字段的 ID、名称、类型或必填标记无效。');return {id:f.id,label:f.label.trim(),kind:f.kind,required:f.required===true};});
      if(new Set(q.fields.map(f=>f.id)).size!==q.fields.length)throw Error('作答字段 ID 不能重复。');
      q.rubric=raw.rubric.map(r=>{if(!object(r)||!safeId(r.id)||typeof r.label!=='string'||!r.label.trim()||r.label.length>1000||!Number.isFinite(Number(r.weight))||Number(r.weight)<=0||Number(r.weight)>1000||r.fieldId!=null&&!q.fields.some(f=>f.id===r.fieldId))throw Error('评分标准 ID、说明、权重或对应字段无效。');return {id:r.id,label:r.label.trim(),weight:Number(r.weight),...(r.fieldId?{fieldId:r.fieldId}:{})};});
      if(new Set(q.rubric.map(r=>r.id)).size!==q.rubric.length)throw Error('评分标准 ID 不能重复。');
      if(weightedPoints(q.rubric,q.points).some(p=>p<=0))throw Error('评分权重差异过大，导致标准分值为零。');
    }
    if(q.explanation.length>10000||String(q.answer).length>10000)throw new Error('答案或解析不得超过 10000 字。');
    return q;
  }
  function gradeQuestion(q, answer) {
    if(structured(q)) {
      const maxima=weightedPoints(q.items.map(item=>({...item,weight:item.weight??item.points})),Number(q.points));
      const items=q.items.map((child,i)=>{const question={...child,points:maxima[i]},value=object(answer)?answer[child.id]:undefined;return {question,answer:value??(structured(child)||child.fields?{}:child.type==='multiple'?[]:''),...gradeQuestion(question,value)};});
      const score=round(items.reduce((n,item)=>n+item.score,0)),pending=items.some(item=>item.pending);
      return {score,pending,correct:pending?null:score===Number(q.points),items};
    }
    if(isManual(q)) return {score:0,pending:true,correct:null,...(q.rubric?{criteria:q.rubric.map((r,i)=>({id:r.id,points:weightedPoints(q.rubric,q.points)[i],score:null}))}:{})};
    let correct=false;
    if(q.type==='multiple') correct=Array.isArray(answer)&&Array.isArray(q.answer)&&JSON.stringify([...new Set(answer)].sort())===JSON.stringify([...new Set(q.answer)].sort());
    else if(q.type==='fill') correct=(Array.isArray(q.answer)?q.answer:[q.answer]).some(a=>normalize(a)===normalize(answer))&&hasAnswer(answer);
    else correct=normalize(answer)===normalize(q.answer)&&hasAnswer(answer);
    return {score:correct?Number(q.points):0,pending:false,correct};
  }
  function applyManualScores(item, marks={}) {
    const next=copy(item),q=next.question;
    if(structured(q)) {
      if(marks.score!=null||marks.criteria||marks.children&&Object.keys(marks.children).some(id=>!q.items.some(child=>child.id===id)))throw Error('组合题须按已有小题评分，不能覆盖总分。');
      next.items=(next.items||gradeQuestion(q,next.answer).items).map(child=>applyManualScores(child,marks.children?.[child.question.id]||{}));
      next.score=round(next.items.reduce((n,child)=>n+child.score,0));next.pending=next.items.some(child=>child.pending);next.correct=next.pending?null:next.score===Number(q.points);return next;
    }
    if(!isManual(q)){if(marks.score!=null||marks.criteria)throw Error('客观题得分由标准答案计算，不能手工覆盖。');return next;}
    const scoreValue=(value,max)=>{const score=Number(value);if(value===''||value==null||!Number.isFinite(score)||score<0||score>max)throw Error(`评分须在 0–${max} 之间。`);return round(score);};
    if(q.rubric) {
      if(marks.score!=null)throw Error('结构化自定义题必须逐项填写评分标准，不能覆盖总分。');
      const maxima=weightedPoints(q.rubric,q.points),existing=new Map((next.criteria||[]).map(r=>[r.id,r.score]));
      if(marks.criteria&&Object.keys(marks.criteria).some(id=>!q.rubric.some(r=>r.id===id)))throw Error('评分标准不存在。');
      next.criteria=q.rubric.map((r,i)=>{const value=marks.criteria&&Object.hasOwn(marks.criteria,r.id)?marks.criteria[r.id]:existing.get(r.id);return {id:r.id,points:maxima[i],score:value==null||value===''?null:scoreValue(value,maxima[i])};});
      next.score=round(next.criteria.reduce((n,r)=>n+(r.score??0),0));next.pending=next.criteria.some(r=>r.score==null);
    } else if(marks.score!=null&&marks.score!==''){next.score=scoreValue(marks.score,q.points);next.pending=false;}
    next.correct=null;return next;
  }
  function validateAnswer(q, answer) {
    if(structured(q)||q.fields) {
      if(!object(answer))throw Error('结构化题目的答案必须为字段对象。');
      const ids=(q.items||q.fields).map(r=>r.id);if(Object.keys(answer).some(id=>!ids.includes(id)))throw Error('答案包含不存在的小题或字段。');
      if(structured(q)){for(const child of q.items)if(Object.hasOwn(answer,child.id))validateAnswer(child,answer[child.id]);}
      else for(const f of q.fields)if(Object.hasOwn(answer,f.id)){const value=answer[f.id];if(typeof value!=='string'||value.length>10000||f.kind==='number'&&value.trim()&&!Number.isFinite(Number(value)))throw Error('自定义题作答字段无效。');}
    } else if(q.type==='multiple'){if(!Array.isArray(answer)||answer.length>10||answer.some(v=>typeof v!=='string'||v.length>2000))throw Error('多选答案无效。');}
    else if(typeof answer!=='string'&&typeof answer!=='boolean'||String(answer).length>20000)throw Error('答题内容无效。');
    return answer;
  }
  function normalizeResultItem(raw, suppliedQuestion, depth=0) {
    if(!object(raw))throw Error('答卷题目无效。');
    const question=suppliedQuestion||validateQuestion(raw.question,depth),answer=validateAnswer(question,raw.answer),base={question,answer,...gradeQuestion(question,answer)};
    if(typeof raw.pending!=='boolean'||typeof raw.score!=='number'||!Number.isFinite(raw.score)||raw.score<0||raw.score>question.points)throw Error('题目分数或评分状态无效。');
    if(structured(question)) {
      if(raw.items!==undefined&&(!Array.isArray(raw.items)||raw.items.length!==question.items.length))throw Error('组合题评分记录与小题数量不匹配。');
      base.items=base.items.map((child,i)=>{const stored=raw.items?.[i];if(!stored)return child;if(stored.question?.id!==child.question.id||JSON.stringify(stored.answer)!==JSON.stringify(child.answer))throw Error('小题答案与父题快照不匹配。');return normalizeResultItem(stored,child.question,1);});
      base.score=round(base.items.reduce((n,child)=>n+child.score,0));base.pending=base.items.some(child=>child.pending);base.correct=base.pending?null:base.score===question.points;
    } else if(isManual(question)) {
      if(typeof raw.pending!=='boolean'||!Number.isFinite(raw.score)||raw.score<0||raw.score>question.points)throw Error('主观题分数或待评分状态无效。');
      if(question.rubric) {
        if(raw.criteria!==undefined&&(!Array.isArray(raw.criteria)||raw.criteria.length!==question.rubric.length||new Set(raw.criteria.map(r=>r?.id)).size!==question.rubric.length))throw Error('评分标准记录不完整或重复。');
        const marks={criteria:{}};for(const c of raw.criteria||[]){if(!object(c)||!question.rubric.some(r=>r.id===c.id))throw Error('未知评分标准。');marks.criteria[c.id]=c.score;}
        Object.assign(base,applyManualScores(base,marks));
      } else if(!raw.pending)Object.assign(base,applyManualScores(base,{score:raw.score}));
      else if(raw.score!==0)throw Error('未评分的旧版主观题得分应为零。');
    }
    return base;
  }
  function validateExam(raw) {
    if(!object(raw)||typeof raw.id!=='string'||!raw.id||raw.id.length>120||typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>100||!Array.isArray(raw.questions)||!raw.questions.length||raw.questions.length>5000||!Number.isInteger(raw.duration)||raw.duration<1||raw.duration>300||!Number.isFinite(raw.passRate)||raw.passRate<1||raw.passRate>100||typeof raw.published!=='boolean')throw Error('试卷字段、题目、时长或及格线无效。');
    return {id:raw.id,title:raw.title,description:typeof raw.description==='string'?raw.description.slice(0,500):'',duration:raw.duration,passRate:raw.passRate,published:raw.published,createdAt:typeof raw.createdAt==='string'?raw.createdAt:'',questions:raw.questions.map(q=>validateQuestion(q)),...validateExamAssignment(raw)};
  }
  function download(filename,value,type='application/json') {
    const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:`${type};charset=utf-8`});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function csvCell(value){const text=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"';}
  async function importFile(file) {
    if(!file)return;if(file.size>10*1024*1024)throw new Error('请选择不超过 10 MB 的 JSON 文件。');
    const parsed=JSON.parse(await file.text()),array=Array.isArray(parsed)?parsed:parsed.questions;
    if(!Array.isArray(array)||!array.length||array.length>5000)throw new Error('文件须包含 1–5000 道题目的数组，或 { questions: [...] } 对象。');
    const imported=array.map((q,i)=>{try{return validateQuestion(q);}catch(e){throw new Error(`第 ${i+1} 道题：${e.message}`);}}),ids=new Set(questions.map(q=>q.id));
    imported.forEach(q=>{if(ids.has(q.id))q.id=uid('q');ids.add(q.id);});
    if(!window.confirm(`校验通过，将追加 ${imported.length} 道题目。已有题目不会被覆盖，确认导入？`))return;
    const next=[...questions,...imported];await api('/api/state/questions','POST',next);questions=next;draw();say(`已导入 ${imported.length} 道题目。`);
  }
  async function click(event) {
    const target=event.target.closest('[data-action]');if(!target||!host.contains(target))return;
    const {action,id}=target.dataset;if(target.disabled)return;
    try {
      if(role!=='teacher'&&['build','saveExam','publish','assignment','saveAssignment','saveGrades','import','addQuestion','editQuestion','structureTemplate'].includes(action))throw Error('此操作请在本地教师角色视图下进行。角色切换不代表身份认证。');
      if(action==='tab'||action==='role') {
        if(submitting)return;
        if(attempt){saveDraft();attempt=null;} if(builder&&!window.confirm('离开后未创建的试卷设置将丢失，确认离开？'))return;
        builder=null;report=null;editor=null;
        if(action==='tab')tab=target.dataset.tab;else role=target.dataset.role;draw();
      } else if(action==='build')newBuilder();
      else if(action==='closeBuilder'){if(builder.selected.size&&!window.confirm('放弃尚未创建的试卷？'))return;builder=null;draw();}
      else if(action==='randomSelect'){const list=filterQuestions().slice();for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}list.slice(0,10).forEach(q=>builder.selected.add(q.id));draw();say(`已从当前筛选范围追加选择 ${Math.min(10,list.length)} 道题。`);}
      else if(action==='clearSelect'){builder.selected.clear();draw();}
      else if(action==='saveExam') {
        if(!builder.title.trim())throw new Error('请填写试卷名称。');if(!builder.selected.size)throw new Error('请至少选择一道题目。');
        if(!Number.isInteger(Number(builder.duration))||builder.duration<1||builder.duration>300)throw new Error('考试时长须为 1–300 的整数分钟。');
        if(!Number.isFinite(Number(builder.passRate))||builder.passRate<1||builder.passRate>100)throw new Error('及格得分率须为 1–100。');
        if(builder.points&&(!Number.isFinite(Number(builder.points))||builder.points<1||builder.points>100))throw new Error('统一分值须为 1–100。');
        const exam=validateExam({id:uid('exam'),title:builder.title.trim(),description:builder.description.trim(),duration:Number(builder.duration),passRate:Number(builder.passRate),published:builder.published,createdAt:new Date().toISOString(),questions:copy(questions.filter(q=>builder.selected.has(q.id))).map(q=>({...q,points:builder.points?Number(builder.points):q.points})),...validateExamAssignment(builder)});target.disabled=true;
        const next=[exam,...exams];await api('/api/state/exams','POST',next);exams=next;builder=null;draw();say('试卷已创建。');
      } else if(action==='assignment') {const exam=exams.find(e=>e.id===id);if(!exam)throw Error('试卷不存在。');editor={mode:'assignment',exam,assignment:copy(validateExamAssignment(exam))};draw();}
      else if(action==='saveAssignment') {if(!editor||editor.mode!=='assignment')return;const assignment=validateExamAssignment(editor.assignment),next=exams.map(e=>e.id===editor.exam.id?{...e,...assignment}:e);target.disabled=true;await api('/api/state/exams','POST',next);exams=next;editor=null;draw();say('分配范围与时间已保存。');}
      else if(action==='publish') {target.disabled=true;const next=exams.map(e=>e.id===id?{...e,published:!e.published}:e);await api('/api/state/exams','POST',next);exams=next;draw();say('试卷发布状态已更新。');}
      else if(action==='exportExam'){const exam=exams.find(e=>e.id===id);download(`${exam.title}.json`,{version:2,...exam});}
      else if(action==='start') {
        const exam=exams.find(e=>e.id===id);if(!exam?.published)throw new Error('该试卷当前未发布。');
        const draft=readDraft(),ownDraft=draft?.exam.id===id&&(draft.studentId||'')===profileId,availability=examAvailability(exam,selectedStudent());
        if(role==='student'&&(!availability.visible||!availability.canStart&&!(ownDraft&&availability.reason==='已截止')))throw Error(availability.reason);
        if(ownDraft&&availability.visible&&(availability.canStart||availability.reason==='已截止')){attempt=draft;if(exam.closesAt)attempt.deadline=Math.min(attempt.deadline,Date.parse(exam.closesAt));report=null;draw();return;}
        if(draft&&!window.confirm(`已有“${draft.exam.title}”的未提交记录，开始新考试将清除该记录。继续？`))return;
        editor={mode:'start',exam};draw();
      } else if(action==='begin') {
        if(!editor||editor.mode!=='start')return;
        const student=selectedStudent(),availability=examAvailability(editor.exam,student);if(!availability.canStart)throw Error(availability.reason+'；请核对本地学员档案和开放时间。');
        const name=student?.name||host.querySelector('#ex-student-name')?.value.trim();if(!name)throw new Error('请输入访客姓名，或选择本地学员档案。');
        const now=Date.now(),deadline=Math.min(now+editor.exam.duration*60000,editor.exam.closesAt?Date.parse(editor.exam.closesAt):Infinity);
        attempt={id:uid('result'),name,studentId:student?.id||'',classId:student?.classId||'',className:roster.classes.find(c=>c.id===student?.classId)?.name||'',exam:copy(editor.exam),startedAt:now,deadline,answers:{}};editor=null;report=null;saveDraft();draw();
      } else if(action==='pause'){if(submitting)return;saveDraft();attempt=null;draw();say('作答记录已保存，计时继续。');}
      else if(action==='jump')host.querySelector(`#ex-question-${Number(target.dataset.index)}`)?.scrollIntoView({behavior:'smooth',block:'start'});
      else if(action==='submit')await submitAttempt();
      else if(action==='report'){const row=resultRows().find(r=>r.id===id);if(!row)throw Error('当前本地档案无此答卷。');report=copy(row);draw();}
      else if(action==='closeReport'){report=null;tab='results';draw();}
      else if(action==='saveGrades') {
        const marks={};host.querySelectorAll('[data-grade]').forEach(input=>{if(!input.value.trim())return;const indexes=input.dataset.grade.split('.').map(Number);if(indexes.some(i=>!Number.isInteger(i)||i<0))throw Error('评分路径无效。');const root=indexes.shift();let item=report.items[root],mark=marks[root]||(marks[root]={});if(!item)throw Error('评分题目不存在。');for(const index of indexes){item=item.items?.[index];if(!item)throw Error('评分小题不存在。');mark.children=mark.children||{};mark=mark.children[item.question.id]||(mark.children[item.question.id]={});}if(input.dataset.criterion){mark.criteria=mark.criteria||{};mark.criteria[input.dataset.criterion]=input.value;}else mark.score=input.value;});
        const next={...copy(report),items:report.items.map((item,i)=>applyManualScores(item,marks[i]||{}))};
        next.score=round(next.items.reduce((n,i)=>n+i.score,0));next.pending=next.items.some(i=>i.pending);next.gradedAt=new Date().toISOString();target.disabled=true;
        const latest=await api('/api/state/results');const rows=(Array.isArray(latest)?latest:results).map(r=>r.id===next.id?next:r);await api('/api/state/results','POST',rows);results=rows;report=next;draw();say(next.pending?'已保存评分，仍有主观题待评。':'评分完成，最终成绩已保存。');
      } else if(action==='exportBank')download('物联网题库.json',{version:2,description:'填空题 answer 为等价答案；组合题 items 的 weight 分配总分；自定义题 fields 定义作答，rubric 权重分配人工评分。',questions});
      else if(action==='import')host.querySelector('#ex-import-file').click();
      else if(action==='addQuestion'){editor={mode:'add',question:{type:'single',category:'物联网基础',difficulty:'初级',title:'',options:['','','',''],answer:'A',points:2,explanation:''}};draw();}
      else if(action==='editQuestion'||action==='previewQuestion'){editor={mode:action==='editQuestion'?'edit':'preview',question:copy(questions.find(q=>q.id===id))};draw();}
      else if(action==='structureTemplate'){const raw=readQuestionForm(host.querySelector('#ex-question-form'));if((raw.items||raw.fields)&&!window.confirm('使用结构示例替换当前小题或评分结构？'))return;const template=structureTemplate(raw.type);editor.question={...raw,...template,title:raw.title.trim()||template.title};delete editor.question.options;draw();}
      else if(action==='closeEditor'){editor=null;draw();}
      else if(action==='exportResult')download(`答卷-${report?.name||'学员'}.json`,report||results.find(r=>r.id===id));
      else if(action==='exportResults'){const rows=[['学员','考试名称','提交时间','得分','满分','得分率','状态'],...resultRows().map(r=>[r.name,r.title,r.submittedAt,r.score,r.maxScore,`${Math.round(r.score/r.maxScore*100)}%`,r.pending?'待人工评分':r.score/r.maxScore*100>=r.passRate?'通过':'未通过'])];download('物联网测评成绩.csv','\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv');}
    } catch(error) {say(error.message||'操作失败，请重试。');target.disabled=false;}
  }
  function input(event) {
    const el=event.target;
    if(el.dataset.answer!==undefined&&attempt){if(submitting)return;if(Date.now()>=attempt.deadline){submitAttempt(true).catch(error=>say(error.message));return;}const indexes=el.dataset.answer.split('.').map(Number),root=indexes.shift();let q=attempt.exam.questions[root],answers=attempt.answers,key=root;if(!q)return;for(const index of indexes){if(!structured(q)||!q.items[index])return;if(!object(answers[key]))answers[key]={};answers=answers[key];q=q.items[index];key=q.id;}if(el.dataset.answerField){if(!q.fields?.some(f=>f.id===el.dataset.answerField))return;if(!object(answers[key]))answers[key]={};answers[key][el.dataset.answerField]=el.value;}else answers[key]=q.type==='multiple'?[...host.querySelectorAll(`[data-answer="${el.dataset.answer}"]:checked`)].map(x=>x.value):el.value;saveDraft();updateAttemptProgress();}
    if(el.dataset.assignmentTime){const target=editor?.mode==='assignment'?editor.assignment:builder;if(target)target[el.dataset.assignmentTime]=el.value;}
    if(el.dataset.builder&&builder){builder[el.dataset.builder]=el.type==='checkbox'?el.checked:el.value;if(el.dataset.builder==='points'){const chosen=questions.filter(q=>builder.selected.has(q.id));host.querySelector('#ex-selected-points').textContent=builder.points?chosen.length*Number(builder.points):sum(chosen);}}
    if(el.dataset.field==='search'){search=el.value;const caret=el.selectionStart;draw();const replacement=host.querySelector('[data-field="search"]');replacement.focus();replacement.setSelectionRange(caret,caret);}
  }
  async function change(event) {
    const el=event.target;
    try {
      if(el.id==='ex-import-file')await importFile(el.files[0]);
      else if(el.dataset.selectQuestion&&builder){el.checked?builder.selected.add(el.dataset.selectQuestion):builder.selected.delete(el.dataset.selectQuestion);const chosen=questions.filter(q=>builder.selected.has(q.id));host.querySelector('#ex-selected-count').textContent=chosen.length;host.querySelector('#ex-selected-points').textContent=builder.points?chosen.length*Number(builder.points):sum(chosen);}
      else if(el.dataset.field==='filterType'){filterType=el.value;draw();}
      else if(el.dataset.field==='filterCategory'){filterCategory=el.value;draw();}
      else if(el.hasAttribute('data-audience-mode')) {const target=editor?.mode==='assignment'?editor.assignment:builder;if(target){target.audience={...target.audience,mode:el.value};draw();}}
      else if(el.dataset.audienceClass||el.dataset.audienceStudent) {const target=editor?.mode==='assignment'?editor.assignment:builder;if(target){const key=el.dataset.audienceClass?'classIds':'studentIds',id=el.dataset.audienceClass||el.dataset.audienceStudent;target.audience[key]=el.checked?[...new Set([...target.audience[key],id])]:target.audience[key].filter(x=>x!==id);}}
      else if(el.dataset.field==='profile'||el.dataset.field==='startProfile') {profileId=roster.students.some(s=>s.id===el.value)?el.value:'';try{localStorage.setItem(PROFILE_KEY,profileId);}catch(_){}report=null;draw();}
      else if(el.dataset.field==='editorType') {
        const form=host.querySelector('#ex-question-form'),data=new FormData(form),q=editor.question;
        q.title=data.get('title');q.category=data.get('category');q.difficulty=data.get('difficulty');q.points=Number(data.get('points'));q.explanation=data.get('explanation');q.type=el.value;
        delete q.items;delete q.fields;delete q.rubric;delete q.options;
        q.options=['选项一','选项二','选项三','选项四'];q.answer=q.type==='single'?'A':q.type==='multiple'?['A','B']:q.type==='truefalse'?'true':q.type==='fill'?['']:'';
        if(['compound','custom'].includes(q.type)){const template=structureTemplate(q.type),title=q.title;Object.assign(q,template);q.title=title||template.title;delete q.options;}draw();
      }
    } catch(error){say(error.message||'导入失败，请检查 JSON 格式。');}finally {if(el.id==='ex-import-file')el.value='';}
  }
  async function submit(event) {
    if(event.target.id!=='ex-question-form')return;event.preventDefault();if(role!=='teacher')return;const form=event.target,button=form.querySelector('[type=submit]');
    try {
      const raw=readQuestionForm(form);
      for(const field of ['tags','objective','provenance'])if(editor.question[field]!==undefined)raw[field]=copy(editor.question[field]);
      const q=validateQuestion(raw),next=editor.mode==='edit'?questions.map(item=>item.id===q.id?q:item):[q,...questions];button.disabled=true;await api('/api/state/questions','POST',next);questions=next;editor=null;draw();say('题目已保存。');
    } catch(error){say(error.message||'保存失败，请重试。');button.disabled=false;}
  }
  async function render(container) {
    if(host&&host!==container){host.removeEventListener('click',click);host.removeEventListener('input',input);host.removeEventListener('change',change);host.removeEventListener('submit',submit);}
    host=container;active=true;clearInterval(ticker);const token=++renderToken;
    host.removeEventListener('click',click);host.removeEventListener('input',input);host.removeEventListener('change',change);host.removeEventListener('submit',submit);
    host.addEventListener('click',click);host.addEventListener('input',input);host.addEventListener('change',change);host.addEventListener('submit',submit);
    host.innerHTML='<div style="padding:60px;text-align:center;color:#8190a5">正在加载题库与考试记录…</div>';
    try {await initialize();const workspace=await api('/api/state/workspace');if(token===renderToken&&host===container){roster=normalizeRoster(workspace);if(!roster.students.some(s=>s.id===profileId))profileId='';draw();}}
    catch(error){if(token===renderToken){container.innerHTML=`<div style="padding:35px;color:#9d5c56">${esc(error.message||'加载失败，请检查服务连接。')} <button id="ex-retry">重试</button></div>`;container.querySelector('#ex-retry').onclick=()=>render(container);}}
  }
  window.addEventListener('beforeunload',()=>{if(attempt)saveDraft();});
  function stop() { active=false; renderToken++; clearInterval(ticker); ticker=null; if(attempt){saveDraft();attempt=null;} editor=null; }
  window.Exams={render,stop,gradeQuestion,validateQuestion,validateExam,validateExamAssignment,normalizeResultItem,helpers:{mergeSupplement,canonicalQuestion,applySeedCorrections,normalizeRoster,examAvailability,weightedPoints,applyManualScores,hasAnswer,answerComplete,validateAnswer}};
})();
