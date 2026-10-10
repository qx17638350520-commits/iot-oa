/* Reproducible structural/scoring checks. Does not certify subject correctness.
 * node validate_question_bank.cjs ./static/exams.js ./data/questions.json ./static/question-bank/references.json 1500
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const [engineFile,bankFile,referenceFile,expected='1500']=process.argv.slice(2);
if(!engineFile||!bankFile||!referenceFile)throw Error('Usage: node validate_question_bank.cjs <exams.js> <bank.json> <references.json> [expectedCount]');
global.window={addEventListener(){}};require(path.resolve(engineFile));const E=window.Exams;
const raw=fs.readFileSync(bankFile),bank=JSON.parse(raw),refs=JSON.parse(fs.readFileSync(referenceFile,'utf8')),refIds=new Set(refs.map(r=>r.id));
let checks=0,childCount=0,manualParts=0;const ok=(x,m)=>{assert(x,m);checks++};const norm=s=>s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
ok(Array.isArray(bank),'Bank must be an array');ok(bank.length===Number(expected),'Primary count');ok(new Set(bank.map(q=>q.id)).size===bank.length,'Unique primary IDs');ok(new Set(bank.map(q=>norm(q.title))).size===bank.length,'Unique normalized primary titles');
function review(q){
 if(q.type==='compound'&&q.items){let max=0;const answers={};for(const c of q.items){childCount++;review(c);if(c.type==='custom'){answers[c.id]=c.fields?Object.fromEntries(c.fields.map(f=>[f.id,'示例作答'])):'示例作答';}else{answers[c.id]=c.type==='fill'?c.answer[0]:c.answer;max+=c.points;}}ok(Math.abs(q.items.reduce((n,c)=>n+c.points,0)-q.points)<0.00001,'Compound point total '+q.id);const r=E.gradeQuestion(q,answers);ok(Math.abs(r.score-max)<0.00001,'Objective subtotal '+q.id);ok(r.pending===q.items.some(c=>c.type==='custom'),'Manual boundary '+q.id);return;}
 if(['compound','custom'].includes(q.type)){manualParts++;ok(E.gradeQuestion(q,'示例作答').pending===true,'Manual grading '+q.id);return;}
 const correct=q.type==='fill'?q.answer[0]:q.answer;ok(E.gradeQuestion(q,correct).score===q.points,'Correct answer '+q.id);ok(E.gradeQuestion(q,q.type==='multiple'?[]:'__wrong__').score===0,'Wrong answer '+q.id);
 if(q.type==='fill')for(const a of q.answer)ok(E.gradeQuestion(q,a).score===q.points,'Accepted fill '+q.id);
 if(q.options)ok(new Set(q.options.map(s=>s.normalize('NFKC').trim())).size===q.options.length,'Unique options '+q.id);
}
for(const q of bank){const parsed=E.validateQuestion(q);review(parsed);if(q.provenance){ok(q.provenance.reviewStatus==='draft-needs-subject-review','Honest review status '+q.id);for(const id of q.provenance.referenceIds)ok(refIds.has(id),'Known source '+q.id+': '+id);ok(parsed.provenance?.reviewStatus===q.provenance.reviewStatus,'Metadata preserved '+q.id);}}
const counts=key=>Object.fromEntries([...new Set(bank.map(q=>q[key]))].map(k=>[k,bank.filter(q=>q[key]===k).length]));
console.log(JSON.stringify({status:'pass',assertions:checks,primaryQuestionCount:bank.length,embeddedChildQuestionCount:childCount,manualParts,countingRule:'Compounds count once; child questions do not increase the primary total.',byType:counts('type'),byDifficulty:counts('difficulty'),byCategory:counts('category'),sha256:crypto.createHash('sha256').update(raw).digest('hex'),limitations:'Structural and scoring checks cannot prove subject-matter accuracy. Teacher review and classroom validation remain pending.'},null,2));
