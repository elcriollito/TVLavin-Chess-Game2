import { readFile } from 'node:fs/promises';
import { applyPrivateHeaders } from '../_lib/play-beta-policy.js';

const entryPath=new URL('../../play-v2-public-beta.html',import.meta.url);
const unavailablePath=new URL('../../play-v2-unavailable.html',import.meta.url);
const read=path=>readFile(path,'utf8');
const MODES=Object.freeze(['games','bots','coach']);

export default async function handler(req,res){
    applyPrivateHeaders(res,'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    if(req.method!=='GET'||process.env.CAISSA_PLAY_V2_BETA_STAGE!=='public-beta'||!MODES.includes(req.query?.mode))return res.status(404).send(await read(unavailablePath));
    try{
        let html=await read(entryPath);const build=/^[a-f0-9]{7,40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA||'')?process.env.VERCEL_GIT_COMMIT_SHA.toLowerCase():'unknown';
        html=html.replace('</head>',`    <meta name="caissa-build" content="${build}">\n</head>`);
        return res.status(200).send(html);
    }catch(_){return res.status(503).send(await read(unavailablePath));}
}
