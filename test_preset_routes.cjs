'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const kind=fs.existsSync(path.join(__dirname,'static/app.js'))?'iot':'logistics',base=kind==='iot'?'static':'dist/static';
const events=[],routeErrors=[],scrolls=[],historyCalls=[],storage=new Map([[kind+'-workspace-mode-v1','preset'],[kind+'_preset_v1_initialized','{"version":1}']]);
class Element{constructor(){this.children=[];this.dataset={};this.classList={toggle(){},add(){},remove(){}};this._html='';}set innerHTML(v){this._html=v;this.children=[];this.retryButton=null;}get innerHTML(){return this._html;}appendChild(e){this.children.push(e);e.parent=this;}insertBefore(e,b){this.children.splice(this.children.indexOf(b),0,e);e.parent=this;}setAttribute(){}querySelector(selector){if(selector==='[data-route-retry]'&&this._html.includes('data-route-retry'))return this.retryButton||(this.retryButton={onclick:null});return null;}querySelectorAll(){return[];}}
const content=new Element(),breadcrumb=new Element(),toast=new Element();
const document={getElementById:id=>({content,breadcrumb,toast}[id]),querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>new Element()};
const ctx={PRESET_PLATFORM:kind,document,localStorage:{get length(){return storage.size},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},location:{protocol:'https:',hash:'#multimodal'},history:{replaceState(_,__,v){ctx.location.hash=v;historyCalls.push(['replace',v])},pushState(_,__,v){ctx.location.hash=v;historyCalls.push(['push',v])}},console:{...console,error(...args){routeErrors.push(args);}},setTimeout,clearTimeout,addEventListener(){},scrollTo(options){scrolls.push(options);},fetch(){throw Error('unexpected network')},PresetData:{build(){throw Error('unexpected re-seed')}},LOCAL_MODE:true};ctx.window=ctx;
for(const name of ['Logistics','HardwareLab','Transfer','Multimodal','ApplicationLab','Extras','Twin','Exams','Learning','Experiments','Annotation','Knowledge','Admin','PresetReplay','PresetVision','PresetExtensions','PresetLogisticsPanels'])ctx[name]={stop:async()=>events.push('stop:'+name),render:async(c,p)=>{events.push('render:'+name+':'+(p||''));c.innerHTML='ready '+name;},mount:async(c,p)=>{events.push('mount:'+name+':'+p);c.innerHTML='ready '+name;}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,base,'preset-mode.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,base,'app.js'),'utf8'),ctx);
(async()=>{await new Promise(setImmediate);for(const page of ['multimodal','annotation','transfer','trainingReplay',...(kind==='logistics'?['neural']:[])]){events.length=0;await ctx.navigate(page);const expected=['multimodal','annotation'].includes(page)?'PresetVision':'PresetReplay';assert(events.some(x=>x.startsWith('render:'+expected+':')));for(const blocked of ['Transfer','Multimodal','Annotation'])assert(!events.some(x=>x.startsWith('render:'+blocked+':')));for(const timer of ['PresetReplay','PresetVision','PresetExtensions','PresetLogisticsPanels'])assert(events.includes('stop:'+timer));assert.equal(content.children.length,1);}
for(const [page,original] of [['knowledge','Knowledge'],['twin','Twin']]){events.length=0;await ctx.navigate(page);assert(events.includes('render:'+original+':'));assert(events.includes('mount:PresetExtensions:'+page));assert.equal(content.children.length,2);assert.equal(content.children[1].id,'preset-'+page+'-original');}
if(kind==='logistics')for(const [page,original] of [['coldchain','Logistics'],['analytics','Extras'],['drone','Extras']]){events.length=0;await ctx.navigate(page);assert(events.includes('render:'+original+':'+page));assert(events.includes('render:PresetLogisticsPanels:'+page));assert.equal(content.children.length,2);}

// Genuine renderer failures should remain recoverable through the rendered retry control.
const originalAdmin=ctx.Admin.render;
let adminAttempts=0,failedSection;
ctx.Admin.render=async c=>{adminAttempts++;assert.match(c.innerHTML,/route-loading/);assert.match(c.innerHTML,/role="status"/);if(adminAttempts===1){failedSection=c;throw new Error('intentional route renderer failure');}c.innerHTML='admin recovered';};
await ctx.navigate('admin');
assert.equal(adminAttempts,1);assert.equal(content.inert,false);assert.equal(content.children[0],failedSection);assert.match(failedSection.innerHTML,/route-error/);assert.match(failedSection.innerHTML,/role="alert"/);assert.equal(routeErrors.length,1);assert.equal(routeErrors[0][1],'admin');
const retry=failedSection.querySelector('[data-route-retry]');assert.equal(typeof retry.onclick,'function');
await retry.onclick();
assert.equal(adminAttempts,2);assert.equal(content.children.length,1);assert.equal(content.children[0].innerHTML,'admin recovered');assert.notEqual(content.children[0],failedSection);assert.equal(ctx.location.hash,'#admin');assert.equal(content.inert,false);assert(!content.children[0].innerHTML.includes('route-error'));
ctx.Admin.render=originalAdmin;
// A renderer finishing after newer navigation must not replace the active route,
// mount stale extensions, log a stale error, or scroll the new route again.
for(const rejects of [false,true]){
 const originalKnowledge=ctx.Knowledge.render;let oldSection,finish,start;
 const started=new Promise(resolve=>start=resolve);
 const deferred=new Promise((resolve,reject)=>finish=rejects?reject:resolve);
 ctx.Knowledge.render=async c=>{oldSection=c;assert.match(c.innerHTML,/route-loading/);start();await deferred;c.innerHTML='stale knowledge completed';};
 const pending=ctx.navigate('knowledge');await started;await ctx.navigate('admin');
 const currentSection=content.children[0],scrollCount=scrolls.length,errorCount=routeErrors.length;
 assert.equal(currentSection.innerHTML,'ready Admin');assert.equal(ctx.location.hash,'#admin');events.length=0;
 finish(rejects?new Error('intentional stale renderer failure'):undefined);await pending;
 assert.equal(content.children.length,1);assert.equal(content.children[0],currentSection);assert.equal(currentSection.innerHTML,'ready Admin');assert.equal(ctx.location.hash,'#admin');assert.equal(content.inert,false);assert.notEqual(currentSection,oldSection);assert.equal(scrolls.length,scrollCount);assert.equal(routeErrors.length,errorCount);assert(!events.includes('mount:PresetExtensions:knowledge'));
 ctx.Knowledge.render=originalKnowledge;
}
// A navigation superseded while awaiting stop hooks must never render its page.
const originalStop=ctx.PresetDemo.stop;let releaseStop,stopStarted,firstStop=true;
const stopping=new Promise(resolve=>stopStarted=resolve);
ctx.PresetDemo.stop=async()=>{if(firstStop){firstStop=false;stopStarted();await new Promise(resolve=>releaseStop=resolve);}return originalStop.call(ctx.PresetDemo);};
events.length=0;const superseded=ctx.navigate('knowledge');await stopping;await ctx.navigate('admin');const winningSection=content.children[0];releaseStop();await superseded;
assert.equal(content.children[0],winningSection);assert.equal(ctx.location.hash,'#admin');assert.equal(content.inert,false);assert(!events.includes('render:Knowledge:'));ctx.PresetDemo.stop=originalStop;
console.log('PASS '+kind+': real renderer throw → accessible retry panel → successful retry; stale renderer success/failure and stop-hook navigation races preserve the newer route.');
assert.equal(storage.has((kind==='iot'?'iot_':'logistics_v1_')+'workspace'),false);console.log('PASS '+kind+': preset visual/training routes bypass real renderers; extensions retain original graph/twin/logistics screens; stop cleanup; independent storage.');})().catch(e=>{console.error(e);process.exitCode=1});
