import { createPlayBetaService } from '../_lib/play-beta-service.js';
export default async function handler(req, res) { return createPlayBetaService().redeem(req, res); }
