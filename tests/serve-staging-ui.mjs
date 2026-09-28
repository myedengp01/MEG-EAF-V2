import http from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../.staging-ui/',import.meta.url);
const allowed=new Set(['hr-letters-upload.html','hr-letters-upload-page.js','hr-letter-upload.js','vendor/jszip.min.js','vendor/docx-preview.min.js','vendor/pdf-lib.min.js','vendor/pdf.mjs','vendor/pdf.worker.mjs','print-preview.html','dashboard.html','hr-letters.html','hr-letters-review.html','eaf-gateway.js','admin-roles.js','hr-letter-fields.js','hr-letter-branding.js','hr-letter-actions.js','hr-letter-print.js','hr-letter-print.css','assets/letterheads/MEG.jpg','assets/letterheads/HD.jpg','assets/letterheads/MEH.jpg','assets/letterheads/ABP.jpg']);
http.createServer(async(req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname.slice(1)||'dashboard.html';if(!allowed.has(path)){res.writeHead(404);res.end();return;}try{res.setHeader('Content-Type',(path.endsWith('.js')||path.endsWith('.mjs'))?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.jpg')?'image/jpeg':'text/html');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"connect-src 'self' https://fjesgcsumbuniatyaeee.supabase.co; worker-src 'self'");res.end(await readFile(new URL(path,root)));}catch{res.writeHead(500);res.end();}}).listen(8767,'127.0.0.1',()=>console.log('Staging test server ready on 127.0.0.1:8767'));


