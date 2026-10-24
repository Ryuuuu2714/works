"""日常鯖のデータパック（nichijo-data.zip）を作る。

使い方（nichijo-pack/ で）:
  python -I datapack/build.py
  packwiz refresh

中身:
  - 奥義（系統を代表する強い呪文）をスクロールフォージで作れなくする（Iron's の呪文ごとの設定）
  - 大災厄を倒すと、その奥義のスクロールが1枚出る（NeoForge のルート追加）
作った zip のハッシュを world/datapacks/nichijo-data.pw.toml に書き込む。
"""
import hashlib
import io
import json
import os
import zipfile

# 大災厄（Cataclysm のエンティティ名） → 落とす奥義（Iron's の呪文ID）
BOSS_SPELLS = {
    "ignis": "fireball",                    # 炎　ファイヤーボール
    "scylla": "lightning_bolt",             # 雷　ライトニングボルト
    "the_leviathan": "blizzard",            # 氷　ブリザード
    "maledictus": "greater_heal",           # 聖　グレートヒール
    "ancient_remnant": "heartstop",         # 血　ハートストップ
    "netherite_monstrosity": "earthquake",  # 自然　地震
    "the_harbinger": "summon_vex",          # 召喚　ヴェックス召喚
    "ender_guardian": "black_hole",         # エンダー　ブラックホール
}
QUALITY = {"min": 0.4, "max": 1.0}   # スクロールの強さ（0〜1。高いほどレベルが高い）

HERE = os.path.dirname(os.path.abspath(__file__))
ZIP_PATH = os.path.join(HERE, "nichijo-data.zip")
META_PATH = os.path.join(HERE, "..", "world", "datapacks", "nichijo-data.pw.toml")


def files():
    yield "pack.mcmeta", {"pack": {"pack_format": 48, "description": "日常鯖：大災厄が奥義のスクロールを落とす"}}
    yield "data/neoforge/loot_modifiers/global_loot_modifiers.json", {
        "replace": False,
        "entries": [f"nichijo:boss_scroll/{boss}" for boss in BOSS_SPELLS],
    }
    for boss, spell in BOSS_SPELLS.items():
        yield f"data/irons_spellbooks/irons_spellbooks_spell_config/{spell}.json", {
            "irons_spellbooks:allow_crafting": False,
        }
        # プレイヤーが倒したときだけ、そのボスのルートに巻物の表を足す
        yield f"data/nichijo/loot_modifiers/boss_scroll/{boss}.json", {
            "type": "neoforge:add_table",
            "conditions": [
                {"condition": "neoforge:loot_table_id", "loot_table_id": f"cataclysm:entities/{boss}"},
                {"condition": "minecraft:killed_by_player"},
            ],
            "table": f"nichijo:boss_scroll/{boss}",
        }
        # 表そのものには条件を付けない（/loot give で確かめられるように）
        yield f"data/nichijo/loot_table/boss_scroll/{boss}.json", {
            "type": "minecraft:entity",
            "pools": [{
                "rolls": 1,
                "entries": [{
                    "type": "minecraft:item",
                    "name": "irons_spellbooks:scroll",
                    "functions": [{
                        "function": "irons_spellbooks:randomize_spell",
                        "quality": QUALITY,
                        "spell_filter": {"spells": [f"irons_spellbooks:{spell}"]},
                    }],
                }],
            }],
        }


buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    for name, data in files():
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))   # 時刻を固定して、中身が同じならハッシュも同じにする
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, json.dumps(data, ensure_ascii=False, indent=2) + "\n")
blob = buf.getvalue()
with open(ZIP_PATH, "wb") as f:
    f.write(blob)
digest = hashlib.sha256(blob).hexdigest()

meta = f'''name = "日常鯖データパック"
filename = "nichijo-data.zip"
side = "server"

[download]
url = "https://ryuuuu2714.github.io/works/nichijo-pack/datapack/nichijo-data.zip"
hash-format = "sha256"
hash = "{digest}"
'''
with open(META_PATH, "w", encoding="utf-8", newline="\n") as f:
    f.write(meta)
print(f"nichijo-data.zip  {len(blob)} bytes  sha256 {digest}")
