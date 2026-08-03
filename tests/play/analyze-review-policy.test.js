import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../js/play/analyze-review-policy.js', import.meta.url), 'utf8');
const load = () => { const window = {}; vm.runInNewContext(source, { window, globalThis: window, Object, Number, Math }); return window.CaissaAnalyzeReviewPolicy; };
test('policy is versioned and exposes only evidence-backed categories', () => {
    const p=load(); assert.equal(p.contractId,'AnalyzeReviewPolicy@1.0.0');
    assert.deepEqual([...p.classifications],['Book','Acceptable','Inaccuracy','Mistake','Blunder']);
});
test('loss thresholds and mate swing are deterministic', () => {
    const p=load();
    for(const [loss,quality] of [[0.49,'Acceptable'],[0.5,'Inaccuracy'],[0.99,'Inaccuracy'],[1,'Mistake'],[2.49,'Mistake'],[2.5,'Blunder']])
        assert.equal(p.classify({loss}).quality,quality);
    assert.equal(p.classify({loss:0,mateSwing:true}).quality,'Blunder');
});
test('visible policy stays quiet for acceptable and recognized book moves', () => {
    const p=load();
    assert.deepEqual({quality:p.classify({loss:0}).quality,annotation:p.classify({loss:0}).annotation},
        {quality:'Acceptable',annotation:''});
    assert.deepEqual({quality:p.classify({loss:0.49,book:true}).quality,annotation:p.classify({loss:0.49,book:true}).annotation},
        {quality:'Book',annotation:''});
    assert.equal(p.classify({loss:0.5,book:true}).quality,'Inaccuracy');
});
test('missing evidence cannot become a quality or accuracy', () => {
    const p=load(); assert.equal(p.classify({loss:null}).ok,false);
    assert.equal(p.accuracy([]).value,null); assert.equal(p.accuracy([{loss:0},{loss:null}]).value,null);
});
test('accuracy uses analyzed losses only and distinguishes a negative sample', () => {
    const p=load(); assert.equal(p.accuracy([{loss:0}]).value,'100.0');
    assert.notEqual(p.accuracy([{loss:0},{loss:3}]).value,'100.0');
    assert.equal(p.accuracy([{loss:0,accuracyIncluded:false},{loss:1}]).value,p.accuracy([{loss:1}]).value);
    assert.equal(p.accuracy([{loss:0,accuracyIncluded:false}]).value,null);
});
