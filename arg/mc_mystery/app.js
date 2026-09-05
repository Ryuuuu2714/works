// ===== 設定 =====
const OPTIONS = {
  TYPE_SPEED: 25,
  CASE_SENSITIVE: false,
  DATA_URL: "keywords.json",
  PLAYER_DATA_URL: "player_data.json" // ★追加: プレイヤー情報ファイルの場所
};

// ===== 要素参照 =====
const $monitor = document.getElementById('monitor');
const $input   = document.getElementById('input');
const $submit  = document.getElementById('submit');

// ★追加: プレイヤー情報を格納する変数
let DICT = {};
let PLAYER_DB = {};      // プレイヤーのIDと名前の全リスト
let PLAYER_NAME = '';    // ログイン中のプレイヤー名

// ===== 出力：タイプライター（1文字ずつ描画） =====
let printQueue = Promise.resolve();
function typewrite(text = ''){
  printQueue = printQueue.then(() => new Promise(resolve => {
    let i = 0;
    const node = document.createTextNode('');
    $monitor.appendChild(node);
    const tick = () => {
      if (i < text.length) {
        node.textContent += text[i++];
        $monitor.scrollTop = $monitor.scrollHeight;
        setTimeout(tick, OPTIONS.TYPE_SPEED);
      } else {
        resolve();
      }
    };
    tick();
  }));
  return printQueue;
}
function newline(){ return typewrite('\n'); }
function printLine(line = ''){ return typewrite(line + '\n'); }

// ===== データファイルのロード関連 =====
// ★変更: keywords.jsonをロードする機能
async function loadDict(){
  const res = await fetch(OPTIONS.DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('keywords.json を読み込めませんでした');
  const json = await res.json();
  DICT = normalizeDict(json);
}
// ★追加: player_data.jsonをロードする機能
async function loadPlayerData(){
  const res = await fetch(OPTIONS.PLAYER_DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('player_data.json を読み込めませんでした');
  PLAYER_DB = await res.json();
}

function normalizeDict(obj){
  if (OPTIONS.CASE_SENSITIVE) return obj;
  const lowered = {};
  Object.keys(obj).forEach(k => { lowered[k.toLowerCase()] = obj[k]; });
  return lowered;
}

// ===== コマンド処理 =====
async function runCommand(raw){
  const input = raw.trim();
  if (!input) return;

  await printLine('> ' + raw);

  const key = OPTIONS.CASE_SENSITIVE ? input : input.toLowerCase();

  // 内蔵コマンド
  if (key === 'help'){
    await printLine('初期コマンド: help, clear');
    await printLine('その他特定のキーワード及びコマンドを入力すると、対応するファイルが解放されます。');
    return;
  }
  if (key === 'clear'){
    $monitor.textContent = '';
    return;
  }

  const entry = DICT[key];
  if (!entry){
    await printLine('ERROR: Unknown Keyword or Password');
    return;
  }

  // ★変更: テキスト表示前にプレイヤー名の置換処理を追加
  if (entry.text){
    // テキストに {PLAYER_NAME} が含まれていたら、保存しておいた名前に置き換える
    const processedText = entry.text.replace(/{PLAYER_NAME}/g, PLAYER_NAME);
    await printLine(processedText);
  }

  if (Array.isArray(entry.links) && entry.links.length){
    for (const link of entry.links){
      const label = link.label || link.href;
      const a = document.createElement('a');
      a.href = link.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = label;
      a.className = 'link';
      $monitor.append(' -> ');
      $monitor.appendChild(a);
      $monitor.append('\n');
    }
  }

  await newline();
}

// ===== イベント =====
$submit.addEventListener('click', () => {
  const v = $input.value;
  $input.value = '';
  runCommand(v);
  $input.focus();
});
$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter'){
    const v = $input.value;
    $input.value = '';
    runCommand(v);
  }
});

// ===== 初期化 =====
// ★変更: ゲーム開始時の処理を大幅に変更
// ===== 初期化 =====
(async function init(){
  try {
    // 1. プレイヤーデータを先に読み込む
    await loadPlayerData();

    // 2. ID入力を求めるプロンプトを表示
    const playerId = prompt('MinecraftのゲームID を入力してください:', '');
    
    // 3. 入力されたIDがデータにあれば名前を保存、なければ「ゲスト」とする
    if (playerId && PLAYER_DB[playerId]) {
      PLAYER_NAME = PLAYER_DB[playerId];
      // ログインメッセージには入力されたIDを表示
      await printLine(`認証成功: Welcome, ${playerId} がログインしました。`);
    } else {
      PLAYER_NAME = 'ゲスト';
      await printLine('認証情報なし: ゲストとしてログインしました。');
    }

    // 4. キーワード辞書を読み込んでゲームの残りを準備
    await loadDict();
    await printLine('boot… /dev/world mounted');
    await printLine('ようこそ！まずは"help"コマンドを入力してみてね。');

  } catch (e){
    await printLine('[fatal] '- + e.message);
  }
  $input.focus();
})();