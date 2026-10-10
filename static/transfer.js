/* Real image transfer learning. The vendored COCO-SSD MobileNetV2 feature extractor
 * stays frozen. Only a new TensorFlow.js dense classification head is optimized.
 * No network inference API, generated metrics, or supplied industrial dataset. */
(function (root) {
  'use strict';
  const ASSET_BASE = typeof document !== 'undefined' && document.currentScript ? new URL('vendor/vision/', document.currentScript.src).href : './static/vendor/vision/';
  const MODEL = Object.freeze({name:'COCO-SSD MobileNetV2 特征提取器',node:'FeatureExtractor/MobilenetV2/Conv_1/Relu6',modelUrl:ASSET_BASE+'model.json',embeddingSize:1280,imageSize:300,normalization:'Graph: RGB int32 [0,255] → bilinear 300×300 → ×(2/255) − 1',source:'https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd',license:'Apache-2.0',runtime:'TensorFlow.js 4.22.0'});
  const LIMITS = Object.freeze({classes:8,images:96,perClass:32,fileBytes:8*1024*1024,pixels:32000000,importBytes:3*1024*1024});
  const DEFAULTS = Object.freeze({epochs:40,learningRate:.001,hidden:32,batchSize:8,testFraction:.25,seed:42});
  const FORMAT='image-transfer-head-v1';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=v=>JSON.parse(JSON.stringify(v));
  const stamp=()=>new Date().toISOString();
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const pause=()=>new Promise(r=>setTimeout(r,0));
  function canceled(){const e=new Error('已停止；本次未完成的模型未替换已保存结果。');e.name='AbortError';return e;}
  function checkCancel(fn){if(fn&&fn())throw canceled();}
  function validateClasses(list){
    if(!Array.isArray(list)||list.length<2||list.length>LIMITS.classes)throw Error('类别数量须为 2–8 个');
    const out=list.map(x=>{if(typeof x!=='string'||!x.trim()||x.trim().length>32)throw Error('类别名须为 1–32 个字符');return x.trim();});
    if(new Set(out).size!==out.length)throw Error('类别名不能重复');return out;
  }
  function validateConfig(raw={}){
    const c={...DEFAULTS,...raw};
    for(const [key,min,max] of [['epochs',1,120],['batchSize',1,32],['seed',0,2147483647]])if(!Number.isInteger(c[key])||c[key]<min||c[key]>max)throw Error('训练轮数 1–120、批大小 1–32、随机种子 0–2147483647，均须为整数');
    if(![16,32,64].includes(c.hidden))throw Error('隐藏层只能选择 16、32 或 64 个神经元');
    if(!finite(c.learningRate)||c.learningRate<.0001||c.learningRate>.05)throw Error('学习率须在 0.0001–0.05 之间');
    if(![.2,.25,.3].includes(c.testFraction))throw Error('留出比例只能选择 20%、25% 或 30%');
    return Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,c[k]]));
  }
  function random(seed){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
  function shuffled(list,rng){const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function stratifiedSplit(labels,numClasses,fraction=.25,seed=42){
    if(!Array.isArray(labels)||labels.length>LIMITS.images||!Number.isInteger(numClasses)||numClasses<2||numClasses>8||![.2,.25,.3].includes(fraction))throw Error('数据划分参数无效');
    if(labels.some(y=>!Number.isInteger(y)||y<0||y>=numClasses))throw Error('图像类别索引无效');
    const rng=random(seed),train=[],test=[],counts=[];
    for(let k=0;k<numClasses;k++){const indexes=labels.map((v,i)=>v===k?i:-1).filter(i=>i>=0);if(indexes.length<5)throw Error('每个类别至少需要 5 张不同图像，才能分层划分训练和留出集');if(indexes.length>LIMITS.perClass)throw Error('每类最多 32 张图像');const a=shuffled(indexes,rng),n=Math.max(1,Math.round(a.length*fraction));test.push(...a.slice(0,n));train.push(...a.slice(n));counts.push({total:a.length,train:a.length-n,test:n});}
    return{train:shuffled(train,rng),test:shuffled(test,rng),counts,seed,fraction};
  }
  function fingerprint(bytes){let a=2166136261,b=2246822519;for(const n of bytes){a=Math.imul(a^n,16777619);b=Math.imul(b^n,3266489917);}return(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
  function createHead(tf,numClasses,rawConfig){
    const config=validateConfig(rawConfig);if(!Number.isInteger(numClasses)||numClasses<2||numClasses>8)throw Error('模型类别数无效');
    const head=tf.sequential();
    head.add(tf.layers.dense({inputShape:[MODEL.embeddingSize],units:config.hidden,activation:'relu',kernelInitializer:tf.initializers.glorotUniform({seed:config.seed}),biasInitializer:'zeros',name:'transfer_hidden'}));
    head.add(tf.layers.dense({units:numClasses,activation:'softmax',kernelInitializer:tf.initializers.glorotUniform({seed:config.seed+1}),biasInitializer:'zeros',name:'transfer_probabilities'}));
    head.compile({optimizer:tf.train.adam(config.learningRate),loss:'categoricalCrossentropy',metrics:['accuracy']});return head;
  }
  function disposeHead(head){if(!head)return;const optimizer=head.optimizer;head.dispose();if(optimizer)optimizer.dispose();}
  async function extractEmbedding(tf,graph,input){
    if(!input||input.rank!==3||input.shape[2]!==3||input.shape[0]<1||input.shape[1]<1)throw Error('需要 RGB 三通道图像张量');
    let batch,activation,embedding;
    try{
      // Feed raw integer RGB; normalization is already present in the pretrained graph.
      batch=tf.tidy(()=>input.toInt().expandDims(0));
      activation=await graph.executeAsync(batch,MODEL.node);
      if(Array.isArray(activation)||activation.rank!==4||activation.shape[3]!==MODEL.embeddingSize)throw Error('预训练特征节点形状与当前模型不匹配');
      embedding=tf.tidy(()=>activation.mean([1,2]).reshape([MODEL.embeddingSize]));
      const values=Array.from(await embedding.data());if(values.some(x=>!finite(x)))throw Error('预训练模型返回非有限特征');return values;
    }finally{batch?.dispose();if(Array.isArray(activation))activation.forEach(t=>t.dispose());else activation?.dispose();embedding?.dispose();}
  }
  function validateFeatures(features,labels,numClasses){
    if(!Array.isArray(features)||features.length!==labels.length||!features.length||features.length>LIMITS.images)throw Error('特征和标签数量不匹配');
    for(const row of features)if(!Array.isArray(row)||row.length!==MODEL.embeddingSize||row.some(v=>!finite(v)))throw Error('每张图像须有 1280 个有限特征');
    if(labels.some(v=>!Number.isInteger(v)||v<0||v>=numClasses))throw Error('标签索引无效');
  }
  function metricsFromProbabilities(probabilities,labels,numClasses){
    if(!Array.isArray(probabilities)||!probabilities.length||probabilities.length!==labels.length)throw Error('预测结果数量不匹配');
    const confusion=Array.from({length:numClasses},()=>Array(numClasses).fill(0));let loss=0,correct=0;
    probabilities.forEach((p,i)=>{const y=labels[i];if(!Number.isInteger(y)||y<0||y>=numClasses||!Array.isArray(p)||p.length!==numClasses||p.some(v=>!finite(v)||v<0||v>1)||Math.abs(p.reduce((a,b)=>a+b,0)-1)>.001)throw Error('预测概率无效');const pred=p.indexOf(Math.max(...p));confusion[y][pred]++;if(pred===y)correct++;loss-=Math.log(Math.max(p[y],1e-7));});
    const perClass=confusion.map((row,k)=>{const support=row.reduce((a,b)=>a+b,0),predicted=confusion.reduce((a,r)=>a+r[k],0);return{support,precision:predicted?row[k]/predicted:0,recall:support?row[k]/support:0};});
    return{accuracy:correct/labels.length,loss:loss/labels.length,total:labels.length,correct,confusion,perClass};
  }
  async function evaluateHead(tf,head,features,labels,numClasses){
    validateFeatures(features,labels,numClasses);let x,p;
    try{x=tf.tensor2d(features,[features.length,MODEL.embeddingSize]);p=head.predict(x);return metricsFromProbabilities(await p.array(),labels,numClasses);}finally{x?.dispose();p?.dispose();}
  }
  async function trainHead(tf,features,labels,numClasses,rawConfig,options={}){
    if(root.PresetDemo?.enabled)throw Error('预设演示模式仅支持样例 / 流程回放，实际模型执行已关闭。');
    const config=validateConfig(rawConfig);validateFeatures(features,labels,numClasses);const split=stratifiedSplit(labels,numClasses,config.testFraction,config.seed);checkCancel(options.isCanceled);
    let head,x,y,vx,vy;const history=[];
    try{
      head=createHead(tf,numClasses,config);
      x=tf.tensor2d(split.train.map(i=>features[i]),[split.train.length,MODEL.embeddingSize]);
      y=tf.tidy(()=>tf.oneHot(tf.tensor1d(split.train.map(i=>labels[i]),'int32'),numClasses));
      vx=tf.tensor2d(split.test.map(i=>features[i]),[split.test.length,MODEL.embeddingSize]);
      vy=tf.tidy(()=>tf.oneHot(tf.tensor1d(split.test.map(i=>labels[i]),'int32'),numClasses));
      await head.fit(x,y,{epochs:config.epochs,batchSize:Math.min(config.batchSize,split.train.length),shuffle:false,validationData:[vx,vy],yieldEvery:'batch',callbacks:{
        onBatchEnd:async()=>{if(options.isCanceled?.())head.stopTraining=true;await pause();},
        onEpochEnd:async(epoch,logs)=>{const row={epoch:epoch+1,loss:Number(logs.loss),accuracy:Number(logs.acc??logs.accuracy),valLoss:Number(logs.val_loss),valAccuracy:Number(logs.val_acc??logs.val_accuracy)};if(Object.values(row).some(v=>!finite(v)))throw Error('训练出现非有限损失，请降低学习率');history.push(row);if(options.onEpoch)await options.onEpoch(row,history);if(options.isCanceled?.())head.stopTraining=true;await pause();}
      }});
      checkCancel(options.isCanceled);
      const test=await evaluateHead(tf,head,split.test.map(i=>features[i]),split.test.map(i=>labels[i]),numClasses);
      const train=await evaluateHead(tf,head,split.train.map(i=>features[i]),split.train.map(i=>labels[i]),numClasses);
      checkCancel(options.isCanceled);return{head,history,split,train,test};
    }catch(error){disposeHead(head);throw error;}finally{x?.dispose();y?.dispose();vx?.dispose();vy?.dispose();}
  }
  function serializeHead(head,classes,config){
    return{format:FORMAT,classes:validateClasses(classes),config:validateConfig(config),backbone:{node:MODEL.node,embeddingSize:MODEL.embeddingSize,source:MODEL.source,modelAsset:'static/vendor/vision/model.json',normalization:MODEL.normalization},weights:head.weights.map(w=>({shape:w.shape.slice(),values:Array.from(w.read().dataSync())}))};
  }
  function validateBundle(raw){
    if(!raw||raw.format!==FORMAT)throw Error('不支持的模型文件格式');const classes=validateClasses(raw.classes),config=validateConfig(raw.config);
    if(raw.backbone?.node!==MODEL.node||raw.backbone?.embeddingSize!==1280)throw Error('分类头的预训练特征提取器不兼容');
    const expected=[[1280,config.hidden],[config.hidden],[config.hidden,classes.length],[classes.length]];
    if(!Array.isArray(raw.weights)||raw.weights.length!==expected.length)throw Error('分类头权重数量无效');
    const weights=raw.weights.map((w,i)=>{const shape=expected[i];if(!w||JSON.stringify(w.shape)!==JSON.stringify(shape)||!Array.isArray(w.values)||w.values.length!==shape.reduce((a,b)=>a*b,1)||w.values.some(x=>!finite(x)||Math.abs(x)>1000000))throw Error('分类头权重形状或数值无效');return{shape,values:w.values.slice()};});
    return{format:FORMAT,classes,config,backbone:{node:MODEL.node,embeddingSize:MODEL.embeddingSize,source:MODEL.source,modelAsset:'static/vendor/vision/model.json',normalization:MODEL.normalization},weights};
  }
  function restoreHead(tf,raw){
    const bundle=validateBundle(raw);let head;const tensors=[];try{head=createHead(tf,bundle.classes.length,bundle.config);for(const w of bundle.weights)tensors.push(tf.tensor(w.values,w.shape));head.setWeights(tensors);return head;}catch(e){disposeHead(head);throw e;}finally{tensors.forEach(t=>t.dispose());}
  }
  let runtimePromise=null,backbonePromise=null,current=null,generation=0;
  async function runtime(){
    if(root.tf){await root.tf.ready();return root.tf;}
    if(!runtimePromise)runtimePromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=ASSET_BASE+'tf.min.js';s.integrity='sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre';s.crossOrigin='anonymous';const timer=setTimeout(()=>{s.remove();reject(Error('TensorFlow.js 加载超时，请重试'));},45000);s.onload=()=>{clearTimeout(timer);root.tf?resolve(root.tf):reject(Error('TensorFlow.js 未初始化'));};s.onerror=()=>{clearTimeout(timer);s.remove();reject(Error('无法加载本站 TensorFlow.js 资源，请检查离线包或网络'));};document.head.appendChild(s);}).then(async tf=>{try{if(!await tf.setBackend('webgl'))throw Error('GPU unavailable');await tf.ready();}catch(e){await tf.setBackend('cpu');await tf.ready();}return tf;}).catch(e=>{runtimePromise=null;throw e;});
    return runtimePromise;
  }
  async function backbone(onStatus=()=>{}){
    const tf=await runtime();if(!backbonePromise){onStatus('加载本站预训练权重，首次初始化可能需要 1–2 分钟…');backbonePromise=(async()=>{let timer,expired=false;const pending=tf.loadGraphModel(MODEL.modelUrl);pending.then(g=>{if(expired)g.dispose();},()=>{});try{return await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('预训练模型加载超时，请检查本站模型文件后重试'));},120000);})]);}finally{clearTimeout(timer);}})().catch(e=>{backbonePromise=null;throw e;});}const graph=await backbonePromise;return{tf,graph};
  }
  function newState(){return{version:1,classes:['纸箱','周转箱','托盘'],config:{...DEFAULTS},bundle:null,result:null,savedAt:null};}
  function validateResult(raw,numClasses){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.history)||!raw.history.length||raw.history.length>120)throw Error('保存的训练记录格式无效');
    const config=validateConfig(raw.config),history=raw.history.map((r,i)=>{if(!r||r.epoch!==i+1||!finite(r.loss)||!finite(r.valLoss)||r.loss<0||r.valLoss<0||![r.accuracy,r.valAccuracy].every(v=>finite(v)&&v>=0&&v<=1.000001))throw Error('保存的损失曲线数值无效');return{epoch:r.epoch,loss:r.loss,valLoss:r.valLoss,accuracy:r.accuracy,valAccuracy:r.valAccuracy};});
    const metric=m=>{if(!m||!Array.isArray(m.confusion)||m.confusion.length!==numClasses||m.confusion.some(row=>!Array.isArray(row)||row.length!==numClasses||row.some(n=>!Number.isInteger(n)||n<0||n>LIMITS.images)))throw Error('保存的混淆矩阵无效');const total=m.confusion.flat().reduce((a,b)=>a+b,0),correct=m.confusion.reduce((a,row,k)=>a+row[k],0);if(total<1||total>LIMITS.images||m.total!==total||m.correct!==correct||!finite(m.accuracy)||Math.abs(m.accuracy-correct/total)>1e-6||!finite(m.loss)||m.loss<0)throw Error('保存的评估指标不一致');return{accuracy:correct/total,loss:m.loss,total,correct,confusion:clone(m.confusion),perClass:m.confusion.map((row,k)=>{const support=row.reduce((a,b)=>a+b,0),predicted=m.confusion.reduce((a,r)=>a+r[k],0);return{support,precision:predicted?row[k]/predicted:0,recall:support?row[k]/support:0};})};};
    const train=metric(raw.train),test=metric(raw.test),n=train.total+test.total,split=raw.split;if(n>LIMITS.images||!split||!Array.isArray(split.train)||!Array.isArray(split.test)||split.train.length!==train.total||split.test.length!==test.total)throw Error('保存的数据划分无效');const indexes=[...split.train,...split.test];if(indexes.some(i=>!Number.isInteger(i)||i<0||i>=n)||new Set(indexes).size!==n)throw Error('保存的数据划分存在重复或越界');
    return{config,history,train,test,split:clone(split),source:String(raw.source||'用户图像').slice(0,160),completedAt:String(raw.completedAt||'').slice(0,40),backend:String(raw.backend||'').slice(0,30),runtime:String(raw.runtime||'').slice(0,30)};
  }
  function loadState(raw){if(raw==null)return newState();if(typeof raw!=='object'||Array.isArray(raw)||raw.version!==1)throw Error('保存的迁移学习工作区格式不兼容，请在教学与数据管理中检查备份');const s=newState();s.classes=validateClasses(raw.classes);s.config=validateConfig(raw.config);if(raw.bundle){s.bundle=validateBundle(raw.bundle);if(JSON.stringify(s.classes)!==JSON.stringify(s.bundle.classes))throw Error('保存模型的类别与工作区不一致');}if(raw.result){if(!s.bundle)throw Error('评估记录缺少对应的分类头');s.result=validateResult(raw.result,s.classes.length);}s.savedAt=typeof raw.savedAt==='string'?raw.savedAt:null;return s;}
  function setStatus(ctx,text,error=false){ctx.status=text;ctx.error=error;const e=ctx.active&&ctx.c.querySelector('#tl-status');if(e){e.textContent=text;e.style.color=error?'#ad4136':'#52746e';}}
  async function save(ctx){
    const payload={...ctx.state,savedAt:stamp()};const snapshot=JSON.stringify(payload);ctx.pending=root.api('transfer_learning','POST',payload);
    try{await ctx.pending;if(JSON.stringify({...ctx.state,savedAt:payload.savedAt})===snapshot){ctx.state.savedAt=payload.savedAt;ctx.dirty=false;}return true;}catch(e){ctx.dirty=true;setStatus(ctx,'保存失败：'+e.message+'。当前页面仍保留模型，可导出后重试。',true);throw e;}finally{ctx.pending=null;}
  }
  function safeAction(ctx,fn){return e=>{if(!ctx.active||ctx.busy||ctx.training||ctx.task)return;ctx.busy=true;let work;try{work=fn(e);}catch(error){work=Promise.reject(error);}const task=Promise.resolve(work).catch(error=>{if(error.name!=='AbortError'){setStatus(ctx,error.message,true);root.toast?.(error.message);}}).finally(()=>{ctx.busy=false;if(ctx.task===task)ctx.task=null;if(ctx.active)paint(ctx);});ctx.task=task;paint(ctx);return task;};}
  function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  function invalidate(ctx){disposeHead(ctx.head);ctx.head=null;ctx.state.bundle=null;ctx.state.result=null;ctx.history=[];ctx.dirty=true;ctx.prediction=null;}
  function architecture(ctx){const k=ctx.state.classes.length,h=ctx.state.config.hidden,p=(1280+1)*h+(h+1)*k;return `<div role="img" aria-label="真实计算流程：300 像素 RGB 图像，冻结的 MobileNetV2，10 乘 10 乘 1280 特征图，全局平均池化，${h} 个 ReLU 神经元，${k} 类 Softmax 概率" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:20px 0"><div class="card" style="padding:12px;background:#f0f5ff">RGB 图像<br><b>300 × 300 × 3</b></div><span>→</span><div class="card" style="padding:12px;background:#eef3f6">🔒 MobileNetV2<br><b>冻结预训练骨干</b><div class="muted">10 × 10 × 1280</div></div><span>→</span><div class="card" style="padding:12px">全局平均池化<br><b>1280 维特征</b></div><span>→</span><div class="card" style="padding:12px;background:#e6f7f0">Dense + ReLU<br><b>${h} 个神经元</b></div><span>→</span><div class="card" style="padding:12px;background:#e6f7f0">Softmax<br><b>${k} 个类别</b></div></div><p class="muted">仅更新绿色分类头，共 ${p.toLocaleString()} 个可训练参数。骨干来自通用 COCO 检测模型，迁移到用户类别；不是已经训练好的工业/物流分类器。</p>`;}
  function chart(history){if(!history?.length)return'<div class="empty">训练后显示真实交叉熵曲线</div>';const a=history.filter(r=>finite(r.loss)&&finite(r.valLoss));if(!a.length)return'';const max=Math.max(.001,...a.flatMap(r=>[r.loss,r.valLoss])),points=key=>a.map((r,i)=>`${38+i/(Math.max(1,a.length-1))*480},${174-r[key]/max*150}`).join(' ');return`<svg viewBox="0 0 560 205" role="img" aria-label="交叉熵损失曲线，蓝色训练集，橙色验证留出集" style="width:100%;max-height:240px"><path d="M38 16V174H535" fill="none" stroke="#d3dfe5"/><text x="3" y="20" font-size="11" fill="#647785">${max.toFixed(2)}</text><text x="18" y="177" font-size="11" fill="#647785">0</text><polyline points="${points('loss')}" fill="none" stroke="#3276cd" stroke-width="2.5"/><polyline points="${points('valLoss')}" fill="none" stroke="#cf914c" stroke-width="2.5"/><text x="38" y="198" font-size="11" fill="#647785">第 1 轮</text><text x="464" y="198" font-size="11" fill="#647785">第 ${a.at(-1).epoch} 轮</text></svg><p class="muted">● <span style="color:#3276cd">训练损失</span>　● <span style="color:#cf914c">验证损失</span>　交叉熵越低越好</p>`;}
  function resultHTML(ctx){const r=ctx.state.result;if(!r?.test||!Array.isArray(r.test.confusion)||r.test.confusion.length!==ctx.state.classes.length)return'<div class="empty">完成训练后生成留出集混淆矩阵和分层评估</div>';const names=ctx.state.classes,t=r.test;
    return`<div class="toolbar" style="gap:24px;margin-bottom:18px"><div>留出集准确率<br><strong style="font-size:28px;color:#087e74">${finite(t.accuracy)?(t.accuracy*100).toFixed(1):'—'}%</strong></div><div>正确 / 总数<br><strong>${esc(t.correct)} / ${esc(t.total)}</strong></div><div>训练集准确率<br><strong>${finite(r.train?.accuracy)?(r.train.accuracy*100).toFixed(1):'—'}%</strong></div><div>留出交叉熵<br><strong>${finite(t.loss)?t.loss.toFixed(4):'—'}</strong></div></div><div style="overflow:auto"><table><caption style="text-align:left;margin-bottom:8px">混淆矩阵：行 = 真实类别，列 = 预测类别</caption><thead><tr><th>真实 ╲ 预测</th>${names.map(n=>`<th>${esc(n)}</th>`).join('')}<th>召回率</th></tr></thead><tbody>${t.confusion.map((row,i)=>`<tr><th>${esc(names[i])}</th>${(Array.isArray(row)?row:[]).map((v,j)=>`<td style="background:${i===j?'#e6f6ed':'#fff'}">${esc(v)}</td>`).join('')}<td>${finite(t.perClass?.[i]?.recall)?(t.perClass[i].recall*100).toFixed(1)+'%':'—'}</td></tr>`).join('')}</tbody></table></div><p class="muted">${esc(r.completedAt||'')} · ${esc(r.source||'用户图像')} · 训练 ${esc(r.train?.total)} / 留出 ${esc(t.total)} · 种子 ${esc(r.config?.seed)}。留出图像不参与梯度更新，但每轮用于监测验证损失；该分数不是独立生产验收结果。请避免同一物品连拍、近重复图像跨集合。</p>`;
  }
  function paintProgress(ctx){if(!ctx.active)return;const h=ctx.c.querySelector('#tl-history');if(h)h.innerHTML=chart(ctx.history);const p=ctx.c.querySelector('#tl-progress');if(p){p.value=ctx.progress||0;p.max=100;}const e=ctx.c.querySelector('#tl-epoch');if(e)e.textContent=ctx.history.length?`第 ${ctx.history.length} / ${ctx.state.config.epochs} 轮 · 训练 ${ctx.history.at(-1).loss.toFixed(4)} · 验证 ${ctx.history.at(-1).valLoss.toFixed(4)}`:'等待训练';}
  function paint(ctx){
    if(!ctx.active)return;const s=ctx.state,n=ctx.samples.length,disabled=ctx.training||ctx.busy?'disabled':'',source=ctx.samples.some(x=>x.synthetic)?'含合成教学图案，仅供流程演示':'用户图像需自行提供标签与质量审核';
    ctx.c.innerHTML=`<div class="page-head"><div><div class="eyebrow">VISUAL AI / REAL TRANSFER LEARNING</div><h1>图像迁移学习实验室</h1><p class="muted">添加真实图像 → 提取冻结特征 → 训练多类别神经网络 → 在留出图像上评估</p></div><span class="badge blue">TensorFlow.js · 本机真实训练</span></div><div class="notice">原图只在当前浏览器页面内存中解码和推理，不上传预测服务。保存内容为类别、参数、分类头权重与实验指标；刷新后需重新添加训练图像。未提供真实工业数据集，任何合成样本成绩都不代表工业识别能力。</div><div class="card"><div class="section-title"><h2>01 · 可视化网络结构</h2><span class="badge">骨干冻结 / 分类头可训练</span></div>${architecture(ctx)}<details><summary>预处理、来源与可复现性</summary><p class="muted">图像等比例缩放并以灰色补边为 300 × 300，输入 RGB int32（0–255）。模型内置双线性缩放和 2/255 − 1 归一化，不重复归一化。读取 Conv_1/Relu6 中间节点，空间平均得到 1280 维特征；分类头使用 Adam 和分类交叉熵。种子控制划分和初始权重；不同硬件浮点结果可能略有差异。模型与运行库来自本站静态资源，第一次仍需加载约 18 MB 权重。</p><p><a href="${MODEL.source}" target="_blank" rel="noopener noreferrer">模型源码与 Apache-2.0 许可</a></p></details></div>
      <div class="card" style="margin-top:18px"><div class="section-title"><h2>02 · 带标签的图像集</h2><span class="badge ${ctx.samples.some(x=>x.synthetic)?'amber':'blue'}">${n} / ${LIMITS.images} 张 · ${s.classes.length} 类</span></div><p class="muted">${source}。每类至少 5 张、最多 32 张不同图像；全局最多 96 张。JPEG / PNG / WebP，单张 ≤ 8 MB、≤ 3200 万像素。相同缩放像素会去重；近重复图像需人工检查。</p><div class="toolbar" style="margin-bottom:16px"><input id="tl-class-name" maxlength="32" placeholder="新类别，如：完好包裹" aria-label="新类别名称" ${disabled}><button class="btn" id="tl-add-class" ${disabled}>＋ 添加类别</button><button class="btn" id="tl-synthetic" ${disabled}>加载合成图案教学样本</button><button class="btn danger" id="tl-clear" ${disabled}>清空当前图像</button></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${s.classes.map((name,k)=>{const list=ctx.samples.filter(x=>x.label===k);return`<div class="card" style="padding:15px;background:#fafcfd"><div class="section-title" style="margin-bottom:10px"><h3>${esc(name)}</h3><span class="badge ${list.length<5?'amber':''}">${list.length} 张</span></div>${list.length>=5?`<p class="muted">本类划分：训练 ${list.length-Math.max(1,Math.round(list.length*s.config.testFraction))} / 留出 ${Math.max(1,Math.round(list.length*s.config.testFraction))}</p>`:''}<div class="toolbar"><label class="btn">添加图片<input data-upload="${k}" type="file" accept="image/jpeg,image/png,image/webp" multiple style="max-width:145px" ${disabled}></label>${s.classes.length>2?`<button class="btn danger" data-remove-class="${k}" aria-label="删除类别 ${esc(name)}" ${disabled}>移除类别</button>`:''}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">${list.map(x=>`<button class="btn" data-remove-image="${x.id}" aria-label="移除 ${esc(x.name)}" title="${esc(x.name)} · 点击移除" style="padding:2px;position:relative" ${disabled}><img src="${x.url}" alt="${esc(x.name)}" width="49" height="49" style="object-fit:contain;border-radius:3px"><span aria-hidden="true" style="position:absolute;right:0;top:0;background:white;font-size:10px">×</span></button>`).join('')}</div></div>`;}).join('')}</div></div>
      <div class="card" style="margin-top:18px"><div class="section-title"><h2>03 · 训练配置与进度</h2><span class="muted">分层留出 · 不参与梯度更新</span></div><div class="toolbar" style="align-items:start">${[['epochs','训练轮数',s.config.epochs,'number','min="1" max="120" step="1"'],['learningRate','学习率',s.config.learningRate,'number','min="0.0001" max="0.05" step="0.0001"'],['batchSize','批大小',s.config.batchSize,'number','min="1" max="32" step="1"'],['seed','随机种子',s.config.seed,'number','min="0" max="2147483647" step="1"']].map(([key,label,value,type,attr])=>`<label class="field">${label}<input data-config="${key}" type="${type}" value="${value}" ${attr} style="width:125px" ${disabled}></label>`).join('')}<label class="field">隐藏层神经元<select data-config="hidden" ${disabled}>${[16,32,64].map(v=>`<option value="${v}" ${v===s.config.hidden?'selected':''}>${v}</option>`).join('')}</select></label><label class="field">留出比例<select data-config="testFraction" ${disabled}>${[.2,.25,.3].map(v=>`<option value="${v}" ${v===s.config.testFraction?'selected':''}>${v*100}%</option>`).join('')}</select></label></div><div class="toolbar"><button class="btn primary" id="tl-train" ${disabled}>${ctx.training?'正在训练…':'提取特征并开始训练'}</button><button class="btn danger" id="tl-stop" ${ctx.training?'':'disabled'}>停止本次训练</button><button class="btn" id="tl-save" ${disabled}>保存工作区</button><button class="btn" id="tl-export" ${disabled}>导出模型 / 配置 / 报告</button><label class="btn">导入分类头<input type="file" id="tl-import" accept=".json,application/json" style="max-width:145px" ${disabled}></label></div><p id="tl-status" role="status" aria-live="polite" style="color:${ctx.error?'#ad4136':'#52746e'}">${esc(ctx.status||'等待添加图像。训练会运行真实卷积网络，CPU 设备可能需要数分钟。')}</p><progress id="tl-progress" value="${ctx.progress||0}" max="100" style="width:100%;accent-color:#128b7b" aria-label="特征提取与训练总体进度"></progress><p id="tl-epoch" class="muted"></p><div id="tl-history">${chart(ctx.history)}</div><p class="muted">${ctx.dirty?'有尚未保存的修改。':s.savedAt?'已保存：'+esc(s.savedAt):'尚未保存。'} 更改类别、图像或训练配置会清除旧分类头，避免误用过期结果。</p></div>
      <div class="card" style="margin-top:18px"><h2>04 · 留出集评估</h2>${resultHTML(ctx)}</div><div class="card" style="margin-top:18px"><div class="section-title"><h2>05 · 新图像预测</h2><span class="badge ${s.bundle?'':'gray'}">${s.bundle?'分类头已训练 / 可加载':'等待完成训练'}</span></div><p class="muted">请选择没有参加训练的新图像。Softmax 为当前类别间相对概率，不是经过校准的可靠度；模型会把未知物品也分到现有类别中。</p><label class="btn">选择待预测图片<input type="file" id="tl-predict" accept="image/jpeg,image/png,image/webp" ${disabled||!s.bundle?'disabled':''}></label>${ctx.prediction?`<div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin-top:18px"><img src="${ctx.prediction.url}" alt="待预测图像" width="150" height="150" style="object-fit:contain;border:1px solid #e5eaf0;border-radius:7px"><div style="flex:1;min-width:200px">${ctx.prediction.probabilities.map((p,k)=>`<div style="margin-bottom:10px"><div class="toolbar" style="justify-content:space-between"><span>${esc(s.classes[k])}</span><b>${(p*100).toFixed(2)}%</b></div><div style="background:#e9eff3;height:7px;border-radius:5px;margin-top:5px"><div style="width:${Math.max(0,Math.min(100,p*100))}%;height:7px;background:${k===ctx.prediction.index?'#0c9481':'#81adc1'};border-radius:5px"></div></div></div>`).join('')}<p class="muted">预测：${esc(s.classes[ctx.prediction.index])} · ${esc(ctx.prediction.backend)} 本机计算</p></div></div>`:''}</div>`;
    const q=id=>ctx.c.querySelector('#'+id);
    q('tl-add-class').onclick=safeAction(ctx,async()=>{const name=q('tl-class-name').value.trim();s.classes=validateClasses([...s.classes,name]);invalidate(ctx);await save(ctx);setStatus(ctx,'已添加类别，请添加训练图像');});
    q('tl-clear').onclick=safeAction(ctx,async()=>{ctx.samples=[];invalidate(ctx);await save(ctx);setStatus(ctx,'已清空当前图像与旧分类头');});
    q('tl-synthetic').onclick=safeAction(ctx,async()=>{if(ctx.samples.length)throw Error('教学样本会创建新的三类实验，请先清空当前图像');s.classes=['合成红色方块','合成蓝色圆形','合成绿色三角'];invalidate(ctx);ctx.samples=syntheticSamples();await save(ctx);setStatus(ctx,'已生成 18 张合成图案，只验证真实训练流程，不代表真实物品精度');});
    ctx.c.querySelectorAll('[data-remove-class]').forEach(b=>b.onclick=safeAction(ctx,async()=>{const k=Number(b.dataset.removeClass);s.classes.splice(k,1);ctx.samples=ctx.samples.filter(x=>x.label!==k).map(x=>({...x,label:x.label>k?x.label-1:x.label}));invalidate(ctx);await save(ctx);}));
    ctx.c.querySelectorAll('[data-remove-image]').forEach(b=>b.onclick=safeAction(ctx,async()=>{ctx.samples=ctx.samples.filter(x=>x.id!==Number(b.dataset.removeImage));invalidate(ctx);await save(ctx);}));
    ctx.c.querySelectorAll('[data-upload]').forEach(input=>input.onchange=safeAction(ctx,async()=>{await addFiles(ctx,Array.from(input.files||[]),Number(input.dataset.upload));}));
    ctx.c.querySelectorAll('[data-config]').forEach(input=>input.onchange=safeAction(ctx,async()=>{s.config=validateConfig({...s.config,[input.dataset.config]:Number(input.value)});invalidate(ctx);await save(ctx);}));
    q('tl-save').onclick=safeAction(ctx,async()=>{await save(ctx);setStatus(ctx,'工作区已保存；训练图像仅保留在当前页面内存');});
    q('tl-export').onclick=safeAction(ctx,async()=>{const output={format:'image-transfer-experiment-v1',exportedAt:stamp(),classes:s.classes,config:s.config,model:s.bundle,result:s.result,modelSource:MODEL,warning:'User images and pretrained backbone bytes are not included. Synthetic metrics do not establish real-world accuracy. Use the same application/model asset for re-import.'};download('image-transfer-experiment.json',output);setStatus(ctx,s.bundle?'已导出真实分类头权重、配置与实验指标':'已导出配置；当前尚无已完成的模型');});
    q('tl-import').onchange=safeAction(ctx,async()=>{const file=q('tl-import').files?.[0];if(!file)return;if(file.size>LIMITS.importBytes)throw Error('模型文件不得超过 3 MB');const raw=JSON.parse(await file.text()),bundle=validateBundle(raw.model||raw);const tf=await runtime(),head=restoreHead(tf,bundle);if(!ctx.active){disposeHead(head);return;}invalidate(ctx);ctx.head=head;ctx.samples=[];s.classes=bundle.classes;s.config=bundle.config;s.bundle=bundle;await save(ctx);setStatus(ctx,'已载入分类头，可预测新图像；未采用导入文件声称的评估成绩');});
    q('tl-train').onclick=()=>{if(ctx.training||ctx.busy||ctx.task)return;ctx.task=train(ctx).catch(error=>{ctx.history=ctx.state.result?.history?.slice()||[];ctx.progress=ctx.state.bundle?100:0;if(error.name==='AbortError')setStatus(ctx,error.message);else{setStatus(ctx,error.message,true);root.toast?.(error.message);}}).finally(()=>{ctx.training=false;ctx.task=null;if(ctx.active)paint(ctx);});return ctx.task;};
    q('tl-stop').onclick=()=>{ctx.cancel=true;setStatus(ctx,'正在停止，当前图像计算或训练批次结束后退出…');q('tl-stop').disabled=true;};
    q('tl-predict').onchange=()=>{if(ctx.training||ctx.busy||ctx.task)return;const file=q('tl-predict').files?.[0];if(!file)return;ctx.busy=true;ctx.task=predict(ctx,file).catch(error=>{if(error.name!=='AbortError')setStatus(ctx,error.message,true);}).finally(()=>{ctx.busy=false;ctx.task=null;if(ctx.active)paint(ctx);});paint(ctx);return ctx.task;};
    paintProgress(ctx);
  }
  let nextImage=1;
  function sampleFromCanvas(canvas,label,name,synthetic=false){const data=canvas.getContext('2d').getImageData(0,0,300,300);return{id:nextImage++,label,name,synthetic,canvas,url:canvas.toDataURL('image/jpeg',.76),fingerprint:fingerprint(data.data),embedding:null};}
  async function decodeFile(file,label=0){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('只支持 JPEG、PNG 和 WebP 图像');if(file.size<=0||file.size>LIMITS.fileBytes)throw Error('单张图像须为非空文件且不超过 8 MB');
    const url=URL.createObjectURL(file);let image,timer;
    try{image=await new Promise((resolve,reject)=>{const i=new Image();timer=setTimeout(()=>reject(Error('图像解码超时')),20000);i.onload=()=>resolve(i);i.onerror=()=>reject(Error('无法解码图像，请检查文件格式'));i.src=url;});if(image.naturalWidth*image.naturalHeight>LIMITS.pixels||image.naturalWidth<1||image.naturalHeight<1)throw Error('图像尺寸无效或超过 3200 万像素');const canvas=document.createElement('canvas');canvas.width=canvas.height=300;const c=canvas.getContext('2d');c.fillStyle='#7f7f7f';c.fillRect(0,0,300,300);const ratio=Math.min(300/image.naturalWidth,300/image.naturalHeight),w=Math.max(1,Math.round(image.naturalWidth*ratio)),h=Math.max(1,Math.round(image.naturalHeight*ratio));c.drawImage(image,Math.floor((300-w)/2),Math.floor((300-h)/2),w,h);return sampleFromCanvas(canvas,label,file.name.slice(0,160));}finally{clearTimeout(timer);URL.revokeObjectURL(url);if(image)image.src='';}
  }
  function syntheticSamples(){const list=[],rng=random(902);for(let k=0;k<3;k++)for(let n=0;n<6;n++){const c=document.createElement('canvas');c.width=c.height=300;const x=c.getContext('2d'),p=50+Math.floor(rng()*35),size=130+Math.floor(rng()*40);x.fillStyle=`rgb(${215+Math.floor(rng()*30)},${215+Math.floor(rng()*30)},${215+Math.floor(rng()*30)})`;x.fillRect(0,0,300,300);x.fillStyle=['#cd4b37','#3264ba','#2b9858'][k];if(k===0)x.fillRect(p,p,size,size);else if(k===1){x.beginPath();x.arc(150+(rng()-.5)*20,150+(rng()-.5)*20,size/2,0,Math.PI*2);x.fill();}else{x.beginPath();x.moveTo(150,p);x.lineTo(240,240-(rng()*20));x.lineTo(60,240-(rng()*20));x.closePath();x.fill();}list.push(sampleFromCanvas(c,k,`合成教学图案-${k+1}-${n+1}.png`,true));}return list;}
  async function addFiles(ctx,files,label){
    if(!files.length)return;const existing=ctx.samples.filter(x=>x.label===label).length;if(files.length+ctx.samples.length>LIMITS.images||existing+files.length>LIMITS.perClass)throw Error('超过数量限制：每类 32 张、全局 96 张');
    const staged=[],known=new Set(ctx.samples.map(x=>x.fingerprint));let duplicates=0;
    for(let i=0;i<files.length;i++){checkCancel(()=>!ctx.active);setStatus(ctx,`本地解码图像 ${i+1} / ${files.length}…`);const sample=await decodeFile(files[i],label);checkCancel(()=>!ctx.active);if(known.has(sample.fingerprint)){duplicates++;continue;}known.add(sample.fingerprint);staged.push(sample);await pause();}
    if(staged.length){ctx.samples.push(...staged);invalidate(ctx);await save(ctx);}setStatus(ctx,`添加 ${staged.length} 张图像${duplicates?'；跳过 '+duplicates+' 张相同缩放像素图像':''}`);
  }
  async function train(ctx){
    if(root.PresetDemo?.enabled)throw Error('预设演示模式仅支持样例 / 流程回放，实际模型执行已关闭。');
    const config=validateConfig(ctx.state.config),classes=validateClasses(ctx.state.classes),labels=ctx.samples.map(x=>x.label);stratifiedSplit(labels,classes.length,config.testFraction,config.seed);
    ctx.training=true;ctx.cancel=false;ctx.progress=0;ctx.history=[];paint(ctx);let result;
    try{
      const {tf,graph}=await backbone(text=>setStatus(ctx,text));checkCancel(()=>ctx.cancel||!ctx.active);setStatus(ctx,'提取冻结 MobileNetV2 特征…');
      const features=[];for(let i=0;i<ctx.samples.length;i++){checkCancel(()=>ctx.cancel||!ctx.active);const sample=ctx.samples[i];if(!sample.embedding){let t;try{t=tf.browser.fromPixels(sample.canvas,3);sample.embedding=await extractEmbedding(tf,graph,t);}finally{t?.dispose();}}features.push(sample.embedding);ctx.progress=(i+1)/ctx.samples.length*55;setStatus(ctx,`真实特征提取 ${i+1} / ${ctx.samples.length} · ${tf.getBackend()} · 1280 维`);paintProgress(ctx);await pause();}
      checkCancel(()=>ctx.cancel||!ctx.active);setStatus(ctx,'冻结骨干，仅对新分类头执行反向传播…');
      result=await trainHead(tf,features,labels,classes.length,config,{isCanceled:()=>ctx.cancel||!ctx.active,onEpoch:(row,history)=>{ctx.history=history.slice();ctx.progress=55+row.epoch/config.epochs*45;paintProgress(ctx);}});
      checkCancel(()=>ctx.cancel||!ctx.active);const bundle=serializeHead(result.head,classes,config);disposeHead(ctx.head);ctx.head=result.head;result.head=null;ctx.state.bundle=bundle;ctx.state.result={completedAt:stamp(),source:ctx.samples.every(x=>x.synthetic)?'合成图案教学样本':ctx.samples.some(x=>x.synthetic)?'混合图像（含合成教学样本）':'用户上传图像',config,history:result.history,split:result.split,train:result.train,test:result.test,backend:tf.getBackend(),runtime:tf.version.tfjs};ctx.dirty=true;ctx.progress=100;await save(ctx);setStatus(ctx,`训练完成并保存 · 留出集 ${result.test.correct}/${result.test.total} 正确（${(result.test.accuracy*100).toFixed(1)}%），请结合样本规模解读`);
    }finally{if(result?.head)disposeHead(result.head);}
  }
  async function predict(ctx,file){
    ctx.cancel=false;const sample=await decodeFile(file);checkCancel(()=>!ctx.active||ctx.cancel);setStatus(ctx,'对新图像执行真实预训练特征提取与分类…');const {tf,graph}=await backbone(text=>setStatus(ctx,text));checkCancel(()=>!ctx.active||ctx.cancel);if(!ctx.head)ctx.head=restoreHead(tf,ctx.state.bundle);let input,x,p;
    try{input=tf.browser.fromPixels(sample.canvas,3);const embedding=await extractEmbedding(tf,graph,input);checkCancel(()=>!ctx.active||ctx.cancel);x=tf.tensor2d([embedding],[1,1280]);p=ctx.head.predict(x);const probabilities=Array.from(await p.data());checkCancel(()=>!ctx.active||ctx.cancel);if(probabilities.some(v=>!finite(v)))throw Error('预测出现非有限结果');ctx.prediction={url:sample.url,probabilities,index:probabilities.indexOf(Math.max(...probabilities)),backend:tf.getBackend()};setStatus(ctx,'新图像预测完成。未知物品也会被分到现有类别，请人工复核。');}finally{input?.dispose();x?.dispose();p?.dispose();}
  }
  async function stop(){const ctx=current;if(!ctx)return;ctx.cancel=true;ctx.active=false;if(ctx.task)await ctx.task;if(ctx.pending)await ctx.pending.catch(()=>{});try{if(ctx.dirty)await save(ctx);}catch(e){ctx.active=true;ctx.cancel=false;paint(ctx);throw e;}disposeHead(ctx.head);ctx.head=null;ctx.samples=[];ctx.prediction=null;if(current===ctx)current=null;}
  async function render(c){await stop();const id=++generation,ctx={c,active:true,cancel:false,busy:false,training:false,samples:[],history:[],state:newState(),status:'',dirty:false};current=ctx;c.innerHTML='<div class="card">正在载入迁移学习工作区…</div>';try{const raw=await root.api('transfer_learning');if(!ctx.active||id!==generation)return;ctx.state=loadState(raw);ctx.history=Array.isArray(ctx.state.result?.history)?ctx.state.result.history.filter(x=>x&&finite(x.loss)&&finite(x.valLoss)).slice(0,120):[];if(ctx.state.bundle)ctx.status='已恢复分类头，可直接预测新图像；训练图像未持久保存。';paint(ctx);}catch(e){if(!ctx.active)return;c.innerHTML=`<div class="card"><h2>工作区载入失败</h2><p>${esc(e.message)}</p><button class="btn" id="tl-retry">重试</button></div>`;c.querySelector('#tl-retry').onclick=()=>render(c);}}
  const helpers={MODEL,LIMITS,DEFAULTS,validateClasses,validateConfig,stratifiedSplit,fingerprint,createHead,disposeHead,extractEmbedding,trainHead,evaluateHead,metricsFromProbabilities,serializeHead,validateBundle,restoreHead,loadState,validateResult};
  root.Transfer={render,stop,helpers};if(typeof module!=='undefined'&&module.exports)module.exports=helpers;
})(typeof window!=='undefined'?window:globalThis);
