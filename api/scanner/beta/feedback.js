import { createScannerBetaService } from '../../../api/_lib/scanner-beta-service.js';
export default async function handler(req, res) { return createScannerBetaService().feedback(req, res); }
