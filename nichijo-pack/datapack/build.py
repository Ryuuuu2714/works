"""日常鯖のデータパック（nichijo-data.zip）を作る。

使い方（nichijo-pack/ で）:
  python -I datapack/build.py
  packwiz refresh

中身:
  - 奥義（系統を代表する強い呪文）をスクロールフォージで作れなくする（Iron's の呪文ごとの設定）
  - 大災厄を倒すと、その奥義のスクロールが1枚出る（NeoForge のルート追加）
  - 魔術のジェム13種（Apotheosis のジェム。Iron's の 1.21.1 版には名前と絵だけが入っている）
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

# 魔術のジェム（Iron's の作者が 1.20.1 版で用意していたものを、今の Apotheosis の形式に移す）
# 値は作者のもの。作者は重ねるほど掛け算で増える方式だったが、オーブと同じ足し算にする
GEM_PERCENT = {"cracked": 0.01, "chipped": 0.03, "flawed": 0.05, "normal": 0.07, "flawless": 0.10, "perfect": 0.15}
GEM_MANA = {"cracked": 5, "chipped": 15, "flawed": 25, "normal": 35, "flawless": 45, "perfect": 55}
SPELL_GEMS = {   # ジェムID → (属性, 演算, 純度ごとの値)
    "fire": ("irons_spellbooks:fire_spell_power", "add_multiplied_base", GEM_PERCENT),
    "ice": ("irons_spellbooks:ice_spell_power", "add_multiplied_base", GEM_PERCENT),
    "lightning": ("irons_spellbooks:lightning_spell_power", "add_multiplied_base", GEM_PERCENT),
    "holy": ("irons_spellbooks:holy_spell_power", "add_multiplied_base", GEM_PERCENT),
    "ender": ("irons_spellbooks:ender_spell_power", "add_multiplied_base", GEM_PERCENT),
    "blood": ("irons_spellbooks:blood_spell_power", "add_multiplied_base", GEM_PERCENT),
    "evocation": ("irons_spellbooks:evocation_spell_power", "add_multiplied_base", GEM_PERCENT),
    "nature": ("irons_spellbooks:nature_spell_power", "add_multiplied_base", GEM_PERCENT),
    "intelligent": ("irons_spellbooks:max_mana", "add_value", GEM_MANA),
    "cast_time": ("irons_spellbooks:cast_time_reduction", "add_multiplied_base", GEM_PERCENT),
    "cooldown": ("irons_spellbooks:cooldown_reduction", "add_multiplied_base", GEM_PERCENT),
    "summoning": ("irons_spellbooks:summon_damage", "add_multiplied_base", GEM_PERCENT),
    "spell_resist": ("irons_spellbooks:spell_resist", "add_multiplied_base", GEM_PERCENT),
}
GEM_WEIGHT = 25   # 出やすさ（Apotheosis のジェムは1種類100）

HERE = os.path.dirname(os.path.abspath(__file__))
ZIP_PATH = os.path.join(HERE, "nichijo-data.zip")
META_PATH = os.path.join(HERE, "..", "world", "datapacks", "nichijo-data.pw.toml")


def files():
    yield "pack.mcmeta", {"pack": {"pack_format": 48, "description": "日常鯖：奥義のスクロールと魔術のジェム"}}
    for gem, (attribute, operation, values) in SPELL_GEMS.items():
        yield f"data/irons_spellbooks/gems/{gem}.json", {
            "type": "apotheosis:gem",
            "weights": {"quality": 0.1, "weight": GEM_WEIGHT},
            "bonuses": [{
                "type": "apotheosis:attribute",
                "attribute": attribute,
                "gem_class": {"key": "armor", "types": [
                    "apotheosis:helmet", "apotheosis:chestplate", "apotheosis:leggings", "apotheosis:boots"]},
                "operation": operation,
                "values": values,
            }],
        }
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
