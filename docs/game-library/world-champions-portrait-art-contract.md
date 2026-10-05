# World Champions portrait art contract

Status: Complete primary-lineage portrait set: Phase 1 prototype plus three user-approved expansion batches.

Scope: all 18 primary-lineage World Champions, from Wilhelm Steinitz through Gukesh Dommaraju.

## Visual system

- Original editorial digital painting; realistic and visibly painterly rather than photographic.
- Museum/archive tone with a dark charcoal-brown background, restrained warm highlights, subtle desaturation, and soft upper-left light.
- One subject, chest-up, upright three-quarter pose, centered face, consistent headroom, and no props.
- No text, logos, watermarks, signatures, flags, chess pieces, decorative frames, or copied photographic compositions.
- The same source portrait must work in the existing horizontal card crop and the compact detail-panel frame.

## Asset contract

| Layer | Contract |
| --- | --- |
| Source master | Lossless 3:4 image, 1086 × 1448 in this prototype; future masters should target 1536 × 2048 or another true 3:4 size. |
| Production derivative | 768 × 1024 WebP, quality 82, metadata stripped. |
| Public path | `/public/images/champions/<slug>.webp`, backed by `public/images/champions/` in the repository. |
| Rendering | Fixed intrinsic `width="768"` and `height="1024"`; `object-fit: cover`; per-portrait `objectPosition`; no layout shift. |
| Loading | First visible portrait eager; later portraits lazy; asynchronous decode. |
| Accessibility | Descriptive alt in the form `Illustrated portrait of <full name>`. |
| Fallback | If `portrait` is absent, incomplete, or not `type: "original-art"`, render the existing CAISSA archival monogram unchanged. |

The source masters remain outside the public application tree. Only the compressed derivatives are shipped.

## Data model

```js
portrait: {
  asset: '/public/images/champions/steinitz.webp',
  alt: 'Illustrated portrait of Wilhelm Steinitz',
  type: 'original-art',
  objectPosition: '50% 36%'
}
```

`objectPosition` is optional and falls back to `50% 36%`. A portrait is publishable by this renderer only when `type`, `asset`, and `alt` are present and `type` is exactly `original-art`.

## Generation provenance

Mode: OpenAI built-in image generation, original generation plus style-reference generation.

Date: 2026-10-04.

External photographs or third-party portrait assets: none.

The Steinitz master established the visual system. Fischer used only the generated Steinitz art as a style/composition reference. Gukesh used only the generated Steinitz and Fischer art as style/composition references. The prompts explicitly prohibited preservation or blending of another subject's identity and prohibited imitation of a specific photograph or FIDE asset.

Lasker, Capablanca, Alekhine, Euwe, and Botvinnik were supplied by the user as the approved first expansion batch. This integration did not regenerate or creatively edit those images; it produced only deterministic 768 × 1024 WebP derivatives and retained the supplied files outside the public application tree.

Smyslov, Tal, Petrosian, Spassky, and Karpov were supplied by the user as the approved second expansion batch. This integration likewise used no image-generation prompt and made no creative edits; it produced only deterministic 768 × 1024 WebP derivatives while keeping the supplied masters outside the public application tree.

Kasparov, Kramnik, Anand, Carlsen, Ding, and a replacement Gukesh master were supplied by the user as the approved final expansion batch. The visual subjects established the file mapping even though the attachment order differed from the accompanying name list. This integration used no image-generation prompt and made no creative edits; it produced only deterministic 768 × 1024 WebP derivatives while keeping the supplied masters outside the public application tree.

Shared final prompt direction:

> Create a new original editorial digital painting for a premium chess museum archive. Make the named champion historically recognizable from the supplied written description. Use a chest-up, centered 3:4 composition with controlled headroom, refined painterly brushwork, a dark charcoal-brown background, restrained desaturated color, faint antique-gold undertones, and soft upper-left studio light. Keep the subject dignified, human, and legible in a compact UI card. Include no text, signature, logo, watermark, border, badge, flag, chess object, or prop. Do not imitate, trace, or recreate a specific photograph or FIDE asset. Avoid photographic gloss, cartoon, anime, caricature, fantasy, and theatrical styling.

Subject clauses:

- **Wilhelm Steinitz:** elderly Central European man; high receding hairline; sparse dark-gray hair; full gray-white beard and moustache; small period wire-rim spectacles; dark Victorian suit, white shirt, and dark tie.
- **Bobby Fischer:** early thirties in the 1972 era; tall and lean; angular oval face; prominent straight nose; strong brows; deep-set focused eyes; clean-shaven; medium-length dark-brown hair brushed back; dark 1970s suit, pale shirt, and dark tie.
- **Gukesh Dommaraju:** age 18 in the 2024 era; young Indian Tamil man; slim oval face; warm medium-brown complexion; thick short black hair; rectangular black eyeglasses; neatly trimmed short moustache and beard; modern dark suit, pale shirt, and dark tie; preserve his youthful age.

## Prototype asset record

| Champion | Production file | Production bytes | Master SHA-256 | Production SHA-256 |
| --- | --- | ---: | --- | --- |
| Wilhelm Steinitz | `steinitz.webp` | 50,446 | `c0b1be6b5f52d2490cac65cb8d4a24878fb1b2731408160a9acf5fc00059596e` | `78229fe2dfa9efe5e472f8e8f9e5c323c0543cf5266d04ad9f5a7ca741f3279b` |
| Emanuel Lasker | `lasker.webp` | 29,944 | `aab0f3166d056179299e337e3cf4b645b333f9055b4f2452f2c0c4cfad2d9b24` | `f4bb01571f8ca57fe6b3338a87609f98382645164ec90c135920bc91a3055ff7` |
| José Raúl Capablanca | `capablanca.webp` | 28,462 | `84482700b095874f83fbc02ab54c4335e60e1debd813ec24ca856cbbf602bc0e` | `a054ddd12c0c11ac4a81e074a0fbe6bcd657ab115cd69c9b7ddf6206b58753a6` |
| Alexander Alekhine | `alekhine.webp` | 31,144 | `ac0a56b2ee64aa9498995449e0881ca905dc61f614ab6bc75e0cd9a52800c735` | `0d34253141b5f1bd65fec9712a96e34b01bad03de44d27b458634b032ccc3d47` |
| Max Euwe | `euwe.webp` | 32,290 | `c85e394940ae538afbc04974af9523a53a3fa23540ffd67b8c2778d4cc9bb056` | `ca64997004f86fa4ddd9faf0541203a3fca09d9c538c0a68352097cc5cf99e6a` |
| Mikhail Botvinnik | `botvinnik.webp` | 33,896 | `782f4b1ecdd8e4fda36b66eb23e93158c92f4fafa6b79702ecdf6a8d86cd0610` | `75bd1fa57facc19ce836499e448865aadf75b3081b167e677695b5d98aeac47b` |
| Vasily Smyslov | `smyslov.webp` | 31,688 | `7fb65f8f5a84ed4d042cecad993fd1e6cbc08bf6bf4065d8fe926c85baeaf23c` | `0845fa9d546dfa067e3bb7b9e395883200a860ade0662c4b9526210b9199add4` |
| Mikhail Tal | `tal.webp` | 28,092 | `d8f15a4ff9e38b7cee369108d1992104561c70d12b5d11485486c893f277552f` | `c4e42f831459c1f1f7dd1ec63e4212628df45a1e0e83966c900d752d982336e3` |
| Tigran Petrosian | `petrosian.webp` | 32,674 | `9cf0a0a2185929309095c0c74f74d25b19b2abcaaf8c8e97de14d557290da10b` | `effcff005d1db6c981728c9132e5a9c20cace1d9df09ce64cae302e7dc265090` |
| Boris Spassky | `spassky.webp` | 40,704 | `6b6f5844aeb954bdea0cf5468c8f10e3e7d36069fd5f9c5c370d4f90ae7ce51a` | `07ffac77bcc9aaccad5b3e64430ae313aecdc58e2fca1f14e9e244c8698394de` |
| Bobby Fischer | `fischer.webp` | 33,532 | `18126026baf8b61159b224df77e3205e97a9d13023e3d5da6ab6385bce02b059` | `e5618bcfefebd44602da25090e95826e864864959bed15a0417deac5a6c714bb` |
| Anatoly Karpov | `karpov.webp` | 28,726 | `831f7eedace14dcbd4b1a162447312044d5c91357ccac2bff456f9fc5664be16` | `9160170dd25e1e6155ff6c9407928996b890d17c5d435b3659763b81c89cbe1a` |
| Garry Kasparov | `kasparov.webp` | 42,840 | `d5ceb9836d9d2442784cf4744dac5c0066b0ad28e01e78d7ac4ef5f46859a455` | `a7d0aef0e3fa16eb5c9fcb2d196f727b50132670107bf84b0a3e35236d2b0df0` |
| Vladimir Kramnik | `kramnik.webp` | 36,718 | `3999cd11a42ec7c4e1aeaa564e9f22e9c45732835745fae851cb0eaa991f242b` | `a88bd408b2da10c7359c2f2309837d4afbdde08a36f3b5e07d30926fd115bcac` |
| Viswanathan Anand | `anand.webp` | 35,502 | `ed0286b07410f79011e25d45bb9ca1ff0ca9f00ad70345d57cda34050a78aeed` | `52ad88a21bf781113efabef80cb2a74cc8777fe8214eb6ea9764cc56cb50ad80` |
| Magnus Carlsen | `carlsen.webp` | 36,330 | `033db58420e455881378b8a1da69101a354df19ca99ff1182c9b2e088b51a7e0` | `206db8be3da4d809cd803164791ae2c942bf91b1c71745a55fbf66d0cd8c74ac` |
| Ding Liren | `ding.webp` | 30,516 | `adef9b96f9ae30102863d7053f9739be910b85dcbb002a5b47e25ddc8c71d954` | `fdc7454028f6407217c4bcddea9161ab47668b9d37bbcc8990a8300ce3b0d3c4` |
| Gukesh Dommaraju | `gukesh.webp` | 36,176 | `8bc42b5714784baf15e6396360b7d212c2a91a9f7081e0e61a66eab16665af73` | `b0dc71cd551832bb48e0219d12a56943030889bcd5822c8b1514592f6edb4954` |

Total production portrait payload: 619,680 bytes before HTTP transfer compression. All 18 primary-lineage champions now have approved portrait art; parallel-only titleholders continue to use the archival monogram unless separately approved.
