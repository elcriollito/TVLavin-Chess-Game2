import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

function channel(value) {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]) {
    return (0.2126 * channel(red)) + (0.7152 * channel(green)) + (0.0722 * channel(blue));
}

function contrast(left, right) {
    const brighter = Math.max(luminance(left), luminance(right));
    const darker = Math.min(luminance(left), luminance(right));
    return (brighter + 0.05) / (darker + 0.05);
}

function composite(foreground, background, alpha) {
    return foreground.map((value, index) => Math.round((value * alpha) + (background[index] * (1 - alpha))));
}

test('persistent board consumes the canonical CAISSA Classic square tokens', async () => {
    const legacy = await readFile(resolve(root, 'styles.css'), 'utf8');
    const persistent = await readFile(resolve(root, 'css/caissa-board.css'), 'utf8');

    assert.match(legacy, /--light-square:\s*#f0d9b5;/);
    assert.match(legacy, /--dark-square:\s*#b58863;/);
    assert.match(persistent, /--caissa-board-light:\s*var\(--light-square,\s*#f0d9b5\);/);
    assert.match(persistent, /--caissa-board-dark:\s*var\(--dark-square,\s*#b58863\);/);
    assert.match(persistent, /\.caissa-board__square--light\s*\{\s*background:\s*var\(--caissa-board-light\);\s*\}/);
    assert.match(persistent, /\.caissa-board__square--dark\s*\{\s*background:\s*var\(--caissa-board-dark\);\s*\}/);
});

test('renderer logic remains free of CAISSA Classic palette literals', async () => {
    const renderer = await readFile(resolve(root, 'js/board/caissa-persistent-renderer.js'), 'utf8');
    assert.doesNotMatch(renderer, /#f0d9b5|#b58863/i);
    assert.match(renderer, /light:\s*'--caissa-board-light'/);
    assert.match(renderer, /dark:\s*'--caissa-board-dark'/);
});

test('coordinate text and the selected-square inner boundary retain non-text contrast', () => {
    const light = [240, 217, 181];
    const dark = [181, 136, 99];
    const coordinate = [20, 24, 30];
    const coordinateAlpha = 0.72;
    const selectedInnerAlpha = 0.78;

    assert.ok(contrast(light, composite(coordinate, light, coordinateAlpha)) >= 3);
    assert.ok(contrast(dark, composite(coordinate, dark, coordinateAlpha)) >= 3);
    assert.ok(contrast(light, composite(coordinate, light, selectedInnerAlpha)) >= 3);
    assert.ok(contrast(dark, composite(coordinate, dark, selectedInnerAlpha)) >= 3);
});
