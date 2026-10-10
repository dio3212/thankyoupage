import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pages = [
  {
    path: "index.html",
    pageName: "thank-you-online-course",
    contentId: "improvdating",
    browserPurchase: true,
  },
  {
    path: "inperson/index.html",
    pageName: "thank-you-inperson-course",
    contentId: "improvlevela",
    browserPurchase: true,
  },
  {
    path: "levelh/index.html",
    pageName: "thank-you-inperson-course-levelh",
    contentId: "levelh",
    browserPurchase: true,
  },
  {
    // 諮詢頁刻意沒有瀏覽器 Meta Purchase（金額走 Teachify 端與 webhook CAPI，不在這頁認金額），
    // 所以也沒有 content_ids。放進清單是為了讓其餘共用檢查涵蓋它，並把「沒有 Purchase」寫成斷言而不是排除。
    path: "consult/index.html",
    pageName: "thank-you-consult",
    contentId: null,
    browserPurchase: false,
  },
];

// 三頁都必須有
const requiredSharedSnippets = [
  '<html lang="zh-TW">',
  '<meta charset="UTF-8">',
  'name="viewport"',
  "new URLSearchParams(window.location.search).get('tradeNo')",
  "navigator.sendBeacon",
  "keepalive: true",
  "startsWith('{') && v.endsWith('}')",
  "https://dioacademy.tw",
];

// 只有會在瀏覽器認一筆 Meta Purchase 的頁才有（eventID 去重、localStorage 防重整重送）
const requiredPurchaseSnippets = [
  "if (!tn || tn.charAt(0) === '{') return;",
  "localStorage.getItem(k)",
  "localStorage.setItem(k, '1')",
  "{eventID: tn}",
  "content_type: 'product'",
];

for (const page of pages) {
  const html = await readFile(page.path, "utf8");

  for (const snippet of requiredSharedSnippets) {
    assert.ok(
      html.includes(snippet),
      `${page.path} is missing required safeguard: ${snippet}`,
    );
  }

  if (page.browserPurchase) {
    for (const snippet of requiredPurchaseSnippets) {
      assert.ok(
        html.includes(snippet),
        `${page.path} is missing required Purchase safeguard: ${snippet}`,
      );
    }
    assert.ok(
      html.includes(`content_ids: ['${page.contentId}']`),
      `${page.path} is missing its expected catalog content ID`,
    );
  } else {
    assert.equal(
      page.contentId,
      null,
      `${page.path} declares no browser Purchase, so it must not declare a content ID`,
    );
  }
  assert.ok(
    html.includes(`var PAGE = '${page.pageName}'`),
    `${page.path} is missing its expected survey page name`,
  );
  assert.ok(
    !html.includes("dio3212.kaik.io"),
    `${page.path} still contains the retired domain`,
  );
  assert.equal(
    (html.match(/fbq\('track', 'Purchase'/g) ?? []).length,
    page.browserPurchase ? 1 : 0,
    `${page.path} browser Purchase count does not match its declared role`,
  );
}

// GA4 購買到站備援（2026-09-19，Codex 複審後改版）：三頁都要有；只能送非電商事件，絕不能再送原生 purchase
for (const path of ["index.html", "inperson/index.html", "levelh/index.html", "consult/index.html"]) {
  const html = await readFile(path, "utf8");
  assert.equal(
    (html.match(/gtag\('event', 'purchase_backup_observed'/g) ?? []).length,
    1,
    `${path} must contain exactly one GA4 backup event`,
  );
  assert.ok(!/gtag\('event', 'purchase'/.test(html), `${path} must not send a native GA4 purchase (cross-client duplicate risk)`);
  for (const snippet of [
    "/^DIO[0-9A-F]{17}$/.test(tn || '')",
    "transaction_id: tn",
    "send_page_view: false",
    "send_to: 'G-ES6BX92WL7'",
    "page_location: loc",
    "gtag/js?id=G-JC7428L3DP",
  ]) {
    assert.ok(html.includes(snippet), `${path} GA4 backup is missing: ${snippet}`);
  }
  const block = html.slice(html.indexOf("gtag('event', 'purchase_backup_observed'"), html.indexOf("transport_type: 'beacon'"));
  assert.ok(!/\b(value|items|currency)\s*:/.test(block), `${path} GA4 backup must not carry ecommerce fields`);
  assert.ok(!/gtag\('config', 'G-JC7428L3DP'/.test(html), `${path} must not config the non-report property`);
}

// 兩題問卷（2026-10-10 改版）：兩題同時顯示、都必答、同樣的按鈕、一次送出
const ALL = ["index.html", "inperson/index.html", "levelh/index.html", "consult/index.html"];
for (const path of ALL) {
  const html = await readFile(path, "utf8");
  const count = (s) => html.split(s).length - 1;
  assert.ok(html.includes("第 1 題｜你第一次是從哪裡知道東區德的？"), `${path} Q1 wording changed`);
  assert.ok(html.includes("第 2 題｜這次決定購買前，哪一個幫你最多？"), `${path} Q2 wording changed`);
  assert.equal(count('<span class="req">必答</span>'), 2, `${path} both questions must be labelled required`);
  assert.equal(count('data-q="q1"'), 11, `${path} must have 11 Q1 options`);
  assert.equal(count('data-q="q2"'), 12, `${path} must have 12 Q2 options`);
  assert.ok(!html.includes('class="assist-btn"'), `${path} Q2 must use the same .survey-btn as Q1 (equal size)`);
  assert.ok(!html.includes('id="assistBox"'), `${path} old hidden second-question box must be gone`);
  assert.ok(html.includes('id="surveySend" disabled'), `${path} submit must start disabled`);
  assert.ok(html.includes("var ready = (sent.q1 || chosen.q1) && (sent.q2 || chosen.q2);"), `${path} submit must require both answers`);
  assert.ok(html.includes("if (!((sent.q1 || chosen.q1) && (sent.q2 || chosen.q2))) return;"), `${path} submit() must also guard both answers (pagehide path)`);
  assert.ok(html.includes("kind: 'purchase_assist'"), `${path} is missing the Q2 payload kind`);
  assert.ok(!/order_ref[^\n]*trade_no|["']?\btrade_no["']?\s*:/.test(html.slice(html.indexOf("purchase_assist"))), `${path} Q2 payload must not carry trade_no (would hit the webhook branch)`);
  // 送出入口與送達處理
  assert.equal(count("function deliverSurvey(payload, cb, leaving)"), 1, `${path} must define deliverSurvey once`);
  assert.equal(count("deliverSurvey(payload, function (ok, queued)") + count("deliverSurvey(p, function (ok, queued)"), 2, `${path} both questions must submit through deliverSurvey`);
  assert.equal(count("navigator.sendBeacon(SURVEY_ENDPOINT"), 1, `${path} must not send outside deliverSurvey (beacon)`);
  assert.equal(count("fetch(SURVEY_ENDPOINT"), 2, `${path} must not send outside deliverSurvey (fetch)`);
  const noCorsAt = html.indexOf("mode: 'no-cors'");
  assert.ok(noCorsAt > 0 && /\.then\(\(\) => cb\(true, true\), \(e\) => \{[^}]*cb\(false\)/.test(html.slice(noCorsAt, noCorsAt + 300)), `${path} leaving-path fetch must report queued and failure`);
  const corsAt = html.indexOf("mode: 'cors'");
  assert.ok(corsAt > 0, `${path} explicit submit must use a CORS fetch to read the server reply`);
  const corsBlock = html.slice(corsAt, corsAt + 700);
  assert.ok(corsBlock.includes("if (!r.ok) throw new Error('http ' + r.status); return r.json();"), `${path} CORS path must reject non-2xx and parse JSON`);
  assert.ok(corsBlock.includes("finish(!!j && j.ok === true)"), `${path} CORS path must require an explicit ok:true`);
  assert.ok(corsBlock.includes(".catch((e) => { console.warn('survey delivery failed', e); finish(false); })"), `${path} CORS path must map any failure to cb(false)`);
  assert.equal(count("}, 20000);"), 1, `${path} explicit submit needs a 20s timeout`);
  assert.ok(html.includes("typeof AbortController === 'function'"), `${path} timeout must abort the request when AbortController exists`);
  for (const id of ['id="surveyStatus"', 'id="surveyError"']) assert.ok(html.includes(id), `${path} is missing ${id}`);
  // 兩題依序送：第 1 題成功才送第 2 題；失敗只重送沒成功的
  assert.ok(html.includes("if (sent.q1) return next(true);") && html.includes("if (sent.q2) return next(true);"), `${path} must skip a question that was already delivered`);
  assert.ok(html.includes("sendQ1(leaving, settled);") && html.includes("sendQ2(leaving, settled);"), `${path} must send both questions in parallel (serial loses Q2 on page leave)`);
  assert.ok(html.includes("if (bad) { fail(); return; }"), `${path} must allow retry when either question fails`);
  assert.ok(html.includes("if (chosen.q1 && !sent.q1) { state = 'sending'; sendQ1(true, function () {}); }"), `${path} pagehide must still flush a Q1-only answer`);
  assert.equal(count("send.addEventListener('click', function () { submit(false); })"), 1, `${path} send button must submit with leaving=false`);
  assert.equal(count("submit(true)"), 1, `${path} only the pagehide flush may submit with leaving=true`);
  assert.ok(html.includes("if (state !== 'idle') return;"), `${path} submit must be guarded against repeat sends`);
  // 重整不再重送：只有伺服器回 ok:true 才寫旗標，排入佇列不算
  assert.ok(html.includes("'survey_sent_' + ref()") && html.includes("'assist_sent_' + ref()"), `${path} must remember sent flags per order`);
  assert.equal(count("cb(true, true)"), 2, `${path} both beacon paths must report queued=true`);
  assert.equal(count("!queued) { try { localStorage.setItem("), 2, `${path} flags must not be written for a queued delivery`);
  assert.ok(html.includes("if (n >= 20) break;") && html.includes("out[k.slice(0, 60)] = v.slice(0, 300)"), `${path} survey URL params must be capped`);
  assert.ok(!/addEventListener\('visibilitychange'/.test(html), `${path} must not auto-submit on tab switch`);
  assert.equal(count("addEventListener('pagehide'"), 1, `${path} must keep exactly one pagehide flush`);
  const gaFn = html.slice(html.indexOf("window.dioGaPurchaseBackup = function"), html.indexOf("window.dioGaPurchaseBackup(new"));
  assert.ok(!/localStorage/.test(gaFn), `${path} GA backup must not persist a sent flag`);
  assert.ok(!/event_callback\s*:/.test(gaFn), `${path} GA backup must not treat event_callback as delivery proof`);
}

// 三頁的送出邏輯必須逐字相同（只差 page 識別字）：改一頁漏兩頁是這個 repo 最容易出的錯
{
  const blocks = [];
  for (const page of pages) {
    const html = await readFile(page.path, "utf8");
    const a = html.indexOf("function deliverSurvey(payload, cb, leaving)");
    const b = html.lastIndexOf("</script>");
    assert.ok(a > 0 && b > a, `${page.path} survey script block not found`);
    blocks.push(html.slice(a, b).split(page.pageName).join("PAGEID"));
  }
  assert.ok(blocks[0].length > 3000, "survey script block suspiciously short");
  for (let i = 1; i < blocks.length; i++) {
    assert.equal(blocks[i], blocks[0], `${pages[i].path} survey script differs from ${pages[0].path}`);
  }
}

console.log(`Validated ${pages.length} production pages.`);
