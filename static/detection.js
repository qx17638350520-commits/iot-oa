/*
 * Real browser-local object detection, using the official TensorFlow.js COCO-SSD model.
 * Libraries and weights are vendored from the official sources below, then loaded same-origin with SRI.
 * Weights: https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json
 * Upstream: https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd
 * TensorFlow.js and COCO-SSD code: Google LLC, Apache-2.0.
 * License: https://github.com/tensorflow/tfjs-models/blob/master/LICENSE
 * No image is sent to a prediction endpoint. detect() receives only a local image/canvas.
 * This general COCO model has 80 classes; it is not an industrial equipment classifier.
 */
(function (host) {
  'use strict';
  const ASSET_BASE=typeof document!=='undefined'&&document.currentScript?new URL('vendor/vision/',document.currentScript.src).href:'./static/vendor/vision/';
  const MODEL = Object.freeze({name:'COCO-SSD',version:'2.2.3',base:'lite_mobilenet_v2',runtime:'TensorFlow.js 4.22.0',
    modelUrl:ASSET_BASE+'model.json',upstreamModelUrl:'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json',
    source:'https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd',license:'Apache-2.0'});
  const SOURCES = Object.freeze([
    {name:'TensorFlow.js',url:ASSET_BASE+'tf.min.js',upstream:'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',integrity:'sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre',global:'tf'},
    {name:'COCO-SSD',url:ASSET_BASE+'coco-ssd.min.js',upstream:'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',integrity:'sha384-7qLdgfEQyO9ZQi9ArRHigK+IBto4XPk468jAqc+fnsXaZIcMAhQeLwzggRK7aESl',global:'cocoSsd'}
  ]);
  const CLASS_NAMES = Object.freeze({
    person:'人',bicycle:'自行车',car:'汽车',motorcycle:'摩托车',airplane:'飞机',bus:'公交车',train:'火车',truck:'卡车',boat:'船',
    'traffic light':'交通信号灯','fire hydrant':'消防栓','stop sign':'停车标志','parking meter':'停车计时器',bench:'长椅',bird:'鸟',cat:'猫',dog:'狗',horse:'马',sheep:'羊',cow:'牛',elephant:'大象',bear:'熊',zebra:'斑马',giraffe:'长颈鹿',backpack:'背包',umbrella:'雨伞',handbag:'手提包',tie:'领带',suitcase:'行李箱',frisbee:'飞盘',skis:'滑雪板',snowboard:'单板滑雪板','sports ball':'球',kite:'风筝','baseball bat':'棒球棒','baseball glove':'棒球手套',skateboard:'滑板',surfboard:'冲浪板','tennis racket':'网球拍',bottle:'瓶子','wine glass':'酒杯',cup:'杯子',fork:'叉子',knife:'刀',spoon:'勺子',bowl:'碗',banana:'香蕉',apple:'苹果',sandwich:'三明治',orange:'橙子',broccoli:'西兰花',carrot:'胡萝卜','hot dog':'热狗',pizza:'披萨',donut:'甜甜圈',cake:'蛋糕',chair:'椅子',couch:'沙发','potted plant':'盆栽',bed:'床','dining table':'餐桌',toilet:'马桶',tv:'电视',laptop:'笔记本电脑',mouse:'鼠标',remote:'遥控器',keyboard:'键盘','cell phone':'手机',microwave:'微波炉',oven:'烤箱',toaster:'烤面包机',sink:'水槽',refrigerator:'冰箱',book:'书',clock:'时钟',vase:'花瓶',scissors:'剪刀','teddy bear':'泰迪熊','hair drier':'吹风机',toothbrush:'牙刷'
  });
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function labelFor(name){return CLASS_NAMES[name] ? CLASS_NAMES[name]+' / '+name : String(name);}
  // Pure helper: validates real output, filters by score and clips rectangles to image bounds.
  function normalizePredictions(predictions,width,height,threshold=.5){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('图像尺寸无效');
    if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw new Error('置信度阈值必须在 0 到 1 之间');
    if(!Array.isArray(predictions))throw new Error('模型返回格式无效');
    return predictions.flatMap(p=>{
      if(!p||!Object.hasOwn(CLASS_NAMES,p.class)||!Number.isFinite(p.score)||p.score<threshold||p.score>1||!Array.isArray(p.bbox)||p.bbox.length!==4||!p.bbox.every(Number.isFinite))return [];
      const [left,top,bw,bh]=p.bbox;if(bw<=0||bh<=0)return [];
      const x=Math.round(clamp(left,0,width)),y=Math.round(clamp(top,0,height));
      const right=Math.round(clamp(left+bw,0,width)),bottom=Math.round(clamp(top+bh,0,height));
      if(right<=x||bottom<=y)return [];
      return [{type:'rectangle',className:p.class,displayName:labelFor(p.class),x,y,w:right-x,h:bottom-y,confidence:p.score}];
    });
  }
  // Pure import helper: every displayed prediction comes from the supplied inference output.
  // Existing human edits and annotations are retained; callers choose replacement explicitly.
  function importPredictions(workspace,predictions,options={}){
    const labels=(workspace.labels||[]).map(x=>({...x}));
    let annotations=(workspace.annotations||[]).map(x=>({...x}));
    const mapped=normalizePredictions(predictions,workspace.width,workspace.height,options.threshold??.5);
    if(options.replaceAI){const removed=new Set(annotations.filter(a=>a.source==='ai'&&!a.reviewed).map(a=>a.id));annotations=annotations.filter(a=>!removed.has(a.id)).map(a=>removed.has(a.parentId)?{...a,parentId:null}:a);}
    let nextId=Math.max(Number(workspace.nextId)||1,...annotations.map(a=>Number(a.id)+1||1));
    let nextLabel=Math.max(0,...labels.map(l=>Number(l.id)||0))+1;
    let group=labels.find(l=>l.source==='coco-group');
    const created=[];
    if(mapped.length&&!group){group={id:nextLabel++,name:'AI 通用物体 · COCO',parent:null,color:'#487dd0',source:'coco-group'};labels.push(group);}
    for(const box of mapped){
      let category=labels.find(l=>l.source==='coco-ssd'&&l.modelClass===box.className);
      if(!category){category={id:nextLabel++,name:box.displayName,parent:group.id,color:['#487dd0','#19a78e','#ab73d9','#ce8750','#dc6b88'][nextLabel%5],source:'coco-ssd',modelClass:box.className};labels.push(category);}
      const a={id:nextId++,type:'rectangle',labelId:category.id,x:box.x,y:box.y,w:box.w,h:box.h,parentId:null,source:'ai',model:MODEL.name,modelVersion:MODEL.version,modelBase:MODEL.base,modelClass:box.className,confidence:box.confidence,reviewed:false};annotations.push(a);created.push(a.id);
    }
    return {labels,annotations,nextId,created};
  }
  const scripts=new Map();let modelPromise=null,lastPhase='尚未加载模型',busy=false;
  function script(source){
    if(host[source.global])return Promise.resolve();
    if(scripts.has(source.url))return scripts.get(source.url);
    const promise=new Promise((resolve,reject)=>{
      const el=document.createElement('script');el.src=source.url;el.async=true;el.crossOrigin='anonymous';el.integrity=source.integrity;el.referrerPolicy='no-referrer';
      const timeout=setTimeout(()=>{el.remove();reject(new Error(source.name+' 下载超时，请检查网络后重试。'));},45000);
      el.onload=()=>{clearTimeout(timeout);if(host[source.global])resolve();else reject(new Error(source.name+' 未正确初始化。'));};
      el.onerror=()=>{clearTimeout(timeout);el.remove();reject(new Error(source.name+' 加载失败，请检查当前站点网络并刷新页面。'));};document.head.appendChild(el);
    }).catch(e=>{scripts.delete(source.url);throw e;});scripts.set(source.url,promise);return promise;
  }
  async function load(onStatus=()=>{}){
    if(modelPromise){onStatus(lastPhase);return modelPromise;}
    const phase=text=>{lastPhase=text;onStatus(text);};
    modelPromise=(async()=>{
      phase('正在加载 TensorFlow.js 运行库…');await script(SOURCES[0]);
      phase('正在加载 COCO-SSD 模型代码…');await script(SOURCES[1]);
      try{if(!await host.tf.setBackend('webgl'))throw new Error('WebGL unavailable');await host.tf.ready();}
      catch(e){phase('GPU 不可用，改用本机 CPU…');await host.tf.setBackend('cpu');await host.tf.ready();}
      phase('正在下载模型权重并初始化，首次使用可能需要 1–2 分钟…');
      let expired=false,timer;
      const pending=host.cocoSsd.load({base:MODEL.base,modelUrl:MODEL.modelUrl});
      pending.then(model=>{if(expired)model.dispose();},()=>{});
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('模型下载或初始化超时。请检查当前站点网络并重试；低性能设备的首次初始化可能较慢。'));},120000);});
      let model;try{model=await Promise.race([pending,timeout]);}finally{clearTimeout(timer);}
      phase('模型已就绪 · '+(host.tf.getBackend()==='webgl'?'WebGL':'CPU')+' 本机推理');return model;
    })().catch(e=>{modelPromise=null;lastPhase='模型加载失败';throw e;});return modelPromise;
  }
  async function detect(image,options={}){
    if(busy)throw new Error('当前已有识别任务，请稍候。');
    const threshold=Number(options.threshold??.5);
    if(!Number.isFinite(threshold)||threshold<.1||threshold>.95)throw new Error('请设置 10%–95% 的置信度阈值');
    busy=true;const report=options.onStatus||(()=>{});
    try{
      const model=await load(report);report('正在本机识别图像…');
      // Browser-local TensorFlow inference. This argument is never serialized or uploaded.
      const predictions=await model.detect(image,50,threshold);
      if(!Array.isArray(predictions))throw new Error('模型未返回有效检测结果');
      return {predictions,backend:host.tf.getBackend(),model:MODEL};
    }finally{busy=false;}
  }
  const api=Object.freeze({MODEL,SOURCES,CLASS_NAMES,labelFor,normalizePredictions,importPredictions,load,detect});
  host.VisionDetection=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
