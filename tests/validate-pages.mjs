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

console.log(`Validated ${pages.length} production pages.`);
