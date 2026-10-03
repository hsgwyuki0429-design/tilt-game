'use strict';
/*
 * The graphics-quality decisions, without a GPU: which tier a device starts in,
 * what AUTO / HIGH / LITE mean, and when the frame monitor gives up on HIGH.
 */
var assert = require('assert');
var Q = require('../src/quality.js');

// ── detect: only plainly weak devices start in LITE ──────────────────────────
function tier(info) { return Q.detect(info).tier; }

assert.strictEqual(tier(), 'high', 'a browser that says nothing is trusted');
assert.strictEqual(tier({}), 'high');
assert.strictEqual(tier({ renderer: 'Apple GPU', cores: 6, memory: 4 }), 'high', 'an iPhone');
assert.strictEqual(tier({ renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', cores: 8 }), 'high');
assert.strictEqual(tier({ renderer: 'ANGLE (Qualcomm, Adreno (TM) 619, OpenGL ES 3.2)', cores: 8, memory: 4 }), 'high', 'a mid-range Android');
assert.strictEqual(tier({ renderer: 'ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)', cores: 8, memory: 8 }), 'high');
assert.strictEqual(tier({ renderer: 'Mali-G78', cores: 8, memory: 8 }), 'high');
assert.strictEqual(tier({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, OpenGL 4.5)', cores: 16, memory: 8 }), 'high');
assert.strictEqual(tier({ renderer: 'Intel(R) UHD Graphics 620', cores: 8, memory: 8 }), 'high');

assert.strictEqual(tier({ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' }), 'lite', 'software GL');
assert.strictEqual(tier({ renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' }), 'lite');
assert.strictEqual(tier({ renderer: 'Microsoft Basic Render Driver' }), 'lite');
assert.strictEqual(tier({ renderer: 'Mali-T760' }), 'lite', 'an old Mali');
assert.strictEqual(tier({ renderer: 'Mali-400 MP' }), 'lite');
assert.strictEqual(tier({ renderer: 'ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2)' }), 'lite', 'an entry-level Adreno');
assert.strictEqual(tier({ renderer: 'PowerVR SGX 544MP' }), 'lite');
assert.strictEqual(tier({ renderer: 'Intel(R) HD Graphics 4000' }), 'lite');
assert.strictEqual(tier({ maxTexture: 2048 }), 'lite', 'a tiny texture limit');
assert.strictEqual(tier({ cores: 4, memory: 2 }), 'lite', 'low memory and few cores');
assert.strictEqual(tier({ memory: 1 }), 'lite');
assert.strictEqual(tier({ cores: 2 }), 'lite');
assert.strictEqual(tier({ cores: 8, memory: 2 }), 'high', 'low memory alone, with many cores, is not enough');
assert.strictEqual(tier({ cores: 4 }), 'high', 'four cores and no memory figure is not enough');
assert.strictEqual(Q.detect({ renderer: 'swiftshader' }).reason, 'gpu');

// ── resolve: AUTO follows the hint and what was learned; the others are fixed ─
var DAY = 864e5, NOW = 1.8e12;
var HIGH = { tier: 'high', reason: 'default' }, LITE = { tier: 'lite', reason: 'gpu' };
assert.strictEqual(Q.resolve('high', LITE, null, NOW).tier, 'high', 'HIGH beats a weak-GPU hint');
assert.strictEqual(Q.resolve('lite', HIGH, null, NOW).tier, 'lite');
assert.strictEqual(Q.resolve('auto', HIGH, null, NOW).tier, 'high');
assert.strictEqual(Q.resolve('auto', LITE, null, NOW).tier, 'lite');
assert.strictEqual(Q.resolve('auto', HIGH, { at: NOW - 3 * DAY }, NOW).tier, 'lite', 'a recent downgrade is remembered');
assert.strictEqual(Q.resolve('auto', HIGH, { at: NOW - 3 * DAY }, NOW).reason, 'learned');
assert.strictEqual(Q.resolve('auto', HIGH, { at: NOW - 20 * DAY }, NOW).tier, 'high', 'and forgotten after two weeks');
assert.strictEqual(Q.resolve('auto', HIGH, { at: NOW + DAY }, NOW).tier, 'high', 'a timestamp from the future is ignored');
assert.strictEqual(Q.resolve('auto', HIGH, { at: 'x' }, NOW).tier, 'high');
assert.strictEqual(Q.resolve('high', HIGH, { at: NOW }, NOW).tier, 'high', 'HIGH ignores what AUTO learned');
assert.strictEqual(Q.resolve('bogus', HIGH, null, NOW).tier, 'high', 'an unknown mode behaves as AUTO');
assert.strictEqual(Q.validMode('lite'), 'lite');
assert.strictEqual(Q.validMode('x'), 'auto');
assert.strictEqual(Q.validMode(undefined), 'auto');

// ── the table: LITE is strictly cheaper than HIGH in every number ────────────
['dpr', 'shadow', 'particles', 'interior', 'detail', 'anisotropy'].forEach(function (k) {
  assert(Q.TIER.lite[k] < Q.TIER.high[k], k + ' must be cheaper in LITE');
});
assert(Q.TIER.high.caustics && Q.TIER.high.glitter && Q.TIER.high.foam);
assert(!Q.TIER.lite.caustics && !Q.TIER.lite.glitter && !Q.TIER.lite.foam);
assert(Q.TIER.high.interior > 0 && Q.TIER.lite.interior === 0, 'only HIGH marches through the ice');

// ── the monitor ──────────────────────────────────────────────────────────────
function run(gaps, busyFor) {
  var m = new Q.FrameMonitor(), verdicts = [];
  gaps.forEach(function (g, i) {
    var v = m.observe(g, busyFor ? busyFor(i) : true);
    if (v) verdicts.push(i);
  });
  return verdicts;
}
function fill(n, ms) { var a = []; for (var i = 0; i < n; i++) a.push(ms); return a; }

assert.deepStrictEqual(run(fill(400, 16.7)), [], '60 fps is fine for ever');
assert.deepStrictEqual(run(fill(400, 8.3)), [], '120 fps is fine');
assert.deepStrictEqual(run(fill(400, 33.4)), [], 'Low Power Mode (30 fps) is a choice, not weakness');
assert.deepStrictEqual(run(fill(400, 36)), [], 'just under the line');
var slow = run(fill(400, 60));
assert.strictEqual(slow.length, 1, 'a slow device is told once');
assert(slow[0] >= 12 + 36, 'and only after the warm-up and a full window: ' + slow[0]);
assert(slow[0] <= 12 + 36 + 3, 'but promptly: ' + slow[0]);
assert.strictEqual(run(fill(400, 41)).length, 1, 'a sustained 24 fps fails');
var awful = run(fill(400, 100));
assert.strictEqual(awful.length, 1, 'a device at 10 fps is told once');
assert(awful[0] <= 12 + 10 + 3, 'and sooner, after only ten frames past the warm-up: ' + awful[0]);
assert.deepStrictEqual(run(fill(400, 70)).length, 1, '14 fps still fails, by the full window');
assert(run(fill(400, 70))[0] > 12 + 10 + 3, 'not by the severe rule');

// Frames that follow an idle frame say nothing about the GPU: the loop idles at
// 20 fps on purpose.
assert.deepStrictEqual(run(fill(400, 50), function () { return false; }), [], 'an idle board never fails');
var alternating = run(fill(400, 50), function (i) { return i % 2 === 0; });
assert.strictEqual(alternating.length, 1, 'busy frames still count when idle ones are mixed in');

// One bad frame — a tab coming back, a garbage collection — is not a verdict.
var hitch = fill(400, 16.7); hitch[100] = 5000; hitch[101] = 900;
assert.deepStrictEqual(run(hitch), [], 'a single hitch is clamped and averaged away');
var shaky = fill(400, 16.7); for (var i = 0; i < 400; i += 9) shaky[i] = 70;
assert.deepStrictEqual(run(shaky), [], 'an occasional slow frame is not a verdict');

// The shader-compile hitch at the start of every stage is skipped.
var warm = fill(12, 400).concat(fill(300, 16.7));
assert.deepStrictEqual(run(warm), [], 'warm-up frames are ignored');

// reset() starts a fresh verdict (a new stage, a new context).
var mon = new Q.FrameMonitor(), v1 = null;
for (var k = 0; k < 200 && !v1; k++) v1 = mon.observe(60, true);
assert.strictEqual(v1, 'slow');
assert.strictEqual(mon.observe(60, true), null, 'no second verdict');
mon.reset();
var again = null;
for (k = 0; k < 200 && !again; k++) again = mon.observe(60, true);
assert.strictEqual(again, 'slow', 'reset() allows a new verdict');

// settle() skips a few frames (a stage is loading) but keeps what was measured.
var kept = new Q.FrameMonitor(), got = null;
for (k = 0; k < 12 + 20; k++) kept.observe(60, true);           // 20 slow frames counted, no verdict yet
kept.settle(8);
for (k = 0; k < 8 + 1; k++) assert.strictEqual(kept.observe(60, true), null, 'settling frames are skipped');
for (k = 0; k < 40 && !got; k++) got = kept.observe(60, true);
assert.strictEqual(got, 'slow', 'and the earlier samples still count towards the verdict');
assert(k <= 20, 'the verdict arrives early because samples were kept: ' + k);
assert(k > 0);

console.log('PASS: quality tiers — detection, AUTO/HIGH/LITE resolution, cost table, frame monitor');
