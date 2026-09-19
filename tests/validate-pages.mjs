import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pages = [
  {
    path: "index.html",
    pageName: "thank-you-online-course",
    contentId: "improvdating",
  },
  {
    path: "inperson/index.html",
    pageName: "thank-you-inperson-course",
    contentId: "improvlevela",
  },
];

const requiredSharedSnippets = [
  '<html lang="zh-TW">',
  '<meta charset="UTF-8">',
  'name="viewport"',
  "new URLSearchParams(window.location.search).get('tradeNo')",
  "if (!tn || tn.charAt(0) === '{') return;",
  "localStorage.getItem(k)",
  "localStorage.setItem(k, '1')",
  "{eventID: tn}",
  "content_type: 'product'",
  "navigator.sendBeacon",
  "keepalive: true",
  "startsWith('{') && v.endsWith('}')",
  "https://dioacademy.tw",
];

for (const page of pages) {
  const html = await readFile(page.path, "utf8");

  for (const snippet of requiredSharedSnippets) {
    assert.ok(
      html.includes(snippet),
      `${page.path} is missing required safeguard: ${snippet}`,
    );
  }

  assert.ok(
    html.includes(`content_ids: ['${page.contentId}']`),
    `${page.path} is missing its expected catalog content ID`,
  );
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
    1,
    `${page.path} must contain exactly one browser Purchase event`,
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
    "ga_purchase_backup_",
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

console.log(`Validated ${pages.length} production pages.`);
