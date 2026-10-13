(function(root){
 'use strict';
 const keys=['address_line1','address_line2','postcode_town','state'];
 const key=n=>n.dataset.field||n.dataset.key;
 function bind(input){if(keys.includes(key(input)))input.addEventListener('input',()=>{input.dataset.addressEdited='true';});}
 function pack(values,nodes,preserved=false){return {...values,_address_override:preserved||Array.from(nodes).some(n=>keys.includes(key(n))&&n.dataset.addressEdited==='true')};}
 function apply(nodes,values,overridden=false){if(overridden)return;for(const n of nodes)if(keys.includes(key(n))&&values&&Object.hasOwn(values,key(n)))n.value=values[key(n)];}
 function reset(nodes){for(const n of nodes)if(keys.includes(key(n))){n.value='';delete n.dataset.addressEdited;}}
 root.HRLetterAddress={keys,bind,pack,apply,reset};
})(typeof window!=='undefined'?window:globalThis);
