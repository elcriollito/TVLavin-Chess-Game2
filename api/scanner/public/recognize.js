import { createScannerPublicRecognitionService } from '../../_lib/scanner-public-recognition-service.js';
export default async function handler(req, res) { return createScannerPublicRecognitionService().recognize(req, res); }
