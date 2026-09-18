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

// GA4 purchase 備援（2026-09-19）：三頁都要有，且只能有一次、不帶 value、只認真訂單編號
for (const path of ["index.html", "inperson/index.html", "consult/index.html"]) {
  const html = await readFile(path, "utf8");
  assert.equal(
    (html.match(/gtag\('event', 'purchase'/g) ?? []).length,
    1,
    `${path} must contain exactly one GA4 purchase backup event`,
  );
  for (const snippet of [
    "/^DIO[0-9A-F]{17}$/.test(tn || '')",
    "ga_purchase_backup_",
    "transaction_id: tn",
    "send_page_view: false",
    "gtag/js?id=G-JC7428L3DP",
    "'G-ES6BX92WL7'",
  ]) {
    assert.ok(html.includes(snippet), `${path} GA4 backup is missing: ${snippet}`);
  }
  const block = html.slice(html.indexOf("gtag('event', 'purchase'"), html.indexOf("transport_type: 'beacon'"));
  assert.ok(!/\bvalue\s*:/.test(block), `${path} GA4 backup must not send value`);
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
