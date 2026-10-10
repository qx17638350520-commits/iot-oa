/* Isolated, fictional teaching workspace. No model execution is performed here. */
(function(root){
'use strict';
const kind=root.PRESET_PLATFORM==='logistics'?'logistics':'iot';
const personalPrefix=kind==='logistics'?'logistics_v1_':'iot_';
const prefix=kind+'_preset_v1_', modeKey=kind+'-workspace-mode-v1';
const clone=x=>JSON.parse(JSON.stringify(x));
let enabled=false, storageError='', mounted=false, ready=false;
function keys(){const out=[];for(let i=0;i<root.localStorage.length;i++)out.push(root.localStorage.key(i));return out;}
try {const choice=root.localStorage.getItem(modeKey);const hasPersonal=keys().some(k=>k.startsWith(personalPrefix)&&!k.startsWith(prefix))||root.localStorage.getItem(kind==='logistics'?'logistics-exam-draft-v1':'iot-academy-exam-draft-v1');enabled=choice==='preset'||(!choice&&!hasPersonal);}
catch(error){storageError='浏览器存储不可用，请允许站点保存数据后重试。';}
const api={get enabled(){return enabled;},kind,storageKey:key=>prefix+key,personalPrefix,
async initialize(){
 if(ready)return; if(storageError)throw Error(storageError);
 if(enabled){
  const marker=prefix+'initialized';
  if(!root.localStorage.getItem(marker)){
   const data=await root.PresetData.build(kind),created=[];
   try {for(const [key,value] of Object.entries(data)){const target=prefix+key;if(root.localStorage.getItem(target)===null){root.localStorage.setItem(target,JSON.stringify(value));created.push(target);}}
    root.localStorage.setItem(marker,JSON.stringify({version:1,fictional:true}));
   } catch(error){for(const key of created)root.localStorage.removeItem(key);throw Error('预设数据保存失败，请检查浏览器可用空间。个人工作区未改动。');}
  }
 }
 ready=true;mount();
},read(key){return clone(JSON.parse(root.localStorage.getItem(prefix+key)||'null'));},write(key,value){root.localStorage.setItem(prefix+key,JSON.stringify(value));return clone(value);},
async switchMode(){await stopModules();root.localStorage.setItem(modeKey,enabled?'personal':'preset');root.location.reload();},
async reset(){if(!root.confirm('重新载入全部预设样例并清除本次预设操作？仅影响预设工作区，个人工作区不会改变。'))return false;await stopModules();for(const key of keys())if(key.startsWith(prefix))root.localStorage.removeItem(key);root.localStorage.setItem(modeKey,'preset');root.location.reload();return true;},
async stop(){root.PresetPhotoWorkspace?.stop?.();root.PresetReplay?.stop?.();root.PresetVision?.stop?.();root.PresetExtensions?.stop?.();root.PresetLogisticsPanels?.stop?.();},
handles(page){return enabled&&['transfer','multimodal','neural','annotation','trainingReplay'].includes(page);},
async render(container,page){if(['multimodal','annotation','transfer'].includes(page)&&root.PresetPhotoWorkspace)return root.PresetPhotoWorkspace.render(container,page,kind);if(['multimodal','annotation'].includes(page)&&root.PresetVision)return root.PresetVision.render(container,page,kind);return root.PresetReplay.render(container,page==='trainingReplay'?'knowledge':page,kind);},
async mountExtensions(area,original,page){if(!enabled)return;const shared=['knowledge','twin'].includes(page),logistics=kind==='logistics'&&['coldchain','analytics','drone'].includes(page);if(!shared&&!logistics)return;const panel=root.document.createElement('section');panel.className='preset-extension-host';original.id='preset-'+page+'-original';area.insertBefore(panel,original);if(shared)await root.PresetExtensions?.mount(panel,page,kind);if(logistics)await root.PresetLogisticsPanels?.render(panel,page);},
mount,steps:kind==='logistics'?[
 ['overview','作业总览','查看预设订单与仓储运行状态'],['warehouse','入库与库存','打开已有订单，查看入库、分拣和库存流程'],['transport','运输与签收','查看预设运输任务与配送状态'],['multimodal','图像与文档','预设图像、识别样例及多模态操作'],['transfer','图像训练','播放已记录训练流程，不执行训练'],['trainingReplay','大模型流程','回放配置、训练记录及样例输出'],['exams','考核与成果','查看已发布试卷、虚构学员与成绩'],['admin','教学管理','查看班级、教师及示例数据']
 ]:[['overview','教学总览','课程、实验、班级与成果均已预设'],['learning','课程学习','打开已完成课时与示例学习记录'],['twin','场景实验','打开预设场景，查看本地仿真流程'],['multimodal','多模态应用','展示预设图像、文字与仪表示例'],['annotation','视觉标注','查看样例图像及已标注结果'],['transfer','图像训练','播放已记录训练流程，不执行训练'],['trainingReplay','大模型流程','回放配置、训练记录及样例输出'],['exams','考核与成果','查看预设试卷、虚构学员与成绩'],['admin','教学管理','查看教师、班级及示例数据']]
};
async function stopModules(){for(const name of ['PresetPhotoWorkspace','PresetReplay','PresetVision','PresetExtensions','PresetLogisticsPanels','Logistics','HardwareLab','Transfer','Multimodal','ApplicationLab','Extras','Twin','Exams','Learning','Experiments','Annotation','Knowledge'])await root[name]?.stop?.();await root.flushApiWrites?.();}
function mount(){
 if(mounted||!root.document?.querySelector)return;const anchor=root.document.querySelector('.main header');if(!anchor)return;mounted=true;
 const node=root.document.createElement('section');node.className='preset-bar';node.setAttribute('aria-label','工作区控制');
 node.innerHTML=enabled?'<div class="preset-status"><span class="badge blue">预设模式</span><span>教师、学员与业务记录均为虚构样例；模型操作为固定样例 / 流程回放。</span><button class="btn" data-preset="tour">操作导览</button><button class="btn" data-preset="reset">重置预设</button><button class="text-button" data-preset="switch">切换个人工作区</button></div><div class="preset-tour" hidden><div class="preset-tour-head"><strong>按顺序操作，无需录入资料</strong><span data-tour-count></span></div><div class="preset-tour-steps"></div><div class="preset-tour-footer"><span data-tour-tip></span><div class="toolbar"><button class="btn" data-preset="prev">上一步</button><button class="btn primary" data-preset="next">下一步 →</button></div></div></div>':'<div class="preset-status"><span class="badge gray">个人工作区</span><span>已有内容已保留。可随时打开独立预设工作区。</span><button class="btn primary" data-preset="switch">打开预设工作区</button></div>';
 anchor.insertAdjacentElement('afterend',node);
 const status=root.document.querySelector('.status-pill');if(status&&enabled)status.textContent='本地仿真';
 let index=0;try{index=Math.max(0,Math.min(api.steps.length-1,Number(root.localStorage.getItem(prefix+'tour_index'))||0));}catch{}
 const draw=()=>{if(!enabled)return;node.querySelector('[data-tour-count]').textContent=`${index+1} / ${api.steps.length}`;node.querySelector('[data-tour-tip]').textContent=api.steps[index][2];node.querySelector('.preset-tour-steps').innerHTML=api.steps.map((s,i)=>`<button class="${i===index?'active':''}" data-tour="${i}"><small>${String(i+1).padStart(2,'0')}</small>${s[1]}</button>`).join('');node.querySelector('[data-preset="prev"]').disabled=index===0;node.querySelector('[data-preset="next"]').textContent=index===api.steps.length-1?'重新开始 ↺':'下一步 →';};
 const go=async i=>{index=i;root.localStorage.setItem(prefix+'tour_index',String(index));draw();await root.navigate(api.steps[index][0]);};
 node.onclick=async event=>{const b=event.target.closest('button');if(!b)return;try{const action=b.dataset.preset;if(b.dataset.tour!==undefined){await go(Number(b.dataset.tour));return;}if(action==='switch'){await api.switchMode();return;}if(action==='reset'){await api.reset();return;}if(action==='tour'){const panel=node.querySelector('.preset-tour');panel.hidden=!panel.hidden;return;}if(action==='prev')await go(Math.max(0,index-1));if(action==='next')await go((index+1)%api.steps.length);}catch(error){root.toast?.(error.message);}};
 draw();
}
root.PresetDemo=api;
})(typeof window==='undefined'?globalThis:window);
