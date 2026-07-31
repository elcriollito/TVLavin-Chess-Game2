import assert from 'node:assert/strict';

export function assertDeepFrozen(value, label='value') {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value),true,`${label} must be frozen`);
    for (const [key,child] of Object.entries(value)) assertDeepFrozen(child,`${label}.${key}`);
}

export function assertJsonSafe(value, label='value') {
    const seen=new Set();
    const visit=(item,path)=>{
        if (typeof item==='function'||typeof item==='symbol'||typeof item==='bigint') assert.fail(`${path} is not JSON-safe`);
        if (!item||typeof item!=='object') return;
        assert.equal(seen.has(item),false,`${path} contains a cycle`);
        seen.add(item);
        for(const [key,child] of Object.entries(item)) visit(child,`${path}.${key}`);
        seen.delete(item);
    };
    visit(value,label);
    assert.doesNotThrow(()=>JSON.stringify(value));
}

export function assertNoDangerousKeys(value, label='value') {
    if (!value||typeof value!=='object') return;
    for(const key of Object.keys(value)){
        assert.equal(['__proto__','prototype','constructor'].includes(key),false,`${label} exposes ${key}`);
        assertNoDangerousKeys(value[key],`${label}.${key}`);
    }
}
