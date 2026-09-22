// deliverSurvey 的行為測試：從真實頁面抽出函式，用假 fetch／假計時器跑各種結果，鎖住「cb 恰好一次」與「只有 ok:true 才算送達」。
// 靜態字串斷言（validate-pages.mjs）擋不住邏輯錯誤，這支補上（Codex 2026-09-20 複審第 4 項）。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const PAGES = ["index.html", "inperson/index.html", "levelh/index.html", "consult/index.html"];
const tick = () => new Promise((r) => setImmediate(r));

function load(html) {
  const a = html.indexOf("function deliverSurvey(payload, cb, leaving)");
  const b = html.indexOf("// ===== 第一題");
  assert.ok(a > 0 && b > a, "cannot locate deliverSurvey");
  return html.slice(a, b);
}

function env(src, { endpoint = "https://example.test/exec", fetchImpl, beacon } = {}) {
  const timers = [];
  const calls = { fetch: [], beacon: 0 };
  const ctx = {
    SURVEY_ENDPOINT: endpoint,
    console: { log() {}, warn() {} },
    navigator: beacon === undefined ? {} : { sendBeacon: (...a) => { calls.beacon++; return beacon(...a); } },
    Blob: class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } },
    AbortController,
    JSON,
    setTimeout: (fn, ms) => { const t = { id: timers.length + 1, fn, ms, cleared: false }; timers.push(t); return t.id; },
    clearTimeout: (id) => { const t = timers.find((x) => x.id === id); if (t) t.cleared = true; },
  };
  if (fetchImpl) ctx.fetch = (url, opts) => { calls.fetch.push({ url, opts }); return fetchImpl(url, opts); };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const results = [];
  const run = (payload, leaving) => ctx.deliverSurvey(payload, (...args) => results.push(args), leaving);
  return { run, results, timers, calls };
}

const okResp = (json, over = {}) => ({ ok: true, status: 200, json: async () => json, ...over });

for (const path of PAGES) {
  const src = load(await readFile(path, "utf8"));
  const T = (name, fn) => fn().then(() => {}, (e) => { e.message = `[${path}] ${name}: ${e.message}`; throw e; });

  await T("ok:true → cb(true) 恰好一次、計時器被清掉、走 cors", async () => {
    const e = env(src, { fetchImpl: async () => okResp({ ok: true, type: "survey" }) });
    e.run({ a: 1 }); await tick();
    assert.deepEqual(e.results, [[true]]);
    assert.equal(e.timers[0].cleared, true);
    assert.equal(e.calls.fetch[0].opts.mode, "cors");
    assert.equal(e.calls.fetch[0].opts.keepalive, true);
  });

  for (const [name, impl] of [
    ["ok:false", async () => okResp({ ok: false, error: "Unknown payload type" })],
    ["缺 ok 欄位", async () => okResp({ type: "survey" })],
    ["ok 是字串 'true'", async () => okResp({ ok: "true" })],
    ["JSON null", async () => okResp(null)],
    ["非 JSON（HTML 錯誤頁）", async () => okResp(null, { json: async () => { throw new SyntaxError("Unexpected token <"); } })],
    ["HTTP 500", async () => ({ ok: false, status: 500, json: async () => ({ ok: true }) })],
    ["網路失敗", async () => { throw new TypeError("Failed to fetch"); }],
    ["fetch 同步丟例外", () => { throw new Error("sync boom"); }],
  ]) {
    await T(`${name} → cb(false) 恰好一次`, async () => {
      const e = env(src, { fetchImpl: impl });
      e.run({}); await tick();
      assert.deepEqual(e.results, [[false]]);
    });
  }

  await T("逾時：計時器觸發 → abort＋cb(false)；之後才回來的成功不再呼叫 cb", async () => {
    let resolveLate, signal;
    const e = env(src, { fetchImpl: (u, o) => { signal = o.signal; return new Promise((r) => { resolveLate = r; }); } });
    e.run({}); await tick();
    assert.equal(e.results.length, 0);
    assert.equal(e.timers[0].ms, 20000);
    e.timers[0].fn(); await tick();
    assert.deepEqual(e.results, [[false]]);
    assert.equal(signal.aborted, true);
    resolveLate(okResp({ ok: true })); await tick();
    assert.equal(e.results.length, 1, "晚到的成功不可再呼叫 cb");
  });

  await T("逾時後 fetch 以 AbortError 拒絕：不再呼叫 cb", async () => {
    let rejectLate;
    const e = env(src, { fetchImpl: () => new Promise((_, rej) => { rejectLate = rej; }) });
    e.run({}); await tick();
    e.timers[0].fn(); await tick();
    rejectLate(Object.assign(new Error("aborted"), { name: "AbortError" })); await tick();
    assert.deepEqual(e.results, [[false]]);
  });

  await T("先成功、計時器之後才觸發：不再呼叫 cb", async () => {
    const e = env(src, { fetchImpl: async () => okResp({ ok: true }) });
    e.run({}); await tick();
    e.timers[0].fn(); await tick();
    assert.deepEqual(e.results, [[true]]);
  });

  await T("cb 自己丟例外：不會被 catch 再呼叫一次", async () => {
    const ctx = { SURVEY_ENDPOINT: "https://example.test/exec", console: { log() {}, warn() {} }, navigator: {}, Blob: class {}, AbortController, JSON,
      fetch: async () => okResp({ ok: true }), setTimeout: () => 1, clearTimeout() {} };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    let n = 0;
    ctx.deliverSurvey({}, () => { n++; throw new Error("cb boom"); }, false);
    await tick(); await tick();
    assert.equal(n, 1, "cb 丟例外後不可被再呼叫");
  });

  await T("leaving：beacon 排入佇列 → cb(true, true) 一次、不動 fetch", async () => {
    const e = env(src, { beacon: () => true, fetchImpl: async () => okResp({ ok: true }) });
    e.run({}, true); await tick();
    assert.deepEqual(e.results, [[true, true]]);
    assert.equal(e.calls.fetch.length, 0);
  });

  await T("leaving：beacon 排不進去 → no-cors fetch，成功仍標 queued", async () => {
    const e = env(src, { beacon: () => false, fetchImpl: async () => ({}) });
    e.run({}, true); await tick();
    assert.deepEqual(e.results, [[true, true]]);
    assert.equal(e.calls.fetch[0].opts.mode, "no-cors");
  });

  await T("leaving：beacon 丟例外 → 落到 no-cors fetch", async () => {
    const e = env(src, { beacon: () => { throw new Error("nope"); }, fetchImpl: async () => ({}) });
    e.run({}, true); await tick();
    assert.deepEqual(e.results, [[true, true]]);
  });

  await T("leaving：beacon 與 fetch 都失敗 → cb(false)", async () => {
    const e = env(src, { beacon: () => false, fetchImpl: async () => { throw new TypeError("offline"); } });
    e.run({}, true); await tick();
    assert.deepEqual(e.results, [[false]]);
  });

  await T("瀏覽器沒有 fetch：走 beacon，標 queued", async () => {
    const e = env(src, { beacon: () => true });
    e.run({}); await tick();
    assert.deepEqual(e.results, [[true, true]]);
  });

  await T("端點未設定：cb(true) 且不送任何東西", async () => {
    const e = env(src, { endpoint: "REPLACE_ME", beacon: () => true, fetchImpl: async () => okResp({ ok: true }) });
    e.run({}); await tick();
    assert.deepEqual(e.results, [[true]]);
    assert.equal(e.calls.fetch.length + e.calls.beacon, 0);
  });
}

console.log(`Behavior-tested deliverSurvey on ${PAGES.length} pages.`);
