const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const annotationFile=__dirname+'/dist/static/annotation.js';
const D=require(__dirname+'/dist/static/detection.js');
function harness(){
 const elements=new Map(),timers=new Map(),writes=[];let nextTimer=1,failSave=false,predict=null;
 function element(){return {innerHTML:'',textContent:'',value:'',checked:false,dataset:{},style:{},listeners:{},classList:{toggle(){}},addEventListener(n,f){this.listeners[n]=f;},focus(){},click(){},insertAdjacentHTML(_,s){this.innerHTML+=s;}};}
 const draw=new Proxy({measureText:s=>({width:s.length*7})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 function makeCanvas(){return {...element(),width:640,height:480,getContext:()=>draw,getBoundingClientRect(){return{left:0,top:0,width:this.width,height:this.height}},setPointerCapture(){},toDataURL:()=> 'data:image/png;base64,AA=='};}
 const canvas=makeCanvas(),root={...element(),isConnected:true,querySelector(s){if(s==='canvas')return canvas;if(!elements.has(s))elements.set(s,element());return elements.get(s);},querySelectorAll(){return []}},container={innerHTML:'',querySelector:()=>root};
 root.querySelector('[data-threshold]').value='50';root.querySelector('[data-replace-ai]').checked=true;
 class FakeImage{constructor(){this.width=640;this.height=480;}set src(v){this._src=v;queueMicrotask(()=>this.onload?.());}get src(){return this._src;}}
 let stored={image:'data:image/jpeg;base64,AA==',imageName:'test.jpg',width:640,height:480,labels:[{id:1,name:'manual',parent:null,color:'#123456'}],annotations:[],nextId:1};
 const c={window:{VisionDetection:{...D,detect:(...args)=>predict(...args)}},Image:FakeImage,performance,console,document:{createElement:t=>t==='canvas'?makeCanvas():element()},URL,Blob,confirm:()=>true,toast:()=>{},setTimeout:f=>{const id=nextTimer++;timers.set(id,f);return id},clearTimeout:id=>timers.delete(id),api:async(path,method,data)=>{if(method==='POST'){if(failSave)throw Error('quota');stored=JSON.parse(JSON.stringify(data));writes.push(stored);return stored;}return JSON.parse(JSON.stringify(stored));}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(annotationFile,'utf8'),c);
 const click=dataset=>root.listeners.click({target:{closest:()=>({dataset})}});
 const drawBox=()=>{canvas.listeners.pointerdown({clientX:10,clientY:20,pointerId:1});canvas.listeners.pointerup({clientX:70,clientY:100,pointerId:1});};
 return {c,root,canvas,container,e:s=>root.querySelector(s),writes,timers,click,drawBox,predict:f=>predict=f,fail:v=>failSave=v};
}
(async()=>{
 const h=harness();await h.c.window.Annotation.render(h.container);h.drawBox();assert.equal(h.writes.length,0);assert.equal(h.timers.size,1);await h.c.window.Annotation.stop();assert.equal(h.writes.length,1);assert.equal(h.writes[0].annotations.length,1);assert.equal(h.timers.size,0);
 await h.c.window.Annotation.render(h.container);let resolve;h.predict(()=>new Promise(r=>resolve=r));const pending=h.click({action:'detect'});await Promise.resolve();await h.c.window.Annotation.stop();h.root.isConnected=false;resolve({predictions:[{class:'person',score:.9,bbox:[10,10,40,40]}],backend:'cpu'});await pending;assert.equal(h.writes.length,1,'stale prediction must not save');assert.equal(h.writes[0].annotations.length,1);
 const k=harness();await k.c.window.Annotation.render(k.container);k.drawBox();k.fail(true);await assert.rejects(k.c.window.Annotation.stop(),/尚未保存/);k.fail(false);await k.c.window.Annotation.stop();assert.equal(k.writes.length,1,'failed save can be retried through stop hook');
 const a=harness();await a.c.window.Annotation.render(a.container);a.predict(async()=>({predictions:[{class:'person',score:.92,bbox:[12,23,100,200]}],backend:'cpu'}));await a.click({action:'detect'});assert.match(a.e('[data-ai-status]').textContent,/1 个物体/);assert.match(a.e('[data-annotations]').innerHTML,/待复核/);await a.click({action:'review'});await a.c.window.Annotation.stop();assert.equal(a.writes[0].annotations[0].reviewed,true);assert.equal(a.writes[0].annotations[0].confidence,.92);
 const e=harness();await e.c.window.Annotation.render(e.container);e.drawBox();e.predict(async()=>{throw Error('test unavailable')});await e.click({action:'detect'});assert.match(e.e('[data-ai-status]').textContent,/AI 识别未完成/);await e.c.window.Annotation.stop();assert.equal(e.writes[0].annotations.length,1,'inference failure preserves annotations');
 console.log('PASS: annotation lifecycle logic with mocked DOM (not browser QA): immediate save-on-leave, timer cancellation, stale result rejection, failed-save recovery, synthetic-output integration flow, review persistence, inference-error annotation retention.');
})().catch(e=>{console.error(e);process.exitCode=1;});
