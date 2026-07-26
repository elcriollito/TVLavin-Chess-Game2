import { createPrivateRunOperationalConfig } from '../../js/endgame-trainer/v2/private-run-operational-config.js';

export default function handler(req,res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  return res.status(200).json(createPrivateRunOperationalConfig(process.env));
}
