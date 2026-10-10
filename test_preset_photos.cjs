'use strict';
// Offline VM tests. No browser, screenshots, recording, network, inference, or training.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=fs.existsSync(path.join(__dirname,'static/preset-photo-workspace.js'))?'static':'dist/static';
const source=fs.readFileSync(path.join(__dirname,base,'preset-photo-workspace.js'),'utf8');
const fixture=['nameplate','gauge','mechanical','pipes'].flatMap((category,n)=>[0,1].map(i=>({
 id:`${category}-${i}`,category,file:`${category}-${i}.jpg`,width:1200,height:800,
 title:`Photo ${category} ${i}`,description:'Manually checked industrial photograph',
 source:'https://example.org/source',author:'Fixture photographer',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
 boxes:[{id:`object-${n}-${i}`,label:'Main object',box:[.1,.2,.6,.5]}],
 points:[{id:`point-${n}-${i}`,label:'Detail',parentId:`object-${n}-${i}`,x:.3,y:.4}],
 polygons:[{id:`polygon-${n}-${i}`,label:'Outline',points:[[.1,.2],[.7,.2],[.7,.7],[.1,.7]]}],
 ...(category==='nameplate'?{ocr:[{text:'SERIAL 001',box:[.2,.3,.2,.1]}]}:{}),
 ...(category==='gauge'?{gauge:{reading:'Manually observed reference',unit:'bar'}}:{})
})));
function harness(photos=fixture){
 const storage=new Map(),timers=new Map(),blobs=new Map(),downloads=[],legacyCalls=[];let id=0,network=0,engines=0;
 const networkFail=()=>{network++;throw Error('Network forbidden');};
 const engineFail=()=>{engines++;throw Error('Model/training forbidden');};
 const interval=f=>{const key=++id;timers.set(key,f);return key;};
 const legacy=name=>{let timer;return{render(host,page,kind){legacyCalls.push({name,page,kind});host.innerHTML='Legacy '+page;timer=interval(()=>{});},stop(){timers.delete(timer);timer=null;}};};
 const box={innerHTML:'',onclick:null,onchange:null,querySelector(selector){assert.equal(selector,'[data-pw-legacy]');return this.legacyHost={innerHTML:''};}};
 const w={IndustrialPhotos:{photos},PresetDemo:{storageKey:k=>'test:photo:'+k},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},PresetVision:legacy('vision'),PresetReplay:legacy('replay'),fetch:networkFail,XMLHttpRequest:networkFail,WebSocket:networkFail,tf:{loadLayersModel:engineFail,loadGraphModel:engineFail,train:engineFail},ort:{InferenceSession:{create:engineFail}},navigator:{mediaDevices:{getUserMedia:engineFail}}};
 const ctx={window:w,console,Blob,fetch:networkFail,XMLHttpRequest:networkFail,WebSocket:networkFail,URL:{createObjectURL:blob=>{const key='blob:'+ ++id;blobs.set(key,blob);return key;},revokeObjectURL:key=>blobs.delete(key)},setInterval:interval,clearInterval:key=>timers.delete(key),setTimeout:interval,clearTimeout:key=>timers.delete(key),document:{createElement(tag){assert.equal(tag,'a');return{click(){downloads.push({name:this.download,blob:blobs.get(this.href)});}}}}};
 vm.runInNewContext(source,ctx,{filename:'preset-photo-workspace.js'});
 return{w,box,storage,timers,blobs,downloads,legacyCalls,api:w.PresetPhotoWorkspace,click(d,disabled=false){assert.equal(typeof box.onclick,'function');box.onclick({target:{closest:()=>({dataset:d,disabled})}});},category(value){box.onchange({target:{dataset:{pwCategory:''},value}});},tick(){for(const f of [...timers.values()])f();},assertSafe(){assert.equal(network,0);assert.equal(engines,0);},async exported(){return JSON.parse(await downloads.at(-1).blob.text());}};
}
const tests=[];function test(name,run){tests.push({name,run});}
function step(h,n){assert.match(h.box.innerHTML,new RegExp(`(?:当前步骤|正在回放) ${n} / 4`));}
function validateArtifact(d,p){
 assert.equal(d.version,'5.5.0');assert.equal(d.schema,'classroom.photo-preset.v1');assert.equal(d.imagePath,p.file);assert.equal(d.imageWidth,p.width);assert.equal(d.imageHeight,p.height);assert.equal(d.imageData,null);
 assert.equal(d.provenance.modelExecuted,false);assert.equal(d.provenance.trainingExecuted,false);assert.equal(d.provenance.realPhotograph,true);assert.equal(d.provenance.annotationSource,'manual_review_preset');assert.equal(d.source.url,p.source);assert.equal(d.source.license,p.license);
 for(const [i,r] of (d.ocr||[]).entries()){assert.equal(r.boxFormat,'xywh_pixels');if(r.box)assert.deepEqual(r.box,Array.from(p.ocr[i].box,(v,j)=>Math.round(v*(j%2?p.height:p.width))));}
 for(const m of d.masks||[])for(const ring of [m.points,...(m.holes||[])])for(const [x,y] of ring){assert(Number.isInteger(x)&&Number.isInteger(y));assert(x>=0&&x<=p.width&&y>=0&&y<=p.height);}
 for(const s of d.shapes)for(const [x,y] of s.points){assert(Number.isInteger(x)&&Number.isInteger(y));assert(x>=0&&x<=p.width&&y>=0&&y<=p.height);}
 for(const s of d.shapes.filter(s=>s.parent_id))assert(d.shapes.some(parent=>parent.object_id===s.parent_id),'shape parent exists');
}
test('all photo tabs, all fixture samples, JSON downloads and hierarchy',async()=>{
 const h=harness();
 for(const [page,tabs] of [['transfer',['classification']],['annotation',['annotation']],['multimodal',['ocr','gauge','parts','pipes','segmentation']]]){
  h.api.render(h.box,page,'iot');
  for(const tab of tabs){h.click({pwTab:tab});const expected=fixture.filter(p=>tab==='ocr'?p.category==='nameplate':tab==='gauge'?p.category==='gauge':tab==='parts'?p.category==='mechanical':tab==='pipes'?p.category==='pipes':true);
   for(const p of expected){assert(h.box.innerHTML.includes(`data-pw-sample="${p.id}"`));h.click({pwSample:p.id});step(h,1);h.click({pwStep:'2'});step(h,3);h.click({pwAction:'export'});const d=await h.exported();validateArtifact(d,p);assert.equal(d.task,tab);assert.equal(h.downloads.at(-1).name,`${p.id}-${tab}.json`);assert.equal(h.downloads.at(-1).blob.type,'application/json');assert(d.shapes.some(s=>s.shape_type==='rectangle'));assert(d.shapes.some(s=>s.shape_type==='point'));assert(d.shapes.some(s=>s.shape_type==='polygon'));}
  }
 }
 h.api.stop();assert.equal(h.blobs.size,0);h.assertSafe();
});
test('step controls, playback completion, pause and restart',()=>{
 const h=harness();h.api.render(h.box,'annotation','iot');step(h,1);h.click({pwAction:'prev'});step(h,1);
 for(let i=1;i<=4;i++){h.click({pwStep:String(i-1)});step(h,i);}h.click({pwAction:'next'});step(h,4);h.click({pwAction:'play'});step(h,1);assert.equal(h.timers.size,1);h.tick();step(h,2);h.click({pwAction:'play'});assert.equal(h.timers.size,0);h.tick();step(h,2);h.click({pwAction:'play'});h.tick();step(h,3);h.tick();step(h,4);assert.equal(h.timers.size,0);assert(!h.box.innerHTML.includes('正在回放 4'));h.click({pwAction:'restart'});step(h,1);h.api.stop();h.assertSafe();
});
test('sample and category switching reset playback, tabs, overlay and zoom',()=>{
 const h=harness();h.api.render(h.box,'transfer','iot');h.click({pwAction:'play'});h.tick();h.click({pwSample:'pipes-1'});step(h,1);assert.equal(h.timers.size,0);h.click({pwStep:'1'});assert(h.box.innerHTML.includes('<svg class="pw-overlay"'));h.click({pwAction:'overlay'});assert(!h.box.innerHTML.includes('<svg class="pw-overlay"'));h.click({pwAction:'overlay'});h.click({pwAction:'zoom'});assert(h.box.innerHTML.includes('pw-photo zoom'));h.click({pwAction:'zoom'});assert(!h.box.innerHTML.includes('pw-photo zoom'));h.click({pwAction:'play'});h.category('mechanical');step(h,1);assert.equal(h.timers.size,0);assert(h.box.innerHTML.includes('data-pw-sample="mechanical-0"'));assert(!h.box.innerHTML.includes('data-pw-sample="pipes-0"'));h.api.stop();h.assertSafe();
});
test('storage resumes state; null, arrays, malformed, primitives safely reset',()=>{
 for(const raw of ['null','[]','[1]','{broken','42','true','"text"']){const h=harness();h.storage.set('test:photo:photo_annotation',raw);h.api.render(h.box,'annotation','iot');step(h,1);h.api.stop();h.assertSafe();}
 const h=harness();h.api.render(h.box,'annotation','iot');h.click({pwSample:'pipes-1'});h.click({pwStep:'2'});h.api.stop();h.api.render(h.box,'annotation','iot');step(h,3);assert(h.box.innerHTML.includes('data-pw-sample="pipes-1" aria-pressed="true"'));h.api.stop();
});
test('switch/render/stop clears owned timers, URLs and delegated handlers',async()=>{
 const h=harness();h.api.render(h.box,'annotation','iot');h.click({pwAction:'export'});h.click({pwAction:'play'});assert.equal(h.blobs.size,1);assert.equal(h.timers.size,1);h.api.render(h.box,'multimodal','iot');assert.equal(h.blobs.size,0);assert.equal(h.timers.size,0);h.click({pwAction:'play'});h.click({pwTab:'gauge'});assert.equal(h.timers.size,0);h.click({pwAction:'play'});h.api.stop();assert.equal(h.timers.size,0);assert.equal(h.box.onclick,null);assert.equal(h.box.onchange,null);h.api.stop();h.assertSafe();
});
test('history and concepts delegate correctly and stop nested playback',()=>{
 for(const [page,tab,name,target] of [['transfer','history','replay','transfer'],['multimodal','concepts','vision','concepts']]){const h=harness();h.api.render(h.box,page,'logistics');h.click({pwTab:tab});assert.deepEqual(h.legacyCalls.at(-1),{name,page:target,kind:'logistics'});assert.equal(h.timers.size,1);h.api.stop();assert.equal(h.timers.size,0,`${tab}: nested playback timer must stop on workspace exit`);h.assertSafe();}
});
test('missing metadata produces explicit empty state without invocation',()=>{const h=harness([]);h.api.render(h.box,'annotation','iot');assert.match(h.box.innerHTML,/照片资源尚未加载/);assert.equal(h.timers.size,0);h.api.stop();h.assertSafe();});
test('real catalog covers all categories, local files, per-photo exports and valid coordinates',async()=>{
 const catalogPath=path.join(__dirname,base,'industrial-photos/catalog.js');
 assert(fs.existsSync(catalogPath),'real photo catalog exists');const context={window:{}};vm.runInNewContext(fs.readFileSync(catalogPath,'utf8'),context);
 const photos=context.window.IndustrialPhotos.photos;assert(Array.isArray(photos)&&photos.length>=4);
 const ids=new Set();for(const category of ['nameplate','gauge','mechanical','pipes'])assert(photos.some(p=>p.category===category),`category ${category} populated`);
 const h=harness(photos);h.api.render(h.box,'annotation','iot');
 for(const p of photos){assert(!ids.has(p.id),'unique photo id');ids.add(p.id);assert(p.width>0&&p.height>0);assert.match(p.source,/^https:\/\//);assert(p.author&&p.license&&p.licenseUrl);assert(fs.statSync(path.join(__dirname,base,'industrial-photos',p.file)).size>0);h.click({pwSample:p.id});h.click({pwStep:'2'});h.click({pwAction:'export'});validateArtifact(await h.exported(),p);}
 h.api.render(h.box,'multimodal','iot');for(const tab of ['ocr','gauge','parts','pipes','segmentation']){h.click({pwTab:tab});assert(!h.box.innerHTML.includes('该类别尚无素材'));h.click({pwAction:'export'});const d=await h.exported();assert.equal(d.task,tab);validateArtifact(d,photos.find(p=>p.file===d.imagePath));}
 h.api.stop();assert.equal(h.blobs.size,0);assert.equal(h.timers.size,0);h.assertSafe();console.log(`  Verified ${photos.length} real catalog photos and all five visual task tabs.`);
});
(async()=>{let failed=0;for(const {name,run} of tests){try{await run();console.log('PASS:',name);}catch(e){failed++;console.error('FAIL:',name,'\n',e.stack);}}console.log(`${tests.length-failed}/${tests.length} offline photo workspace tests passed; no actual engine/network/browser operations.`);if(failed)process.exitCode=1;})();
