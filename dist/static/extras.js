/* Logistics teaching labs. Drone, wiring and RFID are simulations only.
   Neural training performs real numerical optimization locally in the browser. */
(function (root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const clone = v => JSON.parse(JSON.stringify(v));
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const number = v => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(v).trim()) ? Number(v) : NaN;
  const stamp = () => new Date().toISOString();
  const money = n => Number(n).toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2});
  const errorText = errors => errors.slice(0,12).join('；') + (errors.length > 12 ? `；另有 ${errors.length - 12} 个错误` : '');
  function parseCSV(text) {
    if (typeof text !== 'string' || text.length > 1000000) throw new Error('CSV 上限为 1 MB');
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], cell = '', quoted = false, closed = false;
    const pushCell = () => { row.push(cell); cell = ''; closed = false; };
    const pushRow = () => { pushCell(); if (row.some(x => x.trim())) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) { if (ch === '"') { if (text[i+1] === '"') {cell += '"'; i++;} else {quoted=false;closed=true;} } else cell += ch; }
      else if (ch === '"') { if (cell || closed) throw new Error('CSV 引号格式错误'); quoted = true; }
      else if (ch === ',') pushCell();
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i+1] === '\n') i++; pushRow(); }
      else if (closed) { if (!/[ \t]/.test(ch)) throw new Error('CSV 引号结束后只能接分隔符'); }
      else cell += ch;
    }
    if (quoted) throw new Error('CSV 包含未闭合引号');
    if (cell || row.length || closed) pushRow();
    if (!rows.length) throw new Error('CSV 为空');
    if (rows.length > 3001) throw new Error('最多导入 3,000 行记录');
    return rows;
  }
  function safeCSVCell(value) {
    let s = String(value ?? '');
    // Neutralize spreadsheet formula interpretation, including leading whitespace/control chars.
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const toCSV = rows => '\uFEFF' + rows.map(r => r.map(safeCSVCell).join(',')).join('\r\n');
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], {type:type || 'application/json;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  const SHOP_HEADERS = ['order_id','date','category','product','quantity','unit_price'];
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10) === s; }
  function validateShopping(input) {
    const rows = typeof input === 'string' ? parseCSV(input) : input;
    const headers = rows[0].map(x=>String(x).trim());
    if (new Set(headers).size !== headers.length || SHOP_HEADERS.some(x=>!headers.includes(x))) throw new Error('表头必须包含 order_id,date,category,product,quantity,unit_price，且不能重名');
    if (rows.length < 2) throw new Error('至少需要一行购物记录');
    const errors = [], records = [];
    rows.slice(1).forEach((row, i) => {
      const record = Object.create(null);
      if(row.length !== headers.length) { errors.push(`第 ${i+2} 行列数不符`); return; }
      SHOP_HEADERS.forEach(k=>record[k]=String(row[headers.indexOf(k)]).trim());
      const q=number(record.quantity), p=number(record.unit_price);
      if (!record.order_id || !record.category || !record.product || ['order_id','category','product'].some(k=>record[k].length > 100)) errors.push(`第 ${i+2} 行订单、品类和商品必填且不超过 100 字`);
      if (!validDate(record.date)) errors.push(`第 ${i+2} 行日期必须为有效 YYYY-MM-DD`);
      if (!Number.isInteger(q) || q < 1 || q > 100000 || !finite(p) || p < 0 || p > 1000000 || q*p > 1e9) errors.push(`第 ${i+2} 行数量/单价超出范围，数量须为正整数，金额须不超过 10 亿元`);
      records.push({...record,quantity:q,unit_price:p});
    });
    if(errors.length) throw new Error(errorText(errors));
    return records;
  }
  function aggregateShopping(records, filters={}) {
    const filtered = records.filter(r=>(!filters.start || r.date >= filters.start) && (!filters.end || r.date <= filters.end) && (!filters.category || r.category === filters.category));
    const categories = new Map(), days = new Map(); let units=0, revenue=0;
    filtered.forEach(r=>{const value = Math.round(r.quantity*r.unit_price*100)/100; revenue+=value; units+=r.quantity; categories.set(r.category,(categories.get(r.category)||0)+value); days.set(r.date,(days.get(r.date)||0)+value);});
    const orders=new Set(filtered.map(r=>r.order_id)).size;
    return {records:filtered,orders,units,revenue:Math.round(revenue*100)/100,average:orders ? revenue/orders : 0,categories:[...categories].sort((a,b)=>b[1]-a[1]),days:[...days].sort((a,b)=>a[0].localeCompare(b[0]))};
  }
  const SAMPLE_SHOP = `order_id,date,category,product,quantity,unit_price\nL20261001,2026-10-01,冷链食品,低温鲜奶,4,12.5\nL20261001,2026-10-01,日用百货,纸巾,2,18\nL20261002,2026-10-02,电子配件,数据线,3,29.9\nL20261003,2026-10-02,冷链食品,酸奶,6,8.5\nL20261004,2026-10-03,日用百货,收纳盒,2,39\nL20261005,2026-10-04,电子配件,充电器,1,99\nL20261006,2026-10-04,冷链食品,低温鲜奶,5,12.5\nL20261007,2026-10-05,日用百货,纸巾,4,18\nL20261008,2026-10-06,电子配件,数据线,2,29.9\nL20261009,2026-10-07,冷链食品,酸奶,8,8.5`;

  function dronePlan(plan) {
    const errors=[]; const points=Array.isArray(plan.points)?plan.points:[];
    if(points.length < 1 || points.length > 12) errors.push('航点须为 1–12 个');
    if(!finite(plan.load) || plan.load < 0 || plan.load > 2) errors.push('载重须在 0–2 kg');
    if(!finite(plan.battery) || plan.battery < 20 || plan.battery > 100) errors.push('起始电量须在 20–100%');
    let distance=0, previous={x:0,y:0};
    points.forEach((p,i)=>{
      if(!finite(p.x) || !finite(p.y) || Math.abs(p.x)>500 || Math.abs(p.y)>500) errors.push(`航点 ${i+1} 超出教学围栏 ±500 m`);
      if(!finite(p.z) || p.z<5 || p.z>60) errors.push(`航点 ${i+1} 高度须在 5–60 m`);
      distance+=Math.hypot(p.x-previous.x,p.y-previous.y);previous=p;
    });
    const returnDistance=points.length ? Math.hypot(previous.x,previous.y) : 0;
    const costPerMeter=.025 + (finite(plan.load)?plan.load:0)*.006;
    const energy=2+(distance+returnDistance)*costPerMeter+points.length*.5;
    if(distance+returnDistance>3000) errors.push('含返航的路线超过教学上限 3,000 m');
    if(plan.battery-energy < 20) errors.push('预计完成并返航后不足 20% 电量储备，请缩短路线或提高起始电量');
    return {ok:!errors.length,errors,distance,returnDistance,totalDistance:distance+returnDistance,energy,remaining:plan.battery-energy,costPerMeter};
  }
  function startDrone(plan) {
    const result=dronePlan(plan);if(!result.ok) throw new Error(errorText(result.errors));
    return {status:'flying',index:0,x:0,y:0,z:5,battery:plan.battery-2,distance:0,plan:clone(plan),log:[{event:'开始仿真：完成模拟起飞检查',time:stamp()}]};
  }
  function stepDrone(run) {
    if(run.status!=='flying') throw new Error('请先开始一轮仿真');
    const next=clone(run), p=next.plan.points[next.index] || {x:0,y:0,z:0};
    const distance=Math.hypot(p.x-next.x,p.y-next.y), energy=distance*dronePlan(next.plan).costPerMeter+(next.index<next.plan.points.length?.5:0);
    next.battery=Math.max(0,next.battery-energy);next.distance+=distance;next.x=p.x;next.y=p.y;next.z=p.z;next.index++;
    const returned=next.index>next.plan.points.length;
    next.status=returned?'completed':'flying';next.log.push({event:returned?'已模拟返航并降落':`到达航点 ${next.index} · ${distance.toFixed(1)} m`,time:stamp()});
    return next;
  }
  function landDrone(run) {
    if(run.status!=='flying') throw new Error('当前没有运行中的仿真');
    const next=clone(run);next.status='landed';next.z=0;next.log.push({event:'教学应急操作：在当前模拟位置降落，未自动返航',time:stamp()});return next;
  }
  function parseWaypoints(text) {
    const rows=String(text).trim().split(/\r?\n/).filter(x=>x.trim());
    return rows.map((r,i)=>{const a=r.split(',').map(number);if(a.length!==3 || !a.every(finite)) throw new Error(`航点第 ${i+1} 行须为 x,y,高度 三个数值`);return {x:a[0],y:a[1],z:a[2]};});
  }

  function validateTopology(config) {
    const errors=[], gateway=config.gateway || {}, devices=Array.isArray(config.devices)?config.devices:[];
    if(!devices.length) errors.push('请至少配置一个设备');
    if(devices.length>20) errors.push('最多配置 20 个设备');
    if(!gateway.enabled) errors.push('网关未启用');
    if(!/^(mqtt|mqtts):\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(gateway.broker||'')) errors.push('教学 Broker 地址格式为 mqtt://主机:端口 或 mqtts://主机:端口，不包含账号密码');
    else {const port=String(gateway.broker).match(/:(\d+)$/);if(port && (+port[1]<1 || +port[1]>65535))errors.push('Broker 端口须在 1–65535');}
    if(![9600,19200,38400,115200].includes(+gateway.baud)) errors.push('网关波特率无效');
    if(!['none','even','odd'].includes(gateway.parity)) errors.push('网关校验位无效');
    const ids=new Set(), addresses=new Set(), topics=new Set();
    devices.forEach((d,i)=>{
      const name=d.id || `设备 ${i+1}`;
      if(!/^[A-Za-z][A-Za-z0-9_-]{1,29}$/.test(d.id||''))errors.push(`${name}：设备 ID 须为 2–30 位英文、数字、下划线或连字符，以字母开头`);
      if(ids.has(d.id)) errors.push(`${name}：设备 ID 重复`);ids.add(d.id);
      if(!['rfid','temperature','scale'].includes(d.type)) errors.push(`${name}：设备类型无效`);
      if(d.gateway!=='GW-01') errors.push(`${name}：未连接到 GW-01`);
      if(d.protocol==='modbus') {
        if(d.transport!=='RS485')errors.push(`${name}：Modbus RTU 必须使用 RS485`);
        if(!Number.isInteger(+d.address) || +d.address<1 || +d.address>247)errors.push(`${name}：从站地址须为 1–247 整数`);
        if(addresses.has(+d.address))errors.push(`${name}：RS485 总线从站地址冲突`);addresses.add(+d.address);
        if(+d.baud!==+gateway.baud || d.parity!==gateway.parity)errors.push(`${name}：波特率或校验位与网关不一致`);
      } else if(d.protocol==='mqtt') {
        if(d.transport!=='Ethernet')errors.push(`${name}：本实验 MQTT 设备须使用 Ethernet`);
        if(!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(d.topic||'') || d.topic.length>100)errors.push(`${name}：发布主题须为至少两层，不含空格或通配符`);
        if(topics.has(d.topic))errors.push(`${name}：遥测主题重复，无法区分设备`);topics.add(d.topic);
      } else errors.push(`${name}：协议无效`);
    });
    return {ok:!errors.length,errors,connections:devices.filter(d=>d.gateway==='GW-01').length};
  }
  const normalizeEPC = value => String(value||'').replace(/\s/g,'').toUpperCase();
  function scanRFID(manifest, raw, reader, events) {
    const epc=normalizeEPC(raw);
    if(!/^[A-F0-9]{8,24}$/.test(epc)) throw new Error('EPC 须为 8–24 位十六进制字符');
    const item=manifest.find(x=>x.epc===epc), duplicate=(events||[]).some(x=>x.epc===epc&&x.result==='received');
    return {epc,reader,time:stamp(),result:!item?'unknown':duplicate?'duplicate':'received',product:item?.product||'未在预到货清单中',quantity:item?.quantity||0,bin:item?.bin||'待核验'};
  }
  const DEFAULT_LABS = {gateway:{enabled:true,broker:'mqtt://classroom-broker.local:1883',baud:9600,parity:'none'},devices:[{id:'RFID-01',type:'rfid',protocol:'modbus',transport:'RS485',gateway:'GW-01',address:1,baud:9600,parity:'none',topic:'warehouse/rfid/01'},{id:'TEMP-01',type:'temperature',protocol:'mqtt',transport:'Ethernet',gateway:'GW-01',address:2,baud:9600,parity:'none',topic:'warehouse/coldroom/temperature'}],manifest:[{epc:'E200001100000001',product:'冷链周转箱 A',quantity:12,bin:'C-01'},{epc:'E200001100000002',product:'电子配件箱 B',quantity:24,bin:'A-03'},{epc:'E200001100000003',product:'百货补货箱 C',quantity:8,bin:'B-02'}],events:[],source:'教学示例清单'};

  function rng(seed) { let a=(seed>>>0)||1;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}; }
  function shuffle(values, random) {const a=values.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function parseNeuralCSV(text) {
    const rows=parseCSV(text), header=rows[0].map(x=>x.trim());
    if(header.length<3 || header.length>9 || header[header.length-1]!=='label') throw new Error('需要 2–8 个数值特征列，最后一列名为 label');
    if(new Set(header).size!==header.length || header.some(x=>!x || x.length>40)) throw new Error('特征名须唯一、非空且不超过 40 字');
    if(rows.length<13 || rows.length>2001) throw new Error('训练数据需要 12–2,000 行');
    const samples=[], counts=new Map();
    rows.slice(1).forEach((r,i)=>{
      const x=r.slice(0,-1).map(number),label=String(r[r.length-1]||'').trim();
      if(r.length!==header.length || !x.every(v=>finite(v)&&Math.abs(v)<=1e9) || !label || label.length>40) throw new Error(`第 ${i+2} 行列数、数值或类别无效（数值绝对值不超过 10⁹）`);
      samples.push({x,label});counts.set(label,(counts.get(label)||0)+1);
    });
    if(counts.size<2 || counts.size>8) throw new Error('类别数量须为 2–8 类');
    if([...counts.values()].some(n=>n<3)) throw new Error('每类至少 3 行，以支持分层训练/测试划分');
    return {features:header.slice(0,-1),labels:[...counts.keys()].sort(),samples};
  }
  function syntheticCSV(seed=42) {
    const random=rng(seed), rows=[['mass_kg','distance_km','temp_c','label']];
    [['常温配送',[2,12,24],[1.2,8,8]],['冷链配送',[3,18,3],[1.5,10,4]],['重货配送',[18,28,22],[7,14,9]]].forEach(([label,center,spread])=>{
      for(let i=0;i<40;i++)rows.push(center.map((v,j)=>(v+(random()-.5)*spread[j]).toFixed(3)).concat(label));
    });
    return rows.map(r=>r.join(',')).join('\n');
  }
  function splitData(data, seed=42, fraction=.2) {
    if(fraction<=0 || fraction>=1)throw new Error('测试比例必须在 0 与 1 之间');
    const random=rng(seed), train=[],test=[];
    data.labels.forEach(label=>{const group=shuffle(data.samples.filter(s=>s.label===label),random);const n=Math.max(1,Math.min(group.length-1,Math.round(group.length*fraction)));test.push(...group.slice(0,n));train.push(...group.slice(n));});
    const dims=data.features.length;
    const mean=Array.from({length:dims},(_,j)=>train.reduce((a,s)=>a+s.x[j],0)/train.length);
    const scale=mean.map((m,j)=>Math.sqrt(train.reduce((a,s)=>a+(s.x[j]-m)**2,0)/train.length)||1);
    const encode=s=>({x:s.x.map((v,j)=>(v-mean[j])/scale[j]),y:data.labels.indexOf(s.label)});
    return {train:shuffle(train,random).map(encode),test:test.map(encode),mean,scale};
  }
  function createNetwork(inputs, hidden, classes, seed=42) {
    if(!Number.isInteger(inputs)||inputs<1||!Number.isInteger(hidden)||hidden<1||!Number.isInteger(classes)||classes<2)throw new Error('网络尺寸无效');
    const random=rng(seed), weights=(rows,cols)=>Array.from({length:rows},()=>Array.from({length:cols},()=>(random()*2-1)*Math.sqrt(6/(rows+cols))));
    return {w1:weights(hidden,inputs),b1:Array(hidden).fill(0),w2:weights(classes,hidden),b2:Array(classes).fill(0)};
  }
  function forward(net, x) {
    const h=net.w1.map((w,i)=>Math.tanh(w.reduce((s,v,j)=>s+v*x[j],net.b1[i])));
    const logits=net.w2.map((w,i)=>w.reduce((s,v,j)=>s+v*h[j],net.b2[i])), max=Math.max(...logits), exps=logits.map(z=>Math.exp(z-max)), sum=exps.reduce((a,b)=>a+b,0);
    return {h,p:exps.map(z=>z/sum)};
  }
  function metrics(net, samples, classes) {
    let loss=0,correct=0;const confusion=Array.from({length:classes},()=>Array(classes).fill(0));
    samples.forEach(s=>{const p=forward(net,s.x).p, pred=p.indexOf(Math.max(...p));loss-=Math.log(Math.max(1e-15,p[s.y]));correct+=pred===s.y?1:0;confusion[s.y][pred]++;});
    return {loss:loss/samples.length,accuracy:correct/samples.length,confusion};
  }
  function trainEpoch(net,samples,rate) {
    if(!finite(rate)||rate<=0||rate>1||!samples.length)throw new Error('学习率或样本数无效');
    const g1=net.w1.map(r=>r.map(()=>0)),gb1=net.b1.map(()=>0),g2=net.w2.map(r=>r.map(()=>0)),gb2=net.b2.map(()=>0);
    for(const s of samples){
      const {h,p}=forward(net,s.x),delta=p.map((v,i)=>v-(i===s.y?1:0));
      const dh=h.map((v,j)=>net.w2.reduce((a,w,k)=>a+w[j]*delta[k],0)*(1-v*v));
      for(let k=0;k<delta.length;k++){gb2[k]+=delta[k];for(let j=0;j<h.length;j++)g2[k][j]+=delta[k]*h[j];}
      for(let j=0;j<h.length;j++){gb1[j]+=dh[j];for(let i=0;i<s.x.length;i++)g1[j][i]+=dh[j]*s.x[i];}
    }
    const update=(w,g)=>w.forEach((r,j)=>r.forEach((v,i)=>w[j][i]=v-rate*g[j][i]/samples.length));
    update(net.w1,g1);update(net.w2,g2);net.b1=net.b1.map((v,i)=>v-rate*gb1[i]/samples.length);net.b2=net.b2.map((v,i)=>v-rate*gb2[i]/samples.length);
    return net;
  }
  function predict(model,x) {
    if(x.length!==model.features.length || !x.every(finite))throw new Error('预测特征必须全部为有效数字');
    const p=forward(model.network,x.map((v,i)=>(v-model.mean[i])/model.scale[i])).p;
    return model.labels.map((label,i)=>({label,probability:p[i]})).sort((a,b)=>b.probability-a.probability);
  }

  const Helpers={parseCSV,safeCSVCell,toCSV,validDate,validateShopping,aggregateShopping,dronePlan,startDrone,stepDrone,landDrone,parseWaypoints,validateTopology,normalizeEPC,scanRFID,rng,syntheticCSV,parseNeuralCSV,splitData,createNetwork,forward,metrics,trainEpoch,predict};
  if(typeof module!=='undefined' && module.exports)module.exports=Helpers;
  if(!root || !root.document) return;

  let current=null, generation=0;
  const api=(...a)=>root.api(...a), toast=s=>root.toast(s);
  const head=(eyebrow,title,description,badge)=>`<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="muted">${description}</p></div><span class="badge blue">${badge}</span></div>`;
  const stats=items=>`<div class="grid stats">${items.map(([label,value,unit,note])=>`<div class="card"><div class="stat-top">${label}</div><div class="stat-value">${value}<small>${unit||''}</small></div><div class="stat-foot">${note||''}</div></div>`).join('')}</div>`;
  const field=(label,html)=>`<label class="field">${label}${html}</label>`;
  const input=(id,value,attrs='')=>`<input id="${id}" value="${esc(value)}" ${attrs}>`;
  const select=(id,values,selected)=>`<select id="${id}">${values.map(v=>`<option value="${esc(Array.isArray(v)?v[0]:v)}" ${(Array.isArray(v)?v[0]:v)==selected?'selected':''}>${esc(Array.isArray(v)?v[1]:v)}</option>`).join('')}</select>`;
  const time=s=>esc(new Date(s).toLocaleString('zh-CN',{hour12:false}));
  function action(c,id,fn){const el=c.querySelector('#'+id);if(el)el.onclick=async()=>{if(el.disabled)return;el.disabled=true;try{await fn();}catch(e){toast(e.message||String(e));}finally{if(el.isConnected)el.disabled=false;}};}
  function save(ctx) {const data=clone(ctx.state);const p=api('extras_'+ctx.page,'POST',data);ctx.pending=p;return p;}
  function bars(items, format=money) {const max=Math.max(1,...items.map(x=>x[1]));return items.length?items.map(([label,value])=>`<div style="display:grid;grid-template-columns:minmax(70px,120px) 1fr 95px;gap:12px;align-items:center;margin:16px 0"><span style="font-size:12px;overflow-wrap:anywhere">${esc(label)}</span><div style="height:16px;background:#f0f4f8;border-radius:3px"><div style="height:16px;width:${Math.max(.5,value/max*100)}%;background:#286c98;border-radius:3px"></div></div><span style="text-align:right;font-size:12px">${format(value)}</span></div>`).join(''):'<p class="empty">当前筛选无记录</p>';}
  function lineChart(series, label, colors=['#256e96','#cc883c']) {
    if(!series.length||!series[0].length)return '<p class="empty">完成操作后显示真实计算结果</p>';
    const w=600,h=200,pad=28,all=series.flat(),max=Math.max(.001,...all),length=Math.max(...series.map(s=>s.length));
    const coords=a=>a.map((v,i)=>`${pad+i*(w-2*pad)/Math.max(1,length-1)},${h-pad-v/max*(h-2*pad)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" style="width:100%;max-height:240px"><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="#dbe3e9"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" stroke="#dbe3e9"/><text x="${pad}" y="15" fill="#81909d" font-size="10">${max.toFixed(2)}</text><text x="8" y="${h-pad+4}" fill="#81909d" font-size="10">0</text>${series.map((s,j)=>`<polyline points="${coords(s)}" fill="none" stroke="${colors[j%colors.length]}" stroke-width="2.5"/>${s.length===1?`<circle cx="${pad}" cy="${h-pad-s[0]/max*(h-2*pad)}" r="4" fill="${colors[j%colors.length]}"/>`:''}`).join('')}</svg>`;
  }
  function readNumber(c,id){return number(c.querySelector('#'+id).value);}
  function readValue(c,id){return c.querySelector('#'+id).value.trim();}
  const chooseCSV=async(file)=>{if(!file)throw new Error('请选择 CSV 文件');if(file.size>1000000)throw new Error('CSV 文件须小于 1 MB');return file.text();};

  async function renderDrone(ctx) {
    const c=ctx.c,s=ctx.state;
    const plan=s.plan||{load:1,battery:100,points:[{x:80,y:40,z:20},{x:150,y:100,z:25},{x:40,y:160,z:20}]};s.plan=plan;
    const run=s.run, report=dronePlan(plan), flying=run?.status==='flying';
    const points=[{x:0,y:0},...plan.points,{x:0,y:0}], map=p=>`${300+p.x*.47},${245-p.y*.4}`;
    c.innerHTML=head('DRONE ROUTE LAB / 配送路径教学','无人机配送仿真','设置教学航点，检查载重与电量储备，逐段观察配送路线。','仅软件仿真')+
      `<div class="notice">本页不连接或控制真实无人机。能耗为简化教学模型，不包含天气、动力学或实际适航判断，不能用作真实飞行规划。围栏：x/y ±500 m；高度：5–60 m；载重：≤2 kg。</div>`+
      stats([['任务状态',({flying:'运行中',completed:'已返航',landed:'已降落'})[run?.status]||'待规划','','每次推进一个航段'],['当前电量',run?run.battery.toFixed(1):plan.battery,'%','规划最低保留 20%'],['已飞距离',run?run.distance.toFixed(0):0,'m','模拟水平路径距离'],['规划总里程',report.totalDistance.toFixed(0),'m','包含返回起点']])+
      `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr))"><div class="card"><div class="section-title"><h2>航线与载荷</h2><span class="badge gray">起点 (0, 0)</span></div><fieldset ${flying?'disabled':''} style="border:0;padding:0;margin:0">${field('配送载重（kg）',input('drone-load',plan.load,'type="number" min="0" max="2" step="0.1"'))}${field('起始电量（%）',input('drone-battery',plan.battery,'type="number" min="20" max="100"'))}${field('航点：每行 x,y,高度（m）',`<textarea id="drone-points" rows="5" spellcheck="false">${esc(plan.points.map(p=>[p.x,p.y,p.z].join(',')).join('\n'))}</textarea>`)}<div class="toolbar"><button class="btn" id="drone-validate">校验并保存规划</button><button class="btn primary" id="drone-start">开始新一轮仿真</button></div></fieldset><div style="margin-top:20px" id="drone-check"><span class="badge ${report.ok?'':'amber'}">${report.ok?'规划符合教学约束':'规划待修正'}</span><p class="muted">${report.ok?`预计消耗 ${report.energy.toFixed(1)}%，返航后剩余 ${report.remaining.toFixed(1)}%。模型：起飞 2% + 每航点 0.5% + 距离 × (0.025 + 载重 × 0.006)%。`:esc(errorText(report.errors))}</p></div></div><div class="card"><div class="section-title"><h2>配送路线</h2><span class="muted">平面示意 · 单位 m</span></div><svg viewBox="0 0 600 490" style="width:100%;max-height:360px;background:#f6f9fb;border-radius:6px" role="img" aria-label="无人机模拟配送路线"><defs><pattern id="drone-grid" width="47" height="40" patternUnits="userSpaceOnUse"><path d="M 47 0 L 0 0 0 40" fill="none" stroke="#e4ebf0" stroke-width="1"/></pattern></defs><rect x="65" y="45" width="470" height="400" fill="url(#drone-grid)" stroke="#9eacb8" stroke-dasharray="5 5"/><line x1="65" y1="245" x2="535" y2="245" stroke="#c5d2dc"/><line x1="300" y1="45" x2="300" y2="445" stroke="#c5d2dc"/><polyline points="${points.map(map).join(' ')}" fill="none" stroke="#287498" stroke-width="2" stroke-dasharray="5 4"/>${plan.points.map((p,i)=>`<circle cx="${300+p.x*.47}" cy="${245-p.y*.4}" r="7" fill="#287498"/><text x="${310+p.x*.47}" y="${240-p.y*.4}" font-size="12" fill="#31536b">P${i+1}</text>`).join('')}<rect x="292" y="237" width="16" height="16" rx="3" fill="#bd853a"/><text x="315" y="265" fill="#8b6e43" font-size="12">起点 / 仓库</text>${run?`<circle cx="${300+run.x*.47}" cy="${245-run.y*.4}" r="12" fill="#195a63" stroke="#fff" stroke-width="4"/>`:''}<text x="70" y="470" fill="#72889a" font-size="11">教学围栏：±500 m；不代表真实地图</text></svg><div class="toolbar" style="margin-top:18px"><button class="btn primary" id="drone-step" ${!flying?'disabled':''}>${run?.index>=plan.points.length?'推进返航与降落':'推进下一航点'}</button><button class="btn danger" id="drone-land" ${!flying?'disabled':''}>模拟立即降落</button><button class="btn" id="drone-export">导出实验记录</button></div><p class="muted">${run?`当前位置 (${run.x}, ${run.y}) m，高度 ${run.z} m。`:'开始仿真后显示位置。'} 每一步均由你手动推进。</p></div></div><div class="card" style="margin-top:18px"><h2>本轮飞行日志</h2><table><thead><tr><th>时间</th><th>教学事件</th></tr></thead><tbody>${run?.log.length?run.log.slice().reverse().map(l=>`<tr><td>${time(l.time)}</td><td>${esc(l.event)}</td></tr>`).join(''):'<tr><td colspan="2" class="muted">尚未开始仿真</td></tr>'}</tbody></table></div>`;
    const collect=()=>({load:readNumber(c,'drone-load'),battery:readNumber(c,'drone-battery'),points:parseWaypoints(readValue(c,'drone-points'))});
    action(c,'drone-validate',async()=>{const p=collect(),r=dronePlan(p);if(!r.ok)throw new Error(errorText(r.errors));s.plan=p;s.run=null;await save(ctx);await renderDrone(ctx);toast('规划校验通过并已保存');});
    action(c,'drone-start',async()=>{const p=collect(),r=startDrone(p);s.plan=p;s.run=r;await save(ctx);await renderDrone(ctx);});
    action(c,'drone-step',async()=>{s.run=stepDrone(s.run);await save(ctx);await renderDrone(ctx);});
    action(c,'drone-land',async()=>{s.run=landDrone(s.run);await save(ctx);await renderDrone(ctx);toast('已在当前模拟位置降落');});
    action(c,'drone-export',()=>download('无人机配送仿真实验.json',JSON.stringify({mode:'software-simulation-only',...s},null,2)));
  }

  async function renderAnalytics(ctx) {
    const c=ctx.c,s=ctx.state;s.records=Array.isArray(s.records)?s.records:[];ctx.filters=ctx.filters||{};
    const a=aggregateShopping(s.records,ctx.filters),categories=[...new Set(s.records.map(r=>r.category))].sort();
    c.innerHTML=head('SHOPPING DATA / 消费与履约数据','购物数据分析','导入订单明细，用可追溯的汇总统计理解商品结构与日销售变化。','真实数据计算')+
      stats([['订单数',a.orders,'笔','按唯一 order_id 计数'],['销售金额','¥ '+money(a.revenue),'','明细金额四舍五入至分后加总'],['商品件数',a.units,'件',`${a.records.length} 条有效明细`],['平均订单额','¥ '+money(a.average),'','当前筛选销售额 ÷ 订单数']])+
      `<div class="card"><div class="section-title"><h2>数据工作区</h2><span class="badge ${s.source==='教学示例'?'amber':'blue'}">${esc(s.source||'尚未导入数据')}</span></div><p class="muted">CSV 表头：order_id,date,category,product,quantity,unit_price。日期 YYYY-MM-DD；数量 1–100000 的整数；单价为非负数字。每行是一条商品明细；同一订单可有多行，重复明细也会计入，请勿重复导入。最多 3,000 行，导入通过后替换当前数据。</p>${field('CSV 内容（粘贴后点击校验导入）',`<textarea id="shop-csv" rows="4" spellcheck="false" placeholder="${SHOP_HEADERS.join(',')}">${esc(ctx.csv||'')}</textarea>`)}<div class="toolbar"><button class="btn primary" id="shop-import">校验并导入</button><label class="btn">选择 CSV 文件<input type="file" id="shop-file" accept=".csv,text/csv" style="width:180px"></label><button class="btn" id="shop-sample">加载教学示例</button><button class="btn" id="shop-export" ${!a.records.length?'disabled':''}>导出当前筛选 CSV</button></div><div id="shop-import-errors" role="status" style="margin-top:12px;color:#ae493d"></div></div>`+
      `<div class="card" style="margin-top:18px"><div class="toolbar">${field('开始日期',input('shop-start',ctx.filters.start||'','type="date"'))}${field('结束日期',input('shop-end',ctx.filters.end||'','type="date"'))}${field('商品品类',select('shop-category',[['','全部品类'],...categories.map(x=>[x,x])],ctx.filters.category||''))}<button class="btn primary" id="shop-filter">应用筛选</button><button class="btn" id="shop-reset">清除筛选</button></div><p class="muted" style="margin:0">${s.source?`数据来源：${esc(s.source)}。`:'尚无数据。'}统计与导出使用同一筛选范围。币种统一为人民币；不处理退款、折扣、运费和税额。</p></div>`+
      `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr));margin-top:18px"><div class="card"><h2>品类销售额</h2>${bars(a.categories.slice(0,15),n=>'¥ '+money(n))}${a.categories.length>15?'<p class="muted">图表显示前 15 个品类，完整明细可导出。</p>':''}</div><div class="card"><h2>每日销售额</h2>${lineChart([a.days.map(x=>x[1])],'按日期升序的每日销售金额')}<div class="toolbar" style="justify-content:space-between"><span class="muted">${esc(a.days[0]?.[0]||'')}</span><span class="muted">${esc(a.days[a.days.length-1]?.[0]||'')}</span></div><p class="muted">横轴为有记录的日期（等距排列），纵轴为金额。缺少记录的日期不视为零销售。</p><details><summary>查看每日汇总数据</summary><table><thead><tr><th>日期</th><th>金额（元）</th></tr></thead><tbody>${a.days.map(([d,v])=>`<tr><td>${esc(d)}</td><td>${money(v)}</td></tr>`).join('')}</tbody></table></details></div></div>`+
      `<div class="card" style="margin-top:18px"><div class="section-title"><h2>订单明细</h2><span class="muted">${a.records.length>100?'显示前 100 条 / ':''}共 ${a.records.length} 条</span></div><div style="overflow:auto"><table><thead><tr><th>订单编号</th><th>日期</th><th>品类</th><th>商品</th><th>数量</th><th>单价</th><th>金额</th></tr></thead><tbody>${a.records.slice(0,100).map(r=>`<tr><td>${esc(r.order_id)}</td><td>${esc(r.date)}</td><td>${esc(r.category)}</td><td>${esc(r.product)}</td><td>${r.quantity}</td><td>${money(r.unit_price)}</td><td>${money(Math.round(r.quantity*r.unit_price*100)/100)}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">粘贴数据或加载明确标记的教学示例开始分析。</td></tr>'}</tbody></table></div></div>`;
    const importData=async(text,source)=>{try{const records=validateShopping(text);s.records=records;s.source=source;s.importedAt=stamp();ctx.csv=text;ctx.filters={};await save(ctx);await renderAnalytics(ctx);toast(`已验证并保存 ${records.length} 条购物明细`);}catch(e){c.querySelector('#shop-import-errors').textContent=e.message;throw e;}};
    action(c,'shop-import',()=>importData(c.querySelector('#shop-csv').value,'用户粘贴 CSV'));
    c.querySelector('#shop-file').onchange=async e=>{try{const f=e.target.files[0];await importData(await chooseCSV(f),'导入文件：'+f.name);}catch(error){toast(error.message);}finally{e.target.value='';}};
    action(c,'shop-sample',()=>importData(SAMPLE_SHOP,'教学示例'));
    action(c,'shop-export',()=>download('购物明细_当前筛选.csv',toCSV([SHOP_HEADERS,...a.records.map(r=>SHOP_HEADERS.map(k=>r[k]))]),'text/csv;charset=utf-8'));
    action(c,'shop-filter',async()=>{const start=readValue(c,'shop-start'),end=readValue(c,'shop-end');if((start&&!validDate(start))||(end&&!validDate(end))||(start&&end&&start>end))throw new Error('请检查日期范围，开始日期不能晚于结束日期');ctx.filters={start,end,category:readValue(c,'shop-category')};ctx.csv=c.querySelector('#shop-csv').value;await renderAnalytics(ctx);});
    action(c,'shop-reset',async()=>{ctx.filters={};await renderAnalytics(ctx);});
  }

  async function renderLabs(ctx) {
    const c=ctx.c,s=ctx.state;if(!s.gateway)Object.assign(s,clone(DEFAULT_LABS));
    const check=validateTopology(s),received=new Set(s.events.filter(e=>e.result==='received').map(e=>e.epc));
    c.innerHTML=head('CONNECTION & RFID / 接线与识别','物流设备接入实训','配置网关、检查拓扑与协议一致性，再完成 RFID 模拟收货。','无真实硬件连接')+
      stats([['已配置设备',s.devices.length,'台','逻辑接线与协议参数'],['拓扑检查',check.ok?'通过':'待修正','',`${check.errors.length} 项问题`],['预到货标签',s.manifest.length,'个','每个 EPC 对应一个物流单元'],['已识别入库',received.size,'个','重复扫描不会重复收货']])+
      `<div class="notice">本实验仅验证教学拓扑并模拟 RFID 读数，不发送网络数据，不连接真实网关、射频读写器或电气线路。RS485 接线、电源、防护及射频参数需要真实设备规范与现场教师指导。</div>`+
      `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr))"><div class="card"><h2>网关 GW-01</h2>${field('网关启用',select('lab-enabled',[['1','启用'],['0','停用']],s.gateway.enabled?'1':'0'))}${field('上行 MQTT Broker（只校验格式）',input('lab-broker',s.gateway.broker))}<div class="grid" style="grid-template-columns:1fr 1fr">${field('RS485 波特率',select('lab-baud',[9600,19200,38400,115200],s.gateway.baud))}${field('RS485 校验位',select('lab-parity',[['none','无'],['even','偶校验'],['odd','奇校验']],s.gateway.parity))}</div><button class="btn primary" id="lab-gateway">保存网关并校验</button><p class="muted">本教学总线采用 8 数据位、1 停止位。Modbus RTU 设备须与网关使用相同波特率和校验位；MQTT 遥测主题须唯一。</p></div><div class="card"><div class="section-title"><h2>逻辑连接拓扑</h2><span class="badge ${check.ok?'':'amber'}">${check.ok?'参数一致':'存在配置问题'}</span></div><div style="background:#f5f8fb;border:1px solid #e0e7ee;border-radius:6px;padding:16px;margin-bottom:15px"><div style="text-align:center;font-weight:600;color:#2b607f">教学应用 / MQTT Broker</div><div style="text-align:center;color:#93a4af;padding:8px">↑ MQTT 上行（不建立连接）</div><div style="border:1px solid #b3c8d6;background:white;border-radius:5px;padding:12px;text-align:center">GW-01 · ${s.gateway.enabled?'启用':'停用'}</div>${s.devices.map(d=>`<div style="margin:10px 0 0 16px;border-left:2px solid #b3c8d6;padding:8px 12px;background:white;font-size:12px">${esc(d.id)} <span class="muted">${esc(d.protocol==='modbus'?'RS485 / Modbus RTU':'Ethernet / MQTT')} → ${esc(d.gateway||'未连接')}</span></div>`).join('')}</div>${check.ok?'<p class="muted">设备标识、网关归属、协议接口、地址与参数检查均通过。该结果不代表硬件在线或电气连接安全。</p>':`<ul style="color:#ac5840;font-size:12px;line-height:1.9">${check.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`}</div></div>`+
      `<div class="card" style="margin-top:18px"><h2>添加 / 编辑设备</h2><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">${field('设备 ID（同名则更新）',input('dev-id','READER-02','maxlength="30"'))}${field('设备类型',select('dev-type',[['rfid','RFID 读写器'],['temperature','温度传感器'],['scale','称重设备']],'rfid'))}${field('接入协议',select('dev-protocol',[['modbus','Modbus RTU'],['mqtt','MQTT']],'modbus'))}${field('物理接口',select('dev-transport',['RS485','Ethernet'],'RS485'))}${field('连接网关',select('dev-gateway',[['GW-01','GW-01'],['','未连接']],'GW-01'))}${field('Modbus 从站地址',input('dev-address',3,'type="number" min="1" max="247"'))}${field('设备波特率',select('dev-baud',[9600,19200,38400,115200],9600))}${field('设备校验位',select('dev-parity',[['none','无'],['even','偶校验'],['odd','奇校验']],'none'))}${field('MQTT 发布主题',input('dev-topic','warehouse/reader/02','maxlength="100"'))}</div><button class="btn primary" id="lab-device">保存设备配置</button><p class="muted">允许保存不匹配的参数，以观察诊断结果；只有拓扑检查通过后才能进行模拟识别。MQTT 设备不使用 Modbus 地址/串口参数。</p><div style="overflow:auto"><table><thead><tr><th>设备</th><th>类型</th><th>协议 / 接口</th><th>设置</th><th>操作</th></tr></thead><tbody>${s.devices.map((d,i)=>`<tr><td>${esc(d.id)}</td><td>${esc({rfid:'RFID',temperature:'温度',scale:'称重'}[d.type]||d.type)}</td><td>${esc(d.protocol)} / ${esc(d.transport)}</td><td>${d.protocol==='modbus'?`地址 ${esc(d.address)} · ${esc(d.baud)} · ${esc(d.parity)}`:esc(d.topic)}</td><td><button class="btn" data-edit-device="${i}">编辑</button> <button class="btn danger" data-remove-device="${i}">移除</button></td></tr>`).join('')}</tbody></table></div></div>`+
      `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr));margin-top:18px"><div class="card"><div class="section-title"><h2>RFID 模拟入库</h2><span class="badge amber">${esc(s.source||'教学示例清单')}</span></div>${field('模拟读写器',select('rfid-reader',s.devices.filter(d=>d.type==='rfid').map(d=>[d.id,d.id]),''))}${field('EPC 标签（8–24 位十六进制）',input('rfid-epc','','placeholder="E200001100000001" autocomplete="off"'))}<div class="toolbar"><button class="btn primary" id="rfid-scan" ${!check.ok?'disabled':''}>模拟读取并入库</button><button class="btn" id="rfid-next" ${!check.ok?'disabled':''}>填入下一示例标签</button><button class="btn" id="rfid-export">导出识别结果</button></div><p class="muted">“填入下一示例”只填输入框；点击模拟读取后才记录。未知标签标为异常，重复读取不重复计件。</p><div id="rfid-result" role="status" style="margin-top:16px"></div><div class="divider"></div><details><summary>添加预到货标签</summary><div style="margin-top:15px">${field('EPC',input('manifest-epc','','maxlength="24"'))}${field('物流单元名称',input('manifest-product','','maxlength="80"'))}${field('件数',input('manifest-quantity',1,'type="number" min="1" max="10000"'))}${field('目标库位',input('manifest-bin','A-01','maxlength="30"'))}<button class="btn" id="manifest-add">加入预到货清单</button></div></details></div><div class="card"><h2>预到货清单与核对</h2><div style="overflow:auto"><table><thead><tr><th>EPC / 货物</th><th>件数 / 库位</th><th>状态</th></tr></thead><tbody>${s.manifest.map(m=>`<tr><td style="overflow-wrap:anywhere">${esc(m.epc)}<br><span class="muted">${esc(m.product)}</span></td><td>${m.quantity} / ${esc(m.bin)}</td><td><span class="badge ${received.has(m.epc)?'':'gray'}">${received.has(m.epc)?'已识别入库':'待识别'}</span></td></tr>`).join('')}</tbody></table></div><p class="muted">已核对 ${received.size} / ${s.manifest.length} 个标签，入库 ${s.events.filter(e=>e.result==='received').reduce((a,e)=>a+e.quantity,0)} 件。识别结果在当前工作区保存。</p></div></div><div class="card" style="margin-top:18px"><h2>识别事件记录</h2><div style="overflow:auto"><table><thead><tr><th>时间</th><th>读写器 / EPC</th><th>识别结果</th><th>货物 / 库位</th></tr></thead><tbody>${s.events.slice(-100).reverse().map(e=>`<tr><td>${time(e.time)}</td><td>${esc(e.reader)}<br><span class="muted">${esc(e.epc)}</span></td><td><span class="badge ${e.result==='received'?'':'amber'}">${{received:'已识别入库',duplicate:'重复读取，未重复入库',unknown:'未知标签，待核验'}[e.result]}</span></td><td>${esc(e.product)} / ${esc(e.bin)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">还没有识别事件</td></tr>'}</tbody></table></div><p class="muted">显示最近 100 条，最多保存 2,000 条事件。导出包含全部已保存事件。</p></div>`;
    action(c,'lab-gateway',async()=>{s.gateway={enabled:readValue(c,'lab-enabled')==='1',broker:readValue(c,'lab-broker'),baud:readNumber(c,'lab-baud'),parity:readValue(c,'lab-parity')};await save(ctx);await renderLabs(ctx);});
    action(c,'lab-device',async()=>{const d={id:readValue(c,'dev-id'),type:readValue(c,'dev-type'),protocol:readValue(c,'dev-protocol'),transport:readValue(c,'dev-transport'),gateway:readValue(c,'dev-gateway'),address:readNumber(c,'dev-address'),baud:readNumber(c,'dev-baud'),parity:readValue(c,'dev-parity'),topic:readValue(c,'dev-topic')};if(!/^[A-Za-z][A-Za-z0-9_-]{1,29}$/.test(d.id))throw new Error('设备 ID 须以字母开头，长度 2–30 位');const i=s.devices.findIndex(x=>x.id===d.id);if(i<0&&s.devices.length>=20)throw new Error('最多配置 20 台设备');if(i>=0)s.devices[i]=d;else s.devices.push(d);await save(ctx);await renderLabs(ctx);});
    c.querySelectorAll('[data-edit-device]').forEach(b=>b.onclick=()=>{const d=s.devices[+b.dataset.editDevice];for(const k of ['id','type','protocol','transport','gateway','address','baud','parity','topic'])c.querySelector('#dev-'+k).value=d[k]??'';c.querySelector('#dev-id').focus();});
    c.querySelectorAll('[data-remove-device]').forEach(b=>b.onclick=async()=>{try{s.devices.splice(+b.dataset.removeDevice,1);await save(ctx);await renderLabs(ctx);}catch(e){toast(e.message);}});
    action(c,'manifest-add',async()=>{const m={epc:normalizeEPC(readValue(c,'manifest-epc')),product:readValue(c,'manifest-product'),quantity:readNumber(c,'manifest-quantity'),bin:readValue(c,'manifest-bin')};if(!/^[A-F0-9]{8,24}$/.test(m.epc)||!m.product||!m.bin||!Number.isInteger(m.quantity)||m.quantity<1||m.quantity>10000)throw new Error('请填写有效 EPC、货物名、库位和 1–10000 的整数件数');if(s.manifest.some(x=>x.epc===m.epc))throw new Error('该 EPC 已在清单中');if(s.manifest.length>=500)throw new Error('预到货清单最多 500 个标签');s.manifest.push(m);s.source='教学示例 + 用户添加清单';await save(ctx);await renderLabs(ctx);});
    action(c,'rfid-next',()=>{const next=s.manifest.find(m=>!received.has(m.epc));if(!next)throw new Error('清单全部识别完毕，可重复输入 EPC 观察去重');c.querySelector('#rfid-epc').value=next.epc;});
    action(c,'rfid-scan',async()=>{const reader=readValue(c,'rfid-reader');if(!validateTopology(s).ok||!s.devices.some(d=>d.id===reader&&d.type==='rfid'))throw new Error('需要有效拓扑和 RFID 读写器');if(s.events.length>=2000)throw new Error('已达到 2,000 条教学事件上限，请先导出备份');const e=scanRFID(s.manifest,readValue(c,'rfid-epc'),reader,s.events);s.events.push(e);await save(ctx);await renderLabs(ctx);c.querySelector('#rfid-result').innerHTML=`<span class="badge ${e.result==='received'?'':'amber'}">${esc(e.epc)} · ${{received:'已识别并记录入库',duplicate:'重复读取，未重复入库',unknown:'未知标签，需人工核验'}[e.result]}</span>`;});
    action(c,'rfid-export',()=>download('RFID_模拟识别结果.json',JSON.stringify({mode:'software-simulation-only',...s},null,2)));
  }

  function neuralResults(s) {
    if(!s.model || !s.history?.length)return '<div class="card"><h2>训练结果</h2><p class="empty">导入数据并开始训练后，这里显示逐轮计算的真实损失、留出测试集指标和混淆矩阵。</p></div>';
    const last=s.history[s.history.length-1],m=s.model;
    return stats([['已完成轮数',last.epoch,'epoch',s.status==='running'?'训练进行中':s.status==='stopped'?'已停止，保留已完成轮次':'已完成训练'],['训练集损失',last.trainLoss.toFixed(4),'','多分类交叉熵'],['测试集损失',last.testLoss.toFixed(4),'','独立留出数据，未参与梯度计算'],['测试准确率',(last.testAccuracy*100).toFixed(1),'%',`${m.testCount} 条测试样本`]])+
      `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(290px,1fr))"><div class="card"><div class="section-title"><h2>真实训练损失</h2><span class="muted">逐轮重新计算</span></div>${lineChart([s.history.map(x=>x.trainLoss),s.history.map(x=>x.testLoss)],'训练和测试交叉熵损失曲线')}<div class="toolbar"><span style="font-size:12px;color:#256e96">● 训练集</span><span style="font-size:12px;color:#cc883c">● 测试集</span><span class="muted">横轴：epoch 0–${last.epoch}</span></div><p class="muted">曲线来自浏览器内实际计算；epoch 0 是随机初始化后的基线。测试集仅用于观察，反复据此调参可能导致评估偏乐观。</p></div><div class="card"><h2>测试集混淆矩阵</h2><p class="muted">行：真实类别；列：预测类别。对角线为正确预测数量。</p><div style="overflow:auto"><table><thead><tr><th>实际 / 预测</th>${m.labels.map(l=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${m.labels.map((l,i)=>`<tr><th>${esc(l)}</th>${s.confusion[i].map((n,j)=>`<td style="${i===j?'background:#edf5fa;font-weight:600':''}">${n}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted">训练 ${m.trainCount} 条 / 测试 ${m.testCount} 条。每类分层约 80% / 20%，固定种子 ${m.seed}。均值和标准差仅从训练集估计。</p></div></div>`;
  }
  async function renderNeural(ctx) {
    const c=ctx.c,s=ctx.state,data=s.dataset,model=s.model;
    c.innerHTML=head('NEURAL COMPUTING / 可复现训练','神经网络训练实验','使用数值特征训练一个小型多分类网络，验证数据划分、损失下降与单条预测。','浏览器内真实训练')+
      `<div class="notice">本页执行实际数值训练：标准化 → 全连接隐藏层（tanh）→ softmax → 交叉熵 → 全批量梯度下降。不是迁移学习或云端训练服务。合成物流样本只用于教学，准确率不能代表真实物流模型效果。</div>`+
      `<div class="card"><div class="section-title"><h2>1. 准备数值分类数据</h2><span class="badge ${s.source?.includes('合成')?'amber':'gray'}">${esc(s.source||'尚无数据')}</span></div><fieldset ${ctx.training?'disabled':''} style="border:0;padding:0;margin:0"><p class="muted">CSV 需要 2–8 个数值特征列，最后一列为 label。12–2,000 条记录、2–8 类，每类至少 3 条；不支持空值与非数值特征。加载新数据会清除上一模型。请勿上传真实个人身份或敏感信息。</p>${field('数值训练 CSV',`<textarea id="neural-csv" rows="4" spellcheck="false" placeholder="mass_kg,distance_km,temp_c,label">${esc(ctx.csv||'')}</textarea>`)}<div class="toolbar"><button class="btn primary" id="neural-import">校验并加载数据</button><label class="btn">选择 CSV 文件<input type="file" id="neural-file" accept=".csv,text/csv" style="width:180px"></label><button class="btn" id="neural-sample">生成合成教学样本</button><button class="btn" id="neural-data-export" ${!data?'disabled':''}>导出当前数据</button></div></fieldset><div id="neural-errors" role="status" style="color:#ae493d;margin-top:12px"></div>${data?`<div class="divider"></div><div class="toolbar"><span class="badge blue">${data.samples.length} 条记录</span><span class="badge gray">${data.features.length} 个特征</span><span class="badge gray">${data.labels.length} 个类别</span></div><p class="muted">特征：${data.features.map(esc).join('、')}。类别分布：${data.labels.map(l=>`${esc(l)} ${data.samples.filter(x=>x.label===l).length} 条`).join('；')}。</p><details><summary>查看前 8 条数据</summary><div style="overflow:auto"><table><thead><tr>${data.features.concat('label').map(l=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${data.samples.slice(0,8).map(r=>`<tr>${r.x.map(x=>`<td>${x}</td>`).join('')}<td>${esc(r.label)}</td></tr>`).join('')}</tbody></table></div></details>`:''}</div>`+
      `<div class="card" style="margin:18px 0"><h2>2. 配置与训练</h2><fieldset ${ctx.training?'disabled':''} style="border:0;padding:0;margin:0"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">${field('隐藏层神经元',select('neural-hidden',[4,8,12,16],s.params?.hidden||8))}${field('学习率（0.001–1）',input('neural-rate',s.params?.rate??.08,'type="number" min="0.001" max="1" step="0.01"'))}${field('训练轮数（1–400）',input('neural-epochs',s.params?.epochs||120,'type="number" min="1" max="400"'))}${field('随机种子（整数）',input('neural-seed',s.params?.seed??42,'type="number" min="1" max="999999"'))}</div><div class="toolbar"><button class="btn primary" id="neural-train" ${!data?'disabled':''}>从头训练</button><button class="btn" id="neural-model-export" ${!model?'disabled':''}>导出模型与实验指标</button></div></fieldset><button class="btn danger" id="neural-stop" style="margin-top:12px;${ctx.training?'':'display:none'}">停止并保留当前结果</button><p id="neural-status" role="status" class="muted">${ctx.training?'正在训练，每 5 轮更新界面。':s.history?.length?`已保存 ${s.history[s.history.length-1].epoch} 轮真实计算结果。每次“从头训练”会重新初始化网络。`:'训练在当前浏览器完成，不发送到外部 AI 服务。相同数据、参数和种子可复现结果。'}</p></div>`+
      `<div id="neural-results">${neuralResults(s)}</div><div class="card" style="margin-top:18px"><h2>3. 单条样本预测</h2>${model?`<p class="muted">使用已训练权重和训练集标准化参数。模型输出是 softmax 分数，不是经过校准的置信度。</p><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">${model.features.map((f,i)=>field(esc(f),input('predict-'+i,model.mean[i].toFixed(3),'type="number" step="any"'))).join('')}</div><button class="btn primary" id="neural-predict" ${ctx.training?'disabled':''}>运行预测</button><div id="predict-result" style="margin-top:16px" role="status"></div>`:'<p class="muted">至少完成一轮训练后，可输入相同维度的特征进行预测。</p>'}</div>`;
    const importData=async(text,source)=>{try{const dataset=parseNeuralCSV(text);Object.assign(s,{dataset,source,model:null,history:[],confusion:[],status:'ready'});ctx.csv=text;await save(ctx);await renderNeural(ctx);toast(`已校验 ${dataset.samples.length} 条数值分类数据`);}catch(e){c.querySelector('#neural-errors').textContent=e.message;throw e;}};
    action(c,'neural-import',()=>importData(c.querySelector('#neural-csv').value,'用户粘贴 CSV'));
    action(c,'neural-sample',()=>importData(syntheticCSV(42),'合成教学样本 · 120 条 · 固定种子 42'));
    c.querySelector('#neural-file').onchange=async e=>{try{const f=e.target.files[0];await importData(await chooseCSV(f),'导入文件：'+f.name);}catch(error){toast(error.message);}finally{e.target.value='';}};
    action(c,'neural-data-export',()=>download('神经网络_数值训练数据.csv',toCSV([data.features.concat('label'),...data.samples.map(r=>r.x.concat(r.label))]),'text/csv;charset=utf-8'));
    action(c,'neural-model-export',()=>download('神经网络_模型与实验.json',JSON.stringify({format:'logistics-tanh-softmax-v1',source:s.source,params:s.params,model:s.model,history:s.history,confusion:s.confusion,scope:'educational numerical multiclass classifier; not transfer learning'},null,2)));
    action(c,'neural-predict',()=>{const x=s.model.features.map((_,i)=>readNumber(c,'predict-'+i)),result=predict(s.model,x);c.querySelector('#predict-result').innerHTML=`<p>预测类别：<strong>${esc(result[0].label)}</strong></p>${bars(result.map(r=>[r.label,r.probability]),v=>(v*100).toFixed(2)+'%')}`;});
    action(c,'neural-stop',()=>{ctx.cancel=true;c.querySelector('#neural-status').textContent='正在停止并保存最后完成的轮次…';});
    action(c,'neural-train',async()=>{
      if(root.PresetDemo?.enabled)throw Error('预设演示模式仅支持流程回放，实际训练已关闭。');
      const params={hidden:readNumber(c,'neural-hidden'),rate:readNumber(c,'neural-rate'),epochs:readNumber(c,'neural-epochs'),seed:readNumber(c,'neural-seed')};
      if(![4,8,12,16].includes(params.hidden)||!finite(params.rate)||params.rate<.001||params.rate>1||!Number.isInteger(params.epochs)||params.epochs<1||params.epochs>400||!Number.isInteger(params.seed)||params.seed<1||params.seed>999999)throw new Error('请检查隐藏层、学习率、轮数与随机种子范围');
      ctx.csv=c.querySelector('#neural-csv').value;ctx.training=true;ctx.cancel=false;s.params=params;s.status='running';
      const split=splitData(s.dataset,params.seed),network=createNetwork(s.dataset.features.length,params.hidden,s.dataset.labels.length,params.seed);
      s.model={features:s.dataset.features,labels:s.dataset.labels,network,mean:split.mean,scale:split.scale,seed:params.seed,trainCount:split.train.length,testCount:split.test.length,trainedAt:stamp()};s.history=[];
      const measure=epoch=>{const train=metrics(network,split.train,s.dataset.labels.length),test=metrics(network,split.test,s.dataset.labels.length);if(!finite(train.loss)||!finite(test.loss))throw new Error('数值训练出现不稳定，请减小学习率并检查数据');s.history.push({epoch,trainLoss:train.loss,testLoss:test.loss,trainAccuracy:train.accuracy,testAccuracy:test.accuracy});s.confusion=test.confusion;};
      measure(0);await renderNeural(ctx);
      ctx.trainingPromise=(async()=>{
        try {
          for(let epoch=1;epoch<=params.epochs;epoch++) {
            if(ctx.cancel)break;
            trainEpoch(network,split.train,params.rate);measure(epoch);
            if(epoch%5===0 || epoch===params.epochs){
              if(ctx.active){c.querySelector('#neural-results').innerHTML=neuralResults(s);c.querySelector('#neural-status').textContent=`已计算 ${epoch} / ${params.epochs} 轮；最近测试准确率 ${(s.history[s.history.length-1].testAccuracy*100).toFixed(1)}%。`;}
              if(epoch%25===0)await save(ctx);
              await new Promise(resolve=>setTimeout(resolve,0));
            }
          }
          s.status=ctx.cancel?'stopped':'completed';
        }catch(e){s.status='stopped';if(ctx.active)toast(e.message);}
        finally{ctx.training=false;await save(ctx);if(ctx.active)await renderNeural(ctx);}
      })();
      await ctx.trainingPromise;
    });
  }

  async function stop() {
    const ctx=current;if(!ctx)return;ctx.active=false;ctx.cancel=true;
    if(ctx.trainingPromise)await ctx.trainingPromise;
    if(ctx.pending)await ctx.pending;
    if(current===ctx)current=null;
  }
  async function render(c,page) {
    if(!['drone','analytics','labs','neural'].includes(page))throw new Error('未知实训模块');
    await stop();const id=++generation,ctx={c,page,state:{},active:true,training:false,cancel:false};current=ctx;
    c.innerHTML='<div class="card"><p class="muted">正在加载实验工作区…</p></div>';
    try {const saved=await api('extras_'+page);if(!ctx.active||generation!==id)return;ctx.state=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};
      if(ctx.state.status==='running')ctx.state.status='stopped';
      await ({drone:renderDrone,analytics:renderAnalytics,labs:renderLabs,neural:renderNeural}[page])(ctx);
    }catch(e){if(ctx.active)c.innerHTML=`<div class="card"><h2>工作区暂时无法载入</h2><p>${esc(e.message)}</p><button class="btn" id="extra-retry">重试</button></div>`;action(c,'extra-retry',()=>render(c,page));}
  }
  root.Extras={render,stop,helpers:Helpers};
})(typeof window!=='undefined'?window:globalThis);
