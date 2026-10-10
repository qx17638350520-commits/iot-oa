'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const prefix=fs.existsSync('static/preset-replay.js')?'static':'dist/static';
const source=fs.readFileSync(prefix+'/preset-replay.js','utf8');
const store=new Map(),intervals=new Map();let next=0,network=0;
const window={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},PresetDemo:{storageKey:s=>'demo:isolated:'+s},setInterval:f=>{intervals.set(++next,f);return next;},clearInterval:id=>intervals.delete(id),fetch:()=>{network++;throw Error('No network permitted');}};
function container(){return{innerHTML:'',listeners:[],querySelectorAll(sel){const attr=sel.slice(1,-1);const matches=[...this.innerHTML.matchAll(new RegExp(attr+'="([^"]+)"','g'))];return matches.map(m=>{const node={dataset:{[attr.replace('data-','')]:m[1]},addEventListener:(_,fn)=>{node.click=fn;this.listeners.push({attr,value:m[1],node});}};return node;});}};}
const c={window};vm.createContext(c);vm.runInContext(source,c);const api=window.PresetReplay;
const click=(el,attr,val)=>{const found=el.listeners.filter(x=>x.attr===attr&&x.value===val).at(-1);assert(found,attr+' '+val);found.node.click();};
(async()=>{
 const real=JSON.parse(fs.readFileSync(prefix+'/training-evidence/ui_training_record.json'));
 const transfer=JSON.parse(fs.readFileSync('transfer-verification.json'));
 assert.deepEqual(JSON.parse(JSON.stringify(api.evidence.record.training_curve)),real.training_curve);
 assert.equal(api.evidence.transfer.heldOut.accuracy,transfer.heldOut.accuracy);
 assert.equal(api.evidence.record.metrics.heldout_loss_after,real.metrics.heldout_loss_after);
 for(const page of ['transfer','trainingReplay','knowledge','neural','multimodal','annotation']){
  const el=container();assert.equal(await api.render(el,page,'logistics'),true);assert(el.innerHTML.includes('流程回放'));
  assert(!el.innerHTML.includes('type="file"'));assert(!el.innerHTML.includes('<input'));
  if(!['annotation','multimodal'].includes(page)){
   click(el,'data-action','next');assert(el.innerHTML.includes('步骤 2 / 4'));
   const again=container();await api.render(again,page,'logistics');assert(again.innerHTML.includes('步骤 2 / 4'));
   click(again,'data-action','back');assert(again.innerHTML.includes('步骤 1 / 4'));
   click(again,'data-action','play');assert.equal(intervals.size,1);[...intervals.values()][0]();assert(again.innerHTML.includes('步骤 2 / 4'));
   click(again,'data-action','play');assert.equal(intervals.size,0);
   click(again,'data-action','restart');assert(again.innerHTML.includes('步骤 1 / 4'));
   click(again,'data-action','play');api.stop();assert.equal(intervals.size,0);
  }else{
   for(const sample of ['sensor','gauge','document','warehouse']){click(el,'data-sample',sample);assert(el.innerHTML.includes('SAMPLE'));assert(el.innerHTML.includes('固定'));}
  }
 }
 const el=container();await api.render(el,'transfer','iot');click(el,'data-step','2');assert(el.innerHTML.includes('不绘制或补造 epoch 曲线'));click(el,'data-step','3');assert(el.innerHTML.includes('50.00%'));
 await api.render(el,'trainingReplay','iot');click(el,'data-step','2');assert(el.innerHTML.includes('polyline'));click(el,'data-step','3');assert(el.innerHTML.includes('内容退化'));
 await api.render(el,'neural','iot');click(el,'data-action','restart');click(el,'data-action','play');for(let i=0;i<3;i++){const fn=[...intervals.values()][0];assert(fn);fn();}assert.equal(intervals.size,0);assert(el.innerHTML.includes('步骤 4 / 4'));
 store.set('demo:isolated:replay_transfer','garbage');await api.render(el,'transfer','iot');assert(el.innerHTML.includes('步骤 1 / 4'));
 const brokenWindow=window.localStorage;window.localStorage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};await api.render(el,'transfer','iot');window.localStorage=brokenWindow;
 assert.equal(await api.render(el,'unknown','iot'),false);assert.equal(network,0);
 for(const file of ['industrial.svg','logistics.svg','gauge.svg','document.svg']){assert(fs.readFileSync(prefix+'/preset-assets/'+file,'utf8').includes('SAMPLE'));}
 assert(!/\bfetch\s*\(|XMLHttpRequest|\.fit\s*\(|\.predict\s*\(|\.detect\s*\(/.test(source));
 console.log('PASS preset replay: exact evidence, 6 pages, all sample selection, step/back/restart, pause, auto-complete, timer cleanup, namespaced persistence, bad storage, no network/model execution');
})().catch(e=>{console.error(e);process.exit(1);});
