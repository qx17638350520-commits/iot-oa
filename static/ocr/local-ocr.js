/* Local text OCR only. Self-hosted Apache-2.0 Tesseract.js 6.0.1. */
(function (global) {
'use strict';
const scriptBase = typeof document !== 'undefined' ? new URL('.', document.currentScript?.src || location.href).href : '';
function words(data) {
 const result=[];
 for(const block of data.blocks||[]) for(const paragraph of block.paragraphs||[]) for(const line of paragraph.lines||[]) for(const word of line.words||[]) {
  if(word.text?.trim()) result.push({text:word.text,confidence:word.confidence,bbox:{...word.bbox}});
 }
 return result;
}
class Engine {
 constructor(options={}) { this.options=options;this.current=null; }
 async recognize(input, options={}) {
    if(global.PresetDemo?.enabled)throw Error('预设演示模式仅支持样例 / 流程回放，实际模型执行已关闭。');
  if(this.current) throw Error('已有识别任务运行中，请等待或取消。');
  const operation={cancelled:false,worker:null};this.current=operation;
  const abort=new Promise((_,reject)=>operation.reject=reject);
  const run=(async()=>{
   const T=this.options.Tesseract||global.Tesseract;
   if(!T) throw Error('本地 OCR 引擎未加载，请检查静态资源。');
   const languages=options.languages||'chi_sim+eng';
   if(!['chi_sim+eng','chi_sim','eng'].includes(languages)) throw Error('仅安装简体中文和英文语言模型。');
   const config={workerPath:scriptBase+'vendor/worker.min.js',corePath:scriptBase+'vendor/core',langPath:scriptBase+'vendor/lang',workerBlobURL:false,gzip:true,cacheMethod:'none',...this.options.workerOptions,logger:event=>{if(!operation.cancelled&&this.current===operation)options.onProgress?.(event);},errorHandler:error=>operation.reject(Error(String(error)))};
   const worker=await T.createWorker(languages,1,config);operation.worker=worker;
   if(operation.cancelled){await worker.terminate();throw Error('识别已取消');}
   await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
   const {data}=await worker.recognize(input,options.rectangle?{rectangle:options.rectangle}:{},{text:true,blocks:true});
   return {schema:'local-text-ocr.v1',engine:'Tesseract.js',engineVersion:'6.0.1',languages,text:data.text||'',confidence:data.confidence,words:words(data),automaticInference:true,inferenceLocation:typeof document==='undefined'?'local_node_wasm':'local_browser_wasm',semantics:'text_only_no_gauge_or_diagram_understanding',recognizedAt:new Date().toISOString()};
  })();
  const timer=setTimeout(()=>this.cancel('识别超时，请裁剪或缩小图片后重试。'),this.options.timeoutMs||120000);
  try{return await Promise.race([run,abort]);}
  finally{clearTimeout(timer);operation.cancelled=true;this.current=null;if(operation.worker) await operation.worker.terminate();}
 }
 cancel(message='识别已取消') {const op=this.current;if(!op)return;op.cancelled=true;op.reject(Error(message));if(op.worker)op.worker.terminate();}
}
function mount(container,options={}) {
 const el=document.createElement('section');el.className='local-ocr';container.appendChild(el);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 el.innerHTML=`<style>.local-ocr{font:14px/1.6 system-ui,sans-serif;color:#243b53}.local-ocr *{box-sizing:border-box}.local-ocr .lo-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px}.local-ocr .lo-card{border:1px solid #d8e3ef;border-radius:12px;padding:18px;background:white}.local-ocr button,.local-ocr select,.local-ocr textarea{font:inherit;border:1px solid #cad9e8;border-radius:6px;padding:8px 12px;background:#fff;color:#24425f}.local-ocr button{cursor:pointer;margin:4px}.local-ocr button:disabled{opacity:.45;cursor:default}.local-ocr .lo-primary{background:#236dce;color:white}.local-ocr textarea{width:100%;resize:vertical}.local-ocr canvas{width:100%;height:auto;background:#f2f6fa;touch-action:none;border:1px solid #e2e9f2;margin-top:12px;cursor:crosshair}.local-ocr label{display:block;margin:12px 0}.local-ocr p{color:#597087}.local-ocr .lo-note{background:#eef5fc;padding:12px;border-radius:8px;font-size:12px}.local-ocr progress{width:100%}.local-ocr .lo-status{min-height:50px}.local-ocr .lo-words{max-height:160px;overflow:auto;font-size:12px}.local-ocr input[type=file]{max-width:100%}@media(max-width:950px){.local-ocr .lo-grid{grid-template-columns:1fr}}</style><h3>真实文字 OCR · 本地推理</h3><p>上传图片 → 校正旋转 / 框选范围 → 识别 → 人工校对 → 导出</p><div class="lo-note">图像仅在本浏览器内处理。引擎及语言包从本站加载，不调用第三方图像服务。当前支持简体中文与英文；仅识别文字，不读取指针仪表含义或理解工程图。</div><div class="lo-grid"><div class="lo-card"><label>选择 PNG / JPEG / WebP（最大 8 MB）<input data-file type="file" accept="image/png,image/jpeg,image/webp"></label><button data-do="sample">生成中英测试图（实际识别）</button><button data-do="rotate" disabled>顺时针旋转 90°</button><button data-do="clear-roi" disabled>识别整图 / 清除框选</button><canvas width="1000" height="550" aria-label="OCR 图片及识别框"></canvas><p data-source>尚未载入图片</p><small>在图片上拖拽可框选单一区域。旋转或切换图片会清除旧结果与框选。</small></div><div class="lo-card"><label>识别语言<select data-lang><option value="chi_sim+eng">简体中文 + English</option><option value="chi_sim">简体中文</option><option value="eng">English</option></select></label><button class="lo-primary" data-do="recognize" disabled>开始真实 OCR</button><button data-do="cancel" disabled>取消识别</button><progress max="1" value="0"></progress><p role="status" aria-live="polite" class="lo-status" data-status>请上传图片或生成测试图。</p><label>人工校对文本<textarea data-text rows="9" placeholder="真实模型结果会显示在此，可人工修改"></textarea></label><button data-do="txt">导出校对 TXT</button><button data-do="json">导出结果与坐标 JSON</button><p data-confidence>尚无识别结果</p><div class="lo-words" data-words></div><small>置信度是模型内部评分，非准确率保证。建议校对型号、数字和安全提示。不会以固定样例冒充识别结果。</small></div></div>`;
 const q=s=>el.querySelector(s),canvas=q('canvas'),ctx=canvas.getContext('2d'),engine=new Engine(options);
 let image=null,rotation=0,roi=null,result=null,source='',busy=false,dead=false,loadToken=0,drag=null;
 const status=s=>{if(!dead)q('[data-status]').textContent=s;};
 function buttons(){for(const name of ['rotate','clear-roi','recognize'])q(`[data-do="${name}"]`).disabled=busy||!image;q('[data-do="cancel"]').disabled=!busy;q('[data-file]').disabled=busy;q('[data-do="sample"]').disabled=busy;q('[data-lang]').disabled=busy;}
 function raster(){const c=document.createElement('canvas');const swap=rotation%180!==0;c.width=swap?image.height:image.width;c.height=swap?image.width:image.height;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.translate(c.width/2,c.height/2);x.rotate(rotation*Math.PI/180);x.drawImage(image,-image.width/2,-image.height/2);return c;}
 function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);if(!image)return;const c=raster();canvas.width=c.width;canvas.height=c.height;ctx.drawImage(c,0,0);ctx.lineWidth=Math.max(2,c.width/500);for(const word of result?.words||[]){const b=word.bbox;ctx.strokeStyle='#15834d';ctx.strokeRect(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);}if(roi){ctx.strokeStyle='#246fe0';ctx.setLineDash([10,6]);ctx.strokeRect(roi.left,roi.top,roi.width,roi.height);ctx.setLineDash([]);}}
 function reset(){result=null;roi=null;q('[data-text]').value='';q('[data-confidence]').textContent='尚无识别结果';q('[data-words]').replaceChildren();q('progress').value=0;}
 function showSource(){q('[data-source]').textContent=`${source} · ${canvas.width} × ${canvas.height} 像素 · 顺时针 ${rotation}°`;}
 async function loadFile(file){const token=++loadToken;if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>8*1024*1024)throw Error('请选择 8 MB 以内的 PNG/JPEG/WebP 图片。');const url=URL.createObjectURL(file);try{const im=new Image();await new Promise((yes,no)=>{im.onload=yes;im.onerror=()=>no(Error('图片无法解码'));im.src=url;});if(dead||token!==loadToken)return;if(im.width*im.height>16000000)throw Error('图片超过 1600 万像素，请先缩小图片。');image=im;rotation=0;source=file.name;reset();draw();showSource();buttons();status('图片就绪。可旋转校正或拖拽框选后识别。');}finally{URL.revokeObjectURL(url);}}
 function sample(){loadToken++;const c=document.createElement('canvas');c.width=1400;c.height=500;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='#152638';x.font='52px sans-serif';x.fillText('工业传感器  温度检测',70,100);x.fillText('INDUSTRIAL SENSOR',70,190);x.fillText('MODEL TH-204   POWER DC 24V',70,280);x.fillText('安全生产  注意防护',70,370);image=c;rotation=0;source='程序生成的中英测试图（非固定识别结果）';reset();draw();showSource();buttons();status('测试图已生成；点击“开始真实 OCR”运行模型。');}
 function download(name,body,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([body],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const stages={'loading tesseract core':'加载本地 WASM 引擎','initializing tesseract':'初始化引擎','loading language traineddata':'加载中文 / 英文语言包','initializing api':'准备识别','recognizing text':'正在识别文字'};
 async function recognize(){if(busy||!image)return;busy=true;result=null;q('[data-text]').value='';q('[data-words]').replaceChildren();q('[data-confidence]').textContent='识别进行中';draw();buttons();try{const started=performance.now();const r=await engine.recognize(raster(),{languages:q('[data-lang]').value,rectangle:roi,onProgress:event=>{if(dead)return;q('progress').value=Number(event.progress)||0;status((stages[event.status]||event.status)+' '+Math.round((event.progress||0)*100)+'%');}});if(dead)return;result={...r,source,rotation,coordinateSpace:{width:canvas.width,height:canvas.height,origin:'top_left_of_rotated_image'},rectangle:roi,elapsedMs:Math.round(performance.now()-started)};q('[data-text]').value=result.text;q('[data-confidence]').textContent=`模型置信评分：${Number(result.confidence).toFixed(1)} / 100 · ${result.words.length} 个文字框 · ${(result.elapsedMs/1000).toFixed(1)} 秒`;q('[data-words]').innerHTML=result.words.map(w=>`<div>${esc(w.text)} · ${Number(w.confidence).toFixed(0)}</div>`).join('');q('progress').value=1;draw();status(result.text.trim()?'识别完成，请人工校对后导出。':'未检测到文字。请校正方向、提高分辨率或缩小识别范围；未载入替代样例。');}catch(error){if(!dead){q('[data-confidence]').textContent='此次识别未完成';status(error.message+'（未用样例替代）');}}finally{busy=false;if(!dead)buttons();}}
 el.onclick=async event=>{const action=event.target.closest('[data-do]')?.dataset.do;if(!action)return;try{if(action==='cancel'){engine.cancel();return;}if(action==='recognize'){await recognize();return;}if(action==='sample'){sample();return;}if(action==='rotate'&&!busy){rotation=(rotation+90)%360;reset();draw();showSource();status('已旋转，旧结果已清除。');}if(action==='clear-roi'&&!busy){roi=null;result=null;q('[data-text]').value='';q('[data-words]').replaceChildren();q('[data-confidence]').textContent='尚无识别结果';draw();status('将识别整张图片。');}if(action==='txt')download('ocr-corrected.txt',q('[data-text]').value,'text/plain;charset=utf-8');if(action==='json')download('ocr-result.json',JSON.stringify({schema:'local-text-ocr-export.v1',result,correctedText:q('[data-text]').value,manuallyEdited:result?result.text!==q('[data-text]').value:true,automaticInference:!!result,source,rotation,coordinateSpace:{width:canvas.width,height:canvas.height},rectangle:roi},null,2),'application/json');}catch(error){status(error.message);}};
 q('[data-file]').onchange=async event=>{try{const f=event.target.files[0];if(f)await loadFile(f);}catch(error){status(error.message);}finally{event.target.value='';}};
 function point(event){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(canvas.width,Math.round((event.clientX-r.left)*canvas.width/r.width))),y:Math.max(0,Math.min(canvas.height,Math.round((event.clientY-r.top)*canvas.height/r.height)))};}
 canvas.onpointerdown=e=>{if(busy||!image)return;drag=point(e);canvas.setPointerCapture(e.pointerId);};
 canvas.onpointerup=e=>{if(!drag||busy)return;const p=point(e),box={left:Math.min(p.x,drag.x),top:Math.min(p.y,drag.y),width:Math.abs(p.x-drag.x),height:Math.abs(p.y-drag.y)};drag=null;if(box.width<8||box.height<8)return;roi=box;result=null;q('[data-text]').value='';q('[data-words]').replaceChildren();q('[data-confidence]').textContent='尚无识别结果';draw();status(`已框选 ${box.width} × ${box.height} 像素，开始 OCR 后只识别此范围。`);};
 canvas.onpointercancel=()=>{drag=null;};
 return {destroy(){dead=true;loadToken++;engine.cancel();el.remove();},engine,element:el};
}
const api={Engine,words,mount};global.LocalOCR=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
