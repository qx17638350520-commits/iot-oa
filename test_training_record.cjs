const fs=require('fs'),vm=require('vm'),assert=require('assert');
const prefix=fs.existsSync('static/training-record.js')?'static':'dist/static';
const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(prefix+'/training-record.js','utf8'),c);
const r=JSON.parse(fs.readFileSync(prefix+'/training-evidence/ui_training_record.json'));
assert.equal(c.window.TrainingRecord.validate(r),r);const h=c.window.TrainingRecord.html(r);
for(const text of ['离线证据','损失下降不等于准确率提升','内容退化','completed_run.json','iot-lora-cpu-demo.zip',r.model.revision,...r.generation_comparisons.map(x=>x.id)])assert(h.includes(text),text);
for(const change of [{is_live_job:true},{status:'running'},{reload_verified:false},{training_curve:[]},{manual_generation_review:null}])assert.throws(()=>c.window.TrainingRecord.validate({...r,...change}));
const x=JSON.parse(JSON.stringify(r));x.generation_comparisons[0].before='<script>alert(1)</script>';assert(!c.window.TrainingRecord.html(x).includes('<script>'));
assert(fs.existsSync(prefix+'/training-evidence/iot-lora-cpu-demo.zip'));console.log('PASS completed offline training schema, raw comparison, provenance, escaping and artifact links');
