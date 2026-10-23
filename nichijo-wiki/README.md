# 麻雀同好会 日常鯖 攻略Wiki

公開先：https://ryuuuu2714.github.io/works/nichijo-wiki/

日常鯖（Minecraft 1.21.1 / NeoForge、MODパックは `../nichijo-pack/`）のための攻略Wikiです。
HTML・CSS・JavaScript だけの静的サイトで、GitHub Pages でそのまま公開されます。

## 文章を直すには

`content/` の Markdown ファイルを書き換えて、main に入れるだけです（GitHub の画面上で編集しても構いません）。
1分ほどでサイトに反映されます。ブラウザに古い内容が残っていたら、再読み込みしてください。

| ファイル | 中身 |
| --- | --- |
| `content/menu.md` | 左のメニュー。「## 」がグループ、「- [表示名](ファイル名)」が1ページ |
| `content/home.md` | ホーム |
| `content/lore.md` | 世界の成り立ち（物語と用語集） |
| `content/flow.md`、`ch0.md`〜`ch4.md` | 攻略の流れと各章 |
| `content/rules.md`、`join.md`、`controls.md` | ルール・参加方法・操作 |
| `content/magic.md` ほか | 早見表 |
| `content/item-notes.md` | アイテム図鑑に添えるメモ |

### 書き方の約束

- `[[秘術のエッセンス]]` と書くと、アイテム図鑑へのリンクになります。表示名を変えるときは `[[表示名|図鑑の名前かID]]`。
- `- [ ] やること` と書くと、チェック欄になります（チェックは見ている人のブラウザに保存されます）。
  - 「攻略の流れ」グループのページのチェック欄は、ホームの「進み具合」で集計されます。
  - チェック欄の文を書き換えると、その行のチェックは外れた状態に戻ります。
- `{{進み具合}}` の行は進み具合の表に、`{{図鑑検索}}` の行は図鑑の検索窓に置き換わります。
- ページへのリンクは `[表示名](ファイル名.md)` と書きます。
- 新しいページは `content/` に .md ファイルを足し、`menu.md` に1行足します。

## アイテム図鑑のデータ

`data/items.json` は、サーバーのMODのjarから自動で作ったものです（手で直さないでください）。
MODを足したり版を上げたりしたときは、作り直します。補足はデータではなく `content/item-notes.md` に書きます。

### 作り直し方

`tools/gen_items.py` を、MODのjarがあるサーバー上で動かします（Python 3.11以上）。

```
python3 -I tools/gen_items.py <modsのフォルダ> <バニラの extra.jar> <NeoForge の universal.jar> <バニラの ja_jp.json> data/items.json
```

- modsのフォルダ：日常鯖の `mods/`（パックと同じ版のjar）
- extra.jar：サーバーの `libraries/net/minecraft/server/<版>/server-<版>-extra.jar`
- universal.jar：サーバーの `libraries/net/neoforged/neoforge/<版>/neoforge-<版>-universal.jar`
- ja_jp.json：Prism の `assets/indexes/17.json` で `minecraft/lang/ja_jp.json` のハッシュを調べ、`assets/objects/` から取り出したもの

### 動作の確かめ方

`tools/smoke.js` は、ブラウザを模した環境（jsdom）で主な画面を開いて確かめる試験です（Node.js と jsdom が必要）。

```
node tools/smoke.js <nichijo-wikiのフォルダ>      # 手元のファイルで
node tools/smoke.js https://ryuuuu2714.github.io/works/nichijo-wiki/   # 公開中のサイトで
```

## 公開に関する注意

このサイトは誰でも見られます。サーバーのアドレス、配布用の zip、パスワード、友人の個人情報は書かないでください。
