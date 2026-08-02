# Play v2 iPhone QA 11.8.1 — paused session record

**Status:** NOT CERTIFIED — PAUSED FOR DESKTOP PRODUCT ACCEPTANCE

**Evidence classification:** attributed partial physical-device observation; not a completed `PlayV2PhysicalDeviceQAEvidence@1.0.0` certification record.

## Session attribution

- Date: 2026-08-02
- Neutral tester identifier: `tester-iphone-01`
- Physical device: true
- Manufacturer/model: Apple iPhone 17 Pro
- OS: iOS 26.6
- Browser: Safari bundled with iOS 26.6; exact standalone build not observable
- Build commit: `ed7867791dfbaabba3095f008c18f0320eb2ef68`
- `play-v2.html` SHA-256: `C211868676189C493AC24FA08573FA9B5741A9EFE0DCF581D82EA0D353414B3F`
- Environment: trusted private Wi-Fi, dedicated locally trusted QA certificate, internal beta stage
- Sensitive identifiers, device address, credentials, notifications, screenshots, and private keys: not recorded

## Attributed observations

The tester reported that Safari opened the private `/play/beta` URL without a certificate warning, the Play board was visible, and no error or unusual behavior appeared.

Group A observations supplied by the tester:

| Case | Result | Observation |
| --- | --- | --- |
| Portrait board square, practical, and primary | PASS | No additional note supplied. |
| Portrait → landscape → portrait rotation | PASS | No additional note supplied. |
| Safari toolbar expanded/collapsed | PASS | No additional note supplied. |
| Dynamic Island/top/home-indicator safe areas | PASS | No additional note supplied. |
| Horizontal scrolling absent | PASS | No additional note supplied. |
| Controls unclipped and reachable | PASS | No additional note supplied. |
| Games, Bots · Internal, and Coach · Internal visible/reachable | FAIL | Tester: “i dont see them”. |
| Players completely absent | PASS | No additional note supplied. |

No Group B–I case was executed after the failure. Missing viewport, DPR, screenshots, detailed reproduction, and remaining required cases prevent conversion to a complete evidence-schema instance.

## Issue `IPH-11.8.1-001`

- Severity: P1
- Status: open; physical certification stopped
- Summary: required Games, Bots, and Coach mode navigation was not visible/reachable on the physical iPhone entry
- Reproduction: on the attributed iPhone and trusted private session, open the internal `/play/beta` entry and inspect the Play surface for the required mode navigation
- Expected: Games, Bots · Internal, and Coach · Internal are visible and reachable; Players is absent
- Observed: board visible and Players absent, but the tester could not see Games, Bots, or Coach navigation
- Orientation/chrome state: Group A included portrait, landscape, rotation, and expanded/collapsed Safari toolbar; the tester did not attribute the failure to one narrower state
- Evidence files: none supplied
- Reproducibility/workaround: not established; triage intentionally stopped before further physical actions
- Retest: required only after manual desktop visual and functional product acceptance and separate authorization to resume physical QA

## Product-owner decision

Automated desktop checks are not a substitute for product-owner visual acceptance. Play v2 must receive manual desktop visual and functional product acceptance before iPhone certification resumes. No runtime fix was attempted during the physical evidence session.

## Session cleanup

Laptop cleanup was verified complete: the temporary CAISSA server and HTTPS proxy were stopped; their ports had no remaining listeners; the temporary firewall rule, QA certificates, exported certificate material, private-key container references, encrypted password material, logs, process record, proxy scripts, and temporary directory were removed.

The tester confirmed iPhone cleanup complete: trust for the temporary QA root was disabled, the certificate profile was removed, and the transferred public certificate file was deleted.

No certificate value, network address, credential, private key, device identifier, notification content, tunnel, deployment, or public endpoint is retained in this evidence. Nothing was pushed, deployed, tunneled, indexed, or publicly exposed. Play v2 public readiness is not claimed.
