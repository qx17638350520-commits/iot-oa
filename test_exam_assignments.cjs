/* Dependency-free scoring, assignment, editor, and mocked-DOM lifecycle regression.
 * This does not claim browser rendering, layout, security, or authenticated sessions.
 * Run: node test_exam_assignments.cjs
 */
'use strict';
process.env.TZ='UTC';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let checks=0;
function equal(a,b,message){assert.deepEqual(a,b,message);checks++;}
function ok(value,message){assert.ok(value,message);checks++;}
function throws(fn,pattern){assert.throws(fn,pattern);checks++;}
const clone=value=>JSON.parse(JSON.stringify(value));
global.window={addEventListener(){}};
require('./dist/static/exams.js');
const E=window.Exams,H=E.helpers;
const seed=require('./dist/data/questions.json');
// Explicit generations prevent a new supplement from being mistaken for legacy seeds.
const originalSeed=seed.filter(q=>/^iot-q\d{3}$/.test(q.id));
const phase1Seed=seed.filter(q=>q.id.startsWith('iot-ext-'));
const phase2Seed=seed.filter(q=>q.id.startsWith('iot-p2-'));
equal(originalSeed.length,42,'Original seed generation');
equal(phase1Seed.length,238,'Phase 1 additions');
equal(phase2Seed.length,1220,'Phase 2 additions');
equal(seed.length,1500,'Current default bank');
equal(originalSeed.length+phase1Seed.length+phase2Seed.length,seed.length,'Every seed belongs to a declared generation');
equal(new Set(seed.map(q=>q.id)).size,1500,'Default IDs are unique across generations');
for(const q of seed)equal(E.validateQuestion(q).id,q.id);
for(const q of seed.filter(q=>['compound','custom'].includes(q.type)&&!q.items&&!q.rubric))equal(E.gradeQuestion(q,'演示作答'),{score:0,pending:true,correct:null});
const single={id:'choice',type:'single',title:'哪一个是消息协议？',category:'通信',difficulty:'初级',points:2,options:['MQTT','LED'],answer:'A',explanation:'MQTT 是消息协议。'};
const custom=E.validateQuestion({id:'design',type:'custom',title:'说明离线缓冲设计',points:6,answer:'说明持久化和重试边界',fields:[{id:'solution',label:'方案',kind:'multiline',required:true},{id:'capacity',label:'容量',kind:'number',required:false}],rubric:[{id:'persistence',label:'说明持久化方式',fieldId:'solution',weight:1},{id:'boundary',label:'说明容量或重试边界',weight:2}]});
const compound=E.validateQuestion({id:'compound',type:'compound',title:'环境监测综合题',points:10,items:[{...single,id:'protocol',weight:2},{id:'transport',type:'fill',title:'写出发布订阅协议',answer:['MQTT'],weight:3},{...custom,id:'plan',weight:5}]});
equal(compound.items.map(q=>q.points),[2,3,5]);
equal(compound.items.map(q=>q.weight),[2,3,5]);
equal(E.validateQuestion(compound),compound);
equal(E.validateQuestion({...compound,points:7}).items.map(q=>q.points),[1.4,2.1,3.5]);
equal(H.weightedPoints([{weight:1},{weight:1},{weight:1}],1),[0.333333,0.333333,0.333334]);
const answers={protocol:'A',transport:' mqtt ',plan:{solution:'本地持久化，限量重试',capacity:'100'}};
const graded=E.gradeQuestion(compound,answers);
equal(graded.score,5);equal(graded.pending,true);equal(graded.correct,null);equal(graded.items.map(i=>i.score),[2,3,0]);
equal(graded.items[2].criteria.map(i=>i.points),[1.666667,3.333333]);
const partial=H.applyManualScores({question:compound,answer:answers,...graded},{children:{plan:{criteria:{persistence:1}}}});
equal(partial.score,6);equal(partial.pending,true);equal(partial.items[2].criteria[1].score,null);
const final=H.applyManualScores(partial,{children:{plan:{criteria:{boundary:3}}}});
equal(final.score,9);equal(final.pending,false);equal(final.correct,false);equal(final.items[2].score,4);
const full=H.applyManualScores(partial,{children:{plan:{criteria:{persistence:1.666667,boundary:3.333333}}}});
equal(full.score,10);equal(full.pending,false);equal(full.correct,true);
throws(()=>H.applyManualScores(partial,{score:10}),/小题/);
throws(()=>H.applyManualScores(partial,{children:{noSuchChild:{score:1}}}),/小题/);
throws(()=>H.applyManualScores(partial,{children:{protocol:{score:0}}}),/客观题/);
throws(()=>H.applyManualScores(partial,{children:{plan:{score:5}}}),/逐项/);
throws(()=>H.applyManualScores(partial,{children:{plan:{criteria:{persistence:1.666668}}}}),/评分须/);
throws(()=>H.applyManualScores(partial,{children:{plan:{criteria:{boundary:-1}}}}),/评分须/);
throws(()=>H.applyManualScores(partial,{children:{plan:{criteria:{boundary:NaN}}}}),/评分须/);
throws(()=>H.applyManualScores(partial,{children:{plan:{criteria:{unknown:0}}}}),/不存在/);
equal(E.gradeQuestion(custom,{solution:'标准答案',capacity:'123'}).pending,true);
equal(E.gradeQuestion(custom,{solution:'标准答案',capacity:'123'}).score,0);
const auto=E.validateQuestion({...compound,items:compound.items.slice(0,2)});
equal(E.gradeQuestion(auto,{protocol:'A',transport:'MQTT'}).score,10);
equal(E.gradeQuestion(auto,{protocol:'B',transport:'MQTT'}).score,6);
equal(E.gradeQuestion(auto,{}).pending,false);
equal(E.gradeQuestion(auto,{}).score,0);
equal(H.answerComplete(compound,answers),true);
equal(H.answerComplete(compound,{protocol:'A'}),false);
equal(H.answerComplete(custom,{capacity:'123'}),false);
equal(H.answerComplete(custom,{solution:'方案'}),true);
equal(H.hasAnswer({}),false);equal(H.hasAnswer({a:''}),false);equal(H.hasAnswer({a:'0'}),true);
throws(()=>E.validateQuestion({...compound,items:[]}),/2–20/);
throws(()=>E.validateQuestion({...compound,items:[single]}),/2–20/);
throws(()=>E.validateQuestion({...compound,items:[{...single,weight:0},{...single,id:'second'}]}),/权重/);
throws(()=>E.validateQuestion({...compound,items:[{...single,weight:Infinity},{...single,id:'second'}]}),/权重/);
throws(()=>E.validateQuestion({...compound,items:[single,single]}),/ID/);
throws(()=>E.validateQuestion({...compound,items:[{...single,id:'__proto__'},{...single,id:'second'}]}),/ID/);
throws(()=>E.validateQuestion({...compound,items:[compound,single]}),/小题/);
throws(()=>E.validateQuestion({...single,items:[single,single]}),/只有组合/);
throws(()=>E.validateQuestion({...custom,fields:[]}),/作答字段/);
throws(()=>E.validateQuestion({...custom,rubric:[]}),/评分标准/);
throws(()=>E.validateQuestion({...custom,fields:[{id:'x',label:'X',kind:'radio'}]}),/类型/);
throws(()=>E.validateQuestion({...custom,rubric:[{id:'x',label:'X',weight:1,fieldId:'absent'}]}),/对应字段/);
throws(()=>E.validateQuestion({...custom,rubric:[{id:'x',label:'X',weight:-1}]}),/权重/);
throws(()=>E.validateQuestion({...custom,rubric:[{id:'x',label:'X',weight:1},{id:'x',label:'Y',weight:2}]}),/重复/);
throws(()=>E.validateQuestion({...custom,fields:[{id:'x" oninput="bad',label:'X',kind:'text'}]}),/ID/);
throws(()=>H.validateAnswer(custom,{capacity:'not numeric'}),/作答字段/);
throws(()=>H.validateAnswer(custom,{unknown:'bad'}),/不存在/);
throws(()=>H.validateAnswer(compound,'bad'),/字段对象/);
throws(()=>H.validateAnswer(compound,{transport:123}),/答题内容/);
equal(E.normalizeResultItem(final),final);
equal(E.normalizeResultItem(partial),partial);
const tampered=clone(final);tampered.items[0].score=0;equal(E.normalizeResultItem(tampered).score,9);
throws(()=>E.normalizeResultItem({...final,score:100}),/分数/);
throws(()=>E.normalizeResultItem({...final,items:[]}),/数量/);
const mismatch=clone(final);mismatch.items[0].answer='B';throws(()=>E.normalizeResultItem(mismatch),/快照/);
const badCriterion=clone(final);badCriterion.items[2].criteria[0].score=10;throws(()=>E.normalizeResultItem(badCriterion),/评分须/);
const legacy=seed.find(q=>q.type==='compound'&&!q.items);const legacyItem={question:legacy,answer:'回答',score:0,pending:true,correct:null};
equal(E.normalizeResultItem(legacyItem),legacyItem);
const legacyGraded=H.applyManualScores(legacyItem,{score:legacy.points/2});equal(legacyGraded.pending,false);equal(E.normalizeResultItem(legacyGraded),legacyGraded);
throws(()=>H.applyManualScores(legacyItem,{score:legacy.points+1}),/评分须/);
const now=Date.parse('2026-10-10T08:00:00Z');
const exam={id:'public',title:'公开测试',published:true,duration:30,passRate:60,questions:[single]};
const person={id:'s-a',classId:'class-a'};
equal(E.validateExamAssignment(exam),{audience:{mode:'all',classIds:[],studentIds:[]},opensAt:'',closesAt:''});
equal(H.examAvailability(exam,null,now).canStart,true);
equal(H.examAvailability({...exam,published:false},person,now).visible,false);
const assignment={...exam,audience:{mode:'assigned',classIds:['class-a'],studentIds:['s-special']}};
equal(H.examAvailability(assignment,person,now).canStart,true);
equal(H.examAvailability(assignment,{id:'s-special',classId:'class-b'},now).canStart,true);
equal(H.examAvailability(assignment,{id:'s-b',classId:'class-b'},now).visible,false);
equal(H.examAvailability(assignment,null,now).visible,false);
equal(H.examAvailability({...assignment,opensAt:new Date(now+1).toISOString()},person,now).reason,'尚未开放');
equal(H.examAvailability({...assignment,opensAt:new Date(now).toISOString()},person,now).canStart,true);
equal(H.examAvailability({...assignment,closesAt:new Date(now+1).toISOString()},person,now).canStart,true);
equal(H.examAvailability({...assignment,closesAt:new Date(now).toISOString()},person,now).reason,'已截止');
throws(()=>E.validateExamAssignment({audience:{mode:'assigned',classIds:[],studentIds:[]}}),/至少分配/);
throws(()=>E.validateExamAssignment({audience:{mode:'everyone'}}),/分配范围/);
throws(()=>E.validateExamAssignment({audience:{mode:'assigned',classIds:'class-a'}}),/列表/);
throws(()=>E.validateExamAssignment({opensAt:'not a date'}),/时间无效/);
throws(()=>E.validateExamAssignment({opensAt:'2026-01-01',closesAt:'2026-01-01'}),/晚于/);
equal(E.validateExamAssignment({...assignment,audience:{mode:'assigned',classIds:['class-a','class-a']}}).audience.classIds,['class-a']);
equal(H.normalizeRoster({className:'原班级',students:[{id:'old',name:'原学员',group:'一组'}]}),{classes:[{id:'class-default',name:'原班级'}],students:[{id:'old',name:'原学员',group:'一组',classId:'class-default'}]});
equal(E.validateExam({...assignment,questions:[compound]}).questions[0],compound);
console.log(`PASS: ${checks} pure assignment, time-window, weighted/compound, custom-rubric, backup, and original-seed compatibility assertions.`);

// Mocked DOM checks exercise actions and storage, not HTML layout or authenticated access.
class Element {
  constructor(dataset={},value=''){this.dataset=dataset;this.value=value;this.checked=false;this.disabled=false;this.isConnected=true;this.innerHTML='';this.textContent='';this.style={};this.handlers={};this.nodes=new Map();this.lists=new Map();this.classList={toggle(){}};this.type='text';}
  addEventListener(type,fn){this.handlers[type]=fn;}removeEventListener(type){delete this.handlers[type];}
  querySelector(sel){if(!this.nodes.has(sel))this.nodes.set(sel,new Element());return this.nodes.get(sel);}
  querySelectorAll(sel){return this.lists.get(sel)||[];}
  closest(){return this;}contains(){return true;}hasAttribute(name){return name==='data-audience-mode'&&Object.hasOwn(this.dataset,'audienceMode');}
  focus(){}setSelectionRange(){}scrollIntoView(){}click(){}remove(){}appendChild(){}
}
let clock=now;const store=new Map(),timers=new Map(),toasts=[],writes=[],exportedFiles=[];let nextTimer=0,failWrite='';
const database=new Map([
 ['workspace',{name:'实训',className:'甲班',classes:[{id:'class-a',name:'甲班'},{id:'class-b',name:'乙班'}],students:[{id:'s-a',name:'甲同学',classId:'class-a'},{id:'s-b',name:'乙同学',classId:'class-b'}]}],
 ['questions',[single,compound,custom]],
 ['exams',[exam,{...assignment,id:'assigned',title:'甲班结构化考试',questions:[compound],closesAt:new Date(now+600000).toISOString()},{...exam,id:'other',title:'乙班专属',audience:{mode:'assigned',classIds:['class-b'],studentIds:[]}},{...exam,id:'future',title:'未来考试',opensAt:new Date(now+3600000).toISOString()},{...exam,id:'unpublished',title:'未发布试卷',published:false}]],
 ['results',[]]
]);
class TestDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
class TestFormData {constructor(form){this.values=form.formValues;}get(key){return this.values[key]??null;}*[Symbol.iterator](){yield* Object.entries(this.values);}}
const ctx={console,Date:TestDate,Math,JSON,Number,String,Array,Object,Map,Set,Error,Promise,FormData:TestFormData,Blob,URL:{createObjectURL(blob){exportedFiles.push(blob);return 'blob:fake';},revokeObjectURL(){}},setTimeout:()=>0,clearTimeout(){},setInterval(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearInterval(id){timers.delete(id);},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},window:{addEventListener(){},confirm:()=>true,toast:message=>toasts.push(message)},document:{createElement:()=>new Element(),body:new Element()},api:async(key,method,value)=>{key=key.replace('/api/state/','');if(method==='POST'){if(failWrite===key){failWrite='';throw Error('测试保存失败');}database.set(key,clone(value));writes.push(key);return {ok:true};}return clone(database.get(key)??null);}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('./dist/static/exams.js'),'utf8'),ctx);
const UI=ctx.window.Exams,host=new Element();
async function click(action,data={}){const node=new Element({action,...data});await host.handlers.click({target:node});return node;}
async function change(dataset,value,checked=false){const node=new Element(dataset,value);node.checked=checked;await host.handlers.change({target:node});return node;}
function input(dataset,value,type='text',checked=false){const node=new Element(dataset,value);node.type=type;node.checked=checked;host.handlers.input({target:node});return node;}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
  await UI.render(host);ok(host.innerHTML.includes('甲班结构化考试'));ok(host.innerHTML.includes('乙班专属'));
  await click('role',{role:'student'});ok(!host.innerHTML.includes('甲班结构化考试'));ok(!host.innerHTML.includes('乙班专属'));ok(!host.innerHTML.includes('未发布试卷'));ok(host.innerHTML.includes('公开测试'));
  await change({field:'profile'},'s-a');ok(host.innerHTML.includes('甲班结构化考试'));ok(!host.innerHTML.includes('乙班专属'));equal(store.get('iot-academy-local-student-v1'),'s-a');
  await click('start',{id:'assigned'});ok(host.innerHTML.includes('准备好开始了吗'));await change({field:'startProfile'},'s-b');await click('begin');ok(toasts.at(-1).includes('未分配'));equal(store.has('logistics-exam-draft-v1'),false);
  await change({field:'startProfile'},'s-a');await click('begin');ok(host.innerHTML.includes('ASSESSMENT IN PROGRESS'));ok(host.innerHTML.includes('data-answer="0.0"'));ok(host.innerHTML.includes('data-answer-field="solution"'));
  let draft=JSON.parse(store.get('logistics-exam-draft-v1'));equal(draft.studentId,'s-a');equal(draft.className,'甲班');equal(draft.deadline,now+600000);equal(timers.size,1);
  input({answer:'0.0'},'A');input({answer:'0.1'},' mqtt ');input({answer:'0.2',answerField:'solution'},'本地持久化，限量重试');input({answer:'0.2',answerField:'capacity'},'100');
  draft=JSON.parse(store.get('logistics-exam-draft-v1'));equal(draft.answers['0'],answers);
  UI.stop();equal(timers.size,0);equal(JSON.parse(store.get('logistics-exam-draft-v1')).answers['0'],answers);
  await UI.render(host);await change({field:'profile'},'s-b');await click('start',{id:'assigned'});ok(toasts.at(-1).includes('未分配'));ok(!host.innerHTML.includes('ASSESSMENT IN PROGRESS'));
  await change({field:'profile'},'s-a');await click('start',{id:'assigned'});ok(host.innerHTML.includes('ASSESSMENT IN PROGRESS'));equal(timers.size,1);
  failWrite='results';await click('submit');equal(database.get('results').length,0);ok(store.has('logistics-exam-draft-v1'));ok(toasts.at(-1).includes('测试保存失败'));
  await click('submit');equal(database.get('results').length,1);equal(store.has('logistics-exam-draft-v1'),false);equal(timers.size,0);
  let result=database.get('results')[0];equal(result.studentId,'s-a');equal(result.classId,'class-a');equal(result.score,5);equal(result.pending,true);equal(result.items[0].items.length,3);
  const originalQuestion=clone(result.items[0].question);database.get('questions')[1].title='后来编辑的题库';equal(result.items[0].question,originalQuestion);
  await click('closeReport');await click('tab',{tab:'exams'});await change({field:'profile'},'s-b');await click('tab',{tab:'results'});ok(!host.innerHTML.includes('甲班结构化考试'));await click('report',{id:result.id});ok(toasts.at(-1).includes('无此答卷'));
  await click('role',{role:'teacher'});await click('report',{id:result.id});ok(host.innerHTML.includes('data-grade="0.2"'));ok(host.innerHTML.includes('data-criterion="persistence"'));
  host.lists.set('[data-grade]',[new Element({grade:'0.2',criterion:'persistence'},'1.666667'),new Element({grade:'0.2',criterion:'boundary'},'3.333333')]);
  await click('saveGrades');result=database.get('results')[0];equal(result.score,10);equal(result.pending,false);ok(result.gradedAt);equal(result.items[0].items[2].criteria.map(x=>x.score),[1.666667,3.333333]);
  // Existing assignment editing persists independently of publish status and question snapshots.
  await click('closeReport');await click('tab',{tab:'exams'});await click('assignment',{id:'public'});await change({audienceMode:''},'assigned');await change({audienceStudent:'s-a'},'',true);input({assignmentTime:'opensAt'},'2026-10-10T08:30');input({assignmentTime:'closesAt'},'2026-10-10T09:30');await click('saveAssignment');
  const edited=database.get('exams').find(e=>e.id==='public');equal(edited.audience,{mode:'assigned',classIds:[],studentIds:['s-a']});equal(edited.opensAt,'2026-10-10T08:30:00.000Z');equal(edited.questions,[single]);
  await click('role',{role:'student'});await change({field:'profile'},'s-a');await click('start',{id:'public'});ok(toasts.at(-1).includes('尚未开放'));
  // A begin-modal opened before deadline cannot start after close.
  await click('start',{id:'assigned'});clock=now+600000;await click('begin');ok(toasts.at(-1).includes('已截止'));equal(store.has('logistics-exam-draft-v1'),false);
  clock=now+1000;await click('closeEditor');await click('start',{id:'assigned'});await click('begin');input({answer:'0.0'},'A');await click('pause');clock=now+600001;await click('start',{id:'assigned'});await flush();equal(database.get('results').length,2);equal(database.get('results')[0].timedOut,true);equal(database.get('results')[0].items[0].items[0].score,2);equal(timers.size,0);
  // Structured JSON editor and import preserve genuine schema, without touching seed files.
  await click('role',{role:'teacher'});await click('tab',{tab:'bank'});await click('addQuestion');
  const form=new Element();form.id='ex-question-form';form.formValues={type:'compound',category:'通信',difficulty:'中级',points:'10',title:'编辑器组合题',answer:'小题参考',explanation:'说明',structure:JSON.stringify(compound.items)};host.nodes.set('#ex-question-form',form);
  await host.handlers.submit({target:form,preventDefault(){}});equal(database.get('questions')[0].type,'compound');equal(database.get('questions')[0].items.length,3);equal(database.get('questions')[0].items.map(q=>q.points),[2,3,5]);
  await click('editQuestion',{id:database.get('questions')[0].id});ok(host.innerHTML.includes('name="structure"'));ok(host.innerHTML.includes('&quot;weight&quot;'));
  await click('closeEditor');const fileNode=new Element();fileNode.id='ex-import-file';fileNode.files=[{size:1000,text:async()=>JSON.stringify({questions:[custom]})}];await host.handlers.change({target:fileNode});equal(database.get('questions').at(-1).rubric,custom.rubric);equal(database.get('questions').at(-1).fields,custom.fields);
  await click('exportBank');const exported=JSON.parse(await exportedFiles.at(-1).text());equal(exported.version,2);ok(exported.questions.some(q=>q.items?.length===3));ok(exported.questions.some(q=>q.rubric?.length===2));
  await click('closeEditor');await click('tab',{tab:'exams'});await click('build');input({builder:'title'},'班级定向新试卷');input({builder:'points'},'7');await change({selectQuestion:'compound'},'',true);await change({audienceMode:''},'assigned');await change({audienceClass:'class-a'},'',true);await click('saveExam');
  const built=database.get('exams')[0];equal(built.title,'班级定向新试卷');equal(built.audience,{mode:'assigned',classIds:['class-a'],studentIds:[]});equal(built.questions[0].points,7);equal(built.questions[0].items.map(q=>q.points),[1.4,2.1,3.5]);
  await click('exportExam',{id:built.id});const exportedExam=JSON.parse(await exportedFiles.at(-1).text());equal(exportedExam.version,2);equal(exportedExam.audience,built.audience);equal(exportedExam.questions,built.questions);
  // Admin backups use the same helpers so assignment and manual marks round-trip together.
  const adminContext={window:{Exams:E},escapeHTML:s=>String(s)};vm.createContext(adminContext);vm.runInContext(fs.readFileSync(require.resolve('./dist/static/admin.js'),'utf8'),adminContext);
  const restored=adminContext.window.Admin.validateBackup({schema:'iot-studio-backup/v1',data:{questions:[compound,custom],exams:[built],results:[result]}});equal(clone(restored.exams[0].audience),built.audience);equal(clone(restored.results[0].items),result.items);equal(restored.results[0].studentId,'s-a');equal(restored.results[0].pending,false);
  await click('tab',{tab:'bank'});
  // Escaped imported content must remain text in generated markup.
  const escaped={...custom,id:'escaped',title:'<img src=x onerror=alert(1)>',rubric:[{id:'safe-id',label:'<script>bad()</script>',weight:1}]};fileNode.files=[{size:1000,text:async()=>JSON.stringify([escaped])}];await host.handlers.change({target:fileNode});await click('previewQuestion',{id:'escaped'});ok(!host.innerHTML.includes('<script>bad()'));ok(host.innerHTML.includes('&lt;script&gt;bad()'));
  UI.stop();equal(timers.size,0);ok(writes.includes('results'));ok(writes.includes('exams'));ok(writes.includes('questions'));
  console.log(`PASS: ${checks} total assertions, including local-profile visibility and resume binding, deadline submit, failed-save recovery, per-criterion grading persistence, assignment edit, structured editor/import and escaped markup.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
