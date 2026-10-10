/* Dependency-free VM/DOM-mock regressions, not a pixel/browser test. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=fs.existsSync(path.join(__dirname,'static/preset-extensions.js'))?'static':'dist/static';
const source=fs.readFileSync(path.join(__dirname,base,'preset-extensions.js'),'utf8');
let checks=0;
function ok(...a){assert.ok(...a);checks++;}
function eq(...a){assert.deepEqual(...a);checks++;}
function fixture(kind){
 const stored=new Map([['knowledge_workspace','KEEP'],['twin_scene','KEEP']]),timers=new Map(),downloads=[],blobs=[];let id=0,forbidden=0;
 const deny=()=>{forbidden++;throw Error('Forbidden hardware, network, or model call');};
 const w={PresetDemo:{enabled:true,storageKey:n=>kind+'_preset_v1_'+n},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},setInterval:fn=>{timers.set(++id,fn);return id;},clearInterval:i=>timers.delete(i),setTimeout:fn=>fn(),Blob:class{constructor(parts,meta){this.parts=parts;this.meta=meta;blobs.push(this);}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},document:{createElement:()=>({click(){downloads.push(this.download);}})},fetch:deny,XMLHttpRequest:deny,WebSocket:deny,Audio:deny,AudioContext:deny,navigator:{mediaDevices:{getUserMedia:deny},serial:{requestPort:deny},bluetooth:{requestDevice:deny},geolocation:{getCurrentPosition:deny}},tf:{loadLayersModel:deny},api:deny};
 vm.runInNewContext(source,{window:w,fetch:deny,XMLHttpRequest:deny,WebSocket:deny,navigator:w.navigator,document:w.document});
 function host(){const events={},output={textContent:''},status={textContent:''};return {innerHTML:'',isConnected:true,events,output,status,addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n],contains:()=>true,querySelector:s=>s==='[data-px-text-output]'?output:status,click(action){events.click?.({target:{closest:()=>({dataset:{px:action},disabled:false})}});},input(value){events.input?.({target:{value,matches:()=>true}});}};}
 return{w,stored,timers,downloads,blobs,host,get forbidden(){return forbidden;},tick(){const fn=[...timers.values()][0];ok(fn,'timer is registered');fn();}};
}
for(const kind of ['iot','logistics']){
 const e=fixture(kind),api=e.w.PresetExtensions,t=api._test,g=t.graph(kind);
 eq(g.schema,'preset-knowledge-graph/v1');eq(g.nodes.length,4);eq(g.edges.length,3);eq(g.provenance.modelInference,false);eq(g.provenance.workspaceMutation,false);
 const ids=new Set(g.nodes.map(n=>n.id));
 for(const edge of g.edges){ok(ids.has(edge.source)&&ids.has(edge.target),'all relation endpoints exist');ok(edge.added);eq(edge.review.status,'preset-reviewed');ok(g.sources.some(s=>s.id===edge.sourceId));const type=g.ontology.relationTypes.find(r=>r.id===edge.predicate);ok(type);eq(g.nodes.find(n=>n.id===edge.source).type,type.domain);eq(g.nodes.find(n=>n.id===edge.target).type,type.range);}
 const visited=new Set(['n0']);let last=0;while(last!==visited.size){last=visited.size;for(const r of g.edges)if(visited.has(r.source)||visited.has(r.target)){visited.add(r.source);visited.add(r.target);}}eq(visited.size,g.nodes.length,'all nodes connected to source entity');
 const h=e.host();let c=api.mount(h,'knowledge',kind);ok(h.innerHTML.includes('知识图谱构建'));eq(c.getState().index,0);
 for(let i=1;i<4;i++){h.click('next');eq(c.getState().index,i);}ok(h.innerHTML.includes('新增 4 个节点 / 3 条关系'));h.click('next');eq(c.getState().index,3);h.click('back');eq(c.getState().index,2);ok(h.innerHTML.includes('关系审核'));ok(h.innerHTML.includes('固定审核：已核对问答与本体'));
 h.click('export');eq(e.downloads.length,1);const exported=JSON.parse(e.blobs[0].parts[0]);eq(exported.fixtureId,g.fixtureId);eq(exported.edges.length,3);ok(exported.sources[0].answer);
 h.click('play');eq(e.timers.size,1);h.click('pause');eq(e.timers.size,0);eq(c.getState().playing,false);
 h.click('restart');eq(c.getState().index,0);h.click('play');e.tick();eq(c.getState().index,1);e.tick();e.tick();eq(c.getState().index,3);eq(e.timers.size,0);eq(c.getState().playing,false);
 api.stop();eq(Object.keys(h.events).length,0);c=api.mount(h,'knowledge',kind);eq(c.getState().index,3,'stage restored');eq(c.getState().playing,false,'playback never auto starts');
 h.click('restart');h.click('back');eq(c.getState().index,0);h.click('play');api.stop();eq(e.timers.size,0);c.dispatch('next');eq(c.getState().index,0,'stopped controller inert');
 const twin=e.host();c=api.mount(twin,'twin',kind);for(const label of ['文字显示','开关 / 控制开关','人体红外 PIR','储气罐填充','货物位置','扬声器 / 蜂鸣器样例','摄像头画面样例','人脸几何占位'])ok(twin.innerHTML.includes(label),'reachable widget: '+label);
 eq(c.getState().widgets.length,8);for(const label of ['采集卡样例','消息数据包','云平台流程样例','场景更新'])ok(twin.innerHTML.includes(label));
 for(const id of ['text','switch','pir','tank','cargo','audio','camera','face']){ok(twin.innerHTML.includes('data-px-widget="'+id+'"'));twin.click('widget:'+id);ok(!twin.innerHTML.includes('data-px-widget="'+id+'"'));twin.click('widget:'+id);ok(twin.innerHTML.includes('data-px-widget="'+id+'"'));}
 twin.click('widget:camera');api.stop();c=api.mount(twin,'twin',kind);ok(!c.getState().widgets.includes('camera'));ok(!twin.innerHTML.includes('data-px-widget="camera"'));twin.click('restart');eq(c.getState().widgets.length,8);
 twin.click('next');ok(twin.innerHTML.includes('样例数据包：'));twin.click('next');ok(twin.innerHTML.includes('云流程占位：'));twin.click('next');ok(twin.innerHTML.includes('场景属性更新：'));twin.click('restart');
 twin.click('switch');eq(c.getState().switchOverride,true);twin.click('pir');eq(c.getState().pirOverride,true);twin.input('<img src=x onerror=bad>');eq(c.getState().text,'<img src=x onerror=bad>');eq(twin.output.textContent,'<img src=x onerror=bad>');twin.click('next');ok(twin.innerHTML.includes('&lt;img'));ok(!twin.innerHTML.includes('<img src=x'));eq(c.getState().switchOverride,null);
 api.stop();c=api.mount(twin,'twin',kind);eq(c.getState().index,1);eq(c.getState().text,'<img src=x onerror=bad>');twin.click('restart');eq(c.getState().text,null);eq(c.getState().switchOverride,null);eq(c.getState().index,0);
 twin.click('play');twin.isConnected=false;e.tick();eq(e.timers.size,0,'detached mount stops');eq(Object.keys(twin.events).length,0);
 eq(e.stored.get('knowledge_workspace'),'KEEP');eq(e.stored.get('twin_scene'),'KEEP');ok([...e.stored.keys()].filter(k=>k!=='knowledge_workspace'&&k!=='twin_scene').every(k=>k.startsWith(kind+'_preset_v1_extensions_')));
 e.w.PresetDemo.enabled=false;eq(api.mount(e.host(),'knowledge',kind),null);eq(e.timers.size,0);eq(e.forbidden,0,'no network/model/hardware calls');
 eq(t.normalize({version:1,index:500,playing:true}).index,3);eq(t.normalize({version:1,index:1.5}).index,0);eq(t.normalize({version:1,index:2,playing:true}).playing,false);
 e.w.PresetDemo.enabled=true;e.w.localStorage.getItem=()=>'{broken';const broken=e.host();c=api.mount(broken,'knowledge',kind);eq(c.getState().index,0);ok(broken.innerHTML.includes('无法读取'));e.w.localStorage.setItem=()=>{throw Error('quota');};broken.click('next');eq(c.getState().index,1);ok(broken.innerHTML.includes('无法保存'));api.stop();
}
console.log('Preset extensions: '+checks+' checks passed (both platform fixtures; VM/DOM mock).');
