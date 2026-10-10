/* Digital twin workbench. All readings are generated locally, never hardware telemetry. */
window.Twin = (() => {
  'use strict';
  let host, canvas, ctx, state, selected = null, timer = null, running = false;
  let dirty = false, revision = 0, loadEpoch = 0, drag = null, floor = 1;
  let view = '3D', angle = 0.58, zoom = 1, listQuery = '', showLabels = true, snap = true;
  let lastSaved = null, pendingDialog = null, chartWindow = 60;
  let mounted=false, stopPending=null;
  // Inspector visibility is view-only: it never changes the saved scene.
  let inspectorOpen = null;
  const TYPES = {
    '温湿度': {color:'#298da3', icon:'T', unit:'°C', value:24.8, min:-10, max:60, low:16, high:30, step:0.1,legacy:true},
    '温度': {color:'#298da3', icon:'T', unit:'°C', value:24.8, min:-10, max:60, low:16, high:30, step:0.1},
    '湿度': {color:'#4786bc', icon:'H', unit:'%RH', value:52, min:0, max:100, low:25, high:75, step:0.1},
    '光照': {color:'#b49337', icon:'☼', unit:'lux', value:320, min:0, max:2000, low:30, high:1500, step:1},
    '照明': {color:'#e8b544', icon:'☀', unit:'%', value:70, min:0, max:100, low:0, high:100, step:5},
    '风机': {color:'#5d89cd', icon:'≋', unit:'rpm', value:1200, min:0, max:2400, low:0, high:2000, step:10},
    '烟感': {color:'#d3747a', icon:'◉', unit:'mg/m³', value:0.018, min:0, max:1, low:0, high:0.1, step:0.01},
    '门禁': {color:'#589b89', icon:'↔', unit:'', value:0, min:0, max:1, low:0, high:1, step:1},
    '门磁': {color:'#557e94', icon:'D', unit:'', value:0, min:0, max:1, low:0, high:1, step:1},
    '窗帘': {color:'#857ab4', icon:'▥', unit:'%', value:35, min:0, max:100, low:0, high:100, step:5},
    '指纹': {color:'#628fa8', icon:'ID', unit:'', value:0, min:0, max:1, low:0, high:1, step:1},
    '报警器': {color:'#bd6c65', icon:'!', unit:'', value:0, min:0, max:1, low:0, high:1, step:1},
    '可燃气体': {color:'#bc8451', icon:'G', unit:'%LEL', value:2, min:0, max:100, low:0, high:20, step:0.1},
    '电压': {color:'#9776b4', icon:'V', unit:'V', value:220, min:0, max:260, low:198, high:242, step:0.1},
    '电流': {color:'#8a79b9', icon:'A', unit:'A', value:4.2, min:0, max:100, low:0, high:32, step:0.01},
    '功率': {color:'#967ab7', icon:'P', unit:'kW', value:0.9, min:0, max:25, low:0, high:12, step:0.01},
    '电能': {color:'#ad86ad', icon:'E', unit:'kWh', value:0, min:0, max:1000000, low:0, high:1000000, step:0.001},
    '货架': {color:'#8995ac', icon:'▤', unit:'%', value:84, min:0, max:100, low:20, high:100, step:1},
    '电表': {color:'#b08acc', icon:'ϟ', unit:'kW', value:2.4, min:0, max:20, low:0, high:12, step:0.1,legacy:true},
    '摄像头': {color:'#78969c', icon:'◎', unit:'人', value:4, min:0, max:100, low:0, high:30, step:1}
  };
  const SCENES = {
    '建筑': {title:'智慧建筑', subtitle:'双层楼宇 · 办公与公共空间', icon:'▥', floors:2, floorNames:['1F · 公共服务','2F · 智慧办公']},
    '家居': {title:'智慧家居', subtitle:'五个生活分区 · 居家联动', icon:'⌂', floors:1, floorNames:['1F · 家居空间']},
    '商超': {title:'智慧商超', subtitle:'货架、冷柜与收银 · 门店运营', icon:'▤', floors:1, floorNames:['1F · 门店卖场']}
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const num = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const esc = value => window.escapeHTML(value);
  const currentNode = () => state.nodes.find(n => n.id === selected);
  const currentNodes = () => state.nodes.filter(n => n.floor === floor);
  const cleanNode = node => {const {_screen, ...rest} = node; return rest;};
  const snapshot = () => ({...clone(state), nodes:state.nodes.map(n=>clone(cleanNode(n))), version:3, mode:'local-simulation'});
  function createNode(id, type, name, x, y, f=1, extras={}) {
    const t = TYPES[type];
    return {id,type,name,x,y,z:55,floor:f,value:t.value,unit:t.unit,on:true,level:['门禁','门磁','指纹','报警器'].includes(type)?0:type==='窗帘'?35:70,
      threshold:{enabled:true,low:t.low,high:t.high},history:[],alarm:false,...extras};
  }
  const CATALOG = Object.freeze([
    {id:'milk',name:'纯牛奶 250 mL',mode:'count',priceCents:350,unitWeightGrams:250},
    {id:'bread',name:'全麦面包',mode:'count',priceCents:680,unitWeightGrams:120},
    {id:'water',name:'饮用水 550 mL',mode:'count',priceCents:200,unitWeightGrams:550},
    {id:'apple',name:'红富士苹果',mode:'weight',priceCents:1280,unitWeightGrams:0},
    {id:'banana',name:'香蕉',mode:'weight',priceCents:790,unitWeightGrams:0},
    {id:'tomato',name:'番茄',mode:'weight',priceCents:960,unitWeightGrams:0}
  ].map(Object.freeze));
  const centsText = cents => '¥'+(cents/100).toFixed(2);
  function integer(value,min,max,label) {
    if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(label+'必须为 '+min+'–'+max+' 的整数');
    return value;
  }
  function parseMoney(value) {
    const text=String(value).trim();if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(text))throw new Error('金额最多保留两位小数');
    const [yuan,fraction='']=text.split('.');return integer(Number(yuan)*100+Number(fraction.padEnd(2,'0')),0,100000000,'模拟金额（分）');
  }
  function initialRetail() {return {cart:[],balanceCents:10000,receipts:[],lastPayment:null};}
  function retailLine(item) {
    const product=CATALOG.find(p=>p.id===item?.productId);if(!product)throw new Error('购物篮商品不存在');
    const quantity=integer(item.quantity,1,product.mode==='count'?999:1000000,product.mode==='count'?'件数':'净重（克）');
    return {...product,productId:product.id,quantity,netWeightGrams:product.mode==='count'?product.unitWeightGrams*quantity:quantity,
      lineTotalCents:product.mode==='count'?product.priceCents*quantity:Math.floor((product.priceCents*quantity+500)/1000)};
  }
  function retailTotals(retail) {
    if(!Array.isArray(retail?.cart)||retail.cart.length>CATALOG.length)throw new Error('购物篮格式无效');
    const seen=new Set(),lines=retail.cart.map(item=>{if(seen.has(item?.productId))throw new Error('购物篮商品重复');seen.add(item?.productId);return retailLine(item);});
    const totalCents=lines.reduce((sum,line)=>sum+line.lineTotalCents,0);
    integer(totalCents,0,100000000,'合计金额（分）');
    return {lines,totalCents,netWeightGrams:lines.reduce((sum,line)=>sum+line.netWeightGrams,0),countItems:lines.filter(l=>l.mode==='count').reduce((sum,line)=>sum+line.quantity,0),weightedGrams:lines.filter(l=>l.mode==='weight').reduce((sum,line)=>sum+line.quantity,0)};
  }
  function retailAdd(retail,productId,quantity) {
    const prior=retail.cart.find(line=>line.productId===productId),next={productId,quantity:quantity+(prior?.quantity||0)};
    integer(quantity,1,1000000,'添加数量');retailLine(next);
    const cart=retail.cart.filter(line=>line.productId!==productId).concat(next);retailTotals({cart});retail.cart=cart;return retailTotals(retail);
  }
  function retailRemove(retail,productId) {retail.cart=retail.cart.filter(line=>line.productId!==productId);return retailTotals(retail);}
  function retailCheckout(retail,{method='balance',tenderedCents=0,now=Date.now()}={}) {
    const totals=retailTotals(retail);if(!totals.lines.length)throw new Error('购物篮为空，请先添加商品');
    if(!['balance','cash'].includes(method))throw new Error('模拟支付方式无效');
    const balanceBeforeCents=integer(retail.balanceCents,0,100000000,'模拟余额（分）');
    const paidCents=method==='balance'?totals.totalCents:integer(tenderedCents,0,100000000,'模拟实收（分）');
    if(method==='balance'&&balanceBeforeCents<totals.totalCents)throw new Error('模拟余额不足，请调整余额或选择模拟现金');
    if(paidCents<totals.totalCents)throw new Error('模拟实收不足，购物篮未结算');
    if(!Number.isFinite(now)||now<0)throw new Error('收据时间无效');
    const receipt={id:'SIM-'+now+'-'+Math.random().toString(36).slice(2,7),at:now,mode:'local-simulation',method,...clone(totals),paidCents,changeCents:paidCents-totals.totalCents,balanceBeforeCents,balanceAfterCents:method==='balance'?balanceBeforeCents-totals.totalCents:balanceBeforeCents};
    retail.balanceCents=receipt.balanceAfterCents;retail.receipts=[clone(receipt),...retail.receipts].slice(0,50);retail.lastPayment=clone(receipt);retail.cart=[];
    return clone(receipt);
  }
  function normalizeRetail(raw,strict=false) {
    if(raw===undefined||raw===null)return initialRetail();
    const validate=()=>{
      if(typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.cart)||!Array.isArray(raw.receipts)||raw.receipts.length>50)throw new Error('收银状态格式无效');
      const result={cart:raw.cart.map(item=>({productId:item?.productId,quantity:item?.quantity})),balanceCents:integer(raw.balanceCents,0,100000000,'模拟余额（分）'),receipts:[],lastPayment:null};retailTotals(result);
      const ids=new Set();result.receipts=raw.receipts.map(receipt=>{
        if(!receipt||typeof receipt.id!=='string'||!receipt.id||receipt.id.length>100||ids.has(receipt.id)||!Number.isFinite(receipt.at)||receipt.at<0||receipt.mode!=='local-simulation'||!['cash','balance'].includes(receipt.method)||!Array.isArray(receipt.lines)||!receipt.lines.length)throw new Error('本地收据格式无效');
        ids.add(receipt.id);const totals=retailTotals({cart:receipt.lines.map(line=>({productId:line.productId,quantity:line.quantity}))});
        for(const key of ['totalCents','netWeightGrams','countItems','weightedGrams'])if(receipt[key]!==totals[key])throw new Error('收据合计校验失败：'+key);
        receipt.lines.forEach((line,i)=>{for(const key of ['mode','priceCents','unitWeightGrams','lineTotalCents','netWeightGrams'])if(line[key]!==totals.lines[i][key])throw new Error('收据商品金额或重量校验失败');});
        const paid=integer(receipt.paidCents,0,100000000,'收据实收（分）'),before=integer(receipt.balanceBeforeCents,0,100000000,'收据余额（分）');
        if(paid<totals.totalCents||receipt.changeCents!==paid-totals.totalCents||receipt.balanceAfterCents!==(receipt.method==='balance'?before-totals.totalCents:before)||receipt.balanceAfterCents<0||receipt.method==='balance'&&paid!==totals.totalCents)throw new Error('收据支付校验失败');
        return {id:receipt.id,at:receipt.at,mode:'local-simulation',method:receipt.method,...totals,paidCents:paid,changeCents:receipt.changeCents,balanceBeforeCents:before,balanceAfterCents:receipt.balanceAfterCents};
      });
      if(raw.lastPayment!=null){const latest=result.receipts[0];if(!latest||raw.lastPayment.id!==latest.id)throw new Error('最近收据引用无效');result.lastPayment=clone(latest);}
      return result;
    };
    try{return validate();}catch(error){if(strict)throw error;return initialRetail();}
  }
  function scenePreset(type='建筑') {
    if (!SCENES[type]) type='建筑';
    const layouts = {
      '建筑': [['温度','大厅温度',205,255,1],['湿度','大厅湿度',300,255,1],['光照','大厅光照',397,255,1],['照明','大厅照明',400,175,1],['门禁','大厅门锁',430,476,1],['门磁','大厅门磁',523,477,1],['指纹','大厅指纹授权',330,477,1],['可燃气体','机房可燃气体',705,170,1],['报警器','机房声光报警',615,250,1],['风机','新风机组',684,377,1],['电压','楼宇电压',123,145,1],['电流','一层回路电流',220,145,1],['功率','一层回路功率',123,354,1],['电能','一层累计电能',228,354,1],['温度','办公区温度',262,310,2],['湿度','办公区湿度',385,310,2],['照明','办公区照明',400,195,2],['风机','会议室新风',646,370,2],['摄像头','走廊客流',465,472,2]],
      '家居': [['温度','客厅温度',185,320],['湿度','客厅湿度',285,320],['光照','客厅光照',392,320],['照明','客厅主灯',340,427],['照明','卧室床头灯',630,190],['窗帘','卧室窗帘',733,307],['可燃气体','厨房可燃气体',200,177],['风机','浴室排风',475,175],['门禁','入户门锁',642,455],['门磁','入户门磁',741,455],['指纹','入户指纹授权',547,455],['报警器','厨房声光报警',302,177],['电能','家庭累计电能',580,305]],
      '商超': [['温度','冷链温度',197,165,1,{value:5,threshold:{enabled:true,low:1,high:8}}],['湿度','冷链湿度',327,165],['货架','A 区货架存量',330,305],['货架','B 区货架存量',500,305],['光照','卖场光照',445,198],['照明','卖场照明',445,440],['烟感','仓储烟感',705,163],['门禁','员工通道',734,327],['摄像头','入口客流',220,470],['功率','冷柜功率',130,367],['电能','门店累计电能',130,260],['风机','卖场新风',655,400]]
    };
    return {name:SCENES[type].title+'实训场景',scene:type,nodes:layouts[type].map((n,i)=>createNode(i+1,n[0],n[1],n[2],n[3],n[4]||1,n[5]||{})),
      saved:null,version:3,elapsed:0,sampleCount:0,events:[],settings:{interval:1000,linkage:false,grid:true},
      environment:{temperature:25,humidity:52,brightness:320,occupancy:8,smoke:0.018,gas:2,voltage:220,scenario:'normal'},retail:initialRetail()};
  }
  function normalizeScene(raw, strict=false) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      if(strict) throw new Error('场景文件必须为 JSON 对象');
      return scenePreset();
    }
    if (strict && (!SCENES[raw.scene] || !Array.isArray(raw.nodes))) throw new Error('缺少有效的 scene 场景类型或 nodes 组件数组');
    const base=scenePreset(SCENES[raw.scene]?raw.scene:'建筑');
    const result={...base,name:String(raw.name||base.name).slice(0,80),saved:raw.saved||null};
    const ids=new Set();
    const incoming=Array.isArray(raw.nodes)?raw.nodes:base.nodes;
    if(incoming.length>80) throw new Error('每个场景最多支持 80 个组件');
    result.nodes=incoming.map((node,i)=>{
      if(node?.type==='温湿度')node={...node,type:'温度'};
      if(!node || !TYPES[node.type]) throw new Error(`第 ${i+1} 个组件类型无效`);
      if(strict && (typeof node.name!=='string' || !Number.isFinite(node.x) || !Number.isFinite(node.y))) throw new Error(`第 ${i+1} 个组件缺少有效名称或坐标`);
      if(strict && node.threshold && (!Number.isFinite(node.threshold.low)||!Number.isFinite(node.threshold.high))) throw new Error(`第 ${i+1} 个组件告警阈值无效`);
      let id=(typeof node.id==='string'||typeof node.id==='number')?node.id:i+1;
      if(ids.has(String(id))) {if(strict) throw new Error('组件 ID 不能重复'); id='device-'+(i+1);}
      ids.add(String(id));
      const d=createNode(id,node.type,String(node.name||node.type).slice(0,50),clamp(num(node.x,400),95,785),clamp(num(node.y,300),110,520),clamp(Math.round(num(node.floor,1)),1,SCENES[result.scene].floors));
      if(node.type==='照明'&&num(raw.version,2)<3)node={...node,value:clamp(num(node.level,70),0,100),legacyTelemetry:{unit:'lux',history:Array.isArray(node.history)?node.history:[]},history:[]};
      if(strict){if(node.on!==undefined&&typeof node.on!=='boolean')throw new Error(`${d.name} 的启用状态无效`);if(node.level!==undefined&&(!Number.isFinite(node.level)||node.level<0||node.level>100))throw new Error(`${d.name} 的控制值无效`);if(node.value!==undefined&&(!Number.isFinite(node.value)||node.value<TYPES[d.type].min||node.value>TYPES[d.type].max))throw new Error(`${d.name} 的读数超出量程`);if(['门禁','门磁','指纹','报警器'].includes(d.type)&&node.value!==undefined&&![0,1].includes(node.value))throw new Error(`${d.name} 必须为 0/1 状态`);}
      d.z=clamp(num(node.z,55),0,140);d.on=node.on!==false;d.level=clamp(num(node.level,d.level),0,100);
      d.value=clamp(num(node.value,d.value),TYPES[d.type].min,TYPES[d.type].max);
      if(['门禁','门磁','报警器'].includes(d.type)){d.level=d.level>=50?100:0;d.value=d.level>=50?1:0;}
      if(['窗帘','照明'].includes(d.type))d.value=d.level;
      if(d.type==='指纹'){d.authorization=normalizeAuthorization(node.authorization,strict);d.value=d.authorization?.result==='granted'?1:0;}
      const th=node.threshold||{};d.threshold={enabled:th.enabled!==false,low:num(th.low,d.threshold.low),high:num(th.high,d.threshold.high)};
      if(d.threshold.low>=d.threshold.high) {if(strict) throw new Error(`${d.name} 的告警下限必须小于上限`); d.threshold={enabled:true,low:TYPES[d.type].low,high:TYPES[d.type].high};}
      d.history=Array.isArray(node.history)?node.history.filter(p=>p&&Number.isFinite(p.t)&&Number.isFinite(p.value)).slice(-240).map(p=>({t:p.t,value:p.value})):[];
      if(node.legacyTelemetry){if(strict&&(node.legacyTelemetry.unit!=='lux'||!Array.isArray(node.legacyTelemetry.history)||node.legacyTelemetry.history.some(p=>!p||!Number.isFinite(p.t)||!Number.isFinite(p.value))))throw new Error('旧版照度历史无效');d.legacyTelemetry={unit:'lux',history:Array.isArray(node.legacyTelemetry.history)?node.legacyTelemetry.history.filter(p=>p&&Number.isFinite(p.t)&&Number.isFinite(p.value)).slice(-240).map(p=>({t:p.t,value:p.value})):[]};}
      d.alarm=evaluateAlarm(d);return d;
    });
    result.settings={interval:[500,1000,2000].includes(raw.settings?.interval)?raw.settings.interval:1000,linkage:!!raw.settings?.linkage,grid:raw.settings?.grid!==false};
    const e=raw.environment||{};
    if(strict){for(const [key,min,max] of [['humidity',0,100],['gas',0,100],['voltage',180,250]])if(e[key]!==undefined&&(!Number.isFinite(e[key])||e[key]<min||e[key]>max))throw new Error(`环境参数 ${key} 无效`);}
    result.environment={temperature:clamp(num(e.temperature,25),-10,50),humidity:clamp(num(e.humidity,52),0,100),gas:clamp(num(e.gas,2),0,100),voltage:clamp(num(e.voltage,220),180,250),brightness:clamp(num(e.brightness,320),0,1200),occupancy:clamp(Math.round(num(e.occupancy,8)),0,80),smoke:clamp(num(e.smoke,0.018),0,1),scenario:['normal','heat','smoke','gas','night'].includes(e.scenario)?e.scenario:'normal'};
    result.elapsed=Math.max(0,num(raw.elapsed,0));result.sampleCount=Math.max(0,Math.floor(num(raw.sampleCount,0)));
    result.events=Array.isArray(raw.events)?raw.events.slice(0,100).map(e=>({id:String(e.id||''),time:String(e.time||''),name:String(e.name||''),message:String(e.message||''),kind:['alarm','recovery','control','system'].includes(e.kind)?e.kind:'system',ack:!!e.ack,origin:'local-simulation',acknowledgement:e.acknowledgement==='simulated-ack'?'simulated-ack':null,snapshot:normalizeEventSnapshot(e.snapshot,strict)})):[];
    result.retail=normalizeRetail(raw.retail,strict);
    return result;
  }
  function evaluateAlarm(node) {
    return !!(node.on && node.threshold?.enabled && (node.value<node.threshold.low || node.value>node.threshold.high));
  }
  function powerKW(peers, floorNumber=1) {
    return .4+peers.filter(n=>n.on&&n.floor===floorNumber).reduce((sum,n)=>sum+({'照明':.35,'风机':.85,'货架':.03}[n.type]||0)*n.level/100,0);
  }
  function integrateEnergy(kWh,kW,seconds) {
    if(!Number.isFinite(kWh)||!Number.isFinite(kW)||!Number.isFinite(seconds)||kWh<0||kW<0||seconds<0)throw new Error('电能积分参数无效');
    return clamp(kWh+kW*seconds/3600,0,TYPES['电能'].max);
  }
  function nextReading(node, environment, peers, elapsed, random=Math.random, seconds=1) {
    const t=TYPES[node.type], noise=clamp(num(random(),.5),0,1)-.5, env=environment;
    const fan=peers.filter(n=>n.type==='风机'&&n.on&&n.floor===node.floor).reduce((s,n)=>s+n.level/100,0);
    let target=node.value;
    if(['温湿度','温度'].includes(node.type))target=(node.name.includes('冷链')?5:env.temperature)-fan*1.5+Math.sin(elapsed/13+Number(node.x)/100)*.5;
    if(node.type==='湿度')target=num(env.humidity,52)-fan*1.2;
    if(node.type==='光照'){
      const curtains=peers.filter(n=>n.type==='窗帘'&&n.floor===node.floor),opening=curtains.length?curtains.reduce((sum,n)=>sum+n.level/100,0)/curtains.length:1;
      target=env.brightness*(.12+.88*opening)+peers.filter(n=>n.type==='照明'&&n.on&&n.floor===node.floor).reduce((sum,n)=>sum+n.level*4,0);
    }
    if(['照明','窗帘'].includes(node.type))return clamp(node.level,0,100);
    if(node.type==='风机')target=node.level*22;
    if(node.type==='烟感')target=env.smoke/(1+fan*.6);
    if(node.type==='可燃气体')target=num(env.gas,2)/(1+fan*.15);
    if(['门禁','门磁','报警器'].includes(node.type))return node.level>=50?1:0;
    if(node.type==='指纹')return node.authorization?.result==='granted'?1:0;
    if(node.type==='货架')target=node.value-env.occupancy*.007;
    if(['电表','功率'].includes(node.type))return clamp(powerKW(peers,node.floor),t.min,t.max);
    if(node.type==='电压')return clamp(num(env.voltage,220)+noise*.4,t.min,t.max);
    if(node.type==='电流')return clamp(powerKW(peers,node.floor)*1000/Math.max(1,num(env.voltage,220)),t.min,t.max);
    if(node.type==='电能')return integrateEnergy(node.value,powerKW(peers,node.floor),seconds);
    if(node.type==='摄像头')return clamp(Math.round(env.occupancy+Math.sin(elapsed/4)*2),0,100);
    const amplitude={'温湿度':.15,'温度':.15,'湿度':.3,'光照':8,'风机':20,'烟感':.002,'可燃气体':.15,'货架':.15}[node.type]||0;
    const factor=node.type==='货架'?1:.25;
    return clamp(node.value+(target-node.value)*factor+noise*amplitude,t.min,t.max);
  }
  function controlNode(node, level) {
    if(!['照明','风机','门禁','门磁','窗帘','报警器'].includes(node.type)||!Number.isFinite(level)||level<0||level>100)throw new Error('控制参数无效');
    node.level=['门禁','门磁','报警器'].includes(node.type)?(level>=50?100:0):level;
    node.value=['门禁','门磁','报警器'].includes(node.type)?(node.level>=50?1:0):node.type==='风机'?node.level*22:node.level;
    return node;
  }
  function normalizeAuthorization(raw,strict=false) {
    if(raw==null)return null;
    if(!raw||!['granted','denied'].includes(raw.result)||!['staff-demo','resident-demo','visitor-demo'].includes(raw.credential)||!Number.isFinite(raw.at)){
      if(strict)throw new Error('指纹演示授权记录无效');return null;
    }
    return {result:raw.result,credential:raw.credential,at:raw.at,origin:'local-simulation'};
  }
  function fingerprintAuthorization(nodes, nodeId, credential, at=Date.now()) {
    const reader=nodes.find(n=>n.id===nodeId&&n.type==='指纹');
    if(!reader||!reader.on)throw new Error('请先启用指纹演示组件');
    if(!['staff-demo','resident-demo','visitor-demo'].includes(credential)||!Number.isFinite(at))throw new Error('演示身份无效');
    const granted=credential!=='visitor-demo';
    reader.authorization={result:granted?'granted':'denied',credential,at,origin:'local-simulation'};reader.value=granted?1:0;
    const doors=granted?nodes.filter(n=>n.type==='门禁'&&n.on&&n.floor===reader.floor):[];
    doors.forEach(n=>controlNode(n,100));
    return {granted,reader,doors,authorization:clone(reader.authorization)};
  }
  function normalizeEventSnapshot(raw,strict=false) {
    if(raw==null)return null;
    if(!raw||typeof raw!=='object'||!TYPES[raw.type]||!Number.isFinite(raw.value)||raw.value<TYPES[raw.type].min||raw.value>TYPES[raw.type].max||!Number.isFinite(raw.level)||raw.level<0||raw.level>100||typeof raw.on!=='boolean'){
      if(strict)throw new Error('操作快照无效');return null;
    }
    return {id:String(raw.id),type:raw.type,value:raw.value,unit:TYPES[raw.type].unit,level:raw.level,on:raw.on,authorization:normalizeAuthorization(raw.authorization,strict)};
  }
  function markDirty() {dirty=true;revision++;updateSavedLabel();}
  function updateSavedLabel() {
    const el=host?.querySelector('#savedAt');if(!el)return;
    el.textContent=dirty?'● 有未保存更改':state.saved?'已保存 '+new Date(state.saved).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'尚未保存';
    el.style.color=dirty?'#9a671e':'#64748b';
  }
  function recordEvent(node,message,kind='control') {
    state.events.unshift({id:Date.now()+'-'+Math.random().toString(36).slice(2,6),time:new Date().toLocaleTimeString('zh-CN'),name:node?.name||'场景',message,kind,ack:false,origin:'local-simulation',acknowledgement:kind==='control'?'simulated-ack':null,snapshot:node?{id:String(node.id),type:node.type,value:node.value,unit:node.unit,level:node.level,on:node.on,authorization:node.authorization?clone(node.authorization):null}:null});
    state.events=state.events.slice(0,100);
  }
  function checkAlarm(node) {
    const alarm=evaluateAlarm(node);
    if(alarm!==node.alarm) recordEvent(node,alarm?`读数 ${formatValue(node)} 超出 ${node.threshold.low}–${node.threshold.high} ${node.unit}`:'读数恢复到阈值范围',alarm?'alarm':'recovery');
    node.alarm=alarm;
  }
  function formatValue(node, value=node.value) {
    if(node.type==='门禁')return value>=.5?'解锁':'锁定';
    if(node.type==='门磁')return value>=.5?'开启':'闭合';
    if(node.type==='报警器')return value>=.5?'报警输出':'待机';
    if(node.type==='指纹')return node.authorization?(node.authorization.result==='granted'?'授权通过':'授权拒绝'):'未验证';
    if(node.type==='窗帘')return Math.round(value)+'% 开度';
    const digits=node.type==='电能'?5:['电流','功率','电表'].includes(node.type)?2:node.type==='烟感'?3:['照明','风机','摄像头','货架'].includes(node.type)?0:1;
    return Number(value).toFixed(digits)+(node.unit?' '+node.unit:'');
  }
  function tick() {
    if(!running||!host?.isConnected)return;
    const seconds=state.settings.interval/1000;state.elapsed+=seconds;state.sampleCount++;
    const t=Date.now();
    state.nodes.forEach(n=>{
      if(n.on){n.value=nextReading(n,state.environment,state.nodes,state.elapsed,Math.random,seconds);n.history.push({t,value:n.value});n.history=n.history.slice(-240);}
      checkAlarm(n);
    });
    if(state.settings.linkage){
      state.nodes.filter(n=>n.on&&n.alarm&&['温湿度','温度','烟感','可燃气体'].includes(n.type)).forEach(sensor=>{
        if(['温湿度','温度'].includes(sensor.type)&&sensor.value<=sensor.threshold.high)return;
        state.nodes.filter(n=>n.floor===sensor.floor&&(['温湿度','温度'].includes(sensor.type)?n.type==='风机':sensor.type==='可燃气体'?n.type==='报警器':['风机','门禁','报警器'].includes(n.type))).forEach(n=>{
          if(!n.on||n.level!==100){n.on=true;controlNode(n,100);recordEvent(n,`${sensor.name} 触发联动：${n.type==='门禁'?'解锁':'输出调至 100%'}`);}
        });
      });
    }
    markDirty();refreshLive();
  }
  function setRunning(value) {
    running=value;clearInterval(timer);timer=null;
    if(running)timer=setInterval(tick,state.settings.interval);
    const btn=host?.querySelector('#runTwin');if(btn){btn.textContent=running?'Ⅱ 暂停仿真':'▶ 运行仿真';btn.classList.toggle('primary',!running);}
    const label=host?.querySelector('#runLabel');if(label){label.textContent=running?'● 仿真运行中':'● 已暂停 · 可编辑';label.className='badge '+(running?'':'gray');}
    refreshMetrics();
  }
  function confirmAction(title,message,actionLabel='继续') {
    if(pendingDialog)return Promise.resolve(false);
    return new Promise(resolve=>{
      const modal=document.createElement('div');modal.className='tw-modal';modal.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="tw-confirm-title"><h2 id="tw-confirm-title">${esc(title)}</h2><p>${esc(message)}</p><div class="toolbar" style="justify-content:flex-end"><button class="btn" data-cancel>取消</button><button class="btn primary" data-confirm>${esc(actionLabel)}</button></div></section>`;
      const finish=v=>{modal.remove();pendingDialog=null;resolve(v);};pendingDialog=()=>finish(false);
      modal.querySelector('[data-cancel]').onclick=()=>finish(false);modal.querySelector('[data-confirm]').onclick=()=>finish(true);
      modal.onkeydown=e=>{if(e.key==='Escape')finish(false);if(e.key==='Tab'){const b=Array.from(modal.querySelectorAll('button'));if(e.shiftKey&&document.activeElement===b[0]){e.preventDefault();b[1].focus();}else if(!e.shiftKey&&document.activeElement===b[1]){e.preventDefault();b[0].focus();}}};
      host.appendChild(modal);modal.querySelector('[data-cancel]').focus();
    });
  }
  function project(x,y,z=0) {
    if(view==='2D')return{x:480+(x-440)*zoom,y:320+(y-315)*zoom};
    const a=Math.cos(angle),b=Math.sin(angle),scale=.92*zoom;
    return{x:480+((x-440)*a-(y-315)*b)*scale,y:360+((x-440)*b+(y-315)*a)*.48*scale-z*.86*zoom};
  }
  function polygon(points,fill,stroke='#c2d3d1',width=1) {
    ctx.beginPath();points.forEach((p,i)=>{const v=project(...p);i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y);});ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  }
  function box(x,y,w,h,z=20,fill='#c5d8d0',top='#e1ebe5') {
    if(view==='3D'){
      polygon([[x,y,0],[x+w,y,0],[x+w,y,z],[x,y,z]],fill);
      polygon([[x+w,y,0],[x+w,y+h,0],[x+w,y+h,z],[x+w,y,z]],fill);
      polygon([[x,y+h,0],[x+w,y+h,0],[x+w,y+h,z],[x,y+h,z]],fill);
    }
    polygon([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],top);
  }
  function textAt(text,x,y,z=0,color='#718783',size=12,weight='400') {
    const p=project(x,y,z);ctx.fillStyle=color;ctx.textAlign='center';ctx.font=`${weight} ${size}px "Noto Sans CJK SC","Microsoft Yahei",sans-serif`;ctx.fillText(text,p.x,p.y);ctx.textAlign='left';
  }
  function wall(x1,y1,x2,y2,height=40) {
    if(view==='3D')polygon([[x1,y1,0],[x2,y2,0],[x2,y2,height],[x1,y1,height]],'#d6e5e0','#bbcfc7',1);
    else{const a=project(x1,y1),b=project(x2,y2);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle='#c0d1c9';ctx.lineWidth=7*zoom;ctx.stroke();ctx.lineWidth=1;}
  }
  function circleAt(x,y,r,z,color) {const p=project(x,y,z);ctx.beginPath();ctx.ellipse(p.x,p.y,r*zoom,r*zoom*(view==='3D'?.5:1),0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function plant(x,y) {box(x-10,y-10,20,20,15,'#b09d7e','#d1c4a5');circleAt(x,y,18,35,'#6baa8c');circleAt(x-8,y,11,43,'#8abb98');circleAt(x+7,y,10,39,'#528f76');}
  function desk(x,y,w=90,h=44) {
    box(x,y,w,h,27,'#c6b69b','#e4d8c2');box(x+w*.2,y+8,w*.5,9,39,'#557578','#638d8d');
    box(x+w*.23,y+21,w*.44,9,29,'#bacbd0','#e9efed');box(x+w*.34,y+h+7,28,24,18,'#7b9d9b','#a9c3bd');
  }
  function bed(x,y,w=128,h=125) {
    box(x,y,w,h,22,'#b39e87','#faf2e4');box(x+7,y+39,w-14,h-44,29,'#8fb0ba','#b7d0d6');
    box(x+9,y+9,w*.35,24,32,'#dce4dc','#fffdf4');box(x+w*.56,y+9,w*.35,24,32,'#dce4dc','#fffdf4');box(x,y,w,9,44,'#a89980','#c7b89d');
  }
  function sofa(x,y,w=136,h=50) {
    box(x,y,w,h,26,'#819b91','#bfd0bb');box(x,y,w,12,46,'#92aba0','#c8d7c4');box(x,y,13,h,39,'#8ba69a','#b5cbb8');box(x+w-13,y,13,h,39,'#8ba69a','#b5cbb8');
    box(x+18,y+18,w*.33,h-24,29,'#a1bdaa','#d7e3d0');box(x+w*.52,y+18,w*.33,h-24,29,'#a1bdaa','#d7e3d0');
  }
  function rack(x,y,w=94,h=170) {
    box(x,y,w,h,37,'#93a4aa','#dbe5e0');
    for(let r=0;r<4;r++)for(let c=0;c<3;c++)box(x+9+c*(w-15)/3,y+9+r*(h-16)/4,(w-27)/3,(h-29)/4,49+(r%2)*6,['#a8bb9c','#c7ac87','#9db6c3'][c],['#d2dfbd','#edcea6','#c2d9df'][c]);
  }
  function floorPlan() {
    const room=(x,y,w,h,color,label,lx=x+w/2,ly=y+h-14)=>{polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],color,'#d8e4de');textAt(label,lx,ly,0,'#81958e',12);};
    polygon([[76,92,-8],[804,92,-8],[804,538,-8],[76,538,-8]],'#e4eae0','#c1d2c7',2);
    if(state.scene==='建筑'){
      if(floor===1){
        room(90,106,430,400,'#eef0e2','接待大厅 / LOBBY',320,475);room(530,106,255,185,'#e0ebe7','设备机房',665,274);room(530,305,255,205,'#e5ede5','培训教室',675,492);
        wall(520,106,520,260);wall(520,320,520,510);wall(530,297,785,297);
        desk(130,175,145,55);sofa(140,371,150);box(315,380,90,53,15,'#cbb79b','#efe2c9');plant(480,130);plant(475,425);
        [575,641,707].forEach(x=>{box(x,125,42,60,77,'#819b9c','#aec5bd');for(let i=0;i<4;i++)box(x+5,135+i*10,32,5,79,'#527f7b','#719990');});
        for(let r=0;r<2;r++)for(let c=0;c<2;c++)desk(552+c*116,337+r*77,83,35);
        textAt('RECEPTION',202,240,0,'#64748b',12,'600');
      }else{
        room(90,106,430,327,'#e5ece3','开放办公区',300,413);room(533,106,250,190,'#e5ebe3','会议室',665,279);room(533,312,250,195,'#e6ede7','创客实验室',664,488);room(90,443,430,65,'#eef0e2','共享走廊',297,484);
        wall(520,106,520,385);wall(530,302,785,302);wall(90,435,235,435);wall(325,435,520,435);
        for(let r=0;r<2;r++)for(let c=0;c<3;c++)desk(116+c*125,139+r*141,90,48);
        box(580,143,145,84,27,'#c2b499','#e4d8c1');[583,632,682].forEach(x=>{box(x,125,29,21,18,'#8aaca3','#bad0c2');box(x,231,29,21,18,'#8aaca3','#bad0c2');});
        desk(560,346,90,50);desk(669,346,90,50);box(566,435,179,27,30,'#8caaa7','#c3d7cd');plant(481,469);
      }
    }else if(state.scene==='家居'){
      room(90,106,260,173,'#eee9d7','开放厨房',225,257);room(361,106,165,173,'#dfecea','卫浴',440,257);room(540,106,245,280,'#eee6de','卧室',678,365);room(90,292,435,217,'#e8ede1','客厅',322,488);room(540,400,245,110,'#ebe9df','玄关 / 入户',672,493);
      wall(351,106,351,204);wall(533,106,533,326);wall(533,387,785,387);wall(360,286,455,286);
      box(103,117,220,40,36,'#c3b299','#eee5d4');box(103,157,44,72,36,'#c3b299','#eee5d4');circleAt(243,137,11,38,'#8d9b96');circleAt(280,137,11,38,'#8d9b96');box(157,186,113,42,30,'#c2b394','#e4d7bc');box(164,235,23,18,18,'#a49b89','#d9cfb9');box(231,235,23,18,18,'#a49b89','#d9cfb9');
      box(376,119,45,64,20,'#c3d8d6','#f8fbf4');box(454,118,57,35,32,'#bdcfca','#f4f8f2');circleAt(488,202,15,20,'#f3f7f1');
      bed(596,123,133,135);box(556,121,27,40,27,'#c8b39b','#e4d3bd');box(750,124,25,112,58,'#c4b8a1','#e5dac5');plant(758,346);
      sofa(122,337,175,61);box(161,422,120,40,16,'#c7b396','#eaddc4');box(403,322,35,120,34,'#b8c8b5','#d6e0cb');box(410,337,9,83,59,'#456669','#5d8584');plant(119,469);plant(492,318);box(551,420,88,32,29,'#c2b59b','#e5d8bd');
    }else{
      room(90,106,530,117,'#dfebe4','冷链 / 生鲜区',400,212);room(634,106,151,190,'#e9e9db','仓储区',710,279);room(90,237,530,174,'#ecedde','商品陈列区',415,399);room(634,309,151,202,'#e6ece3','收银 / 服务区',712,496);room(90,426,530,84,'#e2ede6','入口通道',415,493);
      wall(626,106,626,246);wall(636,300,785,300);
      [115,265,415].forEach(x=>{box(x,116,126,58,38,'#8eaaa8','#cde3df');box(x+8,123,110,41,42,'#acd0d0','#ddecde');for(let c=0;c<5;c++)box(x+13+c*21,130,15,25,45,'#a5be8b','#d5dfad');});
      rack(281,238,97,142);rack(450,238,97,142);box(117,254,97,102,45,'#a0b9bb','#d3e2e0');box(124,260,83,90,48,'#aac9cd','#d4e8e5');
      for(let r=0;r<2;r++)for(let c=0;c<2;c++)box(652+c*59,123+r*61,46,44,28+r*9,'#b59d78','#ddc7a0');
      desk(658,351,99,49);box(655,428,105,39,30,'#bbaf94','#e2d7bc');box(172,443,26,38,26,'#8eaaa3','#d2e0d4');box(263,443,26,38,26,'#8eaaa3','#d2e0d4');plant(590,470);
      textAt('ENTRANCE',229,523,0,'#64748b',12,'600');
    }
    wall(86,100,792,100,65);wall(86,100,86,516,45);wall(792,100,792,435,32);
    if(view==='2D'){
      wall(86,516,410,516);wall(503,516,792,516);
      // Door opening and swing remain legible in the floor plan.
      const p=project(410,516);ctx.beginPath();ctx.arc(p.x,p.y,85*zoom,-Math.PI/2,0);ctx.strokeStyle='#a9bfb3';ctx.lineWidth=1;ctx.stroke();
    }
  }
  function deviceGlyph(type,x,y) {
    ctx.save();ctx.translate(x,y);ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=1.8;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    if(['温湿度','温度'].includes(type)){ctx.moveTo(-2,-10);ctx.lineTo(-2,3);ctx.arc(0,7,5,Math.PI*1.25,Math.PI*1.75,true);ctx.lineTo(2,-10);ctx.quadraticCurveTo(0,-13,-2,-10);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(0,7);ctx.stroke();}
    if(['照明','光照'].includes(type)){ctx.arc(0,0,5,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*8,Math.sin(a)*8);ctx.lineTo(Math.cos(a)*11,Math.sin(a)*11);ctx.stroke();}}
    if(type==='风机'){ctx.arc(0,0,2,0,Math.PI*2);ctx.fill();for(let i=0;i<3;i++){ctx.save();ctx.rotate(i*Math.PI*2/3);ctx.beginPath();ctx.moveTo(2,-1);ctx.bezierCurveTo(12,-12,15,5,2,4);ctx.closePath();ctx.stroke();ctx.restore();}}
    if(type==='烟感'){ctx.arc(0,1,9,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(0,1,3,0,Math.PI*2);ctx.stroke();[-5,0,5].forEach(x=>{ctx.beginPath();ctx.moveTo(x,-5);ctx.lineTo(x,-2);ctx.stroke();});}
    if(['门禁','门磁'].includes(type)){ctx.rect(-8,-11,14,22);ctx.moveTo(-1,-8);ctx.lineTo(10,-5);ctx.lineTo(10,11);ctx.lineTo(-1,8);ctx.closePath();ctx.stroke();ctx.fillRect(5,1,2,2);}
    if(type==='货架'){ctx.rect(-10,-10,20,20);ctx.moveTo(-10,-3);ctx.lineTo(10,-3);ctx.moveTo(-10,4);ctx.lineTo(10,4);ctx.moveTo(-3,-10);ctx.lineTo(-3,-3);ctx.moveTo(4,-3);ctx.lineTo(4,4);ctx.stroke();}
    if(['电表','电压','电流','功率','电能'].includes(type)){ctx.moveTo(2,-12);ctx.lineTo(-7,1);ctx.lineTo(0,1);ctx.lineTo(-2,12);ctx.lineTo(8,-2);ctx.lineTo(1,-2);ctx.closePath();ctx.stroke();}
    if(type==='摄像头'){ctx.rect(-10,-6,15,13);ctx.moveTo(5,-2);ctx.lineTo(11,-6);ctx.lineTo(11,7);ctx.lineTo(5,3);ctx.moveTo(-3,8);ctx.lineTo(-3,12);ctx.moveTo(-7,12);ctx.lineTo(1,12);ctx.stroke();}
    if(['湿度','可燃气体','窗帘','指纹','报警器'].includes(type)){ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillText(TYPES[type].icon,0,5);}
    ctx.restore();
  }
  function draw() {
    if(!ctx||!state)return;
    const W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#f8fafc');bg.addColorStop(1,'#edf2f8');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    if(state.settings.grid){ctx.strokeStyle='#dfe6f0';ctx.lineWidth=.6;for(let x=40;x<880;x+=35){const a=project(x,60),b=project(x,560);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}for(let y=60;y<=560;y+=35){const a=project(40,y),b=project(880,y);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
    floorPlan();
    const nodes=currentNodes().slice().sort((a,b)=>project(a.x,a.y).y-project(b.x,b.y).y);
    nodes.forEach(n=>{
      const p=project(n.x,n.y,view==='3D'?n.z:0);n._screen=p;
      if(view==='3D'){const base=project(n.x,n.y);ctx.strokeStyle=n.alarm?'#dc8781':'#91afa1';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);circleAt(n.x,n.y,9,0,'#739e8e44');}
      const radius=selected===n.id?24:20;ctx.beginPath();ctx.arc(p.x,p.y,radius+5,0,Math.PI*2);ctx.fillStyle=n.alarm?'#ec837a44':selected===n.id?'#245bcc45':'#ffffffc9';ctx.fill();
      ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fillStyle=n.on?TYPES[n.type].color:'#a8b4b4';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
      deviceGlyph(n.type,p.x,p.y);ctx.textAlign='center';
      if(n.alarm){ctx.beginPath();ctx.arc(p.x+18,p.y-17,8,0,7);ctx.fillStyle='#d76358';ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';ctx.fillText('!',p.x+18,p.y-13);}
      if(showLabels){const name=n.name.length>13?n.name.slice(0,12)+'…':n.name;ctx.font='12px "Noto Sans CJK SC","Microsoft Yahei",sans-serif';const width=Math.max(ctx.measureText(name).width,ctx.measureText(formatValue(n)).width)+18;ctx.fillStyle='#fffffff2';ctx.fillRect(p.x-width/2,p.y+27,width,39);ctx.fillStyle='#334155';ctx.fillText(name,p.x,p.y+42);ctx.fillStyle=n.alarm?'#b45336':'#64748b';ctx.font='12px sans-serif';ctx.fillText(n.on?formatValue(n):'已关闭',p.x,p.y+58);}
      ctx.textAlign='left';
    });
    ctx.font='12px sans-serif';ctx.fillStyle='#64748b';ctx.fillText(view==='3D'?'ISOMETRIC VIEW / 几何投影':'FLOOR PLAN / 平面布置',23,H-24);ctx.textAlign='right';ctx.fillText(SCENES[state.scene].floorNames[floor-1]+' · '+currentNodes().length+' 个组件',W-23,H-24);ctx.textAlign='left';
    // Orientation key.
    ctx.beginPath();ctx.moveTo(W-50,62);ctx.lineTo(W-50,31);ctx.lineTo(W-54,39);ctx.moveTo(W-50,31);ctx.lineTo(W-46,39);ctx.strokeStyle='#64748b';ctx.lineWidth=1.5;ctx.stroke();ctx.font='12px sans-serif';ctx.fillText('N',W-54,24);
  }
  function renderList() {
    const el=host.querySelector('#nodeList');if(!el)return;
    const visible=currentNodes().filter(n=>(n.name+n.type).toLowerCase().includes(listQuery.toLowerCase()));
    el.innerHTML=visible.length?visible.map(n=>`<button class="tw-node ${n.id===selected?'active':''}" data-node="${esc(n.id)}"><span class="tw-dot" style="background:${n.on?TYPES[n.type].color:'#a9b5ba'}">${TYPES[n.type].icon}</span><span><b>${esc(n.name)}</b><small>${esc(n.type)} · ${n.on?(n.alarm?'阈值告警':'已启用'):'已关闭'}</small></span><i style="background:${n.alarm?'#df7866':n.on?'#59ad92':'#b2bbc0'}"></i></button>`).join(''):'<div class="empty" style="padding:22px 8px">没有匹配的组件</div>';
    el.querySelectorAll('[data-node]').forEach(btn=>btn.onclick=()=>selectNode(state.nodes.find(n=>String(n.id)===btn.dataset.node)?.id));
    host.querySelector('#componentCount').textContent=currentNodes().length+' 个';
  }
  function selectNode(id) {selected=id;renderList();inspect();draw();drawChart();}
  function inspect() {
    const el=host.querySelector('#inspector');const n=currentNode();
    if(!n){el.innerHTML='<div class="empty">选择画布或列表中的组件<br>编辑属性、阈值与控制参数</div>';drawChart();return;}
    const controllable=['照明','风机','门禁','门磁','窗帘','报警器'].includes(n.type);
    const binary=['门禁','门磁','报警器'].includes(n.type);
    const controlLabel={'照明':'亮度输出','风机':'风速输出','门禁':'门锁状态','门磁':'门磁状态（模拟开关门）','窗帘':'窗帘开度','报警器':'报警输出'}[n.type];
    el.innerHTML=`<div class="tw-inspector-head"><span class="tw-dot" style="background:${TYPES[n.type].color};width:39px;height:39px;font-size:21px">${TYPES[n.type].icon}</span><div><b>${esc(n.type)}</b><small>SIM-${esc(String(n.id).slice(-6).padStart(4,'0'))}</small></div><span class="badge gray">本地组件</span></div>
      ${n.legacyTelemetry?.history.length?'<p class="muted">旧版照明 lux 历史已归档，可随 JSON / CSV 导出；新图表显示亮度输出。</p>':''}<div class="tw-readout"><strong id="inspectorValue">${n.on?esc(formatValue(n)):'已关闭'}</strong><span id="inspectorStatus" class="badge ${n.alarm?'amber':n.on?'':'gray'}">${n.alarm?'阈值告警':n.on?'已启用':'已关闭'}</span></div>
      <label class="field">组件名称<input id="nodeName" maxlength="50" value="${esc(n.name)}"></label>
      <div class="tw-fields"><label class="field">X 坐标<input id="nodeX" type="number" min="95" max="785" value="${Math.round(n.x)}"></label><label class="field">Y 坐标<input id="nodeY" type="number" min="110" max="520" value="${Math.round(n.y)}"></label><label class="field">高度 Z<input id="nodeZ" type="number" min="0" max="140" value="${Math.round(n.z)}"></label></div>
      ${SCENES[state.scene].floors>1?`<label class="field">所属楼层<select id="nodeFloor">${SCENES[state.scene].floorNames.map((t,i)=>`<option value="${i+1}" ${n.floor===i+1?'selected':''}>${t}</option>`).join('')}</select></label>`:''}
      <div class="tw-inspector-section"><div class="section-title"><h3>设备控制</h3><button class="btn tw-small" id="toggleDevice">${n.on?'关闭组件':'开启组件'}</button></div>
      ${controllable?`<label class="field">${controlLabel}${binary?`<select id="nodeLevel"><option value="0" ${n.level<50?'selected':''}>${n.type==='门禁'?'锁定':n.type==='门磁'?'闭合':'待机'}</option><option value="100" ${n.level>=50?'selected':''}>${n.type==='门禁'?'解锁':n.type==='门磁'?'开启':'报警输出'}</option></select>`:`<div class="row"><input id="nodeLevel" type="range" min="0" max="100" step="5" value="${n.level}" style="width:100%"><b id="levelValue">${n.level}%</b></div>`}</label>`:n.type==='指纹'?`<p class="muted">使用演示身份，不采集真实指纹。</p><div class="toolbar"><button class="btn" id="fingerprintAllow">模拟已授权指纹</button><button class="btn" id="fingerprintDeny">模拟未授权指纹</button></div>`:'<p class="muted" style="margin:0">启用后，在运行仿真时生成采样。</p>'}</div>
      <div class="tw-inspector-section"><div class="section-title"><h3>阈值告警</h3><label class="tw-check"><input type="checkbox" id="alarmEnabled" ${n.threshold.enabled?'checked':''}>启用</label></div><div class="tw-fields" style="grid-template-columns:1fr 1fr"><label class="field">下限 (${esc(n.unit||'0/1')})<input id="alarmLow" type="number" step="${TYPES[n.type].step}" value="${n.threshold.low}"></label><label class="field">上限 (${esc(n.unit||'0/1')})<input id="alarmHigh" type="number" step="${TYPES[n.type].step}" value="${n.threshold.high}"></label></div><p id="thresholdError" class="muted" style="margin:0;color:#c4675b">超出区间时记录告警</p></div>
      <div class="toolbar" style="margin-top:18px"><button class="btn" id="duplicateDevice">复制组件</button><button class="btn danger" id="removeDevice">移除</button></div>`;
    el.querySelector('#nodeName').onchange=e=>{n.name=e.target.value.trim()||n.type;e.target.value=n.name;markDirty();renderList();draw();drawChart();};
    ['X','Y','Z'].forEach((axis,i)=>el.querySelector('#node'+axis).onchange=e=>{const bounds=[[95,785],[110,520],[0,140]][i];n[axis.toLowerCase()]=clamp(num(e.target.value,n[axis.toLowerCase()]),...bounds);e.target.value=Math.round(n[axis.toLowerCase()]);markDirty();draw();});
    const nf=el.querySelector('#nodeFloor');if(nf)nf.onchange=e=>{n.floor=Number(e.target.value);floor=n.floor;host.querySelector('#floorSelect').value=floor;markDirty();renderQuickControls();renderList();draw();refreshMetrics();};
    el.querySelector('#toggleDevice').onclick=()=>{n.on=!n.on;checkAlarm(n);recordEvent(n,n.on?'组件已开启':'组件已关闭');markDirty();inspect();refreshLive();};
    const level=el.querySelector('#nodeLevel');if(level)level.oninput=e=>{controlNode(n,Number(e.target.value));checkAlarm(n);const out=el.querySelector('#levelValue');if(out)out.textContent=n.level+'%';markDirty();draw();updateInspectorReading();renderTelemetry();};
    if(level)level.onchange=e=>{controlNode(n,Number(e.target.value));checkAlarm(n);updateInspectorReading();renderTelemetry();draw();recordEvent(n,controlLabel+'设为 '+(binary?formatValue(n):n.level+'%'));markDirty();renderEvents();renderQuickControls();};
    const allow=el.querySelector('#fingerprintAllow'),deny=el.querySelector('#fingerprintDeny');if(allow)allow.onclick=()=>runFingerprint(n,'staff-demo');if(deny)deny.onclick=()=>runFingerprint(n,'visitor-demo');
    el.querySelector('#alarmEnabled').onchange=e=>{n.threshold.enabled=e.target.checked;checkAlarm(n);markDirty();refreshLive();};
    const updateThreshold=()=>{
      const lowInput=el.querySelector('#alarmLow'),highInput=el.querySelector('#alarmHigh'),low=Number(lowInput.value),high=Number(highInput.value),error=el.querySelector('#thresholdError');
      if(!lowInput.value.trim()||!highInput.value.trim()||!Number.isFinite(low)||!Number.isFinite(high)||low>=high){error.textContent='请输入有效数值，且下限必须小于上限';return;}
      n.threshold.low=low;n.threshold.high=high;error.textContent='超出区间时记录告警';checkAlarm(n);markDirty();refreshLive();
    };
    el.querySelector('#alarmLow').onchange=updateThreshold;el.querySelector('#alarmHigh').onchange=updateThreshold;
    el.querySelector('#duplicateDevice').onclick=()=>{
      if(state.nodes.length>=80){toast('每个场景最多支持 80 个组件');return;}
      const copy=clone(cleanNode(n));copy.id=uniqueId();copy.name=n.name.slice(0,45)+' 副本';copy.x=clamp(n.x+40,95,785);copy.y=clamp(n.y+25,110,520);copy.history=[];copy.alarm=false;state.nodes.push(copy);markDirty();selectNode(copy.id);refreshLive();
    };
    el.querySelector('#removeDevice').onclick=async()=>{if(!await confirmAction('移除组件',`移除“${n.name}”及其采样历史？`, '移除'))return;state.nodes=state.nodes.filter(x=>x.id!==n.id);selected=currentNodes()[0]?.id;markDirty();inspect();refreshLive();};
  }
  function runFingerprint(node,credential) {
    try{
      const result=fingerprintAuthorization(state.nodes,node.id,credential);
      recordEvent(node,result.granted?'演示指纹授权通过'+(result.doors.length?'，已解锁同层门禁':'；无已启用同层门禁'):'演示指纹授权拒绝，门锁状态保持不变');
      result.doors.forEach(door=>recordEvent(door,'演示身份授权，门锁解锁'));
      markDirty();refreshLive();
    }catch(error){toast(error.message);}
  }
  function renderQuickControls() {
    const panel=host?.querySelector('#quickControls'),overlay=host?.querySelector('#environmentOverlay');if(!panel)return;
    const wanted=state.scene==='建筑'?['温度','可燃气体','电压','电流','电能']:['温度','湿度','光照'];
    const sensors=wanted.map(type=>currentNodes().find(n=>n.type===type)).filter(Boolean);
    if(overlay)overlay.innerHTML=sensors.map(n=>`<span>${esc(n.type)} <b>${n.on?esc(formatValue(n)):'已关闭'}</b></span>`).join('');
    const controls=currentNodes().filter(n=>['照明','窗帘','门禁','门磁','报警器'].includes(n.type));
    const reader=currentNodes().find(n=>n.type==='指纹');
    panel.innerHTML=`<div class="tw-quick-heading"><b>场景快捷控制</b><small>本地操作 · 模拟回执</small></div><div class="toolbar">${controls.map(n=>`<button class="btn tw-small" data-quick-control="${esc(n.id)}" aria-pressed="${n.type==='照明'?n.on:n.level>=50}">${esc(n.name)}：${n.on?esc(n.type==='照明'?'开启':formatValue(n)):'停用'}</button>`).join('')}${reader?`<button class="btn tw-small" id="quickFingerprintAllow">已授权指纹</button><button class="btn tw-small" id="quickFingerprintDeny">未授权指纹</button>`:''}</div>`;
    panel.querySelectorAll('[data-quick-control]').forEach(button=>button.onclick=()=>{
      const node=state.nodes.find(n=>String(n.id)===button.dataset.quickControl);if(!node)return;
      if(node.type==='照明')node.on=!node.on;else{node.on=true;controlNode(node,node.level>=50?0:100);}
      checkAlarm(node);recordEvent(node,node.name+' → '+(node.type==='照明'?(node.on?'开启':'关闭'):formatValue(node)));markDirty();refreshLive();
    });
    const allow=panel.querySelector('#quickFingerprintAllow'),deny=panel.querySelector('#quickFingerprintDeny');
    if(allow)allow.onclick=()=>runFingerprint(reader,state.scene==='家居'?'resident-demo':'staff-demo');if(deny)deny.onclick=()=>runFingerprint(reader,'visitor-demo');
  }
  let retailFeedback='';
  function renderRetail() {
    const panel=host?.querySelector('#retailPanel');if(!panel)return;if(state.scene!=='商超'){panel.innerHTML='';return;}
    const totals=retailTotals(state.retail),latest=state.retail.lastPayment;
    const receiptLines=receipt=>receipt.lines.map(line=>`<li>${esc(line.name)} · ${line.quantity}${line.mode==='weight'?' g':' 件'} · ${centsText(line.lineTotalCents)}</li>`).join('');
    panel.innerHTML=`<section class="card tw-retail"><div class="section-title"><div><h2>购物篮与模拟收银</h2><p class="muted">选择按件商品或输入称重净克数，金额按分计算。无真实扣款。</p></div><span class="badge gray">本地收据 ${state.retail.receipts.length} 笔</span></div>
      <div class="tw-retail-layout"><div><div class="tw-retail-entry"><label class="field">商品<select id="retailProduct">${CATALOG.map(p=>`<option value="${p.id}">${esc(p.name)} · ${centsText(p.priceCents)} / ${p.mode==='weight'?'kg':'件'}</option>`).join('')}</select></label><label class="field"><span id="retailQuantityLabel">数量（件）</span><input id="retailQuantity" type="number" min="1" max="999" step="1" value="1"></label><button class="btn primary" id="retailAdd">加入购物篮</button></div>
      <div class="tw-table-wrap"><table><thead><tr><th>商品</th><th>件数 / 净重</th><th>单价</th><th>小计</th><th></th></tr></thead><tbody>${totals.lines.length?totals.lines.map(line=>`<tr><td>${esc(line.name)}</td><td>${line.quantity}${line.mode==='weight'?' g':' 件'}</td><td>${centsText(line.priceCents)} / ${line.mode==='weight'?'kg':'件'}</td><td>${centsText(line.lineTotalCents)}</td><td><button class="btn tw-small" data-retail-remove="${line.productId}">移除</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">购物篮为空，添加商品开始收银演练</td></tr>'}</tbody></table></div>
      <div class="tw-retail-totals"><span>商品净重 <b id="retailNetWeight">${totals.netWeightGrams} g</b></span><span>${totals.countItems} 件按件商品 · ${totals.weightedGrams} g 称重商品</span><strong id="retailTotal">合计 ${centsText(totals.totalCents)}</strong></div></div>
      <div class="tw-retail-payment"><label class="field">模拟账户余额（元）<div class="row"><input id="retailBalance" type="text" inputmode="decimal" value="${(state.retail.balanceCents/100).toFixed(2)}"><button class="btn" id="retailSetBalance">设置</button></div></label><label class="field">模拟支付方式<select id="retailMethod"><option value="balance">模拟余额扣款</option><option value="cash">模拟现金找零</option></select></label><label class="field" id="retailCashField" hidden>模拟实收（元）<input id="retailCash" type="text" inputmode="decimal" value="100.00"></label><button class="btn primary" id="retailPay" ${totals.lines.length?'':'disabled'}>确认模拟结算</button><p class="muted" id="retailFeedback" role="status">${esc(retailFeedback||'支付和余额仅用于课堂演示。')}</p></div></div>
      ${latest?`<div class="tw-retail-receipt"><b>最近购买明细 · ${esc(latest.id)}</b><ul>${receiptLines(latest)}</ul><div>净重 ${latest.netWeightGrams} g · 应付 ${centsText(latest.totalCents)} · 模拟实付/实收 ${centsText(latest.paidCents)} · 找零 ${centsText(latest.changeCents)} · 余额 ${centsText(latest.balanceAfterCents)}</div></div>`:''}
      ${state.retail.receipts.length>1?`<details class="tw-help"><summary>历史本地收据（${state.retail.receipts.length} 笔）</summary>${state.retail.receipts.map(r=>`<details><summary>${new Date(r.at).toLocaleString('zh-CN')} · ${esc(r.id)} · ${centsText(r.totalCents)}</summary><ul>${receiptLines(r)}</ul><p>净重 ${r.netWeightGrams} g · 实收 ${centsText(r.paidCents)} · 找零 ${centsText(r.changeCents)} · 结算后余额 ${centsText(r.balanceAfterCents)}</p></details>`).join('')}</details>`:''}</section>`;
    const $=id=>panel.querySelector('#'+id),message=text=>{$('retailFeedback').textContent=text;retailFeedback=text;};
    $('retailProduct').onchange=()=>{const product=CATALOG.find(p=>p.id===$('retailProduct').value),weight=product.mode==='weight';$('retailQuantityLabel').textContent=weight?'称重净重（g）':'数量（件）';$('retailQuantity').value=weight?'500':'1';$('retailQuantity').max=weight?'1000000':'999';};
    $('retailMethod').onchange=()=>$('retailCashField').hidden=$('retailMethod').value!=='cash';
    $('retailAdd').onclick=()=>{try{const product=CATALOG.find(p=>p.id===$('retailProduct').value);retailAdd(state.retail,product.id,Number($('retailQuantity').value));retailFeedback='已加入 '+product.name;recordEvent(null,'购物篮添加：'+product.name);markDirty();renderRetail();renderEvents();}catch(error){message(error.message);}};
    panel.querySelectorAll('[data-retail-remove]').forEach(button=>button.onclick=()=>{retailRemove(state.retail,button.dataset.retailRemove);retailFeedback='已从购物篮移除商品';recordEvent(null,retailFeedback);markDirty();renderRetail();renderEvents();});
    $('retailSetBalance').onclick=()=>{try{state.retail.balanceCents=parseMoney($('retailBalance').value);retailFeedback='模拟余额设为 '+centsText(state.retail.balanceCents);recordEvent(null,retailFeedback);markDirty();renderRetail();renderEvents();}catch(error){message(error.message);}};
    $('retailPay').onclick=()=>{try{const receipt=retailCheckout(state.retail,{method:$('retailMethod').value,tenderedCents:$('retailMethod').value==='cash'?parseMoney($('retailCash').value):0});retailFeedback='模拟结算完成，应付 '+centsText(receipt.totalCents)+'，找零 '+centsText(receipt.changeCents);recordEvent(null,retailFeedback+'；收据 '+receipt.id);markDirty();renderRetail();renderEvents();}catch(error){message(error.message);}};
  }
  function uniqueId() {let id=Date.now();while(state.nodes.some(n=>String(n.id)===String(id)))id++;return id;}
  function updateInspectorReading() {
    const n=currentNode();if(!n)return;const val=host.querySelector('#inspectorValue'),status=host.querySelector('#inspectorStatus');
    if(val)val.textContent=n.on?formatValue(n):'已关闭';const toggle=host.querySelector('#toggleDevice');if(toggle)toggle.textContent=n.on?'关闭组件':'开启组件';const level=host.querySelector('#nodeLevel');if(level&&document.activeElement!==level){level.value=n.level;const label=host.querySelector('#levelValue');if(label)label.textContent=n.level+'%';}if(status){status.textContent=n.alarm?'阈值告警':n.on?'已启用':'已关闭';status.className='badge '+(n.alarm?'amber':n.on?'':'gray');}
  }
  function refreshMetrics() {
    if(!host||!state)return;
    const values={metricOnline:state.nodes.filter(n=>n.on).length+' / '+state.nodes.length,metricAlarm:state.nodes.filter(n=>n.alarm).length,metricSamples:state.sampleCount,metricElapsed:Math.floor(state.elapsed/60)+'m '+Math.floor(state.elapsed%60)+'s'};
    Object.entries(values).forEach(([key,v])=>{const e=host.querySelector('#'+key);if(e)e.textContent=v;});
    const n=host.querySelector('#sampleIntervalLabel');if(n)n.textContent=(running?'采样中':'已暂停')+' · '+state.settings.interval/1000+' 秒 / 次';
  }
  function renderTelemetry() {
    const el=host.querySelector('#telemetry');if(!el)return;
    el.innerHTML=state.nodes.map(n=>`<tr data-telemetry="${esc(n.id)}"><td><span style="color:${TYPES[n.type].color}">●</span> ${esc(n.name)}</td><td>${n.floor}F</td><td>${esc(n.type)}</td><td class="tw-numeric">${n.on?esc(formatValue(n)):'—'}</td><td><span class="badge ${n.alarm?'amber':n.on?'':'gray'}">${n.alarm?'阈值告警':n.on?'已启用':'已关闭'}</span></td><td>${n.history.length} 个点</td><td>${n.threshold.enabled?esc(n.threshold.low+' – '+n.threshold.high):'未启用'}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">从组件库添加你的第一个设备</td></tr>';
    el.querySelectorAll('[data-telemetry]').forEach(row=>row.onclick=()=>{const n=state.nodes.find(n=>String(n.id)===row.dataset.telemetry);if(!n)return;floor=n.floor;host.querySelector('#floorSelect').value=floor;selectNode(n.id);});
  }
  function drawChart() {
    const chart=host.querySelector('#historyChart');if(!chart)return;const c=chart.getContext('2d'),W=chart.width,H=chart.height,n=currentNode();
    const title=host.querySelector('#chartDevice');if(title)title.textContent=n?n.name+' · '+(n.unit||'门锁状态'):'请选择组件';
    c.clearRect(0,0,W,H);c.fillStyle='#fff';c.fillRect(0,0,W,H);
    const pts=n?n.history.filter(p=>p.t>=(n.history.at(-1)?.t||Date.now())-chartWindow*1000):[];
    if(pts.length<2){c.fillStyle='#8b9ba7';c.font='12px sans-serif';c.textAlign='center';c.fillText(pts.length?'继续运行，至少两个采样点即可绘图':'点击“运行仿真”开始采集，图表仅显示实际生成的采样',W/2,H/2);return;}
    let lo=Math.min(...pts.map(p=>p.value)),hi=Math.max(...pts.map(p=>p.value));const pad=Math.max((hi-lo)*.25,n.type==='烟感'?.004:Math.abs(hi)*.03||1);lo=Math.max(TYPES[n.type].min,lo-pad);hi+=pad;
    const x=i=>52+i/(pts.length-1)*(W-80),y=v=>H-36-(v-lo)/(hi-lo)*(H-61);
    c.font='12px sans-serif';c.textAlign='right';
    for(let i=0;i<=4;i++){const val=lo+(hi-lo)*i/4,Y=y(val);c.strokeStyle='#edf1f3';c.beginPath();c.moveTo(52,Y);c.lineTo(W-20,Y);c.stroke();c.fillStyle='#8b9ba2';c.fillText(val.toFixed(n.type==='烟感'?3:1),43,Y+3);}
    if(n.threshold.enabled)[n.threshold.low,n.threshold.high].forEach(v=>{if(v>lo&&v<hi){c.beginPath();c.setLineDash([5,4]);c.strokeStyle='#dd9277';c.moveTo(52,y(v));c.lineTo(W-20,y(v));c.stroke();c.setLineDash([]);}});
    c.beginPath();pts.forEach((p,i)=>i?c.lineTo(x(i),y(p.value)):c.moveTo(x(i),y(p.value)));c.lineTo(x(pts.length-1),H-36);c.lineTo(x(0),H-36);c.closePath();const gradient=c.createLinearGradient(0,20,0,H-36);gradient.addColorStop(0,TYPES[n.type].color+'44');gradient.addColorStop(1,TYPES[n.type].color+'05');c.fillStyle=gradient;c.fill();
    c.beginPath();pts.forEach((p,i)=>i?c.lineTo(x(i),y(p.value)):c.moveTo(x(i),y(p.value)));c.strokeStyle=TYPES[n.type].color;c.lineWidth=2.3;c.stroke();
    c.beginPath();c.arc(x(pts.length-1),y(pts.at(-1).value),4,0,7);c.fillStyle=TYPES[n.type].color;c.fill();
    [0,Math.floor(pts.length/2),pts.length-1].forEach(i=>{c.textAlign=i===0?'left':i===pts.length-1?'right':'center';c.fillStyle='#8b9ba2';c.fillText(new Date(pts[i].t).toLocaleTimeString('zh-CN'),x(i),H-13);});
  }
  function renderEvents() {
    const el=host.querySelector('#eventList');if(!el)return;
    el.innerHTML=state.events.slice(0,20).map(e=>`<div class="tw-event"><span class="tw-event-dot ${e.kind}"></span><div><b>${esc(e.name)}</b><span>${esc(e.message)}</span><small>${esc(e.time)} · 本地仿真${e.acknowledgement==='simulated-ack'?' · 模拟回执已确认':''}${e.ack?' · 告警已确认':''}</small></div>${e.kind==='alarm'&&!e.ack?`<button class="btn tw-small" data-ack="${esc(e.id)}">确认</button>`:''}</div>`).join('')||'<div class="empty">暂无事件<br><small>设备操作、阈值告警和恢复会记录在此</small></div>';
    host.querySelector('#eventCount').textContent=state.events.filter(e=>e.kind==='alarm'&&!e.ack).length+' 条未确认';
    el.querySelectorAll('[data-ack]').forEach(b=>b.onclick=()=>{const event=state.events.find(e=>e.id===b.dataset.ack);if(event)event.ack=true;markDirty();renderEvents();});
  }
  function refreshLive() {renderQuickControls();draw();renderList();updateInspectorReading();refreshMetrics();renderTelemetry();drawChart();renderEvents();}
  function exportCSV() {
    const rows=[['时间','设备 ID','设备名称','类型','楼层','数值','单位','数据模式']];
    state.nodes.forEach(n=>{n.history.forEach(p=>rows.push([new Date(p.t).toISOString(),n.id,n.name,n.type,n.floor,p.value,n.unit,'local-simulation']));n.legacyTelemetry?.history.forEach(p=>rows.push([new Date(p.t).toISOString(),n.id,n.name,n.type+'（旧版照度）',n.floor,p.value,n.legacyTelemetry.unit,'local-simulation']));});
    if(rows.length===1){toast('还没有采样数据，请先运行仿真');return;}
    const quote=v=>'"'+String(v).replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';
    const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='twin-telemetry.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('已导出 '+(rows.length-1)+' 条采样记录');
  }
  function scopedStyles(){return `<style>
    .tw-shell{--tw-accent:#245bcc;--tw-ink:#243247;--tw-muted:#64748b;--tw-line:#dde4ee;color:var(--tw-ink)}
    .tw-shell .card{border-color:var(--tw-line);border-radius:8px;box-shadow:none}
    .tw-shell .muted{color:var(--tw-muted);font-size:12px}
    .tw-shell .eyebrow{color:var(--tw-muted);font-size:12px;letter-spacing:1.2px;margin-bottom:7px}
    .tw-shell .page-head{gap:24px;align-items:flex-start;margin-bottom:20px}
    .tw-shell .page-head p{font-size:13px;margin-top:5px}
    .tw-head-actions{display:flex;flex-direction:column;align-items:flex-end;gap:12px}
    .tw-shell #sceneName{width:470px;max-width:100%;padding:2px 0;background:transparent;border:1px solid transparent;font-size:24px;font-weight:650;line-height:1.5;color:#1e293b}
    .tw-shell #sceneName:hover{border-color:var(--tw-line)}
    .tw-shell .btn{min-height:34px;padding:7px 11px;font-size:12px;color:#475569;border-color:#d5deea;border-radius:6px}
    .tw-shell .btn:hover{background:#f1f5fb;border-color:#b7c8e5}
    .tw-shell .btn.primary{background:var(--tw-accent);border-color:var(--tw-accent);color:#fff}
    .tw-shell .btn.primary:hover{background:#1e4faa}
    .tw-shell .btn.danger{color:#b54343}
    .tw-shell .badge{font-size:12px;background:#edf3ff;color:#245bcc;padding:4px 7px}
    .tw-shell .badge.gray{background:#f0f3f7;color:#5d6c80}
    .tw-shell .badge.amber{background:#fff6e8;color:#946322}
    .tw-shell h2{font-size:14px;font-weight:650;color:#243247}
    .tw-shell h3{font-size:13px;color:#334155}
    .tw-shell .toolbar{gap:8px}
    .tw-shell button:focus-visible,.tw-shell summary:focus-visible,.tw-shell canvas:focus-visible{outline:2px solid var(--tw-accent);outline-offset:3px}
    .tw-shell input:focus,.tw-shell select:focus{border-color:#7296df;box-shadow:0 0 0 3px #245bcc14}
    .tw-workbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 12px;margin-bottom:16px;background:#fff;border:1px solid var(--tw-line);border-radius:8px;flex-wrap:wrap}
    .tw-presets{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
    .tw-preset{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:7px 11px;background:transparent;border:1px solid transparent;border-radius:5px;color:#64748b}
    .tw-preset>span{font-size:17px;line-height:1}
    .tw-preset b{font-size:12px;font-weight:500;white-space:nowrap}
    .tw-preset:hover{background:#f4f7fc}
    .tw-preset.active{background:#edf3ff;border-color:#dbe7ff;color:var(--tw-accent)}
    .tw-preset.active b{font-weight:650}
    .tw-metrics{display:flex;align-items:center;gap:0;flex-wrap:wrap}
    .tw-metric{display:flex;align-items:baseline;gap:8px;padding:4px 14px;border-left:1px solid #e4eaf2;white-space:nowrap}
    .tw-metric:first-child{border-left:0}
    .tw-metric span{font-size:12px;color:var(--tw-muted)}
    .tw-metric strong{font-size:15px;font-weight:650;color:#334155;font-variant-numeric:tabular-nums}
    .tw-metric #metricAlarm{color:#946322}
    .tw-shell .tw-layout{display:grid;grid-template-columns:184px minmax(0,1fr);gap:16px;align-items:start}
    .tw-shell .tw-layout.tw-inspector-open{grid-template-columns:184px minmax(0,1fr) 288px}
    .tw-shell .tw-panel{padding:14px;min-width:0}
    .tw-shell .tw-canvas-panel{padding:12px}
    .tw-panel-title{margin-bottom:12px}
    .tw-panel-title .muted{font-size:12px}
    .tw-section-label{font-size:12px;font-weight:600;color:#475569;margin:20px 0 12px}
    .tw-library{max-height:250px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .tw-library button{display:flex;flex-direction:column;align-items:center;gap:5px;padding:9px 3px;border:1px solid #e3e9f1;border-radius:5px;background:#fafbfd;color:#526176;font-size:12px}
    .tw-library button span{font-size:20px;line-height:1.2}
    .tw-library button:hover{border-color:#9fb9e8;background:#f0f5ff}
    .tw-node{display:flex;align-items:center;gap:8px;width:100%;min-height:58px;padding:9px 5px;border:0;border-radius:5px;background:transparent;color:#475569;text-align:left}
    .tw-node>span:nth-child(2){min-width:0;flex:1}
    .tw-node.active{background:#edf3ff;color:#245bcc}
    .tw-node:hover{background:#f3f6fb}
    .tw-node b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:550}
    .tw-node small{display:block;margin-top:5px;font-size:12px;line-height:1.35;color:#64748b}
    .tw-node i{width:5px;height:5px;min-width:5px;margin-left:auto;border-radius:50%}
    .tw-dot{display:grid;place-items:center;width:27px;min-width:27px;height:27px;border-radius:6px;color:#fff;font-size:14px}
    .tw-node-list{max-height:355px;overflow:auto;margin:8px -5px}
    .tw-shell #nodeSearch{width:100%;padding:8px;font-size:12px}
    .tw-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:#64748b;margin-top:11px}
    .tw-legend span:before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#6b92b2;margin-right:5px}
    .tw-legend span:last-child:before{background:#c28550}
    .tw-canvas-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
    .tw-shell select{min-height:34px;padding:7px 9px;font-size:12px;color:#475569}
    .tw-view-group{display:flex;gap:2px;padding:3px;background:#f0f3f8;border:1px solid #e3e9f1;border-radius:6px}
    .tw-view-group button{min-height:26px;padding:4px 12px;background:transparent;border:0;border-radius:4px;color:#64748b;font-size:12px}
    .tw-view-group button.active{background:#fff;color:var(--tw-accent);box-shadow:0 1px 3px #1e293b12}
    .tw-shell #toggleInspector[aria-expanded=true]{color:var(--tw-accent);border-color:#a9bfe9;background:#edf3ff}
    .tw-shell .canvas-wrap{border-color:#dfe6f0;background:#f5f8fc;border-radius:6px}
    .tw-shell #twinCanvas{display:block;width:100%;height:auto;aspect-ratio:960/640;touch-action:none;cursor:grab}
    .tw-status-overlay{position:absolute;top:14px;left:16px;pointer-events:none}
    .tw-status-overlay .badge{background:#fffffff0;border:1px solid #e1e7ef;box-shadow:0 2px 6px #33415508}
    .tw-environment-overlay{position:absolute;top:14px;right:14px;display:flex;flex-direction:column;gap:5px;pointer-events:none;font-size:11px;color:#64748b}
    .tw-environment-overlay span{background:#fffffff0;border:1px solid #e1e7ef;border-radius:4px;padding:4px 7px}
    .tw-environment-overlay b{color:#334155;margin-left:7px;font-variant-numeric:tabular-nums}
    .tw-quick-controls{margin-top:12px;padding:10px 0;border-bottom:1px solid #edf1f6}
    .tw-quick-heading{display:flex;gap:10px;align-items:center;margin-bottom:8px;font-size:12px}.tw-quick-heading small{color:#64748b}
    .tw-retail{margin-top:16px;padding:18px}.tw-retail .section-title p{margin-top:6px}.tw-retail-layout{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:24px}.tw-retail-entry{display:flex;align-items:flex-end;gap:10px;margin:15px 0}.tw-retail-entry .field{margin:0;min-width:0;flex:1}.tw-retail-entry .field:nth-child(2){max-width:150px}.tw-retail-entry input,.tw-retail-payment input{width:100%}.tw-retail-totals{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:16px 0;font-size:12px;color:#64748b}.tw-retail-totals strong{font-size:18px;color:#245bcc}.tw-retail-payment{padding:16px;background:#f6f8fc;border:1px solid #e2e9f3;border-radius:6px}.tw-retail-payment .row{gap:6px}.tw-retail-payment .field[hidden]{display:none}.tw-retail-payment #retailPay{width:100%}.tw-retail-payment p{line-height:1.7;margin-top:12px}.tw-retail-receipt{padding:14px;border:1px solid #dce6f5;border-radius:6px;background:#fbfdff;font-size:12px;color:#475569;line-height:1.9}.tw-retail-receipt ul{margin:7px 0;padding-left:20px}
    @media(max-width:760px){.tw-retail-layout{grid-template-columns:1fr}.tw-retail-entry{flex-wrap:wrap}.tw-environment-overlay{top:8px;right:8px;font-size:10px;gap:3px}.tw-environment-overlay span{padding:2px 4px}}
    .tw-bottom-tools{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}
    .tw-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:1.6;color:#5d6c80}
    .tw-check input{width:14px;height:14px;accent-color:var(--tw-accent);box-shadow:none}
    .tw-shell .tw-small{min-height:30px;padding:5px 8px;font-size:12px}
    .tw-rotation{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:12px;margin-top:12px;border-top:1px solid #edf1f6}
    .tw-rotation>span:last-child{margin-left:auto}
    .tw-shell input[type=range]{padding:0;accent-color:var(--tw-accent)}
    .tw-shell .tw-inspector{max-height:900px;overflow:auto}
    .tw-shell .tw-inspector[hidden]{display:none}
    .tw-inspector-title{margin-bottom:16px}
    .tw-inspector-head{display:flex;align-items:center;gap:9px}
    .tw-inspector-head b{font-size:13px}
    .tw-inspector-head small{display:block;font-size:12px;color:#64748b;margin-top:5px}
    .tw-inspector-head .badge{margin-left:auto;white-space:nowrap}
    .tw-readout{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:16px 0;padding:14px 12px;border:1px solid #e2e9f3;border-radius:6px;background:#f6f8fc}
    .tw-readout strong{font-size:23px;font-weight:600;color:#245bcc;font-variant-numeric:tabular-nums}
    .tw-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .tw-fields input{width:100%;padding:8px 6px}
    .tw-shell .field{gap:7px;margin-bottom:13px;font-size:12px;color:#5d6c80}
    .tw-shell .field input,.tw-shell .field select{font-size:12px}
    .tw-inspector-section{border-top:1px solid #e5eaf1;padding-top:15px;margin-top:15px}
    .tw-inspector-section .section-title{margin-bottom:12px;gap:8px}
    .tw-inspector-section h3{margin:0;font-size:13px}
    .tw-environment{margin-top:14px;padding:13px 14px;background:#f8fafd;border:1px solid #e2e8f2;border-radius:6px}
    .tw-environment summary{cursor:pointer;font-size:13px;font-weight:600;color:#334155;line-height:1.7}
    .tw-environment summary span{font-size:12px;font-weight:400;color:#64748b;margin-left:8px}
    .tw-env-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px}
    .tw-help{margin-top:12px;font-size:12px;line-height:1.9;color:#64748b}
    .tw-help summary{cursor:pointer;color:#526176;padding:3px 0}
    .tw-secondary{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(320px,1fr);gap:16px;margin-top:16px}
    .tw-secondary>.card,.tw-telemetry{min-width:0;padding:18px}
    .tw-chart canvas{display:block;width:100%;height:225px}
    .tw-chart .section-title{gap:12px;margin-bottom:12px}
    .tw-chart .row{flex-wrap:wrap}
    .tw-event-list{max-height:254px;overflow:auto}
    .tw-event{display:flex;align-items:flex-start;gap:9px;padding:12px 0;border-bottom:1px solid #edf1f6}
    .tw-event-dot{width:6px;height:6px;border-radius:50%;background:#7595bc;flex-shrink:0;margin-top:6px}
    .tw-event-dot.alarm{background:#c28348}
    .tw-event-dot.recovery{background:#5e947e}
    .tw-event div{flex:1;min-width:0}
    .tw-event b{display:block;font-size:12px;font-weight:600;color:#475569}
    .tw-event span:not(.tw-event-dot){display:block;font-size:12px;color:#64748b;margin:4px 0;line-height:1.6;overflow-wrap:anywhere}
    .tw-event small{font-size:12px;color:#718096}
    .tw-numeric{font-variant-numeric:tabular-nums}
    .tw-telemetry{margin-top:16px}
    .tw-table-wrap{overflow:auto}
    .tw-shell th,.tw-shell td{font-size:12px;padding:13px 12px}
    .tw-shell tbody tr[data-telemetry]{cursor:pointer}
    .tw-shell tbody tr[data-telemetry]:hover{background:#f4f7fc}
    .tw-modal{position:fixed;inset:0;z-index:999;display:grid;place-items:center;padding:22px;background:#182c4a66}
    .tw-modal section{width:100%;max-width:430px;padding:25px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 20px 60px #172b4d33}
    .tw-modal h2{font-size:18px;color:#243247}
    .tw-modal p{margin:10px 0 24px;color:#64748b;font-size:13px;line-height:1.8}
    @media(max-width:1679px){
      .tw-metric{padding:4px 10px}
      .tw-shell .tw-layout.tw-inspector-open{grid-template-columns:184px minmax(0,1fr)}
      .tw-shell .tw-inspector{grid-column:2;max-height:none}
      .tw-inspector #inspector{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 20px;align-items:start}
      .tw-inspector .tw-readout{margin:0 0 8px}
      .tw-inspector .tw-inspector-section{margin:0}
    }
    @media(max-width:1279px){
      .tw-shell .page-head{flex-wrap:wrap;gap:12px}
      .tw-head-actions{flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap;width:100%}
      .tw-workbar{gap:8px}
      .tw-metrics{width:100%;padding-top:9px;border-top:1px solid #e8edf4}
      .tw-metric:first-child{padding-left:0}
      .tw-env-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .tw-secondary{grid-template-columns:1fr}
    }
    @media(max-width:1119px){
      .tw-shell .tw-layout,.tw-shell .tw-layout.tw-inspector-open{grid-template-columns:1fr}
      .tw-canvas-panel{grid-row:1}
      .tw-shell .tw-inspector{grid-column:1;grid-row:2}
      .tw-component-panel{grid-column:1}
      .tw-library{grid-template-columns:repeat(8,minmax(0,1fr))}
      .tw-node-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 8px;max-height:250px}
      .tw-shell .tw-component-panel{padding:16px}
    }
    @media(max-width:760px){
      .tw-shell #sceneName{font-size:21px;width:100%}
      .tw-shell .page-head{margin-bottom:15px}
      .tw-head-actions{gap:10px}
      .tw-shell .toolbar{gap:6px}
      .tw-workbar{padding:9px}
      .tw-presets{width:100%;gap:3px}
      .tw-preset{flex:1;justify-content:center;padding:7px}
      .tw-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .tw-metric,.tw-metric:first-child{padding:3px 7px;border:0}
      .tw-metric strong{font-size:14px}
      .tw-canvas-toolbar>div{width:100%;justify-content:space-between}
      .tw-shell .tw-canvas-panel{padding:10px}
      .tw-status-overlay{top:10px;left:10px}
      .tw-status-overlay .badge{padding:3px 5px}
      .tw-library{grid-template-columns:repeat(4,minmax(0,1fr))}
      .tw-node-list{grid-template-columns:repeat(2,minmax(0,1fr))}
      .tw-inspector #inspector{display:block}
      .tw-inspector .tw-readout{margin:16px 0}
      .tw-inspector .tw-inspector-section{margin-top:16px}
      .tw-environment summary span{display:block;margin-left:14px}
      .tw-rotation>span:last-child{width:100%;margin-left:0}
      .tw-secondary>.card,.tw-telemetry{padding:14px}
      .tw-telemetry>.section-title{align-items:flex-start;gap:12px;flex-wrap:wrap}
    }
  </style>`;}
  function mount() {
    retailFeedback='';
    if(inspectorOpen===null)inspectorOpen=!!window.matchMedia?.('(min-width: 1760px)')?.matches;
    host.innerHTML=scopedStyles()+`<div class="tw-shell">
      <div class="page-head">
        <div><div class="eyebrow">数字孪生实验室 / DIGITAL TWIN</div><input aria-label="场景名称" id="sceneName" maxlength="80" value="${esc(state.name)}"><p class="muted">配置场景与组件，运行本地仿真并观察设备联动。</p></div>
        <div class="tw-head-actions"><span class="badge amber">本地仿真模式 · 设备未连接</span><div class="toolbar"><button class="btn" id="restoreTwin">恢复保存</button><button class="btn" id="importTwin">导入</button><button class="btn" id="exportTwin">导出</button><button class="btn primary" id="saveTwin">保存场景</button></div><input type="file" accept=".json,application/json" id="sceneFile" hidden></div>
      </div>
      <div class="tw-workbar">
        <div class="tw-presets" role="group" aria-label="场景模板">${Object.entries(SCENES).map(([key,s])=>`<button class="tw-preset ${key===state.scene?'active':''}" data-preset="${key}" title="${s.subtitle}" aria-pressed="${key===state.scene}"><span aria-hidden="true">${s.icon}</span><b>${s.title}</b></button>`).join('')}</div>
        <div class="tw-metrics" aria-label="本地仿真统计"><div class="tw-metric"><span>启用组件</span><strong id="metricOnline">0 / 0</strong></div><div class="tw-metric"><span>告警</span><strong id="metricAlarm">0</strong></div><div class="tw-metric"><span>采样轮次</span><strong id="metricSamples">0</strong></div><div class="tw-metric"><span>仿真时间</span><strong id="metricElapsed">0m 0s</strong></div></div>
      </div>
      <div id="twinLayout" class="tw-layout ${inspectorOpen?'tw-inspector-open':''}">
        <section class="card tw-panel tw-component-panel">
          <div class="section-title tw-panel-title"><h2>组件库</h2><span class="muted">点击添加</span></div>
          <div class="tw-library">${Object.entries(TYPES).filter(([,t])=>!t.legacy).map(([key,t])=>`<button data-add="${key}" title="添加${key}"><span style="color:${t.color}" aria-hidden="true">${t.icon}</span>${key} ＋</button>`).join('')}</div>
          <div class="tw-section-label">场景组件 <span id="componentCount" style="float:right;font-weight:400">0 个</span></div>
          <input id="nodeSearch" aria-label="筛选组件" placeholder="搜索名称或类型" value="${esc(listQuery)}"><div id="nodeList" class="tw-node-list"></div><div class="tw-legend"><span>已启用</span><span>阈值告警</span></div>
        </section>
        <section class="card tw-panel tw-canvas-panel">
          <div class="tw-canvas-toolbar">
            <div class="toolbar"><select id="floorSelect" aria-label="当前楼层">${SCENES[state.scene].floorNames.map((f,i)=>`<option value="${i+1}" ${floor===i+1?'selected':''}>${f}</option>`).join('')}</select><div class="tw-view-group" role="group" aria-label="场景视图"><button data-view="2D" class="${view==='2D'?'active':''}">2D</button><button data-view="3D" class="${view==='3D'?'active':''}">3D</button></div></div>
            <div class="toolbar"><button class="btn" id="toggleInspector" aria-expanded="${inspectorOpen}" aria-controls="twinInspector">组件属性</button><button class="btn" id="resetReadings" title="保留空间配置，重新开始采样">↻ 重置读数</button><button class="btn primary" id="runTwin">▶ 运行仿真</button></div>
          </div>
          <div class="canvas-wrap"><canvas id="twinCanvas" width="960" height="640" tabindex="0" aria-label="交互场景画布：点击选中组件，拖动移动，方向键微调">请使用支持 Canvas 的浏览器查看仿真场景。也可通过组件列表和组件属性编辑设备。</canvas><div class="tw-status-overlay"><span class="badge gray" id="runLabel">● 已暂停 · 可编辑</span></div><div id="environmentOverlay" class="tw-environment-overlay" aria-live="off"></div></div>
          <div id="quickControls" class="tw-quick-controls"></div><div class="tw-bottom-tools"><div class="toolbar"><button class="btn tw-small" id="zoomOut" aria-label="缩小">−</button><span id="zoomLabel" class="muted">${Math.round(zoom*100)}%</span><button class="btn tw-small" id="zoomIn" aria-label="放大">＋</button><button class="btn tw-small" id="resetView">复位</button><label class="tw-check"><input type="checkbox" id="showLabels" ${showLabels?'checked':''}>标签</label><label class="tw-check"><input type="checkbox" id="snapGrid" ${snap?'checked':''}>网格吸附</label></div><span id="savedAt" class="muted"></span></div>
          <div class="tw-rotation"><label class="muted" for="angle">旋转视角</label><input id="angle" aria-label="旋转视角" type="range" min="0.15" max="1.35" step="0.02" value="${angle}" style="width:130px"><span class="muted">拖动设备 · 方向键微调</span></div>
          <details class="tw-environment"><summary>仿真环境与联动设置 <span>采样、环境扰动与告警响应</span></summary><div class="tw-env-grid"><label class="field">教学情境<select id="scenario"><option value="normal">日常运行</option><option value="heat">高温工况</option><option value="smoke">烟雾告警演练</option><option value="gas">可燃气体告警演练</option><option value="night">夜间节能</option></select></label><label class="field">采样周期<select id="sampleInterval"><option value="500">0.5 秒</option><option value="1000">1 秒</option><option value="2000">2 秒</option></select></label><label class="field">环境温度 °C<input id="envTemperature" type="number" min="-10" max="50" step="1" value="${state.environment.temperature}"></label><label class="field">环境湿度 %RH<input id="envHumidity" type="number" min="0" max="100" step="1" value="${state.environment.humidity}"></label><label class="field">可燃气体 %LEL<input id="envGas" type="number" min="0" max="100" step="1" value="${state.environment.gas}"></label><label class="field">供电电压 V<input id="envVoltage" type="number" min="180" max="250" step="1" value="${state.environment.voltage}"></label><label class="field">自然照度 lux<input id="envBrightness" type="number" min="0" max="1200" step="20" value="${state.environment.brightness}"></label><label class="field">场景人数<input id="envOccupancy" type="number" min="0" max="80" step="1" value="${state.environment.occupancy}"></label><label class="field">烟雾 mg/m³<input id="envSmoke" type="number" min="0" max="1" step="0.01" value="${state.environment.smoke}"></label></div><label class="tw-check"><input id="linkage" type="checkbox" ${state.settings.linkage?'checked':''}>启用联动：高温开风机；烟感开风机、报警器并解锁；可燃气体仅触发声光报警</label><p class="muted" style="margin:9px 0 0">仅为逻辑教学，不能作为真实燃气处置方案。联动保留至手动复位；指纹授权不采集生物特征。</p></details>
          <details class="tw-help"><summary>操作说明与数据说明</summary>这里的传感器读数由本地算法按环境条件生成，3D 使用轻量几何投影。采样历史最多保留每个组件 240 个点；场景保存包含布置、控制状态、阈值、历史和事件。切换工作台时会自动保存已修改场景，保存失败时保留当前编辑。运行时可调整风机与照明输出，观察温度与用电变化。关闭组件后暂停该组件采样。告警确认仅标记已读，不改变设备状态或阈值。</details>
        </section>
        <section id="twinInspector" class="card tw-panel tw-inspector" ${inspectorOpen?'':'hidden'} aria-label="组件属性">
          <div class="section-title tw-inspector-title"><h2>组件属性</h2><button class="btn tw-small" id="closeInspector" aria-label="收起组件属性">收起</button></div><div id="inspector"></div>
        </section>
      </div>
      <div id="retailPanel"></div><div class="tw-secondary">
        <section class="card tw-chart"><div class="section-title"><div><h2 style="margin-bottom:6px">实时采样曲线</h2><span class="muted" id="chartDevice"></span></div><select id="chartWindow" aria-label="图表时间范围"><option value="30">最近 30 秒</option><option value="60" selected>最近 60 秒</option><option value="180">最近 3 分钟</option></select></div><canvas id="historyChart" width="850" height="225" aria-label="当前组件的实际仿真采样历史"></canvas><div class="row" style="justify-content:space-between"><span class="muted" id="sampleIntervalLabel"></span><span class="muted">仅展示生成的采样点 · 点击设备切换</span></div></section>
        <section class="card"><div class="section-title"><h2>告警与操作记录</h2><div class="toolbar"><span class="badge amber" id="eventCount">0 条未确认</span><button class="btn tw-small" id="clearEvents">清空</button></div></div><div class="tw-event-list" id="eventList"></div></section>
      </div>
      <section class="card tw-telemetry"><div class="section-title"><div><h2 style="margin-bottom:6px">组件遥测台账</h2><span class="muted">点击任一行，定位组件并查看历史</span></div><button class="btn" id="exportTelemetry">导出采样 CSV</button></div><div class="tw-table-wrap"><table><thead><tr><th>组件名称</th><th>楼层</th><th>类型</th><th>当前读数</th><th>状态</th><th>历史采样</th><th>告警区间</th></tr></thead><tbody id="telemetry"></tbody></table></div></section>
    </div>`;
    canvas=host.querySelector('#twinCanvas');ctx=canvas.getContext('2d');
    const $=id=>host.querySelector('#'+id);
    const setInspectorOpen=value=>{
      inspectorOpen=value;
      $('twinInspector').hidden=!value;
      $('twinLayout').classList.toggle('tw-inspector-open',value);
      $('toggleInspector').ariaExpanded=String(value);
      (value?$('closeInspector'):$('toggleInspector')).focus();
    };
    $('toggleInspector').onclick=()=>setInspectorOpen(!inspectorOpen);
    $('closeInspector').onclick=()=>setInspectorOpen(false);
    $('sceneName').onchange=e=>{state.name=e.target.value.trim()||SCENES[state.scene].title+'实训场景';e.target.value=state.name;markDirty();};
    host.querySelectorAll('[data-preset]').forEach(button=>button.onclick=async()=>{
      const target=button.dataset.preset;if(target===state.scene)return;
      if(dirty&&!await confirmAction('切换场景模板','当前场景有未保存的更改。切换后将替换布置与采样记录；购物篮与收银记录保留。可先取消并保存。','切换模板'))return;
      setRunning(false);const retail=state.retail;state=scenePreset(target);state.retail=retail;floor=1;selected=state.nodes[0]?.id;listQuery='';dirty=true;revision++;mount();toast('已加载'+SCENES[target].title+'模板');
    });
    $('floorSelect').onchange=e=>{floor=Number(e.target.value);selected=currentNodes()[0]?.id;renderQuickControls();renderList();inspect();draw();drawChart();};
    host.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;host.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));draw();});
    $('runTwin').onclick=()=>setRunning(!running);
    $('resetReadings').onclick=async()=>{
      if(!await confirmAction('重置仿真读数','保留空间布置与阈值，清除全部采样和事件，重置累计时间。','重置'))return;
      setRunning(false);state.elapsed=0;state.sampleCount=0;state.events=[];
      state.nodes.forEach(n=>{n.value=n.name.includes('冷链')?5:['门禁','门磁','报警器'].includes(n.type)?(n.level>=50?1:0):['照明','窗帘'].includes(n.type)?n.level:n.type==='指纹'?(n.authorization?.result==='granted'?1:0):TYPES[n.type].value;n.history=[];n.alarm=evaluateAlarm(n);});markDirty();refreshLive();toast('采样已重置，空间配置已保留');
    };
    $('nodeSearch').oninput=e=>{listQuery=e.target.value;renderList();};
    host.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
      if(state.nodes.length>=80){toast('每个场景最多支持 80 个组件');return;}
      const type=b.dataset.add,count=state.nodes.filter(n=>n.type===type).length+1,n=createNode(uniqueId(),type,type+' '+String(count).padStart(2,'0'),410+(state.nodes.length%4)*28,330+(state.nodes.length%3)*20,floor);
      state.nodes.push(n);markDirty();selectNode(n.id);refreshLive();
    });
    const changeZoom=delta=>{zoom=clamp(Math.round((zoom+delta)*100)/100,.7,1.35);$('zoomLabel').textContent=Math.round(zoom*100)+'%';draw();};
    $('zoomIn').onclick=()=>changeZoom(.1);$('zoomOut').onclick=()=>changeZoom(-.1);$('resetView').onclick=()=>{zoom=1;angle=.58;$('angle').value=angle;$('zoomLabel').textContent='100%';draw();};
    $('angle').oninput=e=>{angle=Number(e.target.value);draw();};
    $('showLabels').onchange=e=>{showLabels=e.target.checked;draw();};$('snapGrid').onchange=e=>snap=e.target.checked;
    $('chartWindow').value=chartWindow;$('chartWindow').onchange=e=>{chartWindow=Number(e.target.value);drawChart();};
    $('exportTelemetry').onclick=exportCSV;
    $('clearEvents').onclick=async()=>{if(!state.events.length){toast('暂无记录需要清空');return;}if(await confirmAction('清空事件记录','清除所有告警和操作记录，当前设备告警状态不变。','清空')){state.events=[];markDirty();renderEvents();}};
    $('sampleInterval').value=state.settings.interval;$('sampleInterval').onchange=e=>{state.settings.interval=Number(e.target.value);markDirty();if(running)setRunning(true);refreshMetrics();};
    $('linkage').onchange=e=>{state.settings.linkage=e.target.checked;recordEvent(null,e.target.checked?'已启用阈值联动':'已关闭阈值联动');markDirty();renderEvents();};
    [['envTemperature','temperature',-10,50],['envHumidity','humidity',0,100],['envGas','gas',0,100],['envVoltage','voltage',180,250],['envBrightness','brightness',0,1200],['envOccupancy','occupancy',0,80],['envSmoke','smoke',0,1]].forEach(([id,key,min,max])=>{$(id).onchange=e=>{state.environment[key]=clamp(num(e.target.value,state.environment[key]),min,max);e.target.value=state.environment[key];markDirty();};});
    $('scenario').value=state.environment.scenario;$('scenario').onchange=e=>{
      const scenario=e.target.value;state.environment={...state.environment,scenario,...({normal:{temperature:25,humidity:52,gas:2,brightness:320,occupancy:8,smoke:.018},heat:{temperature:39,humidity:42,gas:2,brightness:580,occupancy:22,smoke:.018},smoke:{temperature:29,humidity:55,gas:2,brightness:260,occupancy:12,smoke:.35},gas:{temperature:25,humidity:52,gas:45,brightness:320,occupancy:8,smoke:.018},night:{temperature:21,humidity:58,gas:2,brightness:20,occupancy:1,smoke:.015}}[scenario])};
      $('envHumidity').value=state.environment.humidity;$('envGas').value=state.environment.gas;$('envVoltage').value=state.environment.voltage;$('envTemperature').value=state.environment.temperature;$('envBrightness').value=state.environment.brightness;$('envOccupancy').value=state.environment.occupancy;$('envSmoke').value=state.environment.smoke;recordEvent(null,'切换至“'+e.target.options[e.target.selectedIndex].text+'”');markDirty();renderEvents();
    };
    $('saveTwin').onclick=async()=>{
      const button=$('saveTwin'),token=loadEpoch,savedRevision=revision,sceneState=state,data=snapshot();data.saved=new Date().toISOString();button.disabled=true;button.textContent='保存中…';
      try{await api('twin','POST',data);if(token!==loadEpoch)return;lastSaved=clone(data);if(state===sceneState){state.saved=data.saved;if(revision===savedRevision)dirty=false;updateSavedLabel();}toast('已保存“'+data.name+'”及采样历史');}
      catch(error){toast(error.message||'保存失败，请重试');}
      finally{if(token===loadEpoch&&button.isConnected){button.disabled=false;button.textContent='保存场景';}}
    };
    $('restoreTwin').onclick=async()=>{
      if(!lastSaved){toast('还没有已保存场景，请先保存');return;}
      if(dirty&&!await confirmAction('恢复已保存场景','放弃当前未保存的编辑和采样，恢复到上次保存时的状态。','恢复'))return;
      setRunning(false);state=normalizeScene(lastSaved);floor=1;selected=state.nodes[0]?.id;dirty=false;revision++;mount();toast('已恢复上次保存的场景');
    };
    $('exportTwin').onclick=()=>{downloadJSON('digital-twin-scene.json',snapshot());toast('已导出场景及采样历史');};
    $('importTwin').onclick=()=>$('sceneFile').click();
    $('sceneFile').onchange=async e=>{
      const file=e.target.files?.[0],token=loadEpoch;e.target.value='';if(!file)return;
      try{
        if(file.size>5*1024*1024)throw new Error('文件不能超过 5 MB');
        const imported=normalizeScene(JSON.parse(await file.text()),true);if(token!==loadEpoch)return;
        if(dirty&&!await confirmAction('导入场景','导入将替换当前未保存的内容。确认载入“'+imported.name+'”？','导入'))return;
        setRunning(false);state=imported;floor=1;selected=state.nodes[0]?.id;dirty=true;revision++;mount();toast('已导入 '+state.nodes.length+' 个组件，请保存场景');
      }catch(error){toast('导入失败：'+error.message);}
    };
    const position=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};};
    canvas.onpointerdown=e=>{
      if(e.button!==0)return;const p=position(e),n=currentNodes().slice().reverse().find(n=>n._screen&&Math.hypot(n._screen.x-p.x,n._screen.y-p.y)<30);
      if(n){selected=n.id;drag={id:n.id,p,x:n.x,y:n.y,moved:false};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';canvas.focus();renderList();inspect();drawChart();draw();}
    };
    canvas.onpointermove=e=>{
      if(!drag)return;const n=state.nodes.find(n=>n.id===drag.id);if(!n)return;const p=position(e);let dx=(p.x-drag.p.x)/zoom,dy=(p.y-drag.p.y)/zoom;
      if(view==='3D'){const sx=dx/.92,sy=dy/(.48*.92);dx=sx*Math.cos(angle)+sy*Math.sin(angle);dy=-sx*Math.sin(angle)+sy*Math.cos(angle);}
      let x=drag.x+dx,y=drag.y+dy;if(snap){x=Math.round(x/10)*10;y=Math.round(y/10)*10;}
      n.x=clamp(x,95,785);n.y=clamp(y,110,520);drag.moved=drag.moved||Math.abs(dx)+Math.abs(dy)>2;draw();
    };
    const endDrag=()=>{if(drag?.moved)markDirty();drag=null;canvas.style.cursor='grab';inspect();};canvas.onpointerup=endDrag;canvas.onpointercancel=endDrag;canvas.onlostpointercapture=()=>{if(drag)endDrag();};
    canvas.onkeydown=e=>{const n=currentNode();if(!n)return;const step=e.shiftKey?10:1,offset={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];if(offset){e.preventDefault();n.x=clamp(n.x+offset[0],95,785);n.y=clamp(n.y+offset[1],110,520);markDirty();draw();inspect();}if(e.key==='Escape'){selected=null;drag=null;inspect();draw();renderList();}};
    renderRetail();inspect();refreshLive();updateSavedLabel();
  }
  async function stop() {
    if(stopPending)return stopPending;
    // Cancel stale reads/imports immediately, but retain the editor until durable save succeeds.
    loadEpoch++;
    const work=(async()=>{
      clearInterval(timer);timer=null;running=false;
      if(pendingDialog)pendingDialog();
      if(!mounted){drag=null;ctx=null;canvas=null;return;}
      if(drag?.moved)markDirty();drag=null;
      const leavingHost=host;leavingHost.inert=true;setRunning(false);
      try{
        while(dirty){
          const savedRevision=revision,sceneState=state,data=snapshot();data.saved=new Date().toISOString();
          await api('twin','POST',data);
          lastSaved=clone(data);
          if(state===sceneState){state.saved=data.saved;if(revision===savedRevision)dirty=false;updateSavedLabel();}
        }
        mounted=false;ctx=null;canvas=null;
      }catch(error){
        const button=leavingHost.querySelector('#saveTwin');if(button){button.disabled=false;button.textContent='保存场景';}
        throw new Error('数字孪生尚未保存，请重试保存或先导出备份：'+(error.message||'保存失败'));
      }finally{leavingHost.inert=false;}
    })();
    stopPending=work;
    try{return await work;}finally{if(stopPending===work)stopPending=null;}
  }
  return {
    stop,
    async render(container) {
      await stop();host=container;host.inert=false;const epoch=++loadEpoch;let raw;
      try{raw=await api('twin');}catch(error){
        if(epoch!==loadEpoch||!container.isConnected)return;
        container.innerHTML='<div class="card"><h2>暂时无法读取场景</h2><p class="muted">'+esc(error.message||'请检查本地服务')+'。为避免覆盖已有内容，未载入替代场景。</p><button class="btn primary" data-retry-twin>重新读取</button></div>';
        container.querySelector('[data-retry-twin]').onclick=()=>window.Twin.render(container);return;
      }
      if(epoch!==loadEpoch||!container.isConnected)return;
      try{state=normalizeScene(raw);}catch(error){state=scenePreset();toast('保存数据无法载入：'+error.message);}
      lastSaved=raw?clone(state):null;dirty=false;revision=0;floor=1;view='3D';angle=.58;zoom=1;listQuery='';selected=state.nodes[0]?.id;mount();mounted=true;
    },
    scenePreset, normalizeScene, validateState:raw=>normalizeScene(raw,true), nextReading, evaluateAlarm, integrateEnergy, powerKW, controlNode, fingerprintAuthorization, formatValue, retail:{catalog:()=>clone(CATALOG),initialState:initialRetail,normalize:normalizeRetail,totals:retailTotals,add:retailAdd,remove:retailRemove,checkout:retailCheckout},
    types:()=>clone(TYPES)
  };
})();
