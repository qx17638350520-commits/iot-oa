/* Read-only preset factory and real-module schema integration checks. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=fs.existsSync(path.join(__dirname,'static/preset-data.js'))?__dirname:path.join(__dirname,'dist');
const bankPath=path.join(base,'data/questions.json');
const bankBytes=fs.readFileSync(bankPath,'utf8'),bank=JSON.parse(bankBytes);
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
freeze(bank);
let fetches=0,writes=0;
global.window={addEventListener(){},fetch:async url=>{assert.equal(url,'/data/questions.json');fetches++;return {ok:true,json:async()=>bank};}};
global.localStorage={getItem(){return null;},setItem(){writes++;throw Error('unexpected storage write');},removeItem(){writes++;throw Error('unexpected storage delete');}};
global.api=()=>{writes++;throw Error('unexpected workspace API access');};
for(const file of ['learning','exams','twin','knowledge','transfer','admin','preset-data'])require(path.join(base,'static',file+'.js'));
if(fs.existsSync(path.join(base,'static/logistics-core.js'))){require(path.join(base,'static/logistics-core.js'));window.Extras={helpers:require(path.join(base,'static/extras.js'))};window.HardwareLab={helpers:require(path.join(base,'static/hardware-lab.js'))};}
(async()=>{
 const kind=window.LogisticsCore?'logistics':'iot';
 const seed=await window.PresetData.build(kind);
 assert.equal(seed.questions.length,1500);assert.deepEqual(seed.questions,bank);
 assert.equal(seed.workspace.students.length,12);assert.equal(seed.workspace.classes.length,2);
 assert(seed.workspace.students.every(s=>s.name.startsWith('SAMPLE学员')));
 assert(seed.workspace.notice.includes('虚构'));
 assert.equal(Object.keys(seed.learning.lessons).length,18);
 const l=window.Learning.helpers.normalizeState(seed.learning);
 assert.equal(window.Learning.courses.reduce((n,c)=>n+window.Learning.helpers.courseProgress(c,l).done,0),10);
 const e=window.Experiments.helpers.normalizeState(seed.experiments);
 assert.equal(Object.keys(e.reports).length,6);
 assert.equal(window.Experiments.tasks.filter(t=>window.Experiments.helpers.reportStatus(t,e.reports[t.id])==='已提交').length,4);
 assert.equal(seed.exams.length,3);assert.equal(seed.results.length,8);
 assert.equal(seed.results.filter(r=>r.pending).length,1);
 for(const r of seed.results){assert.equal(r.score,r.items.reduce((n,i)=>n+i.score,0));assert.equal(r.maxScore,r.items.reduce((n,i)=>n+i.question.points,0));r.items.forEach(i=>assert.deepEqual(window.Exams.normalizeResultItem(i),i));}
 assert(seed.results.some(r=>r.score<r.maxScore&&!r.pending));
 assert.equal(seed.annotation_workspace.annotations.length,3);
 const png=Buffer.from(seed.annotation_workspace.image.split(',')[1],'base64');assert.equal(png.readUInt32BE(16),640);assert.equal(png.readUInt32BE(20),360);
 assert.equal(window.Knowledge.validateJSONL(seed.knowledge_workspace.rows.map(r=>JSON.stringify(r)).join('\n')).errors.length,0);
 assert(seed.twin.nodes.length>=12);assert(seed.twin.nodes.every(n=>n.history.length===12));
 assert.equal(seed.transfer_learning.bundle,null);assert.equal(seed.transfer_learning.result,null);
 const common=Object.fromEntries(Object.entries(seed).filter(([k])=>['workspace','questions','exams','results','annotation_workspace','knowledge_workspace','learning','experiments','twin'].includes(k)));
 assert.equal(window.Transfer.helpers.loadState(seed.transfer_learning).bundle,null);
 const normalized=window.Admin.validateBackup({schema:'iot-studio-backup/v1',data:common});
 assert.equal(normalized.exams.length,3);assert.equal(normalized.results.length,8);
 if(kind==='logistics'){
  assert.equal(window.Extras.helpers.validateTopology(seed.extras_labs).ok,true);assert.equal(seed.extras_labs.events[1].result,'duplicate');assert.equal(window.HardwareLab.helpers.validate(seed.hardware_lab.wires).ok,true);assert.equal(seed.extras_neural.model,null);assert(seed.extras_neural.dataset.samples.length>=12);assert.equal(seed.extras_analytics.records.length,16);
  const s=seed.logistics;assert.equal(s.products.length,3);assert.equal(s.vehicles.length,4);
  assert.deepEqual(new Set(s.tasks.map(t=>t.status)),new Set(['delivered','running','planned','arrived']));
  assert(s.alarms.some(a=>a.ack&&a.resolved));assert(s.alarms.some(a=>!a.resolved));assert.equal(s.telemetry.length,4);
  assert.equal(s.reports.length,1);assert.equal(s.reports[0].evidence.telemetry.length,4);
  assert(s.ledger.every(r=>r.at===window.PresetData.fictionalDate));
  for(const p of s.products){assert.equal(p.stock,s.ledger.filter(l=>l.product===p.id).reduce((n,l)=>n+l.delta,0));assert(window.LogisticsCore.available(s,p)>=0);}
  const planned=s.tasks.find(t=>t.status==='planned');assert.equal(window.LogisticsCore.apply(s,'dispatch',{id:planned.id}).tasks.find(t=>t.id===planned.id).status,'running');
 }
 assert.equal(writes,0);assert.equal(fetches,1);assert.equal(fs.readFileSync(bankPath,'utf8'),bankBytes);
 const snapshot=JSON.stringify(seed);
 seed.workspace.students[0].name='changed';seed.questions[0].title='changed';
 const fresh=await window.PresetData.build(kind);assert.equal(JSON.stringify(fresh),snapshot);assert.equal(fresh.workspace.students[0].name,'SAMPLE学员01');assert.equal(fresh.questions[0].title,bank[0].title);
 await assert.rejects(window.PresetData.build('unknown'),/未知/);
 window.fetch=async()=>({ok:false});await assert.rejects(window.PresetData.build(kind),/读取失败/);
 assert.equal(writes,0);
 console.log('PASS '+kind+': 1500 unchanged questions; 12 students; 18 lessons; 6 reports; 3 exams / 8 valid results; PNG annotations; knowledge, twin and untrained transfer schema; isolated fresh returns and zero writes'+(kind==='logistics'?'; consistent warehouse ledger / four order states / cold-chain evidence.':'.'));
})().catch(e=>{console.error(e);process.exitCode=1;});
