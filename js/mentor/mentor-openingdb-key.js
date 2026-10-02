// Key contract reused from js/opening-database.js. No page bootstrap, engine or board.
export function normalizeFenForHash(fen) {
    const parts = String(fen || '').trim().split(/\s+/);
    if (parts.length < 4) return String(fen || '').trim();
    return `${parts[0]} ${parts[1] || 'w'} ${parts[2] || '-'} ${parts[3] || '-'}`;
  }

  function sha1Hex(input) {
    function rotl(n, s) {
      return (n << s) | (n >>> (32 - s));
    }
    function toHex(i) {
      return (`00000000${(i >>> 0).toString(16)}`).slice(-8);
    }

    const msg = unescape(encodeURIComponent(String(input || '')));
    const words = [];
    for (let i = 0; i < msg.length; i += 1) {
      words[i >> 2] |= msg.charCodeAt(i) << (24 - (i % 4) * 8);
    }
    words[msg.length >> 2] |= 0x80 << (24 - (msg.length % 4) * 8);
    words[(((msg.length + 8) >> 6) + 1) * 16 - 1] = msg.length * 8;

    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;

    for (let i = 0; i < words.length; i += 16) {
      const w = [];
      for (let j = 0; j < 16; j += 1) w[j] = words[i + j] | 0;
      for (let j = 16; j < 80; j += 1) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;

      for (let j = 0; j < 80; j += 1) {
        let f = 0;
        let k = 0;
        if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const temp = (rotl(a, 5) + f + e + k + (w[j] | 0)) | 0;
        e = d;
        d = c;
        c = rotl(b, 30) | 0;
        b = a;
        a = temp;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
    }

    return (toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4)).toLowerCase();
  }

export function hashFen(fen) {
    return sha1Hex(normalizeFenForHash(fen)).slice(0, 16);
  }
