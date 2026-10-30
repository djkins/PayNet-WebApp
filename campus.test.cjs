const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const Q=require('./qr-core.js');let s={};const now=1000000,merchants=['Kopi Kolej','The Daily Bowl'];
function create(amount='10.50',merchant='Kopi Kolej'){return Q.create(s,{id:randomUUID(),student:'student-a',merchant,amount,merchants},now);}
let r=create();assert.equal(r.cents,1050);assert.equal(s.qrTransactions.length,0);assert.equal(Q.review(s,Q.PREFIX+r.id,'Kopi Kolej',now).id,r.id);
assert.throws(()=>Q.confirm(s,Q.PREFIX+r.id,'Kopi Kolej',false,now),/Confirm payment/);assert.throws(()=>Q.review(s,Q.PREFIX+r.id,'The Daily Bowl',now),/for Kopi/);assert.throws(()=>Q.review(s,Q.PREFIX+r.id,'Kopi Kolej',now+Q.TTL),/expired/);assert.throws(()=>Q.review(s,'https://example.test','Kopi Kolej',now),/not a UM/);
Q.confirm(s,Q.PREFIX+r.id,'Kopi Kolej',true,now);assert.equal(s.qrTransactions.length,1);assert.throws(()=>Q.confirm(s,Q.PREFIX+r.id,'Kopi Kolej',true,now),/already/);
let a=create(),b=create();assert.equal(a.status,'cancelled');assert.throws(()=>Q.review(s,Q.PREFIX+a.id,'Kopi Kolej',now),/cancelled/);assert.throws(()=>Q.review({},Q.PREFIX+b.id,'Kopi Kolej',now),/does not sync/);
for(const value of ['NaN','Infinity','0','0.49','10.501','100000.01'])assert.throws(()=>create(value));assert.throws(()=>create('10','Foreign merchant'));
// Run the real app and transaction controller in a minimal DOM to verify awards,
// blocked old receipt submissions, role gates, duplicate use and offer rechecks.
const elements={};function element(key){return elements[key]||=( {innerHTML:'',textContent:'',style:{},dataset:{},value:'Student',open:false,classList:{add(){}},addEventListener(){},querySelectorAll(){return[]},insertAdjacentHTML(){},showModal(){this.open=true},close(){this.open=false}});}
let saved=null;const sandbox={console,URLSearchParams,location:{search:''},crypto:{randomUUID},document:{querySelector:element,getElementById:id=>element('#'+id),body:{dataset:{}},addEventListener(){}},localStorage:{getItem:()=>saved,setItem:(k,v)=>saved=v},window:{addEventListener(){},scrollTo(){}},navigator:{},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},cancelAnimationFrame(){},Intl,Date,FormData:class{constructor(f){this.data=f.data}*[Symbol.iterator](){yield*this.data}}};sandbox.window=sandbox;
sandbox.addEventListener=()=>{};sandbox.scrollTo=()=>{};sandbox.QRCode=function(){};sandbox.QRCode.CorrectLevel={M:0};const ctx=vm.createContext(sandbox);
for(const f of ['app.js','campus.js','qr-core.js','transactions.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),ctx);
vm.runInContext(`
let start=state.points;submitCheckin({amount:{value:'10'},receipt:{files:[{}]},code:{value:'UM2210'},merchant:{value:'Kopi Kolej'}});if(state.points!==start)throw Error('Old receipt path awards points');
clockPreview='15:00';applyReferral('FRIEND-UM100');claimDeal('kopi-afternoon');createStudentQR({merchant:{value:'Kopi Kolej'},amount:{value:'10.50'}});
let req=state.qrRequests[0];if(state.points!==start)throw Error('Generating QR awards points');readStudentQR(UMQR.PREFIX+req.id);confirmStudentQR({received:{checked:true}});if(state.points!==start)throw Error('Student can self-confirm');
mode='Merchant';readStudentQR(UMQR.PREFIX+req.id);confirmStudentQR({received:{checked:false}});if(state.points!==start)throw Error('Unchecked attestation awards');
confirmStudentQR({received:{checked:true}});if(state.points!==start+21+100+40)throw Error('Merchant reward stacking');if(state.spent!==97||state.qrTransactions.length!==1||state.dealUses.length!==1)throw Error('Ledger totals');
readStudentQR(UMQR.PREFIX+req.id);confirmStudentQR({received:{checked:true}});if(state.points!==start+161||state.qrTransactions.length!==1)throw Error('Duplicate awards');
mode='Student';createStudentQR({merchant:{value:'Kopi Kolej'},amount:{value:'5'}});req=state.qrRequests[0];state.qrRequests[0].expires=Date.now()-1;persist();mode='Merchant';readStudentQR(UMQR.PREFIX+req.id);confirmStudentQR({received:{checked:true}});if(state.qrTransactions.length!==1)throw Error('Expired confirmation');
let screenCount=0;for(const role of Object.keys(menus)){mode=role;for(const [view]of menus[role]){page=view;render();screenCount++;if(!document.querySelector('#main').innerHTML)throw Error(role+' '+view);}}if(screenCount!==29)throw Error('Navigation coverage');
`,ctx);
console.log('PASS: QR lifecycle, amounts, merchant matching, expiry, cancel/replace, foreign codes, no cross-device claims, explicit merchant attestation, no student receipt bypass, duplicate protection, stacked points and 29 screens.');
