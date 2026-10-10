'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=process.argv[2]||path.join(__dirname,fs.existsSync(path.join(__dirname,'static'))?'static':'dist/static');
const storage=new Map(),timers=new Map();let id=0,calls=0,downloads=[];const fail=()=>{calls++;throw Error('No engine/network permitted');};
const box={innerHTML:'',onclick:null,onchange:null,querySelector(){return this.host={innerHTML:'',onclick:null};}};
const w={PresetDemo:{storageKey:x=>'coverage:'+x},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},PresetReplay:{stop(){},render(){throw Error('not part of this test');}},tf:{loadLayersModel:fail},fetch:fail,navigator:{mediaDevices:{getUserMedia:fail}}};
const blobs=new Map();const context={window:w,console,Blob,Map,URL:{createObjectURL(b){let u='blob:'+ ++id;blobs.set(u,b);return u;},revokeObjectURL(u){blobs.delete(u);}},document:{createElement(){return{click(){downloads.push(blobs.get(this.href));}};}},setInterval:f=>{timers.set(++id,f);return id;},clearInterval:i=>timers.delete(i),setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:i=>timers.delete(i)};
for(const file of ['industrial-photos/catalog.js','preset-vision.js','preset-photo-workspace.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const outer=d=>box.onclick({target:{closest:()=>({dataset:d})}});const inner=d=>box.host.onclick({target:{closest:()=>({dataset:d})}});
(async()=>{
 for(const kind of ['iot','logistics']){
  w.PresetPhotoWorkspace.render(box,'multimodal',kind);assert.match(box.innerHTML,/铭牌文字/);outer({pwTab:'materials'});assert.match(box.innerHTML,/工业原材料/);assert(!box.innerHTML.includes('该类别尚无素材'));assert(w.IndustrialPhotos.photos.filter(p=>p.category==='materials').length>=2);outer({pwTab:'concepts'});
  for(const tab of ['ocr','gauge','gesture','segmentation','generation','onnx'])assert(box.host.innerHTML.includes('data-tab="'+tab+'"'));
  inner({tab:'ocr'});for(const sample of ['drawing','plate','safety','rotated']){inner({sample});inner({action:'export'});const d=JSON.parse(await downloads.at(-1).text());assert.equal(d.sample,sample);assert(d.regions.length>0);if(sample==='safety')assert(d.text.includes('保守前に電源を切る'));if(sample==='rotated')assert(d.regions.some(x=>x.angle===90));}
  inner({tab:'gauge'});assert.match(box.host.innerHTML,/0.60 MPa/);inner({action:'export'});const gauge=JSON.parse(await downloads.at(-1).text());assert.equal(gauge.automaticReading,false);assert.equal(gauge.reading,.6);
  inner({tab:'segmentation'});inner({action:'export'});const masks=JSON.parse(await downloads.at(-1).text());assert.equal(masks.instances.length,2);assert(masks.instances.every(x=>x.path));
  outer({pwTab:'ocr'});assert.match(box.innerHTML,/Malmbergs/);w.PresetPhotoWorkspace.render(box,'annotation',kind);outer({pwTab:'teachingAnnotation'});
  for(const tab of ['device','tools','electrical','mechanical','materials','pipes']){inner({tab});inner({action:'export'});const d=JSON.parse(await downloads.at(-1).text());assert(d.shapes.some(x=>x.shape_type==='rectangle'));assert(d.shapes.some(x=>x.shape_type==='point'));assert.equal(d.provenance.modelExecuted,false);}
  outer({pwTab:'annotation'});assert.match(box.innerHTML,/实拍对象标注/);w.PresetPhotoWorkspace.stop();assert.equal(timers.size,0);assert.equal(blobs.size,0);
 }
 assert.equal(calls,0);console.log('PASS both platform modes: photo-first return; all four OCR types; fixed gauge reading; two original instances; all six teaching annotation categories; cleanup; zero engines/network.');
})().catch(e=>{console.error(e);process.exitCode=1});
