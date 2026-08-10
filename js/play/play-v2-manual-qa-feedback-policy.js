(function installManualQaFeedbackPolicy(root){
    'use strict';
    const VERSION='1.0.0';
    const categories=Object.freeze(['gameplay','visual','accessibility','performance','navigation','other']);
    const severities=Object.freeze(['blocks-testing','major-problem','minor-problem','visual-polish']);
    const discordUrl='https://discord.com/channels/1535886419279482922/1535886421775097938';
    const discordInviteUrl=null;
    const limits=Object.freeze({observation:2000,expected:2000,steps:2000,totalBytes:8192});
    const forbidden=[/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,/\b(?:\d{1,3}\.){3}\d{1,3}\b/,
        /(?:^|[^A-F0-9:])(?:[A-F0-9]{0,4}:){2,7}[A-F0-9]{0,4}(?:[^A-F0-9:]|$)/i,/\bhttps?:\/\/\S+|\bwww\.\S+/i,
        /\b(?:authorization\s*:\s*)?bearer\s+\S+/i,/\b(?:password|passphrase|api[_ -]?key|token|secret|cookie|session(?:[_ -]?id)?|device[_ -]?id|fingerprint)\s*[:=]\s*\S+/i,
        /\b(?:[prnbqk1-8]+\/){7}[prnbqk1-8]+\s+[wb]\s+(?:-|[KQkq]{1,4})\s+(?:-|[a-h][36])\s+\d+\s+\d+\b/i,
        /(?:^|\s)(?:1\.|\[Event\s+"|(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?:\s+(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)){1,})/im,
        /(?:^|[\r\n])\s*[=+@-](?:[A-Za-z]|\d|['"])/,/<[^>]*>|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/];
    const invalidText=value=>forbidden.some(pattern=>pattern.test(String(value||'')));
    const browser=ua=>/firefox/i.test(ua)?'firefox':/edg/i.test(ua)?'edge':/chrome|crios/i.test(ua)?'chromium':/safari/i.test(ua)?'safari':'other';
    const viewport=(w,h)=>w<=430?(w<h?'phone-portrait':'phone-landscape'):w<=900?(w<h?'tablet-portrait':'tablet-landscape'):'desktop';
    const id=cryptoObject=>{const bytes=new Uint8Array(16);cryptoObject.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');};
    function build(input,context,cryptoObject=root.crypto){
        if(!categories.includes(input.category)||!severities.includes(input.severity))throw new Error('REPORT_INVALID_SELECTION');
        const observation=String(input.observation||'').normalize('NFC').trim();const expected=String(input.expected||'').normalize('NFC').trim();const stepsText=String(input.steps||'').normalize('NFC').trim();
        if(!observation||!expected)throw new Error('REPORT_REQUIRED_FIELDS');
        if(observation.length>limits.observation||expected.length>limits.expected||stepsText.length>limits.steps)throw new Error('REPORT_TOO_LARGE');
        if(invalidText(`${observation}\n${expected}\n${stepsText}`))throw new Error('REPORT_SENSITIVE_OR_PROHIBITED');
        if(input.technicalContext===true&&input.consent!==true)throw new Error('CONSENT_REQUIRED');
        const value={contract:`PlayV2ManualQaReport@${VERSION}`,reportId:id(cryptoObject),createdAt:new Date(context.now).toISOString(),build:/^[a-f0-9]{7,40}$/i.test(context.build||'')?String(context.build).toLowerCase():'unknown',mode:['games','bots','coach'].includes(context.mode)?context.mode:'games',surface:['play','postgame','analyze','mentor'].includes(context.surface)?context.surface:'play',routeClass:'play',viewportClass:viewport(context.width,context.height),orientation:context.width>context.height?'landscape':'portrait',browserFamily:browser(context.userAgent),zoomClass:context.zoomClass==='200'?'200':'100',reducedMotion:context.reducedMotion===true,category:input.category,severity:input.severity,observation,expected,steps:stepsText.split(/\r?\n/).map(v=>v.trim()).filter(Boolean),diagnosticCodes:input.technicalContext===true?(context.diagnosticCodes||[]).filter(v=>/^[A-Z0-9_-]{1,40}$/.test(v)).slice(0,12):[],consent:input.technicalContext===true&&input.consent===true};
        const json=`${JSON.stringify(value,null,2)}\n`;if(new TextEncoder().encode(json).length>limits.totalBytes)throw new Error('REPORT_TOO_LARGE');return Object.freeze({value:Object.freeze(value),json});
    }
    root.CaissaPlayV2ManualQaFeedbackPolicy=Object.freeze({contractId:`PlayV2ManualQaFeedbackPolicy@${VERSION}`,reportContractId:`PlayV2ManualQaReport@${VERSION}`,categories,severities,limits,discordUrl,discordInviteUrl,build,invalidText,viewportClass:viewport,browserFamily:browser,transport:'manual-only',storage:'none',endpoint:'fail-closed'});
})(typeof window!=='undefined'?window:globalThis);
