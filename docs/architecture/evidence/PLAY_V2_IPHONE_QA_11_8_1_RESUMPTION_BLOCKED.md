# Play v2 iPhone QA 11.8.1 — Resumption Blocked

Status: **NOT CERTIFIED — PAUSED DURING LAPTOP-SIDE VALIDATION**

Date: 2026-08-03

Evidence contract: `PlayV2PhysicalDeviceQAEvidence@1.0.0`

## Intended device

- Device: physical iPhone 17 Pro.
- Previously observed operating system: iOS 26.6.
- Current iOS version: not reconfirmed because physical testing did not begin.
- Safari version attribution: not recorded.

## Laptop-side observations

The temporary private-Wi-Fi HTTPS architecture was prepared and validated far enough to establish all of the following:

- CAISSA listened only on loopback.
- The HTTPS proxy listened only on the selected trusted private Wi-Fi interface.
- The temporary server certificate had the required private-address SAN and Server Authentication usage.
- The trusted TLS request succeeded from the Alienware.
- Games, Bots, and Coach routes rendered one board and their required mode navigation.
- Players failed closed.
- The same-origin Worker resource and ECO deep link responded successfully.
- No visible FICS or educational product surface was observed.

Laptop browser inspection also observed successful requests to three pre-existing public static-resource CDN origins. This did not expose the private server, but it did not satisfy the required same-origin-only/no-external-destination validation for this physical-QA session.

## Issues

### IPH-11.8.1-001 — Required mode navigation not visible

- Severity: P1.
- Prior state: open from the earlier physical session.
- Resumption state: **not retested on the physical device**.
- Resolution claim: none.

### IPH-11.8.1-002 — Play v2 requests public CDN resources

- Severity: P1.
- Case: secure laptop-side preparation before iPhone handoff.
- Environment: Alienware browser validation through the temporary private HTTPS endpoint.
- Reproduction: open the internal beta entry and inspect browser request origins.
- Observation: public CDN requests were made for existing static dependencies.
- Result: physical handoff blocked; no certificate was transferred or installed on the iPhone.

## Physical cases

Groups A–I were **not executed**. No physical observation is marked passed, failed, resolved, or superseded in this resumption.

## Rollback

- Backend and HTTPS proxy stopped.
- Ports closed.
- Private certificate material, exported public certificate, logs, proxy scripts, password material, and the dedicated temporary directory removed.
- No iPhone cleanup was required because no certificate or profile was transferred.
- Removal of the temporary Windows firewall rule and the remaining public trusted-root entry requires elevated/manual completion.

## Release statement

This evidence makes no physical-certification, public-readiness, deployment, or Season 11 completion claim. Nothing was pushed, deployed, tunneled, or publicly exposed.
