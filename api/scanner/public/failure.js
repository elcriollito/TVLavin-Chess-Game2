import { createScannerPublicService } from '../../_lib/scanner-public-service.js';
export default async function handler(req, res) { return createScannerPublicService().failure(req, res); }
