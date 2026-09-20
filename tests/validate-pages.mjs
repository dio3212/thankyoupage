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
    html.includes(`page: '${page.pageName}'`),
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
for (const path of ["index.html", "inperson/index.html", "consult/index.html"]) {
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

// 購前助攻（2026-09-19）：第一題問「第一次從哪裡知道」，第二題選填、另送 kind=purchase_assist，且不可掛 survey-btn（會被第一題的鎖定一起停用）
for (const path of ["index.html", "inperson/index.html", "consult/index.html"]) {
  const html = await readFile(path, "utf8");
  assert.ok(html.includes("<h3>幫我一個忙｜你第一次是從哪裡知道東區德的？</h3>"), `${path} discovery question wording changed`);
  assert.ok(html.includes("kind: 'purchase_assist'"), `${path} is missing the assist payload kind`);
  assert.ok(!html.includes('class="survey-btn assist-btn"'), `${path} assist buttons must not reuse .survey-btn`);
  assert.equal((html.match(/class="assist-btn"/g) ?? []).length, 12, `${path} must have 12 assist options`);
  assert.ok(!/order_ref[^\n]*trade_no|\btrade_no\s*:/.test(html.slice(html.indexOf("purchase_assist"))), `${path} assist payload must not carry trade_no (would hit the webhook branch)`);
}

// 問卷單次提交與送達失敗處理（2026-09-19 Codex 複審第 3、4 項）：三頁共用同一套送出邏輯
for (const path of ["index.html", "inperson/index.html", "consult/index.html"]) {
  const html = await readFile(path, "utf8");
  const count = (s) => html.split(s).length - 1;
  // 送出只有一個入口：sendBeacon／fetch 各只出現在 deliverSurvey 內，兩題共用，才不會各寫各的漏掉失敗處理
  assert.equal(count("function deliverSurvey(payload, cb, leaving)"), 1, `${path} must define deliverSurvey once`);
  assert.equal(count("deliverSurvey(payload, ok =>") + count("deliverSurvey(p, function (ok, queued)"), 2, `${path} both questions must submit through deliverSurvey`);
  // 送出只有 deliverSurvey 一個入口：beacon 一處、fetch 兩處（頁面關閉用的 no-cors，與按鈕送出用的 cors）
  assert.equal(count("navigator.sendBeacon(SURVEY_ENDPOINT"), 1, `${path} must not send outside deliverSurvey (beacon)`);
  assert.equal(count("fetch(SURVEY_ENDPOINT"), 2, `${path} must not send outside deliverSurvey (fetch)`);
  const noCorsAt = html.indexOf("mode: 'no-cors'");
  assert.ok(noCorsAt > 0 && /\.then\(\(\) => cb\(true, true\), \(e\) => \{[^}]*cb\(false\)/.test(html.slice(noCorsAt, noCorsAt + 300)), `${path} leaving-path fetch must handle rejection with cb(false)`);
  // 按鈕送出走 CORS 讀回應：只有伺服器明確回 ok:true 才算送達（Apps Script 成功回 {"ok":true,"type":"survey"|"assist"}）
  const corsAt = html.indexOf("mode: 'cors'");
  assert.ok(corsAt > 0, `${path} explicit submit must use a CORS fetch to read the server reply`);
  const corsBlock = html.slice(corsAt, corsAt + 700);
  assert.ok(corsBlock.includes("if (!r.ok) throw new Error('http ' + r.status); return r.json();"), `${path} CORS path must reject non-2xx and parse JSON`);
  assert.ok(corsBlock.includes("finish(!!j && j.ok === true)"), `${path} CORS path must require an explicit ok:true`);
  assert.ok(corsBlock.includes(".catch((e) => { console.warn('survey delivery failed', e); finish(false); })"), `${path} CORS path must map any failure to cb(false)`);
  assert.equal(count("}, 20000);"), 1, `${path} explicit submit needs a 20s timeout`);
  assert.ok(html.includes("typeof AbortController === 'function'"), `${path} timeout must abort the request when AbortController exists`);
  // 送出中要有可見狀態，避免 Apps Script 回應慢（實測 1.5-3.3 秒）時買家以為沒反應而重按
  for (const id of ['id="surveyStatus"', 'id="assistStatus"']) assert.ok(html.includes(id), `${path} is missing ${id}`);
  // 失敗要有可見提示，且不能再無條件顯示謝謝
  for (const id of ['id="surveyError"', 'id="assistError"']) assert.ok(html.includes(id), `${path} is missing ${id}`);
  assert.ok(html.includes("if (!ok) {"), `${path} must branch on delivery failure`);
  // 第二題單次提交：選項只是選取，按送出才送；不得回到「點選項送一次、補充再送一次」的兩列寫法
  assert.ok(!/post\(\{/.test(html), `${path} assist must not use the old two-shot post()`);
  assert.ok(html.includes('id="assistSend" disabled'), `${path} assist send button must start disabled`);
  assert.equal(count("send.addEventListener('click', function () { submit(false); })"), 1, `${path} assist send button must submit with leaving=false`);
  assert.equal(count("submit(true)"), 1, `${path} only the pagehide flush may submit with leaving=true`);
  assert.ok(html.includes("}, leaving === true);"), `${path} assist submit must pass the leaving flag to deliverSurvey`);
  assert.ok(html.includes("if (!chosen || state !== 'idle') return;"), `${path} assist submit must be guarded against repeat sends`);
  // 重整不再重送：送出成功才記這筆訂單已送過，載入時讀回
  assert.ok(html.includes("'assist_sent_' + ref()"), `${path} assist must remember a sent order`);
  assert.ok(html.includes("localStorage.getItem(sentKey)"), `${path} assist must read the sent flag on load`);
  // 排入佇列（beacon／no-cors）不等於伺服器確認：只有 ok:true 才寫永久旗標，pagehide 補送不寫（Codex 2026-09-20 第二輪 P1）
  assert.equal(count("cb(true, true)"), 2, `${path} both beacon paths must report queued=true`);
  assert.ok(html.includes("if (sentKey && !queued) { try { localStorage.setItem(sentKey, '1'); } catch (e) {} }"), `${path} assist flag must not be written for a queued (pagehide) send`);
  // 第一題只帶有限的 URL 參數，keepalive 請求本體有 64 KiB 上限
  assert.ok(html.includes("if (paramCount >= 20) break;") && html.includes("urlParams[k.slice(0, 60)] = v.slice(0, 300)"), `${path} survey URL params must be capped`);
  // 只在真的離開頁面時補送：切到別的分頁去複製搜尋詞或網址不算離開
  assert.ok(!/addEventListener\('visibilitychange'/.test(html), `${path} must not auto-submit on tab switch`);
  assert.equal(count("addEventListener('pagehide'"), 1, `${path} must keep exactly one pagehide flush`);
  // GA 備援完全不碰 localStorage：event_callback 只證明 gtag 已派送、不證明 GA4 收到，
  // 一寫旗標就會讓「callback 跑了但 collect 被擋」的買家永久不再補送。重複交給報表按訂單編號去重。
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
