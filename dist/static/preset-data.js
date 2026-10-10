/* Fictional, read-only seed factory. Returns fresh state; never accesses workspace
 * storage, writes an API, starts inference/training, or connects to hardware.
 * All dated records below refer to a fictional teaching day, not observed events. */
(function (root) {
  'use strict';
  const DATE = '2026-09-01T09:00:00.000Z';
  const END = '2026-09-01T09:30:00.000Z';
  const NOTICE = 'SAMPLE 虚构教学预设；所有姓名、记录、成绩与 2026-09-01 时间均为样例，不是真实学员活动。设备与物流为软件仿真；不代表实际接入、交付或模型训练成果。';
  const copy = x => JSON.parse(JSON.stringify(x));
  const image = 'data:image/png;base64,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';

  function teaching(kind) {
    const classes = [{id:'class-default',name:'SAMPLE基础班',teacher:'SAMPLE教师'}, {id:'sample-class-02',name:'SAMPLE进阶班',teacher:'SAMPLE教师'}];
    const students = Array.from({length:12}, (_,i) => ({id:'SAMPLE-'+String(i+1).padStart(2,'0'),name:'SAMPLE学员'+String(i+1).padStart(2,'0'),group:'SAMPLE小组'+(i%3+1),classId:classes[i<8?0:1].id}));
    return {name:kind==='logistics'?'SAMPLE智慧物流实训室':'SAMPLE物联网实训室',teacher:'SAMPLE教师',className:classes[0].name,notice:NOTICE,classes,students};
  }
  function learning() {
    const lessons = {};
    root.Learning.courses.forEach((course,ci) => course.lessons.forEach((lesson,li) => {
      const done=ci<3 || (ci===3&&li===0);
      lessons[lesson.id]={read:ci<5, note:'SAMPLE虚构学习笔记：'+lesson.goal+' 该记录仅用于展示学习进度，需要在真实实践中自行验证。',answer:done?lesson.quiz.answer:null,quizChecked:done,attempts:done?1:0,openedAt:DATE,lastOpenedAt:END,completedAt:done?END:null};
    }));
    return {version:1,lessons,bookmarks:['mqtt','digital-twin'],lastLesson:'digital-twin-2',updatedAt:END};
  }
  function experiments() {
    const observations = {
      'env-twin':'SAMPLE虚构观察：教室温度、照明与风机三个组件；虚构时间09:00、09:01、09:02的温度分别为24、25、26°C。位置使用画布坐标；保存恢复为样例设定，未接入真实设备。',
      'sensor-audit':'SAMPLE虚构观察：09:00到09:04的温度依次为23、24、24、25、26°C；末三点移动平均=(24+25+26)/3=25°C。暂停意味着不再生成读数，并非现场传感器离线。',
      'mqtt-design':'SAMPLE虚构方案：sample/a/telemetry 与 sample/b/telemetry；载荷包含device_id、timestamp、value和unit。QoS 1允许重复，使用设备ID+启动ID+序号去重；本预设未建立网络连接。',
      'annotation-quality':'SAMPLE虚构复核：640×360合成练习图，两个箱体矩形框及一个表面缺陷框；缺陷标签归属箱体。坐标以原图左上角为原点，边界已按合成图形检查；不代表真实视觉模型检测。',
      'knowledge-pipeline':'SAMPLE虚构记录：6条原创教学问答与6条有来源的关系；温度传感器监测温度、边缘网关连接现场设备。保留待复核关系以演示审核流程；规则提取不能证明现实事实。',
      'training-readiness':'SAMPLE虚构准备记录：计划按设备来源划分训练、验证与测试集，避免相近文本泄漏；配置LoRA、学习率0.0002、批量4。示例成绩仅用于页面演示，不是实测评估；尚无训练权重。'
    };
    const reports = {};
    root.Experiments.tasks.forEach((task,i) => {
      const done=i<4;
      reports[task.id]={startedAt:DATE,updatedAt:END,steps:task.steps.map((_,j)=>done||j<2),observations:observations[task.id],evidence:'SAMPLE虚构证据引用：'+task.id+'.json；仅为预设的报告示例，未生成真实操作、硬件或训练证明。',reflection:'SAMPLE反思：必须分别核验数据来源、时间、单位及质量。软件仿真只能用于学习，不能替代真实设备测试与教师审核。',answers:task.quiz.map(q=>q.answer),quizChecked:done,attempts:done?1:0,submittedAt:done?END:null,previousSubmittedAt:null,revisions:done?1:0,topicTests:task.id==='mqtt-design'?[{filter:'sample/+/telemetry',topic:'sample/a/telemetry',valid:true,matches:true,reason:'SAMPLE匹配示例',testedAt:DATE},{filter:'sample/+/telemetry',topic:'sample/a/room/telemetry',valid:true,matches:false,reason:'SAMPLE不匹配示例',testedAt:END}]:[]};
    });
    return {version:1,reports,updatedAt:END};
  }
  function annotation() {
    return {image,imageName:'SAMPLE-合成箱体-非真实现场.png',width:640,height:360,labels:[{id:1,name:'SAMPLE箱体',color:'#3278bc',parent:null},{id:2,name:'SAMPLE表面缺陷',color:'#dd624e',parent:1}],annotations:[{id:1,labelId:1,type:'rectangle',x:85,y:90,w:180,h:180,parentId:null},{id:2,labelId:1,type:'rectangle',x:355,y:100,w:190,h:170,parentId:null},{id:3,labelId:2,type:'rectangle',x:420,y:160,w:50,h:35,parentId:2}],nextId:4,updatedAt:END};
  }
  function knowledge() {
    const facts=[['温度传感器','监测','温度'],['边缘网关','连接','现场设备'],['MQTT','用于','传输遥测消息'],['TLS','用于','加密通信链路'],['RFID读写器','用于','识别教学标签'],['质量标记','用于','区分正常与过期数据']];
    return {datasetName:'SAMPLE原创教学问答（虚构场景）',rows:facts.map(([s,p,o])=>({instruction:s+'在SAMPLE教学场景中的作用是什么？',input:'仅供软件教学，不含真实设备、个人或业务数据。',output:s+p+o+'。实际应用需核验设备规范、来源与适用条件。'})),triples:facts.map(([subject,predicate,object],i)=>({id:i+1,subject,predicate,object,source:i+1,method:'SAMPLE人工整理',reviewed:i<4})),config:{taskName:'SAMPLE教学问答配置（未训练）',baseModel:'待选择 / 未加载',method:'LoRA',epochs:3,learningRate:0.0002,batchSize:4,maxLength:1024,validationSplit:0.2,seed:42,loraRank:16,notes:NOTICE+' 仅准备配置，不含模型权重、训练记录或评估指标。'},updatedAt:END};
  }
  function twin(kind) {
    const state=root.Twin.scenePreset(kind==='logistics'?'商超':'建筑');
    state.name='SAMPLE'+(kind==='logistics'?'仓储冷链':'教学楼宇')+' · 虚构仿真场景';
    state.saved=END;state.elapsed=60;state.sampleCount=12;
    state.nodes.forEach(n=>{n.name='SAMPLE'+n.name;n.history=Array.from({length:12},(_,i)=>({t:Date.parse(DATE)+i*5000,value:n.value}));});
    state.events=[{id:'sample-event-1',time:'2026-09-01 09:00（虚构）',name:'SAMPLE场景',message:'预设软件仿真记录，未连接硬件；历史曲线为固定教学数值。',kind:'system',ack:true,origin:'local-simulation',acknowledgement:null,snapshot:null}];
    return root.Twin.validateState(state);
  }
  function correctAnswer(q) {
    if(q.type==='compound'&&q.items?.length)return Object.fromEntries(q.items.map(child=>[child.id,correctAnswer(child)]));
    if(q.type==='custom'&&q.fields)return Object.fromEntries(q.fields.map(f=>[f.id,f.kind==='number'?'1':'SAMPLE虚构作答：按题目要求核验数据、单位与来源。']));
    return copy(q.type==='fill'&&Array.isArray(q.answer)?q.answer[0]:q.answer??'SAMPLE虚构作答');
  }
  function exams(bank,workspace) {
    const objective=bank.filter(q=>['single','multiple','truefalse','fill'].includes(q.type));
    const manual=bank.find(q=>q.type==='custom');
    if(objective.length<12||!manual)throw Error('打包题库缺少预设试卷所需题型');
    const papers=[
      {id:'sample-exam-foundation',title:'SAMPLE基础能力测评',questions:objective.slice(0,12),published:true,audience:{mode:'all',classIds:[],studentIds:[]}},
      {id:'sample-exam-engineering',title:'SAMPLE综合实践测评',questions:[...objective.slice(12,20),manual],published:true,audience:{mode:'assigned',classIds:['class-default'],studentIds:[]}},
      {id:'sample-exam-draft',title:'SAMPLE待审核试卷',questions:objective.slice(20,28),published:false,audience:{mode:'all',classIds:[],studentIds:[]}}
    ].map(e=>root.Exams.validateExam({...e,description:NOTICE,duration:30,passRate:60,createdAt:DATE,opensAt:'',closesAt:''}));
    const results=workspace.students.slice(0,8).map((student,index)=>{
      const exam=papers[index===7?1:0];
      const items=exam.questions.map((question,qi)=>{
        const answer=qi<index%4?(question.type==='multiple'?[]:''):correctAnswer(question);
        return root.Exams.normalizeResultItem({question:copy(question),answer,...root.Exams.gradeQuestion(question,answer)});
      });
      const pending=items.some(x=>x.pending);
      return {id:'sample-result-'+(index+1),examId:exam.id,title:exam.title,name:student.name,studentId:student.id,classId:student.classId,className:workspace.classes.find(c=>c.id===student.classId).name,startedAt:DATE,submittedAt:END,gradedAt:pending?null:END,durationSeconds:1800,passRate:60,maxScore:items.reduce((sum,x)=>sum+x.question.points,0),score:items.reduce((sum,x)=>sum+x.score,0),pending,timedOut:false,items};
    });
    return {exams:papers,results};
  }
  function logistics() {
    const core=root.LogisticsCore;
    if(!core)throw Error('物流教学模块尚未加载');
    let state=core.initial();
    const apply=(action,data)=>{state=core.apply(state,action,data);};
    [['SAMPLE-FRESH','SAMPLE冷藏鲜果',120,2,8],['SAMPLE-DAIRY','SAMPLE乳制品',80,2,6],['SAMPLE-FROZEN','SAMPLE冷冻食品',100,-25,-18]].forEach(([sku,name,qty,min,max],i)=>apply('receive',{sku,name,zone:'SAMPLE库区'+(i+1),qty,min,max,humidity:85}));
    for(let i=0;i<4;i++)apply('vehicle',{plate:'SAMPLE冷链车'+(i+1),driver:'SAMPLE驾驶员'+(i+1),capacity:60,cold:true});
    const plan=(pi,vi,qty,distance,duration)=>{apply('plan',{product:state.products[pi].id,vehicle:state.vehicles[vi].id,qty,destination:'SAMPLE虚构配送点'+(vi+1),distance,duration});return state.tasks[0].id;};
    const delivered=plan(0,0,20,30,60);apply('dispatch',{id:delivered});
    apply('sample',{id:delivered,minutes:20,temp:12,humidity:90,online:false,distance:10,offset:4});
    state.alarms.slice().forEach(a=>apply('ack',{id:a.id,note:'SAMPLE处置示例：核对温度、路线和连接；软件样例，无真实干预。'}));
    apply('sample',{id:delivered,minutes:20,temp:5,humidity:65,online:true,distance:20,offset:0});
    apply('deliver',{id:delivered,receiver:'SAMPLE签收员'});
    const running=plan(1,1,25,50,40);apply('dispatch',{id:running});apply('sample',{id:running,minutes:45,temp:10,humidity:70,online:true,distance:20,offset:0});
    plan(2,2,30,80,90);
    const arrived=plan(0,3,15,10,30);apply('dispatch',{id:arrived});apply('sample',{id:arrived,minutes:10,temp:5,humidity:65,online:true,distance:10,offset:0});
    apply('calendar',{title:'SAMPLE冷链异常处置课（虚构日期）',date:'2026-09-01',className:'SAMPLE基础班'});
    // Normalize Core-generated wall-clock fields before taking evidence snapshots.
    state.ledger.forEach(r=>{r.at=DATE;r.detail='SAMPLE虚构记录：'+r.detail;});
    state.tasks.forEach(t=>{if(t.deliveredAt)t.deliveredAt=END;});
    apply('report',{task:delivered,title:'SAMPLE冷链异常到签收闭环',learner:'SAMPLE学员01',observations:'SAMPLE虚构证据：注入12°C、90%RH、4km偏航和离线，再恢复5°C并签收；告警已确认。所有事件为软件教学样例，不是现场运输记录。'});
    state.reports.forEach(r=>r.at=END);
    return state;
  }
  function logisticsLabs() {
    const H=root.Extras?.helpers, hardware=root.HardwareLab?.helpers;
    const result={};
    if(H){
      result.extras_analytics={source:'SAMPLE虚构教学订单',importedAt:DATE,records:Array.from({length:16},(_,i)=>({order_id:'SAMPLE-ORDER-'+String(i+1).padStart(2,'0'),date:'2026-09-'+String(1+i%4).padStart(2,'0'),category:['冷链食品','日用百货','电子配件'][i%3],product:['SAMPLE鲜奶','SAMPLE收纳盒','SAMPLE数据线'][i%3],quantity:1+i%5,unit_price:[12.5,39,29.9][i%3]}))};
      const plan={load:1,battery:100,points:[{x:80,y:40,z:20},{x:150,y:100,z:25},{x:40,y:160,z:20}]};
      let run=H.startDrone(plan);run=H.stepDrone(run);run.log.forEach(l=>{l.time=DATE;l.event='SAMPLE虚构预设：'+l.event;});
      result.extras_drone={plan,run};
      result.extras_neural={dataset:H.parseNeuralCSV(H.syntheticCSV(42)),source:'SAMPLE合成教学样本（未训练）',model:null,history:[],confusion:[],status:'ready',params:{hidden:8,rate:.08,epochs:120,seed:42}};
      const lab={gateway:{enabled:true,broker:'mqtt://sample.invalid:1883',baud:9600,parity:'none'},devices:[{id:'SAMPLE-RFID',type:'rfid',protocol:'modbus',transport:'RS485',gateway:'GW-01',address:1,baud:9600,parity:'none',topic:'sample/rfid'},{id:'SAMPLE-TEMP',type:'temperature',protocol:'mqtt',transport:'Ethernet',gateway:'GW-01',address:2,baud:9600,parity:'none',topic:'sample/temperature'}],manifest:[{epc:'E200001100000001',product:'SAMPLE冷链周转箱',quantity:12,bin:'SAMPLE-C01'},{epc:'E200001100000002',product:'SAMPLE待收货箱',quantity:8,bin:'SAMPLE-A01'}],events:[],source:'SAMPLE虚构教学标签'};
      lab.events.push(H.scanRFID(lab.manifest,lab.manifest[0].epc,'SAMPLE-RFID',lab.events));
      lab.events.push(H.scanRFID(lab.manifest,lab.manifest[0].epc,'SAMPLE-RFID',lab.events));
      lab.events.forEach(e=>e.time=DATE);result.extras_labs=lab;
    }
    if(hardware){
      const state=hardware.initial();state.wires=hardware.expected.map(([a,b])=>({a,b}));
      state.wireLog=[{at:DATE,message:'SAMPLE虚构记录：四条教学导线已连接；未连接任何硬件。'}];
      state.memory[0]='11223344';state.rfidLog=[{at:DATE,band:'HF',message:'SAMPLE预设内存块0=11223344，非真实标签读取。'}];
      state.readerCount=4;state.slots=4;state.assignment=[0,1,2,3];state.collisionSlots=[];result.hardware_lab=state;
    }
    result.application_lab={threshold:30,last:{temperature:32,humidity:55,threshold:30,fan:true,alarm:true},events:[{at:DATE,direction:'SAMPLE虚构应用结果',topic:'sample/greenhouse',payload:'SAMPLE预设温度32°C超过教学阈值30°C；仅虚拟风机，无网络连接。'}]};
    return result;
  }
  async function build(kind='iot') {
    if(!['iot','logistics'].includes(kind))throw Error('未知预设平台：'+kind);
    for(const name of ['Learning','Experiments','Exams','Twin'])if(!root[name])throw Error('预设依赖尚未加载：'+name);
    const response=await root.fetch('/data/questions.json');
    if(!response.ok)throw Error('打包题库读取失败；未生成或写入任何预设');
    const bundled=await response.json();
    if(!Array.isArray(bundled)||!bundled.length)throw Error('打包题库无效');
    // Validate copies, retain exact bundled records including provenance fields.
    bundled.forEach(q=>root.Exams.validateQuestion(copy(q)));
    const workspace=teaching(kind);
    const data={workspace,questions:copy(bundled),learning:learning(),experiments:experiments(),annotation_workspace:annotation(),knowledge_workspace:knowledge(),twin:twin(kind),...exams(copy(bundled),workspace),transfer_learning:{version:1,classes:['SAMPLE完整箱体','SAMPLE表面缺陷'],config:{epochs:40,learningRate:.001,hidden:32,batchSize:8,testFraction:.25,seed:42},bundle:null,result:null,savedAt:END}};
    if(kind==='logistics'){data.logistics=logistics();Object.assign(data,logisticsLabs());}
    return data;
  }
  root.PresetData=Object.freeze({build,version:1,fictionalDate:DATE,notice:NOTICE});
})(typeof window!=='undefined'?window:globalThis);
