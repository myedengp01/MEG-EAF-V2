(function(root){
 'use strict';
 const order=['employee_name','employee_id','position','department','current_basic','basic_increment','basic_increment_pct','revised_basic','letter_date','effective_date'];
 const gross=new Set(['current_gross','gross_increment','gross_increment_pct','revised_gross']);
 function number(value){if(value===null||value===undefined||String(value).trim()==='')return null;const s=String(value).trim();if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return null;const n=Number(s.replaceAll(',',''));return Number.isFinite(n)?n:null;}
 function calculate(current,increment){const c=number(current),i=number(increment);return {basic_increment_pct:c!==null&&c>0&&i!==null?(i/c*100).toFixed(2):'',revised_basic:c!==null&&i!==null?(c+i).toFixed(2):''};}
 function fields(keys){const unique=[...new Set(keys)].filter(k=>!gross.has(k));if(unique.includes('current_basic')&&unique.includes('revised_basic'))for(const k of ['basic_increment','basic_increment_pct'])if(!unique.includes(k))unique.push(k);return [...order.filter(k=>unique.includes(k)),...unique.filter(k=>!order.includes(k))];}
 root.HRLetterFields={order,fields,number,calculate};
})(typeof globalThis!=='undefined'?globalThis:this);
