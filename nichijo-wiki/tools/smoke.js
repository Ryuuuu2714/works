// 日常鯖 攻略Wiki の動作確認（jsdom でブラウザを模して、主な画面を開いて確かめる）
// 使い方: node smoke.js <nichijo-wiki のディレクトリ>
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const root = process.argv[2];   // ローカルのディレクトリ、または公開URL（https://…/nichijo-wiki/）
const LIVE = /^https?:\/\//.test(root);
const BASE = LIVE ? root.replace(/\/?$/, "/") : "https://example.test/works/nichijo-wiki/";
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.stack || e.message)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));
let fetchCount = 0;
let w;

async function readRel(rel) {
  if (LIVE) {
    const r = await fetch(new URL(rel, BASE));
    return { ok: r.ok, status: r.status, body: await r.text() };
  }
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return { ok: false, status: 404, body: "" };
  return { ok: true, status: 200, body: fs.readFileSync(file, "utf8") };
}

async function boot() {
  let html = (await readRel("index.html")).body;
  html = html.replace(/<script src=[^>]+><\/script>/g, "");   // 外部スクリプトは下で手で読み込む
  const dom = new JSDOM(html, { url: BASE + "index.html", runScripts: "dangerously", virtualConsole: vc, pretendToBeVisual: true });
  w = dom.window;
  w.scrollTo = () => {};
  w.Element.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.fetch = async (url) => {
    fetchCount++;
    const rel = new URL(String(url), BASE).href.slice(BASE.length).split("?")[0];
    const r = await readRel(rel);
    return { ok: r.ok, status: r.status, text: async () => r.body, json: async () => JSON.parse(r.body) };
  };
  w.eval((await readRel("assets/vendor/marked.min.js")).body);
  w.eval((await readRel("assets/app.js")).body);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => Array.from(w.document.querySelectorAll(s));
async function go(hash, wait = 400) { w.location.hash = hash; await sleep(LIVE ? wait * 3 : wait); }
const results = [];
function check(name, cond, info = "") { results.push(`${cond ? "OK  " : "NG  "} ${name}${info ? "  … " + info : ""}`); }

(async () => {
  await boot();
  await sleep(LIVE ? 2500 : 600);
  // 1. ホーム
  check("ホームの見出し", $("main h1")?.textContent === "日常鯖 攻略Wiki", $("main h1")?.textContent);
  check("メニューのリンク数", $$("#sidebar a").length >= 18, String($$("#sidebar a").length));
  await sleep(300);
  check("進み具合の行（5章）", $$(".progress-row").length === 5, String($$(".progress-row").length));
  check("ホームの図鑑検索フォーム", !!$('[data-widget="search"] form'));
  check("ホームの [[ ]] リンクが図鑑へ", ($("a.ilink")?.getAttribute("href") || "").startsWith("#/item/"), $("a.ilink")?.getAttribute("href"));
  const homeH2 = $$("main h2").map((h) => h.dataset.title || h.textContent);
  check("ホームの見出しが崩れない（改行コードがCRLFでも）", homeH2.includes("冒険手帳の進み具合") && homeH2.includes("はじめての人へ"), homeH2.join(","));

  // 独自の書き方
  await go("#/p/flow");
  check("位階の道のり（```段階）", $$(".route .route-step").length === 5 && !!$(".route-step.tier-pinnacle"), String($$(".route .route-step").length));
  await go("#/p/join");
  check("【注意】の囲み（1つの引用に2つあっても分かれる）", $$("blockquote.callout-warn").length >= 2, String($$("blockquote.callout-warn").length));
  await go("#/p/magic");
  check("矢印の流れ（```順番）", $$(".chain .chain-item").length >= 3, String($$(".chain .chain-item").length));
  check("3列以上の表はスマホでカードにできる", !!$("table.stack td[data-label]"));
  await go("#/p/gear");
  check("レアリティの色", $$(".rarity.rarity-mythic").length >= 1);

  // 2. 物語のページ
  await go("#/p/lore");
  check("物語ページの見出し", $("main h1")?.textContent === "世界の成り立ち");
  const unresolved = $$("a.ilink.missing").map((a) => a.textContent);
  check("物語ページの未解決リンクなし", unresolved.length === 0, unresolved.join(","));
  check("目次が出る", $$("#toc li").length >= 2, String($$("#toc li").length));
  check("八つの大災厄の生い立ち", $$("main h3").filter((h) => /イグニス|リヴァイアサン|スキュラ|マレディクタス|骸|ネザライトの怪物|ハービンジャー|エンダーガーディアン/.test(h.textContent)).length === 8, String($$("main h3").length));

  // 3. 冒険手帳
  await go("#/p/ch0");
  const boxes = $$('main input[type="checkbox"]');
  check("序章のチェック欄が7つ・操作できる", boxes.length === 7 && boxes.every((b) => !b.disabled), `${boxes.length}`);
  check("章の概要（位階の札）", !!$(".summary.tier-haven .tier-pill"));
  check("冒険手帳の見出しに済んだ数", $(".task-meter .task-num")?.textContent === "0/7", $(".task-meter .task-num")?.textContent);
  check("前後のページ", !!$(".pager .pager-prev") && !!$(".pager .pager-next"));
  boxes[0].checked = true;
  boxes[0].dispatchEvent(new w.Event("change"));
  await go("#/", 700);
  const first = $$(".progress-row")[0];
  check("チェックがホームの進み具合に反映", first?.querySelector(".progress-num")?.textContent === "1/7", first?.querySelector(".progress-num")?.textContent);
  await go("#/p/ch0");
  check("チェックが保存されている", $$('main input[type="checkbox"]')[0]?.checked === true);

  // 4. 図鑑の検索
  await go("#/items?q=" + encodeURIComponent("えっせんす"), 700);
  const names = $$(".result-name").map((x) => x.textContent);
  check("ひらがなで検索できる", names[0] === "秘術のエッセンス" || names.includes("秘術のエッセンス"), names.slice(0, 4).join(" / "));
  await go("#/items?q=ignis", 500);
  check("英語名で検索できる", $$(".result-name").length > 0, $$(".result-name").slice(0, 3).map((x) => x.textContent).join(" / "));
  await go("#/items?mod=waystones", 500);
  check("MODで絞り込める", $$(".result").length > 0 && $$(".result .mod").every((m) => m.textContent === "Waystones"), String($$(".result").length));

  // 5. アイテムのページ
  await go("#/item/" + encodeURIComponent("irons_spellbooks:arcane_essence"), 500);
  check("アイテム名", $("main h1")?.textContent === "秘術のエッセンス");
  check("この鯖でのメモ", !!$(".note-sec"));
  check("手に入る場所（宝箱・敵）", $$(".item-page h3").map((h) => h.textContent).join(",").includes("宝箱から"));
  check("使い道のチップ", $$(".item-page .chips a.chip").length >= 10, String($$(".item-page .chips a.chip").length));
  await go("#/item/" + encodeURIComponent("irons_spellbooks:wayward_compass"), 400);
  check("作業台の3×3", $$(".grid3 .cell").length === 9 && $$(".grid3 a.cell").length === 9, $$(".grid3 .cell").map((c) => c.textContent).join("|"));
  await go("#/item/" + encodeURIComponent("waystones:warp_dust"), 400);
  check("並べ方自由のレシピ", $$(".recipe .ings .chip").length === 2, $$(".recipe .ings .chip").map((c) => c.textContent).join("+"));
  await go("#/item/" + encodeURIComponent("apotheosis:gem"), 400);
  check("メモだけの項目（ジェム）", $("main h1")?.textContent === "ジェム" && !!$(".note-sec"));
  await go("#/item/" + encodeURIComponent("waystones:portal_scroll"), 400);
  check("日本語化パックの名前（門の巻物）", $("main h1")?.textContent === "門の巻物", $("main h1")?.textContent);
  await go("#/item/" + encodeURIComponent("apothic_enchanting:infused_hellshelf"), 400);
  check("注入エンチャントの条件表示", ($(".recipe .extra")?.textContent || "").includes("eterna"), $(".recipe .extra")?.textContent);

  // 6. 上の検索窓
  const q = $("#q");
  q.value = "いぐにす";
  q.dispatchEvent(new w.Event("input"));
  await sleep(500);
  check("上の検索窓の候補", !$("#qResults").hidden && $$("#qResults a").length >= 2, $$("#qResults a").map((a) => a.textContent.trim()).slice(0, 3).join(" / "));

  // 7. 存在しないページ
  await go("#/p/nothing-here");
  check("存在しないページ", ($("main h1")?.textContent || "").includes("見つかりません"));

  // 8. 全ページの未解決リンク
  const pages = $$("#sidebar a").map((a) => a.getAttribute("href")).filter((h) => h.startsWith("#/p/"));
  const missingAll = [];
  for (const p of pages) {
    await go(p, 250);
    $$("a.ilink.missing").forEach((a) => missingAll.push(`${p}:${a.textContent}`));
  }
  check(`全${pages.length}ページの未解決リンクなし`, missingAll.length === 0, missingAll.join(", "));

  check("エラーなし", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log(results.join("\n"));
  console.log(`fetch: ${fetchCount}`);
  process.exit(results.some((r) => r.startsWith("NG")) ? 1 : 0);
})();
