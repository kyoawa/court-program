const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/lib/image-sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{},URL,Date,Set};vm.runInNewContext(code,context);
const validate=context.exports.validateSnapshot;
const url='https://leaflogixmedia.blob.core.windows.net/product-image/test.png';
const sample=()=>({productId:1577752,capturedAt:new Date().toISOString(),images:[{imageId:1396598,imageUrl:url}]});
test('accepts a complete snapshot and valid empty snapshot',()=>{assert.equal(validate(sample()).images.length,1);assert.equal(validate({...sample(),images:[]}).images.length,0)});
test('rejects malformed IDs, duplicate IDs, stale timestamps and foreign URLs',()=>{
 for(const s of [{...sample(),productId:-1},{...sample(),images:null},{...sample(),capturedAt:'2000-01-01'}, {...sample(),capturedAt:new Date(Date.now()+120000).toISOString()}, {...sample(),images:[sample().images[0],sample().images[0]]},{...sample(),images:[{imageId:2,imageUrl:'https://example.com/image.png'}]}]) assert.throws(()=>validate(s));
});
function harness(){
 const emitted=[];class XHR{open(){}setRequestHeader(){}send(){this.sent=true}addEventListener(_,fn){this.load=fn}}
 const window={addEventListener:()=>{},postMessage:message=>emitted.push(message),fetch:async()=>({ok:true,clone:()=>({json:async()=>({Result:true,Data:{images:[]}})})})};
 vm.runInNewContext(fs.readFileSync('extension/dutchie-sync/capture.js','utf8'),{window,XMLHttpRequest:XHR,location:{href:'https://canyon.backoffice.dutchie.com/products/catalog/1577752',origin:'https://canyon.backoffice.dutchie.com',pathname:'/products/catalog/1577752'},URL,WeakSet,Date});
 function xhr(body,status=200,path='/api/v2/inventory/get-product-extra-info'){const r=new XHR();r.open('POST',path);r.send();r.status=status;r.responseText=JSON.stringify(body);r.load?.();return r}
 return {emitted,xhr,window};
}
test('captures only matching product images; never forwards other fields',()=>{
 const h=harness();h.xhr({Result:true,Data:{images:[{Id:1396598,WhseProducts_Id:1577752,ProductImageFileName:url}],tags:['private']}});
 assert.equal(h.emitted.length,1);assert.equal(h.emitted[0].snapshot.images[0].imageId,1396598);assert.equal(JSON.stringify(h.emitted).includes('private'),false);
 h.xhr({Result:true,Data:{images:[{Id:1,WhseProducts_Id:999,ProductImageFileName:url}]}});assert.equal(h.emitted.length,1);
});
test('failed responses cannot clear mappings; a successful empty result can',()=>{
 const h=harness();h.xhr({Result:false,Data:{images:[]}});h.xhr({Result:true,Data:{images:[]}},401);h.xhr({Result:true,Data:{} });h.xhr({Result:true,Data:{images:[]}},200,'/products/delete');assert.equal(h.emitted.length,0);
 h.xhr({Result:true,Data:{images:[]}});assert.equal(h.emitted.length,1);assert.equal(h.emitted[0].snapshot.images.length,0);
});
test('fetch capture preserves original response',async()=>{const h=harness();const r=await h.window.fetch('/api/v2/inventory/get-product-extra-info');await new Promise(resolve=>setImmediate(resolve));assert.equal(r.ok,true);assert.equal(h.emitted.length,1)});
function workerHarness() {
 const state={key:'k'.repeat(48)}, alarms=new Map(), visits=[],requests=[];let listener,alarmListener;
 const chrome={
  storage:{local:{setAccessLevel:async()=>{},get:async()=>structuredClone(state),set:async value=>Object.assign(state,structuredClone(value))}},
  runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn},onStartup:{addListener:()=>{}}},
  tabs:{sendMessage:async()=>{},create:async options=>{visits.push(options.url);return {id:42}},update:async(id,options)=>{visits.push(options.url)}},
  alarms:{create:async(name,value)=>alarms.set(name,value),clear:async name=>alarms.delete(name),onAlarm:{addListener:fn=>alarmListener=fn}}
 };
 vm.runInNewContext(fs.readFileSync('extension/dutchie-sync/background.js','utf8'),{chrome,Date,Set,AbortSignal,crypto:require("node:crypto").webcrypto,fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>options.method==='POST'?{synced:true,imageCount:JSON.parse(options.body).images.length}:{productIds:[1577752,1577738]}}}});
 const send=(message,sender={url:'chrome-extension://test/popup.html'})=>new Promise(resolve=>listener(message,sender,resolve));
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 return {state,alarms,visits,requests,send,alarm:async name=>{alarmListener({name});await tick();await tick()}};
}
test('worker imports only its dedicated tab, advances once, and resumes persisted progress',async()=>{
 const h=workerHarness();assert.equal((await h.send({type:'start'})).ok,true);assert.equal(h.visits.length,1);
 const sender={url:'https://canyon.backoffice.dutchie.com/products/catalog/1577752',tab:{id:42},frameId:0};
 await h.send({type:'capture',snapshot:sample()},{...sender,tab:{id:77}});assert.equal(h.state.job.index,0);
 await h.send({type:'capture',snapshot:sample()},sender);assert.equal(h.state.job.index,1);
 await h.send({type:'capture',snapshot:sample()},sender);assert.equal(h.requests.filter(r=>r.options.method==='POST').length,1);
 await h.send({type:'pause'});await h.alarm('sync-next');assert.equal(h.visits.length,1);
 await h.send({type:'resume'});assert.equal(h.visits[1],'https://canyon.backoffice.dutchie.com/products/catalog/1577738');
 await h.alarm('sync-timeout');assert.equal(h.state.job.running,false);assert.equal(h.state.job.index,1);
 assert.equal(h.requests.some(r=>r.url.includes('remove')),false);
});
test('worker rejects website control messages and invalid single-product IDs',async()=>{
 const h=workerHarness();assert.match((await h.send({type:'start'},{url:'https://canyon.backoffice.dutchie.com/'})).error,/sender/);
 assert.match((await h.send({type:'start',productId:''})).error,/valid product/);assert.equal(h.visits.length,0);
});
test('fast crawler reads five product metadata responses with session kept inside page', async()=>{
 let handler,active=0,peak=0;const messages=[],calls=[];
 class XHR {open(){}send(){}setRequestHeader(){}addEventListener(){}}
 const window={addEventListener:(_,fn)=>handler=fn,postMessage:message=>messages.push(message),fetch:async(path,options)=>{
  calls.push({path,options});active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;
  const productId=JSON.parse(options.body).ProductId;
  return {ok:true,status:200,json:async()=>({Result:true,Data:{images:[{Id:productId+100,WhseProducts_Id:productId,ProductImageFileName:url}]}})};
 }};
 const location={href:'https://canyon.backoffice.dutchie.com/products/catalog/1',origin:'https://canyon.backoffice.dutchie.com',pathname:'/products/catalog/1'};
 vm.runInNewContext(fs.readFileSync('extension/dutchie-sync/capture.js','utf8'),{window,XMLHttpRequest:XHR,location,URL,WeakSet,WeakMap,Date,Headers,AbortSignal,setTimeout});
 const xhr=new XHR();xhr.open('POST','/api/v2/inventory/get-product-extra-info');xhr.setRequestHeader('Content-Type','application/json');xhr.send(JSON.stringify({SessionId:'private-session',ProductId:1,OrgId:8071}));
 await handler({source:window,origin:location.origin,data:{type:'court-fetch-images-v2',batchId:'test',ids:[1,2,3,4,5]}});
 assert.equal(peak,5);assert.equal(messages[0].results.length,5);assert.equal(messages[0].results[4].snapshot.productId,5);
 assert.equal(JSON.stringify(messages).includes('private-session'),false);
 for(const call of calls){assert.equal(call.path,'/api/v2/inventory/get-product-extra-info');assert.equal(call.options.credentials,'include');assert.equal(JSON.parse(call.options.body).SessionId,'private-session')}
 await handler({source:window,origin:location.origin,data:{type:'court-fetch-images-v2',batchId:'bad',ids:[1,2,3,4,5,6]}});assert.equal(calls.length,5);
});
