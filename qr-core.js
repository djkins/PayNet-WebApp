/* Browser-local transaction model. Tokens are opaque, not signed payment credentials. */
(function(root){
'use strict';
const PREFIX='UMC1:',TTL=5*60*1000;
function initialise(s){s.qrRequests=s.qrRequests||[];s.qrTransactions=s.qrTransactions||[];return s;}
function cents(value){const n=Number(value);if(!Number.isFinite(n)||n<.5||n>100000||Math.abs(n*100-Math.round(n*100))>0.000001)throw Error('Enter an amount from RM0.50 to RM100,000 with at most two decimal places.');return Math.round(n*100);}
function token(raw){const text=String(raw).trim();if(!/^UMC1:[a-f0-9-]{36}$/i.test(text))throw Error('This is not a UM Connect+ transaction QR. Ask the student to generate a new QR.');return text.slice(PREFIX.length).toLowerCase();}
function create(s,input,now=Date.now()){
 initialise(s);const amount=cents(input.amount);
 if(!input.merchants.includes(input.merchant))throw Error('Choose a participating demo merchant.');
 if(!/^[a-f0-9-]{36}$/i.test(input.id))throw Error('Could not generate a transaction identifier.');
 s.qrRequests.filter(r=>r.student===input.student&&r.status==='pending').forEach(r=>r.status='cancelled');
 const r={id:input.id.toLowerCase(),student:input.student,merchant:input.merchant,cents:amount,created:now,expires:now+TTL,status:'pending',claim:input.claim?JSON.parse(JSON.stringify(input.claim)):null};
 s.qrRequests.unshift(r);return r;
}
function review(s,raw,merchant,now=Date.now()){
 initialise(s);const id=token(raw),r=s.qrRequests.find(r=>r.id===id);
 if(!r)throw Error('QR not found in this browser. This demo does not sync separate devices. Use Preview merchant scan on the student QR.');
 if(r.status!=='pending'||s.qrTransactions.some(t=>t.request===id))throw Error(r.status==='confirmed'?'This QR has already been confirmed. Points cannot be awarded twice.':'This QR was cancelled. Ask the student for a new QR.');
 if(now>=r.expires)throw Error('This QR has expired. Ask the student to generate a new one.');
 if(r.created>now+1000||r.expires-r.created!==TTL)throw Error('Invalid transaction timing. Generate a new QR.');
 if(r.merchant!==merchant)throw Error('This QR is for '+r.merchant+'. Select that demo merchant or ask for the correct QR.');
 if(!Number.isInteger(r.cents)||r.cents<50||r.cents>10000000)throw Error('Invalid transaction amount.');
 return r;
}
function confirm(s,raw,merchant,checked,now=Date.now()){
 if(!checked)throw Error('Confirm payment in your own banking app before recording the transaction.');
 const r=review(s,raw,merchant,now);r.status='confirmed';r.confirmed=now;
 const t={id:'TX-'+r.id,request:r.id,student:r.student,merchant:r.merchant,cents:r.cents,confirmed:now,method:'Merchant QR scan',points:0};s.qrTransactions.unshift(t);return {request:r,transaction:t};
}
const api={PREFIX,TTL,initialise,cents,token,create,review,confirm};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.UMQR=api;
})(typeof window!=='undefined'?window:globalThis);
