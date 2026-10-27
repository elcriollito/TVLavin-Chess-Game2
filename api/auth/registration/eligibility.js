import { createRegistrationAgeGateService } from '../../_lib/registration-age-gate-service.js';

export default function handler(req, res) {
  return createRegistrationAgeGateService().eligibility(req, res);
}
