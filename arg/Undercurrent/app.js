// ============================================================
// 富山県内過去スレ保管庫 検索ロジック
// ★ キーワードとスレッドの紐付けは下の DATA を編集してください
//   ・スペース区切りのキーは「全部の単語がそろったとき」だけヒットする
//     （一部だけ入力すると「キーワードが足りません」と表示される）
//   ・同じスレに別の言い方でも行けるようにしたいときは、キーを1行増やせばOK
// ============================================================

// ★ 行き先の定義（同じスレを複数のキーから指せるように、ここで1回だけ書く）
const T = {
  kamikakushi:   { title: "【迷宮入り】不気味な未解決事件について語ろうず【神隠し】", file: "threads/0001.html", desc: "2007/08/13作成 - 事件板アーカイブ" },
  toshidensetsu: { title: "【怪談】おまえらの地元の都市伝説・噂話教えろ", file: "threads/002a.html", desc: "2004/09/23作成 - オカルト板アーカイブ" },
  odonote:       { title: "【洒落怖】『オドノテ』って知ってる奴いる？", file: "threads/003odnt.html", desc: "2004/04/04作成 - オカルト板アーカイブ" },
  jimoto:        { title: "【地元民】『オドノテ』ってネット怪談流行ってるけどさぁ……", file: "threads/004e.html", desc: "2004/04/10作成 - 歴史・民俗板アーカイブ" },
  winny:         { title: "【Winny】富山県警でも捜査資料流出【祭り】", file: "threads/010winny.html", desc: "2006/03/21作成 - ニュース速報板アーカイブ" },
  kyodoshi:      { title: "【越中】富山の郷土史・治水史を語るスレ", file: "threads/007water.html", desc: "2004/04/25作成 - 歴史・民俗板アーカイブ" },
  mokugeki:      { title: "【富山】ワイ、大学生グループ失踪事件の1人を目撃していた件について【未解決】", file: "threads/008hugan.html", desc: "2004/05/21作成 - 事件板アーカイブ" },
  kozeni:        { title: "【富山】松川で毎晩小銭投げとる奴おるんやけど", file: "threads/011kozeni.html", desc: "2004/04/27作成 - 地元板アーカイブ" },
  sakujo:        { title: "【削除依頼】オカルト板『オドノテ』関連スレッド", file: "threads/012sakujo.html", desc: "2004/05/01作成 - 削除依頼板アーカイブ" },
  hiddenlog:     { title: "index.php/hidden_log", file: "threads/009lastnote.html", desc: "System Alert - 隠しログへのアクセス" },

  // ---- ★イースターエッグ（本筋とは無関係のエクストラスレ） ----
  ex_kaitai:     { title: "★【ネタバレ注意】都市伝説解体センター クリアした奴語ろうぜ Part12", file: "threads/016ex_kaitai.html", desc: "★エクストラ - 2026/03/08作成 - 家庭用ゲーム板アーカイブ" },
  ex_samejima:   { title: "★伝説の「鮫島スレ」について語ろう", file: "threads/017ex_samejima.html", desc: "★エクストラ - 2001/05/23作成 - ラウンジ板アーカイブ" },
  ex_kisaragi:   { title: "★身のまわりで変なことが起こったら実況するスレ 26", file: "threads/018ex_kisaragi.html", desc: "★エクストラ - 2004/01/08 - オカルト板アーカイブ" },
  ex_iden:       { title: "★【ネット怪談】マイクラサーバーに現れる「friendly bot」について", file: "threads/019ex_iden.html", desc: "★エクストラ - 2025/10/05作成 - オカルト板アーカイブ" },
  ex_kunekune:   { title: "★【洒落怖】富山の婆ちゃん家で「くねくね」を見た話", file: "threads/020ex_kunekune.html", desc: "★エクストラ - 2003/08/15作成 - オカルト板アーカイブ" },
  ex_kanrinin:   { title: "★【悲報】過去スレ保管庫の管理人、友達を富山に呼ぶためだけにこのサイトを作る", file: "threads/022ex_kanrinin.html", desc: "★エクストラ - 2026/09/24作成 - ニュース速報板アーカイブ" }
};

// ★ キーワード → 行き先
const DATA = {
  // ---- 前半：噂を追う（公開日からオンラインで遊べる範囲） ----
  "神隠し": [T.kamikakushi],
  "都市伝説": [T.toshidensetsu],
  "オドノテ": [T.odonote],
  "ミナガセ": [T.jimoto],
  "ハシヅル": [T.jimoto],

  // ---- 転換点：松川の黒封筒に書かれた文字 ----
  "オチテオチテ": [T.winny],

  // ---- 後半：警察DB（mirror/）の記録と行き来する ----
  "旧神通川 治水工事": [T.kyodoshi],
  "郷土史": [T.kyodoshi],
  "治水": [T.kyodoshi],
  "治水史": [T.kyodoshi],
  "治水工事": [T.kyodoshi],
  "富岩運河 天門橋": [T.mokugeki],   // 「富岩運河」は郷土史スレ、「天門橋」は警察DBから
  "小銭": [T.kozeni],
  "硬貨": [T.kozeni],
  "削除依頼": [T.sakujo],
  "削除依頼板": [T.sakujo],
  "削除": [T.sakujo],

  // ---- 天門橋のメモとお札から（「澱の手」「牛ノ首」の変換ゆれも許容） ----
  "澱ノ手 牛の首": [T.hiddenlog],
  "澱の手 牛の首": [T.hiddenlog],
  "澱ノ手 牛ノ首": [T.hiddenlog],
  "澱の手 牛ノ首": [T.hiddenlog],

  // ---- ★イースターエッグ（どこからも誘導しない。知っている人だけが打ち込む） ----
  "都市伝説解体センター": [T.ex_kaitai],
  "解体センター": [T.ex_kaitai],
  "鮫島事件": [T.ex_samejima],
  "鮫島": [T.ex_samejima],
  "鮫島スレ": [T.ex_samejima],
  "サメジマ": [T.ex_samejima],
  "きさらぎ駅": [T.ex_kisaragi],
  "きさらぎ": [T.ex_kisaragi],
  "伊佐貫": [T.ex_kisaragi],
  "はすみ": [T.ex_kisaragi],
  "未来都市イデン": [T.ex_iden],
  "イデン": [T.ex_iden],
  "マリア": [T.ex_iden],
  "NIIR": [T.ex_iden],
  "くねくね": [T.ex_kunekune],
  "クネクネ": [T.ex_kunekune],
  "案内人": [T.ex_kanrinin],
  "作者": [T.ex_kanrinin],
  "製作者": [T.ex_kanrinin],
  "制作者": [T.ex_kanrinin]
};

const $input = document.getElementById('search-input');
const $button = document.getElementById('search-button');
const $results = document.getElementById('results');

function search() {
  // 入力された全角スペースを半角スペースに変換し、連続するスペースを1つにまとめる
  const rawQuery = $input.value.trim();
  const query = rawQuery.replace(/[　\s]+/g, ' ');

  $results.innerHTML = ''; // リセット

  if (!query) return;

  let exactMatchKey = null;
  let partialMatchFound = false;

  // 入力された文字列を単語ごとに分割し、Setを使って重複を排除する
  // これにより「澱ノ手 澱ノ手」のような不正入力を防ぐ
  const queryWords = [...new Set(query.split(' '))];

  // DATAオブジェクトのキーをすべて走査する
  for (const key of Object.keys(DATA)) {
    const keyWords = key.split(' ');

    // 入力されたすべての単語が、設定キーの中に含まれているかを判定
    const isSubset = queryWords.every(word => keyWords.includes(word));

    if (isSubset) {
      // 単語数が同じなら完全一致（順番は問わない）
      if (queryWords.length === keyWords.length) {
        exactMatchKey = key;
        break;
      }
      // 単語数が少ない場合は「キーワード不足」として扱う
      else if (queryWords.length < keyWords.length) {
        partialMatchFound = true;
      }
    }
  }

  // 結果の表示処理
  if (exactMatchKey) {
    DATA[exactMatchKey].forEach(item => {
      const div = document.createElement('div');
      div.innerHTML = `
        <a href="${item.file}" class="thread-link" target="_blank">${item.title}</a>
        <div class="thread-desc">${item.desc}</div>
      `;
      $results.appendChild(div);
    });
  } else if (partialMatchFound) {
    // キーワードが足りない場合
    $results.innerHTML = '<p class="error" style="color: #cc5500;">キーワードが足りません。さらに情報を組み合わせてください。</p>';
  } else {
    // 一致しない場合
    $results.innerHTML = '<p class="error">一致するスレッドが見つかりませんでした。</p>';
  }
}

$button.addEventListener('click', search);
$input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') search();
});
