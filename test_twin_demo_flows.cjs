/* Deterministic domain + real-handler lifecycle regressions; mocked DOM/Canvas, not browser QA. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'dist/static/twin.js'),'utf8');
const context={console};context.window=context;vm.createContext(context);vm.runInContext(source,context);
const T=context.Twin,copy=x=>JSON.parse(JSON.stringify(x));
// Reuse the established DOM/Canvas/API-gate harness without executing its tests.
const lifecycle=fs.readFileSync(path.join(__dirname,'test_twin_lifecycle.cjs'),'utf8');
const prefix=lifecycle.slice(0,lifecycle.indexOf('const tests = [];'));
const {harness,checkpoint,observed}=new Function('require','__dirname',prefix+';return {harness,checkpoint,observed};')(require,__dirname);
const tests=[],test=(name,run)=>tests.push({name,run});
const node=(scene,type)=>scene.nodes.find(n=>n.type===type);
const epsilon=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const mustReject=edit=>{const s=T.scenePreset('建筑');edit(s);assert.throws(()=>T.validateState(s));};
const clickData=(h,attribute,value)=>{const button=h.content.querySelectorAll('['+attribute+']').find(el=>el.attrs[attribute]===String(value));assert.ok(button,attribute+'='+value);return button.click();};
async function persist(h){const stopping=observed(h.twin.stop());await checkpoint();assert.equal(h.writes.length>0,true);h.writes.at(-1).succeed();await stopping.done;assert.equal(stopping.status,'fulfilled');return h.saved();}
async function startScene(scene){const h=harness({gateReads:true});const start=observed(h.start());await checkpoint();h.reads[0].succeed(h.twin.scenePreset(scene));await start.done;assert.equal(start.status,'fulfilled');return h;}

test('presets expose distinct sensor units and required controls',()=>{
  const building=T.scenePreset('建筑'),home=T.scenePreset('家居');
  for(const [type,unit] of [['温度','°C'],['湿度','%RH'],['光照','lux'],['可燃气体','%LEL'],['电压','V'],['电流','A'],['功率','kW'],['电能','kWh']])assert.equal(node(building,type).unit,unit);
  for(const type of ['照明','窗帘','门禁','门磁','指纹','报警器'])assert.ok(node(home,type));
  assert.equal(node(home,'温湿度'),undefined);
  for(const scene of ['建筑','家居','商超'])assert.equal(T.validateState(T.scenePreset(scene)).scene,scene);
});

test('all sampling stays within each component range at bounded environmental extremes',()=>{
  const types=T.types(),scene=T.scenePreset('建筑');
  for(const [type,definition] of Object.entries(types))for(const random of [()=>0,()=>1])for(const sign of [0,1]){
    const n={...copy(scene.nodes[0]),type,value:sign?definition.max:definition.min,level:sign?100:0,unit:definition.unit};
    const env={temperature:sign?50:-10,humidity:sign?100:0,brightness:sign?1200:0,gas:sign?100:0,voltage:sign?250:180,occupancy:sign?80:0,smoke:sign?1:0};
    for(let i=0;i<200;i++){n.value=T.nextReading(n,env,scene.nodes,i,random,.5);assert.ok(Number.isFinite(n.value),type);assert.ok(n.value>=definition.min&&n.value<=definition.max,type+' bounds');}
  }
});

test('power, current and energy use kW/A/kWh consistently and integrate actual sample interval',()=>{
  const s=T.scenePreset('建筑'),energy=node(s,'电能'),power=T.powerKW(s.nodes,1);energy.value=3;
  const current=T.nextReading(node(s,'电流'),s.environment,s.nodes,1,()=>.5);
  epsilon(current*s.environment.voltage/1000,power);
  epsilon(T.integrateEnergy(3,2,1800),4);
  for(const interval of [.5,1,2]){
    let value=0;for(let t=0;t<3600;t+=interval)value=T.integrateEnergy(value,2,interval);epsilon(value,2);
    epsilon(T.nextReading(energy,s.environment,s.nodes,1,()=>.5,interval),3+power*interval/3600);
  }
  for(const params of [[0,-1,1],[0,1,-1],[NaN,1,1],[0,Infinity,1]])assert.throws(()=>T.integrateEnergy(...params));
  assert.match(T.formatValue(energy),/kWh/);
});

test('lamp and curtains affect illumination while humidity and temperature remain separate',()=>{
  const s=T.scenePreset('家居'),light=node(s,'光照');light.value=0;
  s.nodes.filter(n=>n.type==='照明').forEach(n=>n.on=false);T.controlNode(node(s,'窗帘'),0);
  const dark=T.nextReading(light,s.environment,s.nodes,0,()=>.5);
  T.controlNode(node(s,'窗帘'),100);const daylight=T.nextReading(light,s.environment,s.nodes,0,()=>.5);assert.ok(daylight>dark);
  node(s,'照明').on=true;assert.ok(T.nextReading(light,s.environment,s.nodes,0,()=>.5)>daylight);
  const humidity=node(s,'湿度'),temperature=node(s,'温度');
  assert.notEqual(T.nextReading(humidity,{...s.environment,humidity:90},s.nodes,0,()=>.5),T.nextReading(humidity,{...s.environment,humidity:10},s.nodes,0,()=>.5));
  epsilon(T.nextReading(temperature,{...s.environment,humidity:90},s.nodes,0,()=>.5),T.nextReading(temperature,{...s.environment,humidity:10},s.nodes,0,()=>.5));
});

test('binary door/magnetic/alarm controls and curtain position return correct states',()=>{
  const s=T.scenePreset('家居');
  for(const type of ['门禁','门磁','报警器']){const n=node(s,type);T.controlNode(n,100);assert.equal(n.value,1);T.controlNode(n,0);assert.equal(n.value,0);assert.equal(n.level,0);}
  const curtain=node(s,'窗帘');T.controlNode(curtain,45);assert.equal(curtain.value,45);assert.match(T.formatValue(curtain),/45% 开度/);
  assert.throws(()=>T.controlNode(curtain,101));assert.throws(()=>T.controlNode(node(s,'温度'),25));
});

test('fingerprint is demo allow/deny and never claims or stores biometric data',()=>{
  const s=T.scenePreset('家居'),reader=node(s,'指纹'),door=node(s,'门禁'),contact=node(s,'门磁');
  const denied=T.fingerprintAuthorization(s.nodes,reader.id,'visitor-demo',1000);assert.equal(denied.granted,false);assert.equal(door.value,0);assert.equal(reader.authorization.result,'denied');
  const granted=T.fingerprintAuthorization(s.nodes,reader.id,'resident-demo',1001);assert.equal(granted.granted,true);assert.equal(door.value,1);assert.equal(contact.value,0,'unlock does not invent an opened door');
  T.fingerprintAuthorization(s.nodes,reader.id,'visitor-demo',1002);assert.equal(door.value,1,'denial does not silently change an existing lock state');
  assert.deepEqual(Object.keys(reader.authorization).sort(),['at','credential','origin','result']);
  assert.equal(reader.authorization.origin,'local-simulation');reader.on=false;assert.throws(()=>T.fingerprintAuthorization(s.nodes,reader.id,'staff-demo'));
});

test('legacy scenes keep control settings and archive lux readings with their correct unit',()=>{
  const raw=T.scenePreset('家居');raw.version=2;delete raw.retail;delete raw.environment.humidity;delete raw.environment.gas;delete raw.environment.voltage;
  node(raw,'温度').type='温湿度';const lamp=node(raw,'照明');lamp.value=945;lamp.level=65;lamp.unit='lux';lamp.history=[{t:100,value:850},{t:200,value:940}];
  const loaded=T.validateState(raw);assert.ok(node(loaded,'温度'));assert.equal(node(loaded,'照明').value,65);assert.equal(node(loaded,'照明').unit,'%');assert.equal(node(loaded,'照明').history.length,0);assert.equal(node(loaded,'照明').legacyTelemetry.history[1].value,940);assert.equal(node(loaded,'照明').legacyTelemetry.unit,'lux');assert.equal(loaded.retail.balanceCents,10000);
  assert.deepEqual(copy(T.validateState(copy(loaded))),copy(loaded));
});

test('strict import rejects malformed new sensor/control/authorization data',()=>{
  mustReject(s=>node(s,'湿度').value=101);mustReject(s=>node(s,'门磁').value=.5);mustReject(s=>node(s,'门禁').on='true');mustReject(s=>node(s,'电能').value=-1);mustReject(s=>s.environment.gas='25');mustReject(s=>s.environment.voltage=999);mustReject(s=>node(s,'指纹').authorization={result:'real-match',credential:'staff-demo',at:1});
});

test('integer-cents basket computes count plus weighed grams, net weight and rounding',()=>{
  const retail=T.retail.initialState();T.retail.add(retail,'milk',2);T.retail.add(retail,'apple',375);T.retail.add(retail,'banana',333);
  const total=T.retail.totals(retail);assert.equal(total.totalCents,700+480+263);assert.equal(total.netWeightGrams,500+375+333);assert.equal(total.countItems,2);assert.equal(total.weightedGrams,708);
  assert.ok(total.lines.every(l=>Number.isInteger(l.lineTotalCents)));T.retail.add(retail,'milk',1);assert.equal(T.retail.totals(retail).lines.find(l=>l.productId==='milk').quantity,3);
  T.retail.remove(retail,'banana');assert.equal(T.retail.totals(retail).totalCents,1530);
  const before=copy(retail);for(const q of [-1,0,1.2,NaN,Infinity,1001])assert.throws(()=>T.retail.add(retail,'milk',q));assert.deepEqual(copy(retail),before);
});

test('insufficient balance or tender fails atomically with basket and receipts intact',()=>{
  const retail=T.retail.initialState();T.retail.add(retail,'bread',2);retail.balanceCents=100;const before=copy(retail);
  assert.throws(()=>T.retail.checkout(retail,{method:'balance'}),/余额不足/);assert.deepEqual(copy(retail),before);
  assert.throws(()=>T.retail.checkout(retail,{method:'cash',tenderedCents:1359}),/实收不足/);assert.deepEqual(copy(retail),before);
  assert.throws(()=>T.retail.checkout(retail,{method:'cash',tenderedCents:1500.2}));assert.deepEqual(copy(retail),before);
});

test('cash receipt preserves purchased lines, exact totals/change and unchanged balance',()=>{
  const retail=T.retail.initialState();T.retail.add(retail,'milk',2);T.retail.add(retail,'apple',375);
  const receipt=T.retail.checkout(retail,{method:'cash',tenderedCents:2000,now:1730000000000});
  assert.equal(receipt.totalCents,1180);assert.equal(receipt.paidCents,2000);assert.equal(receipt.changeCents,820);assert.equal(receipt.netWeightGrams,875);assert.equal(receipt.balanceAfterCents,10000);assert.equal(retail.cart.length,0);assert.equal(retail.receipts.length,1);assert.equal(receipt.mode,'local-simulation');
  receipt.lines[0].quantity=99;assert.equal(retail.receipts[0].lines[0].quantity,2,'saved receipt is an independent snapshot');
  assert.throws(()=>T.retail.checkout(retail,{method:'cash',tenderedCents:100}),/购物篮为空/);
});

test('balance purchase deducts correct amount; strict roundtrip includes unfinished cart and receipts',()=>{
  const s=T.scenePreset('商超');T.retail.add(s.retail,'banana',501);const receipt=T.retail.checkout(s.retail,{method:'balance',now:1730000000001});assert.equal(receipt.totalCents,396);assert.equal(receipt.changeCents,0);assert.equal(s.retail.balanceCents,9604);
  T.retail.add(s.retail,'water',3);const restored=T.validateState(copy(s));assert.deepEqual(copy(restored.retail),copy(s.retail));
  for(const mutate of [r=>r.receipts[0].totalCents++,r=>r.receipts[0].lines[0].priceCents++,r=>r.receipts[0].changeCents++,r=>r.balanceCents=-1,r=>r.cart[0].quantity=.5]){const bad=copy(s);mutate(bad.retail);assert.throws(()=>T.validateState(bad));}
});

test('home real handlers update overlays, control snapshots and persist authorization across exit',async()=>{
  const h=await startScene('家居'),preset=h.twin.scenePreset('家居'),curtain=node(preset,'窗帘'),door=node(preset,'门禁'),contact=node(preset,'门磁');
  assert.match(h.get('environmentOverlay').textContent,/温度.*湿度.*光照/s);clickData(h,'data-view','2D');
  clickData(h,'data-quick-control',curtain.id);clickData(h,'data-quick-control',contact.id);h.get('quickFingerprintDeny').click();h.get('quickFingerprintAllow').click();
  const saved=await persist(h);assert.equal(node(saved,'窗帘').level,100);assert.equal(node(saved,'门磁').value,1);assert.equal(node(saved,'门禁').value,1);assert.equal(node(saved,'指纹').authorization.result,'granted');
  assert.ok(saved.events.some(e=>e.message.includes('授权拒绝')));assert.ok(saved.events.some(e=>e.message.includes('授权通过')));
  assert.ok(saved.events.filter(e=>e.kind==='control').every(e=>e.origin==='local-simulation'&&e.acknowledgement==='simulated-ack'));
  assert.ok(saved.events.some(e=>e.snapshot?.type==='窗帘'&&e.snapshot.level===100));assert.deepEqual(copy(h.twin.validateState(saved).events),saved.events);
});

test('building gas scenario triggers local alarm output, records acknowledgement and keeps gas distinct from smoke',async()=>{
  const h=await startScene('建筑');const scenario=h.get('scenario');scenario.value='gas';scenario.selectedIndex=scenario.options.findIndex(o=>o.value==='gas');scenario.onchange({target:scenario});
  const linkage=h.get('linkage');linkage.checked=true;linkage.onchange({target:linkage});h.get('runTwin').click();for(let i=0;i<12;i++)h.tick();
  const saved=await persist(h);assert.ok(node(saved,'可燃气体').value>20);assert.equal(node(saved,'报警器').value,1);assert.equal(node(saved,'门禁').value,0,'gas demo only raises alarm');assert.equal(saved.environment.smoke,.018);assert.ok(saved.events.some(e=>e.kind==='alarm'));assert.ok(saved.events.some(e=>e.snapshot?.type==='报警器'&&e.acknowledgement==='simulated-ack'));
  const meter=node(saved,'电能');epsilon(meter.value,h.twin.powerKW(saved.nodes,1)*12/3600);
});

test('shop UI adds weighed items, rejects insufficient balance, completes cash and autosaves actual receipt',async()=>{
  const h=await startScene('商超');h.change('retailProduct','milk');h.get('retailQuantity').value='2';h.get('retailAdd').click();
  h.change('retailProduct','apple');assert.match(h.get('retailQuantityLabel').textContent,/净重/);h.get('retailQuantity').value='375';h.get('retailAdd').click();
  assert.equal(h.get('retailNetWeight').textContent,'875 g');assert.match(h.get('retailTotal').textContent,/11\.80/);
  h.get('retailBalance').value='1.00';h.get('retailSetBalance').click();h.get('retailPay').click();assert.match(h.get('retailFeedback').textContent,/余额不足/);assert.match(h.get('retailTotal').textContent,/11\.80/);
  h.change('retailMethod','cash');h.get('retailCash').value='20.00';h.get('retailPay').click();assert.match(h.get('retailFeedback').textContent,/结算完成.*8\.20/);assert.match(h.get('retailPanel').textContent,/最近购买明细.*纯牛奶.*红富士苹果/s);
  const saved=await persist(h);assert.equal(saved.retail.cart.length,0);assert.equal(saved.retail.receipts[0].totalCents,1180);assert.equal(saved.retail.receipts[0].changeCents,820);assert.equal(saved.retail.balanceCents,100);assert.deepEqual(copy(h.twin.validateState(saved).retail),saved.retail);
});

test('switching scene templates preserves unfinished basket and previous purchases',async()=>{
  const h=await startScene('商超');h.get('retailAdd').click();h.get('retailPay').click();h.change('retailProduct','apple');h.get('retailQuantity').value='625';h.get('retailAdd').click();
  for(const scene of ['家居','商超']){const changing=observed(clickData(h,'data-preset',scene));const confirm=h.content.querySelector('[data-confirm]');assert.ok(confirm);confirm.click();await changing.done;assert.equal(changing.status,'fulfilled');}
  assert.match(h.get('retailTotal').textContent,/8\.00/);assert.match(h.get('retailPanel').textContent,/最近购买明细/);const saved=await persist(h);assert.equal(saved.retail.receipts.length,1);assert.equal(saved.retail.cart[0].quantity,625);assert.equal(saved.retail.balanceCents,9650);
});

test('complete-workspace backup validates and preserves control snapshots and checkout data',()=>{
  vm.runInContext(fs.readFileSync(path.join(__dirname,'dist/static/admin.js'),'utf8'),context);
  const scene=T.scenePreset('家居'),reader=node(scene,'指纹');T.fingerprintAuthorization(scene.nodes,reader.id,'resident-demo',1000);T.retail.add(scene.retail,'tomato',555);T.retail.checkout(scene.retail,{method:'balance',now:1730000000002});T.retail.add(scene.retail,'bread',2);
  const backup={schema:'iot-studio-backup/v1',data:{twin:scene}},restored=context.Admin.validateBackup(copy(backup));assert.deepEqual(copy(restored.twin.retail),copy(scene.retail));assert.deepEqual(copy(node(restored.twin,'指纹').authorization),copy(reader.authorization));assert.equal(node(restored.twin,'门禁').value,1);
  backup.data.twin.retail.receipts[0].lines[0].lineTotalCents++;assert.throws(()=>context.Admin.validateBackup(copy(backup)));
});

let completed=0;process.once('beforeExit',()=>{if(completed!==tests.length){console.error(`Incomplete demo suite ${completed}/${tests.length}`);process.exitCode=1;}});
(async()=>{let failed=0;for(const {name,run} of tests){try{await run();console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.stack);}finally{completed++;}}if(failed)process.exitCode=1;console.log(`${tests.length-failed}/${tests.length} twin demo tests passed (domain logic + mocked DOM/API integration).`);})();
