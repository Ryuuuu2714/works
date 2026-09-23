// ============================================================
// 捜査資料照会システム（ミラー）― 画面の動き
// ★ 文章や答えは records.js にあります（基本はこのファイルを触らなくてOK）
// ★ テスト用：index.html#/reset を開くと、進行状況を全部リセットできる
// ============================================================
(function () {
  "use strict";

  var app = document.getElementById("app");

  // ---------- 進行状況の保存（プライベートブラウズ等で使えないときはメモリに退避） ----------
  var memory = {};
  var store = {
    get: function (k) {
      try {
        var v = localStorage.getItem("odo_" + k);
        if (v !== null) return v;
      } catch (e) { /* 使えない環境 */ }
      return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null;
    },
    set: function (k, v) {
      memory[k] = String(v);
      try { localStorage.setItem("odo_" + k, String(v)); } catch (e) { /* 使えない環境 */ }
    },
    del: function (k) {
      delete memory[k];
      try { localStorage.removeItem("odo_" + k); } catch (e) { /* 使えない環境 */ }
    }
  };
  var ALL_KEYS = ["login", "notice", "unlocked", "secret", "hands", "higashino", "refdocs", "report", "report_time"];
  function flag(k) { return store.get(k) === "1"; }
  function setFlag(k) { store.set(k, "1"); }

  // ---------- 墨消し解除の進捗 ----------
  function unlockedList() {
    try { return JSON.parse(store.get("unlocked") || "[]"); } catch (e) { return []; }
  }
  function unlock(id) {
    var l = unlockedList();
    if (l.indexOf(id) < 0) { l.push(id); store.set("unlocked", JSON.stringify(l)); }
  }
  function isOpen(p) { return !p.locked || unlockedList().indexOf(p.id) >= 0; }
  var lockedCount = PERSONS.filter(function (p) { return p.locked; }).length;
  function progress() {
    var l = unlockedList();
    return PERSONS.filter(function (p) { return p.locked && l.indexOf(p.id) >= 0; }).length;
  }
  function allOpen() { return progress() >= lockedCount; }

  // ---------- 入力のゆれを吸収する ----------
  function norm(s) {
    var t = String(s == null ? "" : s);
    if (t.normalize) t = t.normalize("NFKC");
    t = t.toLowerCase().replace(/[\s　・･]/g, "");
    t = t.replace(/[ぁ-ゖ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) + 0x60); }); // ひらがな→カタカナ
    t = t.replace(/(サン|クン|君|氏|様|サマ)$/, "");
    return t;
  }
  function equalsAny(input, list) {
    var n = norm(input);
    return list.some(function (x) { return norm(x) === n; });
  }
  function containsAny(input, list) {
    var n = norm(input);
    return n !== "" && list.some(function (x) { return n.indexOf(norm(x)) >= 0; });
  }
  function kanjiNumber(s) {
    var d = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
    var m = String(s).match(/^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/);
    if (m) return (m[1] ? d[m[1]] : 1) * 10 + (m[2] ? d[m[2]] : 0);
    if (d[s]) return d[s];
    return NaN;
  }
  function parseNumber(s) {
    var t = String(s).trim();
    if (t.normalize) t = t.normalize("NFKC");
    t = t.replace(/[本個人名つ]$/, "");
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    return kanjiNumber(t);
  }
  function parseDate8(s) {
    var t = String(s);
    if (t.normalize) t = t.normalize("NFKC");
    var r = t.match(/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (r) return String(2018 + parseInt(r[1], 10)) + pad(r[2]) + pad(r[3]);
    var h = t.match(/平成\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (h) return String(1988 + parseInt(h[1], 10)) + pad(h[2]) + pad(h[3]);
    var g = t.match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/);
    if (g) return g[1] + pad(g[2]) + pad(g[3]);
    return t.replace(/\D/g, "");
  }
  function pad(x) { return String(parseInt(x, 10)).padStart(2, "0"); }
  function parseItemNo(s) {
    var t = String(s);
    if (t.normalize) t = t.normalize("NFKC");
    var m = t.match(/^\s*(?:押収品|押)?\s*[-ー－―‐]?\s*(?:No\.?)?\s*(\d{1,2})\s*$/i);
    if (!m) return null;
    var no = pad(m[1]);
    return ITEMS.some(function (it) { return it.no === no; }) ? no : null;
  }
  function reiwa(d) {
    var h = d.getHours();
    var ampm = h < 12 ? "午前" : "午後";
    return "令和" + (d.getFullYear() - 2018) + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
      ampm + (h % 12) + "時" + d.getMinutes() + "分";
  }

  // ---------- 画面の部品 ----------
  function row(k, v) { return '<div class="row"><div class="k">' + k + '</div><div class="v">' + v + "</div></div>"; }
  function nav() {
    return '<div class="nav">' +
      '<a href="#/menu">メニュー</a><a href="#/overview">事案概要</a><a href="#/items">押収品目録</a>' +
      '<a href="#/statements">聴取記録</a><a href="#/refdocs">参考資料</a>' +
      '<a href="#/search">照会</a><a href="#/logout">ログアウト</a></div>';
  }
  function page(html) { app.innerHTML = nav() + '<div class="content"><div class="panel">' + html + "</div></div>"; }
  function redact(w) { return '<span class="redact">' + (w || "■■■■") + "</span>"; }
  function statusOf(it) {
    if (it.lostAfterHigashino && flag("higashino")) return '<span class="creep">所在不明（令和8年4月17日確認）</span>';
    return it.status;
  }
  function placeOf(p) {
    if (p.placeGated && !allOpen()) return redact("■■■■■■■■") + ' <span class="muted">（関係者全員の照会完了後に開示）</span>';
    return p.lastPlace;
  }
  // 閲覧記録（見た日時と回数を、資料の下に残す）
  function viewLog(key) {
    var k = "views_" + key;
    if (ALL_KEYS.indexOf(k) < 0) ALL_KEYS.push(k);
    var n = parseInt(store.get(k) || "0", 10) + 1;
    store.set(k, n);
    return '<p class="viewlog">' + MSG.viewLog.replace("{TIME}", reiwa(new Date())).replace("{N}", n) + "</p>";
  }
  // Enterキーでボタンを押せるようにする
  function onEnter(input, button) {
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); button.click(); } });
  }
  function $(id) { return document.getElementById(id); }

  // ---------- ログイン ----------
  function renderLogin() {
    app.innerHTML = '<div class="content"><div class="panel">' +
      "<h2>ログイン</h2>" +
      '<p class="muted">本システムは部外秘資料を扱います。許可された端末以外からのアクセスは記録されます。</p>' +
      '<label class="field">ユーザーID<input type="text" id="lid" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
      '<label class="field">パスワード（8桁）<input type="password" id="lpw" inputmode="numeric" autocomplete="off"></label>' +
      '<div class="err" id="lerr"></div>' +
      '<button class="btn" id="lbtn">ログイン</button>' +
      "</div></div>";
    var btn = $("lbtn");
    onEnter($("lid"), btn); onEnter($("lpw"), btn);
    $("lid").addEventListener("input", function () { $("lerr").textContent = ""; });
    $("lpw").addEventListener("input", function () { $("lerr").textContent = ""; });
    btn.addEventListener("click", function () {
      var id = $("lid").value, pw = $("lpw").value;
      if (!id.trim() || !pw.trim()) { $("lerr").textContent = "ユーザーIDとパスワードを入力してください。"; return; }
      if (norm(id) === norm(CONFIG.loginId) && parseDate8(pw) === CONFIG.password) {
        setFlag("login");
        location.hash = flag("notice") ? "#/menu" : "#/notice"; route();
        return;
      }
      $("lerr").textContent = MSG.loginWrong;
    });
  }

  // ---------- 取扱注意（ログイン後に1回だけ） ----------
  function renderNotice() {
    app.innerHTML = '<div class="content"><div class="panel">' +
      "<h2>" + NOTICE.title + ' <span class="stamp">部外秘</span></h2>' +
      '<p class="muted">' + NOTICE.revised + "</p>" +
      NOTICE.items.map(function (t) { return '<p class="doc">' + t + "</p>"; }).join("") +
      '<button class="btn" id="nbtn">' + NOTICE.button + "</button></div></div>";
    $("nbtn").addEventListener("click", function () {
      setFlag("notice"); location.hash = "#/menu"; route();
    });
  }

  // ---------- メニュー ----------
  function renderMenu() {
    var report = (flag("higashino") && flag("refdocs"))
      ? '<a href="#/report">捜査報告書（未提出）</a>'
      : '<span class="muted">捜査報告書（未提出）― 関連資料の照会が完了していません</span>';
    page("<h2>メニュー" + ' <span class="stamp">部外秘</span></h2>' +
      '<p class="muted">ログイン中：' + CONFIG.loginId + "（生活安全課）</p>" +
      '<div class="notice">【お知らせ・令和8年9月】証拠品保管庫の点検にともない、一部資料の保管状況を更新しています。</div>' +
      "<h3>担当事案</h3>" +
      '<div class="card"><b>' + CASE.name + "（平成16年）</b><br>" +
      '<a href="#/overview">事案概要・所在不明者一覧を開く</a></div>' +
      "<h3>資料</h3><ul class=\"menu\">" +
      '<li><a href="#/items">押収品目録</a></li>' +
      '<li><a href="#/statements">聴取記録</a>（機密区分B）</li>' +
      '<li><a href="#/refdocs">参考資料</a>（機密区分A）</li>' +
      '<li><a href="#/search">照会</a>（氏名・押収品番号）</li>' +
      "<li>" + report + "</li></ul>");
  }

  // ---------- 事案概要（墨消し解除） ----------
  function renderOverview(flash) {
    var cards = PERSONS.map(function (p) {
      var open = isOpen(p);
      var head = open
        ? p.name + "（" + p.age + '）<span class="muted">　mixi上の名称：' + p.handle + "</span>"
        : redact("■■ ■■") + "（" + p.age + "）";
      var h = '<div class="card"><b>所在不明者' + p.label + "</b>：" + head +
        row("最終確認", p.lastSeen) + row("場所", placeOf(p)) + (p.memo ? row("備考", p.memo) : "");
      if (open) {
        h += '<a href="#/person/' + p.id + '">家出人捜索願を見る</a>';
      } else {
        h += '<div class="gate"><div class="muted">氏名またはmixi上の名称を入力して検索</div>' +
          '<input type="text" id="u_' + p.id + '" autocomplete="off">' +
          '<div class="err" id="e_' + p.id + '"></div>' +
          '<button class="btn" data-unlock="' + p.id + '">検索</button></div>';
      }
      return h + "</div>";
    }).join("");
    page("<h2>事案概要</h2>" +
      row("事案名", CASE.name) + row("認知", CASE.recognized) + row("担当", CASE.charge) + row("概要", CASE.summary) +
      "<h3>所在不明者一覧</h3>" +
      '<p class="muted">' + CASE.redactNote + "</p>" +
      '<p>照会進捗：<b>' + progress() + " / " + lockedCount + "</b></p>" +
      (flash ? '<div class="notice">' + flash + "</div>" : "") +
      cards);
    Array.prototype.forEach.call(document.querySelectorAll("[data-unlock]"), function (btn) {
      var id = btn.getAttribute("data-unlock");
      var input = $("u_" + id), err = $("e_" + id);
      onEnter(input, btn);
      input.addEventListener("input", function () { err.textContent = ""; });
      btn.addEventListener("click", function () {
        var v = input.value;
        if (!v.trim()) { err.textContent = "氏名を入力してください。"; return; }
        var target = PERSONS.filter(function (p) { return p.id === id; })[0];
        if (equalsAny(v, target.accepts)) {
          unlock(id);
          var msg = "照合一致：所在不明者" + target.label + "の墨消しを解除しました。";
          if (allOpen()) msg += "<br>関係者全員の照会が完了しました。所在不明者Aの最終確認場所を開示します。";
          renderOverview(msg);
          return;
        }
        var other = PERSONS.filter(function (p) { return p.id !== id && equalsAny(v, p.accepts); })[0];
        err.textContent = other ? "照合不一致（その氏名は別の所在不明者として登録されています）" : "照合不一致";
      });
    });
  }

  // ---------- 家出人捜索願 ----------
  function renderPerson(id) {
    var p = PERSONS.filter(function (x) { return x.id === id; })[0];
    if (!p) { renderMenu(); return; }
    if (!isOpen(p)) { location.hash = "#/overview"; return; }
    var rows = p.form.map(function (f) { return row(f[0], f[1].replace("{PLACE}", placeOf(p))); }).join("");
    page("<h2>家出人捜索願" + ' <span class="stamp">写</span></h2>' + rows + viewLog("person_" + p.id) +
      '<p><a href="#/overview">← 所在不明者一覧に戻る</a></p>');
  }

  // ---------- 押収品目録 ----------
  function renderItems() {
    var list = ITEMS.map(function (it) {
      if (it.gated && !allOpen()) {
        return '<div class="card"><b>押-' + it.no + "</b>　" + redact("■■■■■■") +
          '<br><span class="muted">閲覧制限中（関係者全員の照会完了後に開示）</span></div>';
      }
      return '<div class="card"><b><a href="#/item/' + it.no + '">押-' + it.no + "</a></b>　" + it.name +
        '<br><span class="muted">' + it.place + "／" + it.date + "／保管状況：</span>" + statusOf(it) + "</div>";
    }).join("");
    page("<h2>押収品目録</h2>" + list + '<p class="muted">' + LIST_FOOTER + "</p>");
  }

  function renderItem(no) {
    var it = ITEMS.filter(function (x) { return x.no === no; })[0];
    if (!it) { renderItems(); return; }
    if (it.gated && !allOpen()) {
      page("<h2>押-" + it.no + "</h2><p>閲覧制限中です。関係者全員の照会が完了すると開示されます（事案概要を参照）。</p>" +
        '<p><a href="#/items">← 押収品目録に戻る</a></p>');
      return;
    }
    if (it.sealed) {   // ★ 押-12：最後まで開けない
      page("<h2>押-" + it.no + "</h2>" +
        row("品名", it.name) + row("保管場所", it.place) + row("領置", it.date) + row("保管状況", statusOf(it)) +
        '<div class="gate"><b>閲覧権限がありません</b><br>' + SEALED + "</div>" +
        viewLog("item_" + it.no) + '<p><a href="#/items">← 押収品目録に戻る</a></p>');
      return;
    }
    if (it.view === "analysis") { renderAnalysis(it); return; }
    if (it.view === "envelope") { renderEnvelope(it); return; }
    page("<h2>押-" + it.no + "</h2>" +
      row("品名", it.name) + row("発見場所", it.place) + row("領置", it.date) + row("保管状況", statusOf(it)) +
      row("備考", it.body) + viewLog("item_" + it.no) + '<p><a href="#/items">← 押収品目録に戻る</a></p>');
  }

  function renderAnalysis(it) {
    var chats = ANALYSIS.chats.map(function (c) { return '<li><a href="' + c.href + '">' + c.label + "</a></li>"; }).join("");
    var heads = ["日時", "板・スレッド", "レス", "ID", "送信元"];
    var trs = ANALYSIS.posts.map(function (r) {
      return "<tr>" + r.map(function (c, i) { return '<td data-l="' + heads[i] + '">' + c + "</td>"; }).join("") + "</tr>";
    }).join("");
    page("<h2>押-01 解析報告" + ' <span class="stamp">部外秘</span></h2>' +
      row("品名", it.name) + row("押収場所", it.place) + row("領置", it.date) + row("保管状況", statusOf(it)) +
      '<p class="muted">' + ANALYSIS.summary + "</p>" +
      "<h3>1. 復元されたチャットログ（mixi プライベートトピック「進捗報告用」）</h3><ul>" + chats + "</ul>" +
      "<h3>2. 掲示板への書き込み照会結果</h3>" +
      '<p class="muted">プロバイダへの照会結果と、各人の端末の送信履歴を照合したもの。</p>' +
      '<table class="log"><thead><tr><th>' + heads.join("</th><th>") + "</th></tr></thead><tbody>" + trs + "</tbody></table>" +
      ANALYSIS.postNotes.map(function (n) { return '<p class="muted">' + n + "</p>"; }).join("") +
      "<h3>3. 作成文書</h3><p>" + ANALYSIS.docs + "</p>" +
      "<h3>4. 受信メール</h3><p>" + ANALYSIS.mail + "</p>" +
      "<h3>5. 検索履歴（4月22日以降・抜粋）</h3><p>" + ANALYSIS.searches + "</p>" +
      '<h3>6. 印刷ログ</h3><p>' + ANALYSIS.printLog + ' <a href="#/item/03">押-03 を開く</a></p>' +
      viewLog("item_01") + '<p><a href="#/items">← 押収品目録に戻る</a></p>');
  }

  function renderEnvelope(it) {
    var html = "<h2>押-03 黒色封筒" + ' <span class="stamp">部外秘</span></h2>' +
      row("品名", it.name) + row("発見場所", it.place) + row("領置", it.date) + row("保管状況", statusOf(it)) +
      row("外観", ENVELOPE.appearance) + row("内容物", ENVELOPE.content) + "<h3>鑑定結果</h3>";
    if (!flag("hands")) {
      html += '<div class="gate"><b>証拠品所持確認</b><br>' + ENVELOPE.gateText +
        '<input type="text" id="hand" inputmode="numeric" autocomplete="off">' +
        '<div class="err" id="herr"></div><button class="btn" id="hbtn">照合</button></div>';
    } else {
      html += '<p class="ok">照合一致。</p><p class="creep">' + ENVELOPE.afterGate + "</p><p>" + ENVELOPE.result + "</p>" + viewLog("item_03");
    }
    page(html + '<p><a href="#/items">← 押収品目録に戻る</a></p>');
    if (!flag("hands")) {
      var input = $("hand"), btn = $("hbtn"), err = $("herr");
      onEnter(input, btn);
      input.addEventListener("input", function () { err.textContent = ""; });
      btn.addEventListener("click", function () {
        if (!input.value.trim()) { err.textContent = "数を入力してください。"; return; }
        if (parseNumber(input.value) === CONFIG.handCount) { setFlag("hands"); renderEnvelope(it); return; }
        err.textContent = ENVELOPE.wrong;
      });
    }
  }

  // ---------- 聴取記録（秘密の質問） ----------
  function renderStatements() {
    if (!flag("secret")) {
      page("<h2>聴取記録" + ' <span class="stamp">機密区分B</span></h2>' +
        '<div class="gate"><b>追加認証</b><br>機密区分Bの資料を閲覧するには、秘密の質問に答えてください。<br>' +
        "【秘密の質問】" + CONFIG.secretQuestion +
        '<input type="text" id="sq" autocomplete="off"><div class="err" id="serr"></div>' +
        '<button class="btn" id="sbtn">回答</button></div>');
      var input = $("sq"), btn = $("sbtn"), err = $("serr");
      onEnter(input, btn);
      input.addEventListener("input", function () { err.textContent = ""; });
      btn.addEventListener("click", function () {
        if (!input.value.trim()) { err.textContent = "回答を入力してください。"; return; }
        if (equalsAny(input.value, CONFIG.secretAnswers)) { setFlag("secret"); renderStatements(); return; }
        err.textContent = MSG.secretWrong;
      });
      return;
    }
    var list = STATEMENTS.map(function (s) {
      if (s.gated && !allOpen()) {
        return '<div class="card"><b>' + s.title + '</b><br><span class="muted">' + s.date + "／" + s.about +
          "</span><p>" + redact("■■■■■■■■■■■■") + '<br><span class="muted">（関係者全員の照会完了後に開示）</span></p></div>';
      }
      return '<div class="card"><b>' + s.title + '</b><br><span class="muted">' + s.date + "／" + s.about + "</span><p>" +
        s.body + "</p>" + (s.memo ? '<p class="muted">聴取者メモ：' + s.memo + "</p>" : "") + "</div>";
    }).join("");
    page("<h2>聴取記録" + ' <span class="stamp">機密区分B</span></h2>' + list + viewLog("statements"));
  }

  // ---------- 参考資料（機密区分A・お札の裏の地名で開く） ----------
  function renderRefdocs() {
    if (!flag("refdocs")) {
      page("<h2>" + REFDOCS.gateTitle + ' <span class="stamp">機密区分A</span></h2>' +
        '<div class="gate">' + REFDOCS.gateText +
        '<input type="text" id="rf" autocomplete="off"><div class="err" id="rferr"></div>' +
        '<button class="btn" id="rfbtn">承認</button></div>');
      var input = $("rf"), btn = $("rfbtn"), err = $("rferr");
      onEnter(input, btn);
      input.addEventListener("input", function () { err.textContent = ""; });
      btn.addEventListener("click", function () {
        if (!input.value.trim()) { err.textContent = "地名を入力してください。"; return; }
        if (equalsAny(input.value, REFDOCS.accepts)) { setFlag("refdocs"); renderRefdocs(); return; }
        err.textContent = REFDOCS.wrong;
      });
      return;
    }
    function ink(s) {
      return s.replace(/\{R(\d+)\}/g, function (m, n) {
        return redact(new Array(parseInt(n, 10) + 1).join("■"));
      });
    }
    var body = REFDOCS.docBody.map(function (line) { return '<p class="doc">' + ink(line) + "</p>"; }).join("");
    page("<h2>" + REFDOCS.docTitle + ' <span class="stamp">機密区分A</span></h2>' +
      REFDOCS.docHead.map(function (r) { return row(r[0], r[1]); }).join("") +
      body +
      '<div class="notice">' + ink(REFDOCS.decision) + "</div>" +
      '<div class="margin-note">' + REFDOCS.margin + "</div>" + viewLog("refdocs") +
      (flag("higashino") ? '<p><a href="#/report">捜査報告書（未提出）を開く</a></p>' : ""));
  }

  // ---------- 照会（検索） ----------
  function renderSearch(result) {
    page("<h2>照会</h2>" +
      '<p class="muted">氏名、押収品番号（例：押-01）などで照会できます。</p>' +
      '<input type="text" id="q" autocomplete="off"><div class="err" id="qerr"></div>' +
      '<button class="btn" id="qbtn">照会</button>' +
      (result ? '<div class="result">' + result + "</div>" : ""));
    var input = $("q"), btn = $("qbtn"), err = $("qerr");
    onEnter(input, btn);
    input.addEventListener("input", function () { err.textContent = ""; });
    btn.addEventListener("click", function () {
      var q = input.value;
      if (!q.trim()) { err.textContent = "照会する内容を入力してください。"; return; }
      doSearch(q);
    });
  }

  function doSearch(q) {
    var no = parseItemNo(q);
    if (no) { location.hash = "#/item/" + no; return; }
    if (norm(q) === norm("手")) { renderSearch('<span class="creep">' + MSG.hand + "</span>"); return; }
    if (equalsAny(q, CONFIG.authorAccepts) || containsAny(q, ["東野", "ヒガシノ", "琉之介"])) { location.hash = "#/higashino"; return; }
    if (equalsAny(q, CONFIG.players)) {
      if (flag("report")) { location.hash = "#/case2026"; return; }
      renderSearch(MSG.notYet); return;
    }
    var p = PERSONS.filter(function (x) { return equalsAny(q, x.accepts); })[0];
    if (p) {
      if (isOpen(p)) { location.hash = "#/person/" + p.id; return; }
      renderSearch(MSG.redacted); return;
    }
    var w = SEARCH_WORDS.filter(function (s) { return equalsAny(q, s.words); })[0];
    if (w) { location.hash = w.go; return; }
    renderSearch(MSG.noHit);
  }

  // ---------- 情報提供受理票（東野） ----------
  function renderHigashino(justOpened) {
    if (!flag("higashino")) {
      page("<h2>情報提供受理票</h2>" +
        '<div class="gate">' + HIGASHINO.gateText +
        '<p class="muted">' + HIGASHINO.partial + "</p>" +
        '<input type="text" id="hd" inputmode="numeric" autocomplete="off"><div class="err" id="herr2"></div>' +
        '<button class="btn" id="hdbtn">照会</button></div>');
      var input = $("hd"), btn = $("hdbtn"), err = $("herr2");
      onEnter(input, btn);
      input.addEventListener("input", function () { err.textContent = ""; });
      btn.addEventListener("click", function () {
        if (!input.value.trim()) { err.textContent = "受理年月日を入力してください。"; return; }
        if (parseDate8(input.value) === CONFIG.higashinoDate) { setFlag("higashino"); renderHigashino(true); return; }
        err.textContent = HIGASHINO.wrong;
      });
      return;
    }
    page("<h2>情報提供受理票</h2>" +
      HIGASHINO.rows.map(function (r) { return row(r[0], r[1]); }).join("") +
      '<p class="viewlog creep">' + HIGASHINO.lastViewed + "</p>" +
      (justOpened ? '<div class="notice creep">' + HIGASHINO.afterNote + "</div>" : "") +
      viewLog("higashino") +
      (flag("refdocs")
        ? '<p><a href="#/report">捜査報告書（未提出）を開く</a></p>'
        : '<p><a href="#/refdocs">参考資料（機密区分A）を開く</a></p>'));
  }

  // ---------- 捜査報告書 ----------
  function renderReport() {
    if (!flag("higashino") || !flag("refdocs")) {
      page("<h2>捜査報告書（未提出）</h2>" +
        "<p>関連資料の照会が完了していません。</p>" +
        '<p class="muted">未照会：' +
        (flag("higashino") ? "" : "情報提供受理票　") +
        (flag("refdocs") ? "" : "参考資料（機密区分A）") + "</p>");
      return;
    }
    if (flag("report")) {
      page("<h2>捜査報告書</h2><p class=\"ok\">" + REPORT.accepted + "</p>" +
        '<p><a class="btn" href="#/case2026">' + REPORT.newCase + "</a></p>");
      return;
    }
    page("<h2>捜査報告書（未提出）</h2>" +
      '<p class="muted">' + REPORT.lead + "</p>" +
      row("件名", REPORT.subject) + "<p>" + REPORT.body + "</p>" +
      '<label class="field">' + REPORT.q1 + '<input type="text" id="r1" autocomplete="off"></label><div class="err" id="re1"></div>' +
      '<label class="field">' + REPORT.q2 + '<input type="text" id="r2" autocomplete="off"></label><div class="err" id="re2"></div>' +
      '<label class="field">' + REPORT.q3 + '<input type="text" id="r3" inputmode="numeric" autocomplete="off"></label><div class="err" id="re3"></div>' +
      '<button class="btn" id="rbtn">提出する</button><div id="rres"></div>');
    ["r1", "r2", "r3"].forEach(function (k, i) {
      $(k).addEventListener("input", function () { $("re" + (i + 1)).textContent = ""; });
    });
    $("rbtn").addEventListener("click", function () {
      var v1 = $("r1").value, v2 = $("r2").value, v3 = $("r3").value, ok = true;
      if (!v1.trim()) { $("re1").textContent = "未記入です。"; ok = false; }
      else if (!containsAny(v1, REPORT.q1Accepts)) { $("re1").textContent = REPORT.q1Wrong; ok = false; }
      if (!v2.trim()) { $("re2").textContent = "未記入です。"; ok = false; }
      else if (!containsAny(v2, REPORT.q2Accepts)) { $("re2").textContent = REPORT.q2Wrong; ok = false; }
      var n = parseNumber(v3);
      if (!v3.trim()) { $("re3").textContent = "未記入です。"; ok = false; }
      else if (isNaN(n) || n < 1) { $("re3").textContent = "数字で入力してください。"; ok = false; }
      if (!ok) return;
      setFlag("report");
      store.set("report_time", new Date().toISOString());
      $("rbtn").disabled = true;
      $("rres").innerHTML = '<p class="ok">' + REPORT.q1Ok + "<br>" + REPORT.q2Ok + "</p>" +
        '<p class="creep">' + (n === 5 ? REPORT.q3Five : REPORT.q3Other.replace("{N}", n)) + "</p>" +
        '<p class="ok">' + REPORT.accepted + "</p>";
      setTimeout(function () {
        $("rres").innerHTML += '<div class="notice creep blink">' + REPORT.newCase + "</div>" +
          '<p><a class="btn" href="#/case2026">開く</a></p>';
      }, 2500);
    });
  }

  // ---------- 令和8年の新規事案 ----------
  function renderCase2026() {
    if (!flag("report")) { page("<h2>照会結果</h2><p>" + MSG.notYet + "</p>"); return; }
    var t = new Date(store.get("report_time") || Date.now());
    var time = reiwa(t);
    var rows = CASE2026.rows.map(function (r) {
      return row(r[0], r[1].replace(/\{TIME\}/g, time).replace("{PLAYERS}", CONFIG.players.join("／")));
    }).join("");
    page("<h2>" + CASE2026.title + ' <span class="stamp">新規</span></h2>' + rows + viewLog("case2026") +
      '<p><a class="btn" href="' + CASE2026.link.href + '">' + CASE2026.link.label + "</a></p>");
  }

  // ---------- 画面の切り替え ----------
  function route() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("/");
    var name = parts[0], arg = parts[1];
    if (name === "reset") {
      ALL_KEYS.forEach(function (k) { store.del(k); });
      for (var mk in memory) { delete memory[mk]; }
      try {
        Object.keys(localStorage)
          .filter(function (k) { return k.indexOf("odo_") === 0; })
          .forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) { /* 使えない環境 */ }
      location.hash = "#/";
      renderLogin();
      return;
    }
    if (name === "logout") { store.del("login"); location.hash = "#/"; renderLogin(); return; }
    if (!flag("login")) { renderLogin(); return; }
    if (!flag("notice")) { renderNotice(); return; }   // 取扱注意を1回読ませる
    switch (name) {
      case "overview": renderOverview(); break;
      case "person": renderPerson(arg); break;
      case "items": renderItems(); break;
      case "item": renderItem(arg); break;
      case "statements": renderStatements(); break;
      case "refdocs": renderRefdocs(); break;
      case "notice": renderNotice(); break;
      case "search": renderSearch(); break;
      case "higashino": renderHigashino(); break;
      case "report": renderReport(); break;
      case "case2026": renderCase2026(); break;
      default: renderMenu();
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", route);
  route();
})();
