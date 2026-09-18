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

console.log(`Validated ${pages.length} production pages.`);
