import { createScannerFeedbackReviewService } from '../../_lib/scanner-feedback-review-service.js';
export default async function handler(req, res) { return createScannerFeedbackReviewService().list(req, res); }
