'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./dist/static/extras.js');
const headers='order_id,date,category,product,quantity,unit_price\n';
const fixture=()=>({gateway:{enabled:true,broker:'mqtt://classroom.local:1883',baud:9600,parity:'none'},devices:[{id:'RFID-01',type:'rfid',gateway:'GW-01',protocol:'modbus',transport:'RS485',address:1,baud:9600,parity:'none'}]});

test('CSV handles BOM, quoted commas, double quotes, CRLF and multiline values',()=>{
  assert.deepEqual(H.parseCSV('\uFEFFa,b\r\n"x,y","say ""yes"""\r\n"line\nwrap",3'),[['a','b'],['x,y','say "yes"'],['line\nwrap','3']]);
  assert.throws(()=>H.parseCSV('a,b\n"unfinished'),/未闭合/);
  assert.throws(()=>H.parseCSV('a,b\n"bad"x,2'),/引号/);
  assert.throws(()=>H.parseCSV(''),/为空/);
});

test('CSV exports neutralize formula prefixes and preserve quoted text',()=>{
  for(const cell of ['=HYPERLINK("bad")','  +1','\t=1','-3','@SUM(A1)','\rabc'])assert.ok(H.safeCSVCell(cell).startsWith('"\''),cell);
  assert.equal(H.safeCSVCell('<script>"hello"</script>'),'"<script>""hello""</script>"');
  assert.equal(H.toCSV([['x','y'],['a,b','c']]),'\uFEFF"x","y"\r\n"a,b","c"');
});

test('shopping validation is strict and rejects partial imports',()=>{
  const rows=H.validateShopping(headers+'A,2026-10-01,食品,牛奶,2,12.50\nA,2026-10-01,日用,纸巾,1,10\nB,2026-10-02,食品,牛奶,3,12.50');
  assert.equal(rows.length,3);assert.equal(rows[0].unit_price,12.5);
  assert.throws(()=>H.validateShopping(headers+'A,2026-02-30,食品,奶,2,1'),/日期/);
  assert.throws(()=>H.validateShopping(headers+'A,2026-10-01,食品,奶,2x,1'),/数量/);
  assert.throws(()=>H.validateShopping(headers+'A,2026-10-01,食品,奶,1,-1'),/数量/);
  assert.throws(()=>H.validateShopping(headers+'A,2026-10-01,食品,奶,1,1\nB,2026-10-01,食品,奶,0,1'),/数量/);
  assert.throws(()=>H.validateShopping(headers+'A,2026-10-01,食品,奶,100000,1000000'),/金额/);
  assert.throws(()=>H.validateShopping('order_id,date\nA,2026-10-01'),/表头/);
  assert.equal(H.validDate('2024-02-29'),true);assert.equal(H.validDate('2025-02-29'),false);
});

test('shopping totals, unique order counts and filters derive from records',()=>{
  const rows=H.validateShopping(headers+'A,2026-10-01,食品,牛奶,2,12.50\nA,2026-10-01,日用,纸巾,1,10\nB,2026-10-02,食品,牛奶,3,12.50');
  const a=H.aggregateShopping(rows);assert.equal(a.orders,2);assert.equal(a.units,6);assert.equal(a.revenue,72.5);assert.equal(a.average,36.25);assert.deepEqual(a.categories,[['食品',62.5],['日用',10]]);assert.deepEqual(a.days,[['2026-10-01',35],['2026-10-02',37.5]]);
  const b=H.aggregateShopping(rows,{start:'2026-10-02',category:'食品'});assert.equal(b.orders,1);assert.equal(b.revenue,37.5);
  const z=H.aggregateShopping(rows,{category:'无'});assert.equal(z.revenue,0);assert.equal(z.average,0);
  const cents=H.validateShopping(headers+'A,2026-10-01,食品,牛奶,3,0.1');assert.equal(H.aggregateShopping(cents).revenue,.3);
});

test('drone plans enforce fence, payload, altitude and return reserve',()=>{
  const plan={load:1,battery:100,points:[{x:100,y:0,z:20},{x:100,y:100,z:20}]};
  const report=H.dronePlan(plan);assert.equal(report.ok,true);assert.ok(Math.abs(report.totalDistance-(200+Math.sqrt(20000)))<1e-9);
  assert.equal(H.dronePlan({...plan,load:3}).ok,false);
  assert.equal(H.dronePlan({...plan,battery:20}).ok,false);
  assert.equal(H.dronePlan({...plan,points:[{x:501,y:0,z:20}]}).ok,false);
  assert.equal(H.dronePlan({...plan,points:[{x:0,y:0,z:61}]}).ok,false);
  assert.equal(H.dronePlan({...plan,points:[]}).ok,false);
  assert.deepEqual(H.parseWaypoints('10,20,30\n-5,40,10'),[{x:10,y:20,z:30},{x:-5,y:40,z:10}]);
  assert.throws(()=>H.parseWaypoints('2,,4'),/三个数值/);
});

test('drone advances deterministic segments and returns, emergency landing is distinct',()=>{
  const plan={load:1,battery:100,points:[{x:100,y:0,z:20},{x:100,y:100,z:25}]};
  const start=H.startDrone(plan);assert.equal(start.battery,98);assert.equal(start.index,0);
  const first=H.stepDrone(start);assert.equal(first.x,100);assert.equal(first.distance,100);assert.equal(start.index,0);
  const second=H.stepDrone(first),returned=H.stepDrone(second);assert.equal(returned.status,'completed');assert.equal(returned.x,0);assert.equal(returned.y,0);assert.equal(returned.z,0);
  assert.ok(Math.abs(returned.battery-H.dronePlan(plan).remaining)<1e-9);
  assert.throws(()=>H.stepDrone(returned),/先开始/);
  const landed=H.landDrone(first);assert.equal(landed.status,'landed');assert.equal(landed.x,100);assert.equal(landed.z,0);assert.equal(first.status,'flying');
});

test('topology detects gateway, duplicate addresses and serial protocol mismatches',()=>{
  assert.equal(H.validateTopology(fixture()).ok,true);
  const x=fixture();x.devices.push({...x.devices[0],id:'SCALE-01'});assert.ok(H.validateTopology(x).errors.some(e=>e.includes('地址冲突')));
  x.devices[1].address=2;x.devices[1].baud=19200;assert.ok(H.validateTopology(x).errors.some(e=>e.includes('不一致')));
  x.devices[1].baud=9600;x.devices[1].transport='Ethernet';assert.ok(H.validateTopology(x).errors.some(e=>e.includes('RS485')));
  const y=fixture();y.gateway.broker='mqtt://user:password@host';assert.equal(H.validateTopology(y).ok,false);
  y.gateway.broker='mqtt://host:70000';assert.equal(H.validateTopology(y).ok,false);
  const z=fixture();z.gateway.enabled=false;assert.equal(H.validateTopology(z).ok,false);
});

test('MQTT teaching topology validates interface, identity and topic isolation',()=>{
  const x=fixture();x.devices=[{id:'TEMP-01',type:'temperature',gateway:'GW-01',protocol:'mqtt',transport:'Ethernet',topic:'warehouse/temp/01'}];assert.equal(H.validateTopology(x).ok,true);
  x.devices[0].topic='warehouse/#';assert.equal(H.validateTopology(x).ok,false);
  x.devices[0].topic='warehouse/temp/01';x.devices.push({...x.devices[0],id:'TEMP-02'});assert.ok(H.validateTopology(x).errors.some(e=>e.includes('主题重复')));
  x.devices[1].topic='warehouse/temp/02';x.devices[1].gateway='';assert.equal(H.validateTopology(x).ok,false);
});

test('RFID identifies expected EPC, blocks duplicate receipt and records unknowns',()=>{
  const manifest=[{epc:'E200001100000001',product:'货箱',quantity:12,bin:'A-01'}];
  const first=H.scanRFID(manifest,' e2000011 00000001 ','RFID-01',[]);assert.equal(first.result,'received');assert.equal(first.quantity,12);
  const dup=H.scanRFID(manifest,first.epc,'RFID-01',[first]);assert.equal(dup.result,'duplicate');
  assert.equal(H.scanRFID(manifest,'E200001100000099','RFID-01',[first]).result,'unknown');
  assert.throws(()=>H.scanRFID(manifest,'not-a-tag','RFID-01',[]),/EPC/);
});

test('neural CSV validates dimensions, finite values, class counts and minimum records',()=>{
  const data=H.parseNeuralCSV(H.syntheticCSV(42));assert.equal(data.samples.length,120);assert.equal(data.features.length,3);assert.equal(data.labels.length,3);assert.equal(H.syntheticCSV(42),H.syntheticCSV(42));
  assert.throws(()=>H.parseNeuralCSV('x,y,label\n1,2,a'),/12/);
  assert.throws(()=>H.parseNeuralCSV(H.syntheticCSV().replace('常温配送','')),/类别无效/);
  assert.throws(()=>H.parseNeuralCSV(H.syntheticCSV().replace(/\n[^,]+,/, '\nInfinity,')),/数值/);
  assert.throws(()=>H.parseNeuralCSV(H.syntheticCSV().replace('mass_kg','distance_km')),/唯一/);
});

test('stratified split is deterministic and keeps test samples out of normalization',()=>{
  const data=H.parseNeuralCSV(H.syntheticCSV()),split=H.splitData(data,12);assert.deepEqual(split,H.splitData(data,12));assert.equal(split.train.length,96);assert.equal(split.test.length,24);
  data.labels.forEach((_,y)=>{assert.equal(split.test.filter(s=>s.y===y).length,8);assert.equal(split.train.filter(s=>s.y===y).length,32);});
  split.mean.forEach((_,i)=>assert.ok(Math.abs(split.train.reduce((s,r)=>s+r.x[i],0))<1e-9));
  const totalMeans=data.features.map((_,i)=>data.samples.reduce((s,r)=>s+r.x[i],0)/data.samples.length);assert.notDeepEqual(split.mean,totalMeans);
});

test('softmax is finite, normalized and numerically stable for large logits',()=>{
  const n={w1:[[1,0],[0,1]],b1:[0,0],w2:[[1000,1000],[999,999]],b2:[1000,1000]};
  const p=H.forward(n,[100,100]).p;assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(p.reduce((a,b)=>a+b)-1)<1e-12);assert.ok(p[0]>p[1]);
});

test('gradient update matches finite difference derivative through tanh and softmax',()=>{
  const net=H.createNetwork(2,3,2,8),samples=[{x:[.2,-.3],y:0},{x:[.6,.7],y:1}],copy=JSON.parse(JSON.stringify(net)),epsilon=1e-5;
  copy.w1[1][0]+=epsilon;const plus=H.metrics(copy,samples,2).loss;copy.w1[1][0]-=2*epsilon;const minus=H.metrics(copy,samples,2).loss;
  const expected=(plus-minus)/(2*epsilon),before=net.w1[1][0];H.trainEpoch(net,samples,.01);const observed=(before-net.w1[1][0])/.01;assert.ok(Math.abs(expected-observed)<1e-7,`${expected} ${observed}`);
});

test('actual training lowers loss and produces predictions and correct confusion totals',()=>{
  const data=H.parseNeuralCSV(H.syntheticCSV()),split=H.splitData(data,42),net=H.createNetwork(3,8,3,42),before=H.metrics(net,split.train,3);
  for(let epoch=0;epoch<120;epoch++)H.trainEpoch(net,split.train,.08);
  const after=H.metrics(net,split.train,3),held=H.metrics(net,split.test,3);assert.ok(after.loss<before.loss*.2);assert.ok(held.accuracy>.9);assert.equal(held.confusion.flat().reduce((a,b)=>a+b),24);
  const model={features:data.features,labels:data.labels,mean:split.mean,scale:split.scale,network:net};const prediction=H.predict(model,[2,12,24]);assert.equal(prediction[0].label,'常温配送');assert.ok(Math.abs(prediction.reduce((a,r)=>a+r.probability,0)-1)<1e-12);
  assert.throws(()=>H.predict(model,[1,2]),/全部为有效数字/);
  assert.throws(()=>H.trainEpoch(net,split.train,0),/学习率/);
});

test('same seed and data reproduce exact training weights',()=>{
  const data=H.parseNeuralCSV(H.syntheticCSV(99)),split=H.splitData(data,7),a=H.createNetwork(3,4,3,7),b=H.createNetwork(3,4,3,7);
  for(let i=0;i<20;i++){H.trainEpoch(a,split.train,.1);H.trainEpoch(b,split.train,.1);}assert.deepEqual(a,b);
});
