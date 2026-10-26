import { createScannerPublicRecognitionService } from '../../_lib/scanner-public-recognition-service.js';

const service = createScannerPublicRecognitionService();

export default async function handler(req, res) { return service.recognize(req, res); }
