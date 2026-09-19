import { createScannerBetaRecognitionService } from '../../../api/_lib/scanner-beta-recognition-service.js';

const service = createScannerBetaRecognitionService();

export default async function handler(req, res) {
  return service.recognize(req, res);
}
