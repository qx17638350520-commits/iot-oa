'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=fs.existsSync('dist/static/preset-logistics-panels.js')?'dist/static/preset-logistics-panels.js':'static/preset-logistics-panels.js';
const source=fs.readFileSync(path,'utf8');
const store=new Map(),timers=new Map();let counter=0,network=0;
const window={PresetDemo:{storageKey:k=>'logistics_preset_v1_'+k},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setInterval:fn=>{timers.set(++counter,fn);return counter;},clearInterval:id=>timers.delete(id),fetch:()=>{network++;throw Error('Network prohibited');}};
vm.runInNewContext(source,{window});const api=window.PresetLogisticsPanels;
const host=()=>({innerHTML:'',contains:()=>true,onclick:null,onchange:null});
function click(h,d){h.onclick({target:{closest:()=>({dataset:d,disabled:false})}});}
function filter(h,name,value){h.onchange({target:{dataset:{filter:name},value}});}
const saved=p=>JSON.parse(store.get('logistics_preset_v1_logistics_'+p));
assert.equal(api.data.shipments.length,3);assert.equal(api.data.events.length,144);assert.equal(api.data.aircraft.length,3);
assert.equal(api.calculate.coldRows('CL-2401','all').length,6);
assert.deepEqual(Array.from(api.calculate.coldRows('CL-2401','early'),p=>p[0]),[0,15,30]);
assert.deepEqual(Array.from(api.calculate.coldRows('CL-2401','late'),p=>p[0]),[45,60,75]);
assert.equal(api.calculate.coldRows('CL-2401','all').filter(p=>p[3]>8).length,1);
assert.equal(api.data.events.reduce((n,e)=>n+e.count,0),720);
for(const event of ['all','浏览','搜索','加购','购买'])for(const category of ['all','生鲜食品','冷藏乳品','生活用品'])for(const time of ['all','morning','afternoon']){
 const f={event,category,time};
 const expected=Array.from(api.data.events).filter(e=>(event==='all'||e.type===event)&&(category==='all'||e.category===category)&&(time==='all'||(time==='morning'?e.minute<630:e.minute>=630)));
 const actual=api.calculate.filteredEvents(f);assert.equal(actual.length,expected.length);
 const counts=api.calculate.hotCounts(f);assert.equal(counts.length,6);
 for(let zone=0;zone<6;zone++)assert.equal(counts[zone].count,expected.filter(e=>e.zone===zone).reduce((n,e)=>n+e.count,0));
}
for(const p of ['coldchain','analytics','drone']){
 const h=host();assert.equal(api.render(h,p),true);assert(h.innerHTML.includes('固定虚构教学数据'));assert(!/<input|type="file"/.test(h.innerHTML));
 if(p==='analytics'){
  filter(h,'event','搜索');assert(h.innerHTML.includes('消费习惯摘要'));assert(api.calculate.filteredEvents({event:'搜索'}).length>0);filter(h,'event','购买');filter(h,'category','冷藏乳品');filter(h,'time','afternoon');click(h,{zone:'2'});click(h,{tab:'events'});
  const next=host();api.render(next,p);assert.equal(saved(p).event,'购买');assert(next.innerHTML.includes('冷藏区 · 行为明细'));assert(next.innerHTML.includes('固定行为事件'));
  click(next,{action:'clearZone'});assert.equal(saved(p).zone,'all');click(next,{action:'resetFilters'});assert.equal(saved(p).event,'all');
 }else{
  click(h,{action:'next'});assert.equal(saved(p).step,1);click(h,{action:'back'});assert.equal(saved(p).step,0);
  click(h,{step:'2'});assert.equal(saved(p).step,2);click(h,{action:'play'});assert.equal(timers.size,1);
  [...timers.values()][0]();assert.equal(saved(p).step,3);click(h,{action:'play'});assert.equal(timers.size,0);
  const next=host();api.render(next,p);assert(next.innerHTML.includes('节点 4 / 6'));
  click(next,{action:'reset'});assert.equal(saved(p).step,0);click(next,{action:'play'});
  for(let n=0;n<5;n++)[...timers.values()][0]();assert.equal(timers.size,0);assert.equal(saved(p).step,5);
  click(next,{action:'play'});assert.equal(saved(p).step,0);api.stop();assert.equal(timers.size,0);assert.equal(next.onclick,null);assert.equal(next.onchange,null);
 }
}
const c=host();api.render(c,'coldchain');filter(c,'window','late');assert.equal(saved('coldchain').step,0);assert(c.innerHTML.includes('节点 1 / 3'));click(c,{tab:'temperature'});assert(c.innerHTML.includes('温度变化曲线'));filter(c,'shipment','CL-2402');assert(c.innerHTML.includes('冷冻食品'));assert(c.innerHTML.includes('data-action="original"'));
const d=host();api.render(d,'drone');click(d,{aircraft:'UAV-03'});click(d,{step:'3'});click(d,{tab:'safety'});assert(d.innerHTML.includes('低电量返航'));assert(d.innerHTML.includes('已发生事件'));assert.equal(saved('drone').aircraft,'UAV-03');filter(d,'task','TASK-02');assert.equal(saved('drone').aircraft,'UAV-03');assert(d.innerHTML.includes('所选新方案尚未载入'));click(d,{action:'loadMission'});assert.equal(saved('drone').aircraft,'UAV-02');assert.equal(saved('drone').assignment,'TASK-02');assert.equal(saved('drone').step,0);const loaded=host();api.render(loaded,'drone');assert(loaded.innerHTML.includes('TASK-02 → UAV-02'));
for(const p of ['coldchain','analytics','drone']){store.set('logistics_preset_v1_logistics_'+p,'garbage');assert.equal(api.render(host(),p),true);}
store.set('logistics_preset_v1_logistics_coldchain',JSON.stringify({shipment:'invalid',window:'invalid',step:900,tab:'invalid'}));const corrupt=host();api.render(corrupt,'coldchain');assert(corrupt.innerHTML.includes('节点 6 / 6'));assert(corrupt.innerHTML.includes('CL-2401'));
const storage=window.localStorage;window.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};const blocked=host();api.render(blocked,'coldchain');click(blocked,{action:'next'});assert(blocked.innerHTML.includes('浏览器存储暂不可用'));window.localStorage=storage;
assert.equal(api.render(host(),'other'),false);api.stop();assert.equal(network,0);
assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|\.fit\s*\(|\.predict\s*\(|\.detect\s*\(/.test(source));
async function browser(){
 const {chromium}=require('playwright');const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});let requests=0;const errors=[];
  page.on('request',()=>requests++);page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="panel"></main><section id="preset-coldchain-original">Original monitoring retained</section>');
  for(const css of ['dist/static/style.css','dist/static/logistics.css']) if(fs.existsSync(css)) await page.addStyleTag({content:fs.readFileSync(css,'utf8')});
  await page.evaluate(()=>{const saved={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>saved[k]||null,setItem:(k,v)=>saved[k]=v}});window.PresetDemo={storageKey:k=>'isolated:'+k};});
  await page.addScriptTag({content:source});
  const render=p=>page.evaluate(p=>window.PresetLogisticsPanels.render(document.querySelector('#panel'),p),p);
  await render('coldchain');await page.locator('[data-filter="shipment"]').selectOption('CL-2402');await page.locator('[data-filter="window"]').selectOption('late');
  await page.locator('[data-action="next"]').click();assert.match(await page.locator('.pl-replay').innerText(),/节点 2 \/ 3/);
  await page.locator('[data-tab="temperature"]').click();assert.equal(await page.locator('.pl-chart').count(),1);
  await page.locator('[data-action="original"]').click();assert.equal(await page.locator('#preset-coldchain-original').innerText(),'Original monitoring retained');
  await render('analytics');await page.locator('[data-filter="event"]').selectOption('购买');await page.locator('[data-filter="category"]').selectOption('冷藏乳品');await page.locator('[data-filter="time"]').selectOption('afternoon');
  const expected=api.calculate.hotCounts({event:'购买',category:'冷藏乳品',time:'afternoon'});
  for(let i=0;i<6;i++)assert.equal(Number(await page.locator('.pl-heat-cell strong').nth(i).innerText()),expected[i].count);
  await page.locator('.pl-heat-cell').nth(2).click();assert.match(await page.locator('.pl-columns').innerText(),/冷藏区 · 行为明细/);await page.locator('[data-tab="events"]').click();assert.equal(await page.locator('tbody tr').count(),Math.max(1,api.calculate.filteredEvents({event:'购买',category:'冷藏乳品',time:'afternoon'}).filter(e=>e.zone===2).length));
  await render('analytics');assert.equal(await page.locator('[data-filter="event"]').inputValue(),'购买');
  await render('drone');await page.locator('[data-filter="task"]').selectOption('TASK-02');await page.locator('[data-action="loadMission"]').click();assert.match(await page.locator('.pl-panel').innerText(),/TASK-02 → UAV-02/);await page.locator('[data-aircraft="UAV-03"]').click();await page.locator('[data-step="3"]').click();await page.locator('[data-tab="safety"]').click();assert.equal(await page.locator('tbody tr').count(),1);
  await page.locator('[data-action="play"]').click();await page.evaluate(()=>window.PresetLogisticsPanels.stop());const before=await page.locator('#panel').innerHTML();await page.waitForTimeout(1250);assert.equal(await page.locator('#panel').innerHTML(),before);
  for(const p of ['coldchain','analytics','drone']){await render(p);await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.querySelector('.pl-panel').scrollWidth<=document.documentElement.clientWidth));await page.setViewportSize({width:1280,height:900});}
  assert.deepEqual(errors,[]);assert.equal(requests,0);
 }finally{await browser.close();}
}
console.log('PASS logistics preset panels: 60 filter combinations, deterministic counts/positions, 3 screen renders, controls, persistence, safety events, lifecycle cleanup, zero network/model calls');
if(process.argv.includes('--browser')) browser().then(()=>console.log('PASS real-browser controls, calculated heatmap, retained monitoring anchor, persistence, timer stop, mobile layout, zero network requests')).catch(e=>{console.error(e);process.exitCode=1;});
