/* Run: node test_detection.cjs
 * Real CPU inference: node test_detection.cjs --inference /path/to/photo.jpg --image-source https://source/url
 * Pillow is used only to decode a test photo into RGB; predictions are the real vendored TF.js model output.
 */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const D=require('./dist/static/detection.js');
function logicTests(){
 assert.equal(Object.keys(D.CLASS_NAMES).length,80);
 const predictions=[{class:'person',score:.8,bbox:[-4,10,30,120]},{class:'cat',score:.2,bbox:[1,2,30,40]},{class:'industrial pump',score:.99,bbox:[1,2,30,40]}];
 assert.deepEqual(D.normalizePredictions(predictions,100,100,.5),[{type:'rectangle',className:'person',displayName:'人 / person',x:0,y:10,w:26,h:90,confidence:.8}]);
 const workspace={width:100,height:100,labels:[{id:1,name:'manual'}],annotations:[{id:1,type:'rectangle',labelId:1,x:1,y:1,w:10,h:10},{id:2,type:'rectangle',source:'ai',reviewed:false},{id:3,type:'rectangle',source:'ai',reviewed:true},{id:4,type:'point',parentId:2}],nextId:5};
 const result=D.importPredictions(workspace,predictions,{threshold:.5,replaceAI:true});assert.equal(result.created.length,1);assert.equal(result.annotations.length,4);assert.equal(result.annotations.find(x=>x.id===4).parentId,null);assert.ok(result.annotations.find(x=>x.id===3));assert.equal(workspace.annotations.length,4);assert.equal(workspace.labels.length,1);assert.equal(result.annotations.at(-1).confidence,.8);
 const repeated=D.importPredictions({...workspace,...result},predictions,{threshold:.5,replaceAI:true});assert.equal(repeated.annotations.length,4);assert.equal(repeated.labels.length,result.labels.length);
 const empty=D.importPredictions({...workspace,...result},[],{threshold:.5,replaceAI:true});assert.equal(empty.created.length,0);assert.ok(empty.annotations.every(a=>a.source!=='ai'||a.reviewed));
 assert.equal(D.normalizePredictions([],100,100).length,0);assert.equal(D.normalizePredictions([{class:'person',score:NaN,bbox:[1,1,2,2]},{class:'person',score:.9,bbox:[200,1,2,2]},{class:'cat',score:.9,bbox:[1,1,-1,2]},{class:'person',score:1.1,bbox:[1,1,2,2]}],100,100).length,0);assert.throws(()=>D.normalizePredictions([],0,100));assert.throws(()=>D.normalizePredictions([],100,100,2));
 for(const item of D.SOURCES){const data=fs.readFileSync(path.join(__dirname,'dist',item.url));assert.equal('sha384-'+crypto.createHash('sha384').update(data).digest('base64'),item.integrity);}
 const model=JSON.parse(fs.readFileSync(path.join(__dirname,'dist',D.MODEL.modelUrl),'utf8'));
 for(const group of model.weightsManifest)for(const shard of group.paths)assert.ok(fs.statSync(path.join(__dirname,'dist/static/vendor/vision',shard)).size>0);
 console.log('PASS: real 80-class map; clipping and filtering; invalid output rejection; reviewed/manual retention; repeated import; metadata; parent repair; SRI and all model shards.');
}
async function inferenceTest(imagePath,imageSource){
 const vm=require('node:vm'),cp=require('node:child_process');
 const decoded=JSON.parse(cp.execFileSync('python3',['-c',"import sys,json,base64;from PIL import Image;i=Image.open(sys.argv[1]).convert('RGB');print(json.dumps({'width':i.width,'height':i.height,'rgb':base64.b64encode(i.tobytes()).decode()}))",imagePath],{maxBuffer:30*1024*1024}).toString());
 const vendor=path.join(__dirname,'dist/static/vendor/vision'),localPrefix='https://local-model-fixture.invalid/';
 const savedFetch=global.fetch;let reads=0;
 // The browser runtime is unmodified; this read-only adapter loads the exact local deployed model bytes without a HTTP socket.
 global.fetch=async input=>{const u=String(input);if(!u.startsWith(localPrefix))throw Error('Unexpected external request: '+u);const file=path.join(vendor,path.basename(u));reads++;return new Response(fs.readFileSync(file),{status:200,headers:{'content-type':u.endsWith('.json')?'application/json':'application/octet-stream'}});};
 const tf=require('./dist/static/vendor/vision/tf.min.js'),context={tf,console};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(vendor,'coco-ssd.min.js'),'utf8'),context);
 await tf.setBackend('cpu');await tf.ready();const start=performance.now();
 const model=await context.cocoSsd.load({base:D.MODEL.base,modelUrl:localPrefix+'model.json'}),loaded=performance.now();
 const tensor=tf.tensor3d(Uint8Array.from(Buffer.from(decoded.rgb,'base64')),[decoded.height,decoded.width,3],'int32');
 const predictions=await model.detect(tensor,50,.5),finished=performance.now();
 const mapped=D.normalizePredictions(predictions,decoded.width,decoded.height,.5);
 const report={verifiedAt:new Date().toISOString(),status:predictions.length?'passed_nonempty_real_inference':'no_objects_detected',testEnvironment:'Node '+process.version+' / vendored browser TensorFlow.js CPU backend; local filesystem-only model transport',browserInteractionTested:false,model:{...D.MODEL,modelUrl:'static/vendor/vision/model.json'},runtimeVersion:tf.version.tfjs,modelPackageVersion:context.cocoSsd.version,image:{source:imageSource||null,sha256:crypto.createHash('sha256').update(fs.readFileSync(imagePath)).digest('hex'),width:decoded.width,height:decoded.height},threshold:.5,modelFileReads:reads,externalInferenceRequests:0,loadAndWarmupMs:Math.round(loaded-start),inferenceMs:Math.round(finished-loaded),predictions,normalized:mapped};
 fs.writeFileSync(path.join(__dirname,'model-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));tensor.dispose();model.dispose();global.fetch=savedFetch;
 assert.ok(predictions.length>0,'Real sample should return at least one detection');assert.equal(mapped.length,predictions.length);assert.ok(mapped.every(p=>p.x>=0&&p.y>=0&&p.x+p.w<=decoded.width&&p.y+p.h<=decoded.height));
}
logicTests();const args=process.argv.slice(2),index=args.indexOf('--inference');if(index>=0){const source=args.indexOf('--image-source');inferenceTest(args[index+1],source>=0?args[source+1]:null).catch(e=>{console.error(e);process.exitCode=1;});}
