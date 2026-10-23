/* 麻雀同好会 日常鯖 攻略Wiki
 *
 * 文章は content/*.md、メニューは content/menu.md、図鑑のメモは content/item-notes.md、
 * アイテムのデータは data/items.json（MODのjarから自動生成）から読み込む。
 * ページの切り替えは URL の # 以降で行う:
 *   #/            ホーム（content/home.md）
 *   #/p/名前       content/名前.md
 *   #/items?q=..  アイテム図鑑の検索
 *   #/item/ID     アイテムのページ
 *
 * Markdown の独自の書き方（README.md に例あり）:
 *   [[アイテム名]]、[[表示名|名前かID]]   図鑑へのリンク
 *   > 【注意】…                          囲み（注意・危険・ヒント・確認・メモ・目標・次の章へ）
 *   ```概要 / ```段階 / ```順番           章の概要・ワールドレベルの道のり・矢印の流れ
 *   {{進み具合}}、{{図鑑検索}}            進み具合の表、図鑑の検索窓
 */
"use strict";
(() => {
  const CONTENT = "content/";
  const MOD_INFO = {
    irons_spellbooks: ["Iron's Spells", 268], irons_lib: ["Iron's Lib", 268],
    cataclysm: ["Cataclysm", 12], apotheosis: ["Apotheosis", 42],
    apothic_enchanting: ["Apothic Enchanting", 300], apothic_spawners: ["Apothic Spawners", 320],
    mowziesmobs: ["Mowzie's Mobs", 140], aquaculture: ["Aquaculture 2", 196],
    sophisticatedbackpacks: ["Sophisticated Backpacks", 28], sophisticatedcore: ["Sophisticated Core", 28],
    waystones: ["Waystones", 172], handcrafted: ["Handcrafted", 88], lootr: ["Lootr", 54],
    patchouli: ["Patchouli", 0], minecraft: ["Minecraft", 110], note: ["メモ", 220],
  };
  const TIERS = { 安全地帯: "haven", 冒険: "frontier", 進撃: "ascent", 頂点: "summit", 天上界: "pinnacle" };
  const RARITIES = { コモン: "common", アンコモン: "uncommon", レア: "rare", エピック: "epic", ミシック: "mythic" };
  const CALLOUTS = { 注意: "warn", 危険: "danger", ヒント: "tip", 確認: "check", メモ: "memo", 目標: "goal", 次の章へ: "next" };

  // ---- 小さな道具 -------------------------------------------------------------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境では覚えない */ } },
  };
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  // 検索用に文字をそろえる（全角半角・大文字小文字・カタカナ→ひらがな・記号と空白を除く）
  const norm = (s) => String(s ?? "").normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･\-_'’"“”「」『』（）()【】.,、。:：]/g, "");
  const modName = (m) => (MOD_INFO[m] ? MOD_INFO[m][0] : (DB && DB.mods[m]) || m);
  const modHue = (m) => (MOD_INFO[m] ? MOD_INFO[m][1] : (hash(m).charCodeAt(0) * 37) % 360);
  const modBadge = (m) => `<span class="mod" style="--h:${modHue(m)}">${esc(modName(m))}</span>`;
  const itemHref = (id) => `#/item/${encodeURIComponent(id)}`;
  const tierPill = (t) => `<span class="tier-pill tier-${TIERS[t]}">${esc(t)}</span>`;

  const texts = new Map();
  async function fetchText(path) {
    if (!texts.has(path)) {
      texts.set(path, fetch(path, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.text();
      }).then((t) => t.replace(/\r\n?/g, "\n")));
    }
    try { return await texts.get(path); } catch (e) { texts.delete(path); throw e; }
  }

  // ---- アイテムのデータ ---------------------------------------------------------
  let DB = null;
  let dbPromise = null;
  function loadDB() {
    if (!dbPromise) {
      dbPromise = Promise.all([
        fetch("data/items.json", { cache: "no-cache" }).then((r) => r.json()),
        fetchText(CONTENT + "item-notes.md").catch(() => ""),
      ]).then(([data, notes]) => (DB = buildDB(data, notes)));
    }
    return dbPromise;
  }

  function buildDB(data, notesMd) {
    const byId = new Map();
    const byName = new Map();
    const byKey = new Map();
    for (const it of data.items) {
      byId.set(it.id, it);
      if (!byName.has(it.n) || byName.get(it.n).v) byName.set(it.n, it);
    }
    // 図鑑のメモ（## 名前 の下に書いた文章を、そのアイテムに付ける。図鑑にない名前は新しい項目として足す）
    for (const block of notesMd.split(/^## /m).slice(1)) {
      const lines = block.split("\n");
      const title = lines.shift().trim();
      const meta = {};
      while (lines.length && /^(id|mod|en)\s*[:：]/.test(lines[0])) {
        const m = lines.shift().match(/^(id|mod|en)\s*[:：]\s*(.*)$/);
        meta[m[1]] = m[2].trim();
      }
      if (!title) continue;
      let it = byId.get(meta.id || title) || byName.get(title);
      if (!it) {
        it = { id: meta.id || `note:${title}`, n: title, e: meta.en || "", m: meta.mod || "note", pseudo: 1 };
        data.items.push(it);
        byId.set(it.id, it);
        byName.set(it.n, it);
      }
      it.note = lines.join("\n").trim();
    }
    for (const it of data.items) {
      it._k = norm(it.n);
      it._e = norm(it.e);
      it._i = it.id.toLowerCase();
      it._t = it.note ? norm(it.note) : "";
      if (!byKey.has(it._k)) byKey.set(it._k, it);
    }
    // 使い道（このアイテムを材料にするレシピ）の逆引き
    const usedIn = new Map();
    const add = (iid, rid) => {
      if (!iid || iid === rid) return;
      if (!usedIn.has(iid)) usedIn.set(iid, new Set());
      usedIn.get(iid).add(rid);
    };
    for (const it of data.items) {
      for (const r of it.r || []) {
        for (const ing of [...(r.g || []), ...(r.in || [])]) {
          if (!ing) continue;
          if (ing.tg && data.tags[ing.tg]) data.tags[ing.tg].forEach((m) => add(m, it.id));
          else add(ing.i, it.id);
          (ing.alts || []).forEach((a) => add(a, it.id));
        }
      }
    }
    const modCount = {};
    data.items.forEach((it) => { modCount[it.m] = (modCount[it.m] || 0) + 1; });
    return { data, byId, byName, byKey, usedIn, mods: data.mods || {}, modCount };
  }

  function findItem(q) {
    if (!DB) return null;
    return DB.byId.get(q) || DB.byName.get(q) || DB.byKey.get(norm(q)) || null;
  }

  function searchItems(q, { mod = "", vanilla = true } = {}) {
    const nq = norm(q);
    const out = [];
    for (const it of DB.data.items) {
      if (mod && it.m !== mod) continue;
      if (!vanilla && it.v) continue;
      let s = 0;
      if (!nq) s = 1;
      else if (it._k === nq) s = 100;
      else if (it._k.startsWith(nq)) s = 80;
      else if (it._k.includes(nq)) s = 60;
      else if (it._e.includes(nq)) s = 45;
      else if (it._i.includes(nq)) s = 35;
      else if (it._t.includes(nq)) s = 15;
      if (!s) continue;
      if (it.v) s -= 8;
      if (it.note) s += 4;
      out.push([s, it]);
    }
    out.sort((a, b) => b[0] - a[0] || a[1].n.length - b[1].n.length || a[1].n.localeCompare(b[1].n, "ja"));
    return out.map((x) => x[1]);
  }

  // ---- Markdown -------------------------------------------------------------
  const inline = (s) => window.marked.parseInline(s.trim());
  const blockLines = (src) => src.split("\n").map((l) => l.trim()).filter(Boolean);

  // ```名前 で始まる囲みを、図や表にする
  const BLOCKS = {
    // 章の概要。「キー: 値」を1行ずつ。キーが「レベル」なら色付きの札にする
    概要(src) {
      let tier = "";
      let tierKey = "";
      const rows = [];
      for (const line of blockLines(src)) {
        const m = line.match(/^([^:：]+)[:：]\s*(.*)$/);
        if (!m) continue;
        const k = m[1].trim();
        const v = m[2].trim();
        if (/^(レベル|ワールドレベル|位階)$/.test(k) && TIERS[v]) { tier = v; tierKey = k; }
        else rows.push(`<div><dt>${esc(k)}</dt><dd>${inline(v)}</dd></div>`);
      }
      const cls = tier ? ` tier-${TIERS[tier]}` : "";
      const head = tier ? `<p class="summary-tier"><span>${esc(tierKey)}</span>${tierPill(tier)}</p>` : "";
      return `<div class="summary${cls}">${head}<dl>${rows.join("")}</dl></div>\n`;
    },
    // ワールドレベルの道のり。「レベル | 題 | 中身 | 次へ進む条件」を1行ずつ
    段階(src) {
      const steps = blockLines(src).map((line) => {
        const [tier = "", title = "", desc = "", cond = ""] = line.split("|").map((s) => s.trim());
        const cls = TIERS[tier] ? `tier-${TIERS[tier]}` : "tier-none";
        return `<li class="route-step ${cls}"><span class="route-tier">${esc(tier)}</span><div class="route-body">`
          + `<p class="route-title">${inline(title)}</p>`
          + (desc ? `<p class="route-desc">${inline(desc)}</p>` : "")
          + (cond ? `<p class="route-cond"><span>次へ</span>${inline(cond)}</p>` : "")
          + `</div></li>`;
      });
      return `<ol class="route">${steps.join("")}</ol>\n`;
    },
    // 矢印の流れ。「A → B → C」を1行ずつ
    順番(src) {
      return blockLines(src).map((line) => `<p class="chain">${line.split(/\s*(?:→|->)\s*/)
        .map((x) => `<span class="chain-item">${inline(x)}</span>`)
        .join('<span class="chain-arrow">→</span>')}</p>`).join("") + "\n";
    },
  };
  let markedReady = false;
  function setupMarked() {
    if (markedReady) return;
    markedReady = true;
    window.marked.use({
      gfm: true,
      breaks: true,   // 1回の改行も、そのまま改行として表示する
      renderer: {
        code(code, info) {
          const f = BLOCKS[(info || "").trim()];
          return f ? f(code) : false;
        },
      },
    });
  }

  function renderMarkdown(md, page) {
    setupMarked();
    md = md.replace(/\r\n?/g, "\n");
    // [[アイテム名]] / [[表示名|アイテム名かID]] を図鑑へのリンクにする
    md = md.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, label, target) => {
      const t = (target || label).trim();
      return `<a class="ilink" data-q="${esc(t)}" href="#/items?q=${encodeURIComponent(t)}">${esc(label.trim())}</a>`;
    });
    // 部品の行は前後を空けて置く（続く見出しが部品の一部と読まれないように）
    md = md.replace(/^[ \t]*\{\{\s*進み具合\s*\}\}[ \t]*$/gm, '\n<div class="widget" data-widget="progress"></div>\n');
    md = md.replace(/^[ \t]*\{\{\s*図鑑検索\s*\}\}[ \t]*$/gm, '\n<div class="widget" data-widget="search"></div>\n');
    const wrap = document.createElement("div");
    wrap.className = "prose";
    wrap.innerHTML = window.marked.parse(md);
    decorate(wrap, page);
    return wrap;
  }

  function decorate(wrap, page) {
    // 見出しに目印を付ける（目次用）
    $$("h2, h3", wrap).forEach((h, i) => { h.id = `s${i + 1}`; h.dataset.title = h.textContent.trim(); });
    // リンクの書き換え：xxx.md → #/p/xxx、外部リンクは別タブ
    $$("a[href]", wrap).forEach((a) => {
      const href = a.getAttribute("href");
      if (/^https?:\/\//.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
      else if (/\.md(#.*)?$/.test(href) && !href.startsWith("#")) a.setAttribute("href", "#/p/" + href.replace(/\.md(#.*)?$/, ""));
    });
    // 【注意】などで始まる引用は囲みにする。1つの引用に【…】の段落が複数あれば、それぞれ別の囲みに分ける
    const LABEL = /^\s*【([^】]{1,8})】\s*(<br>\s*)?/;
    $$("blockquote", wrap).forEach((bq) => {
      const ps = Array.from(bq.children);
      const starts = ps.map((p, i) => (i > 0 && p.tagName === "P" && LABEL.test(p.innerHTML) ? i : -1)).filter((i) => i > 0);
      let after = bq;
      starts.forEach((s, k) => {
        const nb = document.createElement("blockquote");
        ps.slice(s, starts[k + 1] ?? ps.length).forEach((p) => nb.append(p));
        after.after(nb);
        after = nb;
      });
    });
    $$("blockquote", wrap).forEach((bq) => {
      const p = bq.firstElementChild;
      const m = p && p.tagName === "P" && p.innerHTML.match(LABEL);
      if (!m) return;
      p.innerHTML = p.innerHTML.slice(m[0].length);
      bq.classList.add("callout", `callout-${CALLOUTS[m[1]] || "memo"}`);
      bq.insertAdjacentHTML("afterbegin", `<p class="callout-label">${esc(m[1])}</p>`);
    });
    // 表：スマホでカードにするための見出しの写し、レアリティとワールドレベルの色
    $$("table", wrap).forEach((t) => {
      const heads = $$("thead th", t).map((th) => th.textContent.trim());
      const stack = heads.length >= 3;
      $$("tbody tr", t).forEach((tr) => $$("td", tr).forEach((td, i) => {
        if (heads[i]) td.dataset.label = heads[i];
        const txt = td.textContent.trim();
        if (TIERS[txt]) td.innerHTML = tierPill(txt);
        else if (RARITIES[txt]) td.innerHTML = `<span class="rarity rarity-${RARITIES[txt]}">${esc(txt)}</span>`;
        // カード表示では「見出し｜中身」の2つに並べるので、中身（文字とリンクのまざり）を1つにまとめる
        if (stack && td.childNodes.length && txt) {
          const v = document.createElement("span");
          v.className = "cell-v";
          v.append(...td.childNodes);
          td.append(v);
        }
      }));
      if (stack) t.classList.add("stack");
      const box = document.createElement("div");
      box.className = "table-wrap";
      t.replaceWith(box);
      box.append(t);
    });
    // 冒険手帳（チェック欄）を、この端末に保存できるようにする
    $$('input[type="checkbox"]', wrap).forEach((box) => {
      const li = box.closest("li");
      if (!li) return;
      const key = `nw:task:${page}:${hash(li.textContent.trim())}`;
      box.disabled = false;
      box.checked = store.get(key, box.checked);
      li.classList.add("task");
      li.classList.toggle("done", box.checked);
      box.addEventListener("change", () => {
        store.set(key, box.checked);
        li.classList.toggle("done", box.checked);
      });
    });
    // チェック欄の上の見出しに、いくつ済んだかを出す
    $$("ul", wrap).forEach((ul) => {
      const items = $$(":scope > li.task", ul);
      if (!items.length) return;
      ul.classList.add("tasks");
      let h = ul.previousElementSibling;
      while (h && !/^H[23]$/.test(h.tagName)) h = h.previousElementSibling;
      if (!h) return;
      const meter = document.createElement("span");
      meter.className = "task-meter";
      h.append(meter);
      const update = () => {
        const done = items.filter((li) => $("input", li).checked).length;
        meter.innerHTML = `<span class="task-bar"><span style="width:${Math.round((done / items.length) * 100)}%"></span></span><span class="task-num">${done}/${items.length}</span>`;
      };
      items.forEach((li) => $("input", li).addEventListener("change", update));
      update();
    });
  }

  // 本文中の [[...]] リンクを、図鑑のデータが読めたら正しい行き先にする
  function upgradeItemLinks(root) {
    loadDB().then(() => {
      $$("a.ilink", root).forEach((a) => {
        const it = findItem(a.dataset.q);
        if (it) { a.href = itemHref(it.id); a.title = `${it.n}（${modName(it.m)}）`; }
        else a.classList.add("missing");
      });
    });
  }

  // 冒険手帳の進み具合：menu.md の「攻略の流れ」グループのページを数える
  async function progressWidget(el) {
    const group = MENU.find((g) => /攻略の流れ/.test(g.title));
    if (!group) { el.textContent = ""; return; }
    const pages = group.items.filter((x) => x.href.startsWith("#/p/"));
    const rows = await Promise.all(pages.map(async (p) => {
      const name = p.href.slice(4);
      const md = await fetchText(CONTENT + name + ".md").catch(() => "");
      const tasks = [...md.matchAll(/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/gm)];
      if (!tasks.length) return null;
      const html = window.marked.parse(tasks.map((t) => `- [${t[1]}] ${t[2]}`).join("\n"));
      const tmp = document.createElement("div");
      tmp.innerHTML = html.replace(/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g, "$1");
      const done = $$("li", tmp).filter((li) => store.get(`nw:task:${name}:${hash(li.textContent.trim())}`, $("input", li)?.checked || false)).length;
      return { title: p.title, href: p.href, tier: p.tier, done, total: tasks.length };
    }));
    const list = rows.filter(Boolean);
    el.innerHTML = `<div class="progress-list">${list.map((r) => {
      const pct = Math.round((r.done / r.total) * 100);
      return `<a class="progress-row${r.done === r.total ? " complete" : ""}${r.tier ? ` tier-${TIERS[r.tier]}` : ""}" href="${r.href}">
        <span class="progress-title">${esc(r.title)}</span>
        <span class="progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></span>
        <span class="progress-num">${r.done}/${r.total}</span></a>`;
    }).join("")}</div><p class="hint">チェックはこのブラウザだけに保存されます。</p>`;
  }

  function searchWidget(el) {
    el.innerHTML = `<form class="inline-search"><input type="search" placeholder="例：秘術のエッセンス、えっせんす、warp dust" aria-label="アイテム図鑑を検索"><button type="submit">図鑑で探す</button></form>`;
    $("form", el).addEventListener("submit", (e) => {
      e.preventDefault();
      location.hash = `#/items?q=${encodeURIComponent($("input", el).value.trim())}`;
    });
  }

  // ---- メニュー --------------------------------------------------------------
  let MENU = [];
  async function loadMenu() {
    const md = await fetchText(CONTENT + "menu.md").catch(() => "");
    const groups = [];
    let cur = null;
    for (const line of md.split("\n")) {
      let m;
      if ((m = line.match(/^##\s+(.+)/))) groups.push((cur = { title: m[1].trim(), items: [] }));
      else if ((m = line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*(\S*)/))) {
        if (!cur) groups.push((cur = { title: "", items: [] }));
        const t = m[2].trim();
        cur.items.push({
          title: m[1].trim(),
          href: t.startsWith("#") || /^https?:/.test(t) ? t : "#/p/" + t.replace(/\.md$/, ""),
          tier: TIERS[m[3]] ? m[3] : "",
        });
      }
    }
    MENU = groups;
    $("#sidebar").innerHTML = `<p class="sidebar-brand">麻雀同好会 日常鯖 攻略Wiki</p>` + groups.map((g) => `<div class="nav-group">${g.title ? `<p class="nav-title">${esc(g.title)}</p>` : ""}<ul>${g.items.map((x) => `<li><a href="${esc(x.href)}"${/^https?:/.test(x.href) ? ' target="_blank" rel="noopener"' : ""}>${x.tier ? `<span class="nav-tier tier-${TIERS[x.tier]}" title="${esc(x.tier)}"></span>` : ""}${esc(x.title)}</a></li>`).join("")}</ul></div>`).join("");
  }

  function markActiveNav() {
    const h = location.hash || "#/";
    $$("#sidebar a").forEach((a) => {
      const href = a.getAttribute("href");
      const on = href === h || (href === "#/p/home" && h === "#/") || (href.startsWith("#/items") && (h.startsWith("#/items") || h.startsWith("#/item/")));
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  // 前後のページ（メニューの並び順）
  function pager(name) {
    const pages = MENU.flatMap((g) => g.items).filter((x) => x.href.startsWith("#/p/"));
    const i = pages.findIndex((x) => x.href === `#/p/${name}`);
    if (i < 0 || name === "home") return null;
    const prev = pages[i - 1];
    const next = pages[i + 1];
    const nav = document.createElement("nav");
    nav.className = "pager";
    nav.setAttribute("aria-label", "前後のページ");
    nav.innerHTML = (prev ? `<a class="pager-prev" href="${esc(prev.href)}"><span>前へ</span>${esc(prev.title)}</a>` : "")
      + (next ? `<a class="pager-next" href="${esc(next.href)}"><span>次へ</span>${esc(next.title)}</a>` : "");
    return nav;
  }

  // ---- 画面 ------------------------------------------------------------------
  const main = $("#main");
  const toc = $("#toc");

  function setView(node, title, { withToc = false } = {}) {
    main.replaceChildren(node);
    document.title = title ? `${title}｜日常鯖 攻略Wiki` : "麻雀同好会 日常鯖 攻略Wiki";
    toc.innerHTML = "";
    if (withToc) {
      const hs = $$("h2, h3", node);
      if (hs.length >= 3) {
        const list = `<ul>${hs.map((h) => `<li class="${h.tagName.toLowerCase()}"><a href="#${h.id}" data-jump="${h.id}">${esc(h.dataset.title || h.textContent)}</a></li>`).join("")}</ul>`;
        toc.innerHTML = `<p class="toc-title">このページの目次</p>${list}`;
        // 横幅が狭いときは、本文の頭に開閉できる目次を置く
        const h1 = $("h1", node);
        const details = document.createElement("details");
        details.className = "toc-inline";
        details.innerHTML = `<summary>このページの目次</summary>${list}`;
        if (h1) h1.after(details); else node.prepend(details);
      }
    }
    closeSidebar();
    markActiveNav();
    window.scrollTo(0, 0);
  }

  // 目次のリンクは # を使うとページの切り替えと重なるので、スクロールだけにする
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-jump]");
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
    a.closest("details")?.removeAttribute("open");
  });

  async function showPage(name) {
    let md;
    try { md = await fetchText(CONTENT + name + ".md"); }
    catch (e) {
      const div = document.createElement("div");
      div.className = "prose";
      div.innerHTML = `<h1>ページが見つかりません</h1><p><code>content/${esc(name)}.md</code> がありません。メニューから選び直してください。</p>`;
      return setView(div, "ページが見つかりません");
    }
    const node = renderMarkdown(md, name);
    const title = $("h1", node)?.textContent || name;
    const nav = pager(name);
    if (nav) node.append(nav);
    setView(node, name === "home" ? "" : title, { withToc: true });
    upgradeItemLinks(node);
    $$('[data-widget="progress"]', node).forEach(progressWidget);
    $$('[data-widget="search"]', node).forEach(searchWidget);
  }

  // ---- アイテム図鑑：検索 ------------------------------------------------------
  async function showSearch(q, mod, vanilla) {
    const node = document.createElement("div");
    node.className = "items-page";
    node.innerHTML = `<h1>アイテム図鑑</h1>
      <p class="lead">名前の一部・ひらがな・英語名・ID で探せます。</p>
      <form class="inline-search big"><input type="search" value="${esc(q)}" placeholder="例：秘術のエッセンス、ねぷつにうむ、Ignis" aria-label="アイテム図鑑を検索" autofocus><button type="submit">探す</button></form>
      <div class="filters" role="group" aria-label="MODで絞り込む"></div>
      <label class="check"><input type="checkbox" class="vanilla"${vanilla ? " checked" : ""}> バニラのアイテムも一覧に出す（検索したときは常に出ます）</label>
      <p class="count" aria-live="polite"></p>
      <ul class="result-list"></ul>`;
    setView(node, q ? `「${q}」の検索結果` : "アイテム図鑑");
    const input = $("input[type=search]", node);
    const go = (nq, nm, nv) => {
      const p = new URLSearchParams();
      if (nq) p.set("q", nq);
      if (nm) p.set("mod", nm);
      if (nv) p.set("v", "1");
      const h = "#/items" + (p.toString() ? "?" + p : "");
      if (location.hash !== h) history.replaceState(null, "", h);
      render(nq, nm, nv);
    };
    $("form", node).addEventListener("submit", (e) => { e.preventDefault(); go(input.value.trim(), mod, vanilla); input.blur(); });
    let timer;
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => go(input.value.trim(), mod, vanilla), 150); });
    $(".vanilla", node).addEventListener("change", (e) => { vanilla = e.target.checked; go(input.value.trim(), mod, vanilla); });

    await loadDB();
    const filters = $(".filters", node);
    const mods = Object.keys(DB.modCount).filter((m) => m !== "minecraft").sort((a, b) => DB.modCount[b] - DB.modCount[a]);
    filters.innerHTML = [`<button type="button" data-mod="" class="chip-btn">すべて</button>`, ...mods.map((m) => `<button type="button" data-mod="${esc(m)}" class="chip-btn" style="--h:${modHue(m)}">${esc(modName(m))}<span>${DB.modCount[m]}</span></button>`)].join("");
    filters.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mod]");
      if (!b) return;
      mod = b.dataset.mod;
      go(input.value.trim(), mod, vanilla);
    });

    function render(nq, nm, nv) {
      q = nq; mod = nm;
      $$("button[data-mod]", filters).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mod === (nm || ""))));
      const res = searchItems(nq, { mod: nm, vanilla: nv || !!nq });
      const shown = res.slice(0, 120);
      $(".count", node).textContent = res.length ? `${res.length}件${res.length > shown.length ? `（上位${shown.length}件を表示）` : ""}` : "見つかりませんでした。別の言い方や英語名でも試してみてください。";
      $(".result-list", node).innerHTML = shown.map(resultRow).join("");
    }
    render(q, mod, vanilla);
  }

  function resultRow(it) {
    const flags = [it.r ? "作り方" : "", it.s ? "入手先" : "", DB.usedIn.has(it.id) ? "使い道" : "", it.note ? "メモ" : ""].filter(Boolean);
    return `<li><a class="result" href="${itemHref(it.id)}">
      <span class="result-name">${esc(it.n)}</span>
      ${modBadge(it.m)}
      <span class="result-sub">${esc(it.e || "")}</span>
      <span class="result-flags">${flags.map((f) => `<span>${f}</span>`).join("")}</span></a></li>`;
  }

  // ---- アイテム図鑑：1件のページ ---------------------------------------------------
  function ingName(ing) {
    if (!ing) return "";
    const it = ing.i && DB.byId.get(ing.i);
    const base = it ? it.n : ing.i || "?";
    return ing.tg ? `${base}など` : base;
  }
  function ingTitle(ing) {
    if (!ing) return "";
    if (ing.tg) {
      const members = (DB.data.tags[ing.tg] || []).map((m) => DB.byId.get(m)?.n || m);
      return `どれでもよい（#${ing.tg}）：${members.join("、")}`;
    }
    const alts = (ing.alts || []).map((m) => DB.byId.get(m)?.n || m);
    return alts.length ? `どれでもよい：${[ingName(ing), ...alts].join("、")}` : ingName(ing);
  }
  function ingLink(ing, cls = "chip") {
    if (!ing) return "";
    const known = ing.i && DB.byId.has(ing.i);
    const count = ing.c ? `<b>×${ing.c}</b>` : "";
    const inner = `<span>${esc(ingName(ing))}</span>${count}`;
    return known
      ? `<a class="${cls}" href="${itemHref(ing.i)}" title="${esc(ingTitle(ing))}">${inner}</a>`
      : `<span class="${cls} plain" title="${esc(ingTitle(ing))}">${inner}</span>`;
  }

  function recipeCard(r, it) {
    const out = `<span class="arrow" aria-hidden="true">→</span><span class="out">${esc(it.n)}${r.o ? ` ×${r.o}` : ""}</span>`;
    let body;
    if (r.g) {
      body = `<div class="grid3" role="img" aria-label="作業台の並べ方">${r.g.map((c) => (c ? ingLink(c, "cell") : `<span class="cell empty"></span>`)).join("")}</div>`;
    } else {
      body = `<div class="ings">${(r.in || []).map((c) => ingLink(c)).join('<span class="plus">＋</span>')}</div>`;
    }
    const extra = (r.x || []).map((x) => `<p class="extra">${esc(x)}</p>`).join("");
    return `<div class="recipe"><p class="station">${esc(r.t)}</p><div class="recipe-body">${body}${out}</div>${extra}</div>`;
  }

  function groupSources(list) {
    const g = { 宝箱: [], 敵: [], その他: [] };
    for (const s of list) {
      if (s.startsWith("宝箱：")) g.宝箱.push(s.slice(3));
      else if (s.includes("を倒す")) g.敵.push(s);
      else g.その他.push(s);
    }
    return g;
  }
  function moreList(items, n, render) {
    if (items.length <= n) return `<ul class="srcs">${items.map(render).join("")}</ul>`;
    return `<ul class="srcs">${items.slice(0, n).map(render).join("")}</ul><details class="more"><summary>ほか${items.length - n}件を表示</summary><ul class="srcs">${items.slice(n).map(render).join("")}</ul></details>`;
  }

  async function showItem(id) {
    await loadDB();
    const it = DB.byId.get(id) || findItem(id);
    const node = document.createElement("article");
    node.className = "item-page";
    if (!it) {
      node.innerHTML = `<h1>見つかりません</h1><p><code>${esc(id)}</code> は図鑑にありません。<a href="#/items?q=${encodeURIComponent(id)}">図鑑で探す</a></p>`;
      return setView(node, "見つかりません");
    }
    const used = [...(DB.usedIn.get(it.id) || [])].map((x) => DB.byId.get(x)).filter(Boolean).sort((a, b) => a.n.localeCompare(b.n, "ja"));
    const src = groupSources(it.s || []);
    const sections = [];
    if (it.d && it.d.length) sections.push(`<section><h2>ゲーム内の説明</h2>${it.d.map((d) => `<p class="tooltip">${esc(d)}</p>`).join("")}</section>`);
    if (it.note) {
      const n = renderMarkdown(it.note, `item:${it.id}`);
      sections.push(`<section class="note-sec"><h2>この鯖でのメモ</h2>${n.innerHTML}</section>`);
    }
    if (it.r && it.r.length) sections.push(`<section><h2>作り方</h2><div class="recipes">${it.r.map((r) => recipeCard(r, it)).join("")}</div></section>`);
    if (it.s && it.s.length) {
      const parts = [];
      if (src.宝箱.length) parts.push(`<h3>宝箱から</h3>${moreList(src.宝箱, 10, (s) => `<li>${esc(s)}</li>`)}`);
      if (src.敵.length) parts.push(`<h3>敵から</h3>${moreList(src.敵, 10, (s) => `<li>${esc(s)}</li>`)}`);
      if (src.その他.length) parts.push(`<h3>そのほか</h3>${moreList(src.その他, 10, (s) => `<li>${esc(s)}</li>`)}`);
      sections.push(`<section><h2>手に入る場所</h2>${parts.join("")}</section>`);
    }
    if (used.length) sections.push(`<section><h2>これを材料に作れるもの（${used.length}）</h2><div class="chips">${moreChips(used)}</div></section>`);
    if (!it.r && !it.s && !it.note && !used.length) sections.push(`<section><p class="muted">この図鑑には、作り方や入手先のデータがありません（ボスの報酬・交易・特殊な方法で手に入るものかもしれません）。下のボタンで調べてみてください。</p></section>`);

    const q1 = `${it.n} ${modName(it.m)} マイクラ`;
    const q2 = `${it.e || it.n} ${modName(it.m)} minecraft`;
    node.innerHTML = `<p class="crumbs"><a href="#/items">アイテム図鑑</a> ／ <a href="#/items?mod=${encodeURIComponent(it.m)}">${esc(modName(it.m))}</a></p>
      <header class="item-head">
        <div class="item-tags">${modBadge(it.m)}${it.v ? '<span class="tag-v">バニラ</span>' : ""}${it.b ? '<span class="tag-v">ブロック</span>' : ""}</div>
        <h1>${esc(it.n)}</h1>
        <p class="item-sub">${it.e ? `<span>${esc(it.e)}</span>` : ""}${it.pseudo ? "" : `<code>${esc(it.id)}</code><button type="button" class="copy" data-copy="${esc(it.id)}">IDをコピー</button>`}</p>
      </header>
      ${sections.join("")}
      <section class="ext"><h2>もっと詳しく調べる</h2><p>
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(q1)}">日本語で検索</a>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(q2)}">英語で検索</a></p></section>`;
    setView(node, it.n);
    upgradeItemLinks(node);
    $(".copy", node)?.addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(e.target.dataset.copy); e.target.textContent = "コピーしました"; }
      catch (err) { e.target.textContent = "コピーできませんでした"; }
    });
  }
  function moreChips(items) {
    const chip = (x) => `<a class="chip" href="${itemHref(x.id)}" title="${esc(modName(x.m))}"><span>${esc(x.n)}</span></a>`;
    if (items.length <= 40) return items.map(chip).join("");
    return items.slice(0, 40).map(chip).join("") + `<details class="more"><summary>ほか${items.length - 40}件を表示</summary><div class="chips">${items.slice(40).map(chip).join("")}</div></details>`;
  }

  // ---- 上の検索窓 ------------------------------------------------------------
  const q = $("#q");
  const qr = $("#qResults");
  let qSel = -1;
  let qTimer;
  async function quickSearch() {
    const text = q.value.trim();
    if (!text) { qr.hidden = true; return; }
    await loadDB();
    const items = searchItems(text, { vanilla: true }).slice(0, 7);
    const nt = norm(text);
    const pages = MENU.flatMap((g) => g.items).filter((p) => norm(p.title).includes(nt)).slice(0, 3);
    const rows = [
      ...pages.map((p) => ({ href: p.href, html: `<span class="qr-kind">ページ</span><span class="qr-name">${esc(p.title)}</span>` })),
      ...items.map((it) => ({ href: itemHref(it.id), html: `<span class="qr-name">${esc(it.n)}</span>${modBadge(it.m)}` })),
      { href: `#/items?q=${encodeURIComponent(text)}`, html: `<span class="qr-all">「${esc(text)}」を図鑑ですべて探す</span>` },
    ];
    qSel = -1;
    qr.innerHTML = rows.map((r, i) => `<a role="option" id="qr${i}" href="${esc(r.href)}">${r.html}</a>`).join("");
    qr.hidden = false;
  }
  q.addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(quickSearch, 120); });
  q.addEventListener("focus", () => { loadDB(); if (q.value.trim()) quickSearch(); });
  q.addEventListener("keydown", (e) => {
    const opts = $$("a", qr);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!opts.length) return;
      qSel = (qSel + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle("sel", i === qSel));
      q.setAttribute("aria-activedescendant", `qr${qSel}`);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = qSel >= 0 ? opts[qSel] : null;
      location.hash = target ? target.getAttribute("href") : `#/items?q=${encodeURIComponent(q.value.trim())}`;
      qr.hidden = true;
      q.blur();
    } else if (e.key === "Escape") {
      qr.hidden = true;
      q.blur();
    }
  });
  qr.addEventListener("click", () => { qr.hidden = true; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) qr.hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });

  // ---- メニュー（スマホ）とテーマ ----------------------------------------------------
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");
  const menuBtn = $("#menuBtn");
  function closeSidebar() { sidebar.classList.remove("open"); scrim.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", () => {
    const open = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", open);
    scrim.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  scrim.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });
  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("nw:theme", next);
  });

  // ---- 起動 ------------------------------------------------------------------
  function route() {
    const h = location.hash || "#/";
    if (/^#s\d+$/.test(h)) return;   // 目次の古い書き方は無視
    const [path, qs] = h.slice(1).split("?");
    const params = new URLSearchParams(qs || "");
    const parts = path.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
    if (!parts.length) return showPage("home");
    if (parts[0] === "p") return showPage(parts.slice(1).join("/") || "home");
    if (parts[0] === "items") return showSearch(params.get("q") || "", params.get("mod") || "", params.get("v") === "1");
    if (parts[0] === "item") return showItem(parts.slice(1).join("/"));
    return showPage("home");
  }
  window.addEventListener("hashchange", route);
  loadMenu().finally(route);
})();
