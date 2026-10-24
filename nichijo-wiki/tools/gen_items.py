"""日常鯖 攻略Wiki のアイテム図鑑データ（items.json）を MOD の jar から作る。

使い方:
  python3 -I gen_items.py <modsディレクトリ> <バニラのextra.jar> <neoforgeのuniversal.jar> <バニラのja_jp.json> <出力json> [リソースパックのフォルダ ...]

リソースパック（日本語化パック nichijo-ja など）を渡すと、その ja_jp.json の訳を、ゲームと同じく MOD の訳より優先する。

抜き出すもの:
  - アイテム: models/item/*.json を登録の目安にし、名前（日本語優先）と説明文を付ける
  - 作り方: data/<ns>/recipe/**.json（neoforge:conditions で、入っていない MOD 向けのものは除く）
  - 入手先: loot_table（宝箱・モブ・釣り・考古学など）と、Iron's の append_loot（他の宝箱へ足す分）
  - 鉱石: worldgen/configured_feature の ore
材料にだけ出てくるバニラのアイテムも、名前と使い道を引けるように入れる。
"""
import json
import os
import re
import sys
import zipfile
from collections import defaultdict
import tomllib

mods_dir, vanilla_jar, neoforge_jar, vanilla_ja_path, out_path = sys.argv[1:6]
pack_dirs = sys.argv[6:]

FMT = re.compile(r"§.")


def clean(s):
    return FMT.sub("", s).strip() if isinstance(s, str) else s


def load_json(z, name):
    try:
        return json.loads(z.read(name).decode("utf-8", "replace"))
    except Exception:
        return None


# ---- jar を開く ---------------------------------------------------------------
mod_jars = []
for fn in sorted(os.listdir(mods_dir)):
    if fn.endswith(".jar"):
        mod_jars.append(zipfile.ZipFile(os.path.join(mods_dir, fn)))
vz = zipfile.ZipFile(vanilla_jar)
nfz = zipfile.ZipFile(neoforge_jar)
all_data_jars = mod_jars + [vz, nfz]

# ---- MOD の情報と、名前空間→MOD の対応 ------------------------------------------
loaded = {"minecraft", "neoforge", "c"}
mod_names = {"minecraft": "Minecraft"}
ns_owner = {}
for z in mod_jars:
    try:
        meta = tomllib.loads(z.read("META-INF/neoforge.mods.toml").decode("utf-8", "replace"))
    except Exception:
        continue
    mods = meta.get("mods", [])
    for m in mods:
        loaded.add(m.get("modId"))
        mod_names[m.get("modId")] = m.get("displayName", m.get("modId"))
    owner = mods[0].get("modId") if mods else None
    for n in z.namelist():
        mm = re.match(r"assets/([^/]+)/models/item/", n)
        if mm and owner:
            ns_owner.setdefault(mm.group(1), owner)
    data_ns = {n.split("/")[1] for n in z.namelist() if n.startswith("data/") and n.count("/") >= 2}
    for ns in data_ns:
        if owner and ns not in ("minecraft", "c", "neoforge", "curios"):
            ns_owner.setdefault(ns, owner)

# ---- 言語 ---------------------------------------------------------------------
en, ja = {}, {}
for z in mod_jars + [vz]:
    for n in z.namelist():
        mm = re.match(r"assets/[^/]+/lang/(en_us|ja_jp)\.json$", n)
        if mm:
            (en if mm.group(1) == "en_us" else ja).update(load_json(z, n) or {})
with open(vanilla_ja_path, encoding="utf-8") as f:
    ja.update(json.load(f))
for d in pack_dirs:
    for root, _, files in os.walk(os.path.join(d, "assets")):
        if os.path.basename(root) == "lang" and "ja_jp.json" in files:
            with open(os.path.join(root, "ja_jp.json"), encoding="utf-8-sig") as f:
                ja.update(json.load(f))


def lang(key):
    return clean(ja.get(key) or en.get(key) or "")


def lang_en(key):
    return clean(en.get(key) or "")


# ---- アイテムの登録 -------------------------------------------------------------
registry = {}   # id -> {"ns", "path"}
for z in mod_jars:
    for n in z.namelist():
        mm = re.match(r"assets/([^/]+)/models/item/([a-z0-9_/]+)\.json$", n)
        if mm and "/" not in mm.group(2):
            registry.setdefault(f"{mm.group(1)}:{mm.group(2)}", (mm.group(1), mm.group(2)))

SKIP_NS = {"minecraft"}
SKIP_ID = re.compile(r"(_spawn_egg$|debug|(^|_)test(_|$)|^dev_)")


def item_name(iid):
    ns, _, p = iid.partition(":")
    return lang(f"item.{ns}.{p}") or lang(f"block.{ns}.{p}")


def item_name_en(iid):
    ns, _, p = iid.partition(":")
    return lang_en(f"item.{ns}.{p}") or lang_en(f"block.{ns}.{p}")


name_keys = set()
for iid in registry:
    ns, p = registry[iid]
    name_keys.add(f"item.{ns}.{p}")
    name_keys.add(f"block.{ns}.{p}")


def descriptions(iid):
    ns, _, p = iid.partition(":")
    out = []
    for base in (f"item.{ns}.{p}", f"block.{ns}.{p}"):
        for src in (ja, en):
            for k in src:
                if k.startswith(base) and k != base and k[len(base)] in "._" and k not in name_keys:
                    if re.search(r"\.(title|name)$|error|fail", k):
                        continue
                    v = clean(src[k])
                    if v and "%" not in v and v not in out and len(v) < 400:
                        out.append(v)
            if out:
                break
    return out[:5]


# ---- タグ ---------------------------------------------------------------------
raw_tags = defaultdict(list)
for z in all_data_jars:
    for n in z.namelist():
        mm = re.match(r"data/([^/]+)/tags/items?/(.+)\.json$", n)
        if mm:
            j = load_json(z, n) or {}
            for v in j.get("values", []):
                raw_tags[f"{mm.group(1)}:{mm.group(2)}"].append(v["id"] if isinstance(v, dict) else v)


def resolve_tag(tag, seen=None):
    seen = seen or set()
    if tag in seen:
        return []
    seen.add(tag)
    out = []
    for v in raw_tags.get(tag, []):
        if v.startswith("#"):
            out += resolve_tag(v[1:], seen)
        elif v not in out:
            out.append(v)
    return out


def tag_rep(tag):
    items = resolve_tag(tag)
    if not items:
        return None, 0
    van = [i for i in items if i.startswith("minecraft:")]
    return (van or items)[0], len(items)


# ---- 作り方 -------------------------------------------------------------------
TYPE_LABEL = {
    "minecraft:crafting_shaped": "作業台", "minecraft:crafting_shapeless": "作業台（並べ方自由）",
    "minecraft:smelting": "かまど", "minecraft:blasting": "溶鉱炉", "minecraft:smoking": "燻製器",
    "minecraft:campfire_cooking": "焚き火", "minecraft:stonecutting": "石切台",
    "minecraft:smithing_transform": "鍛冶台", "minecraft:smithing_trim": "鍛冶台（装飾）",
    "irons_spellbooks:alchemist_cauldron_brew": "錬金術師の大釜（調合）",
    "irons_spellbooks:alchemist_cauldron_empty": "錬金術師の大釜（瓶に汲む）",
    "irons_spellbooks:alchemist_cauldron_fill": "錬金術師の大釜（注ぐ）",
    "apothic_enchanting:infusion": "注入エンチャント（エンチャント台）",
    "apothic_enchanting:keep_nbt_infusion": "注入エンチャント（エンチャント台）",
    "sophisticatedbackpacks:smithing_backpack_upgrade": "鍛冶台",
    "cataclysm:weapon_fusion": "合成機金床（Cataclysm）",
    "cataclysm:amethyst_bless": "アメジストの祭壇（Cataclysm）",
}


def cond_ok(conds):
    if not conds:
        return True
    if isinstance(conds, dict):
        conds = [conds]
    for c in conds:
        t = c.get("type", "")
        if t == "neoforge:mod_loaded" and c.get("modid") not in loaded:
            return False
        if t == "neoforge:not" and cond_ok([c.get("value", {})]):
            return False
        if t == "neoforge:and" and not cond_ok(c.get("values", [])):
            return False
        if t == "neoforge:or" and not any(cond_ok([v]) for v in c.get("values", [])):
            return False
        if t == "neoforge:false":
            return False
        if t == "neoforge:item_exists":
            iid = c.get("item", "")
            if not iid.startswith("minecraft:") and iid not in registry:
                return False
        if t == "neoforge:tag_empty" and resolve_tag(c.get("tag", "")):
            return False
    return True


def ingredient(x):
    """材料を {"i": id, "tg": tag, "n": 候補数, "c": 個数} にする"""
    if x is None:
        return None
    if isinstance(x, list):
        alts = [ingredient(y) for y in x]
        alts = [a for a in alts if a]
        if not alts:
            return None
        a = dict(alts[0])
        if len(alts) > 1:
            a["alts"] = [b.get("i") for b in alts[1:] if b.get("i")][:8]
        return a
    if isinstance(x, str):
        return {"tg": x[1:], "i": tag_rep(x[1:])[0]} if x.startswith("#") else {"i": x}
    if isinstance(x, dict):
        if "item" in x:
            r = {"i": x["item"]}
        elif "tag" in x:
            rep, n = tag_rep(x["tag"])
            r = {"tg": x["tag"], "i": rep, "n": n}
        elif "id" in x:
            r = {"i": x["id"]}
        elif x.get("type") == "neoforge:compound":
            return ingredient(x.get("children", []))
        elif "items" in x:
            return ingredient(x["items"])
        elif "ingredient" in x:
            return ingredient(x["ingredient"])
        elif "children" in x:
            return ingredient(x["children"])
        else:
            return None
        cnt = x.get("count")
        if isinstance(cnt, int) and cnt > 1:
            r["c"] = cnt
        return r
    return None


def result_of(r):
    for k in ("result", "output"):
        v = r.get(k)
        if isinstance(v, str):
            return v, 1
        if isinstance(v, dict):
            iid = v.get("id") or v.get("item")
            if isinstance(iid, str):
                return iid, v.get("count", 1)
    v = r.get("results")
    if isinstance(v, list) and v and isinstance(v[0], dict):
        return v[0].get("id") or v[0].get("item"), v[0].get("count", 1)
    return None, 0


recipes = defaultdict(list)   # result id -> [recipe]
for z in mod_jars:
    for n in z.namelist():
        mm = re.match(r"data/([^/]+)/recipes?/(.+)\.json$", n)
        if not mm:
            continue
        r = load_json(z, n)
        if not isinstance(r, dict) or "type" not in r:
            continue
        if not cond_ok(r.get("neoforge:conditions")):
            continue
        rid, cnt = result_of(r)
        if not rid or not isinstance(rid, str):
            continue
        t = r["type"]
        label = TYPE_LABEL.get(t)
        if not label:
            label = "作業台" if "pattern" in r else ("作業台（並べ方自由）" if "crafting" in t else t)
        rec = {"t": label, "id": f"{mm.group(1)}:{mm.group(2)}"}
        if isinstance(cnt, int) and cnt > 1:
            rec["o"] = cnt
        if "pattern" in r and "key" in r:
            keymap = {k: ingredient(v) for k, v in r["key"].items()}
            grid = []
            rows = r["pattern"] + [""] * (3 - len(r["pattern"]))
            for row in rows[:3]:
                row = row.ljust(3)
                for ch in row[:3]:
                    grid.append(keymap.get(ch) if ch != " " else None)
            rec["g"] = grid
        else:
            ins = []
            for k in ("template", "base", "addition", "ingredient", "input", "ingredients", "inputs"):
                v = r.get(k)
                if v is None:
                    continue
                if k in ("ingredients", "inputs") and isinstance(v, list):
                    ins += [ingredient(x) for x in v]
                else:
                    ins.append(ingredient(v))
            rec["in"] = [i for i in ins if i]
        extra = []
        req = r.get("requirements")
        if isinstance(req, dict):
            parts = [f"{k} {v}" for k, v in req.items() if isinstance(v, (int, float)) and v]
            if parts:
                extra.append("必要なエンチャント属性: " + "、".join(parts))
        if extra:
            rec["x"] = extra
        recipes[rid].append(rec)

# ---- 入手先（戦利品表） -----------------------------------------------------------
table_items = defaultdict(set)
table_refs = defaultdict(set)


def walk_loot(o, tid):
    if isinstance(o, dict):
        t = o.get("type", "")
        if t in ("minecraft:item", "item") and isinstance(o.get("name"), str):
            table_items[tid].add(o["name"])
        elif t in ("minecraft:tag", "tag") and isinstance(o.get("name"), str):
            for i in resolve_tag(o["name"])[:30]:
                table_items[tid].add(i)
        elif t in ("minecraft:loot_table", "loot_table"):
            ref = o.get("value") or o.get("name")
            if isinstance(ref, str):
                table_refs[tid].add(ref)
        for v in o.values():
            walk_loot(v, tid)
    elif isinstance(o, list):
        for v in o:
            walk_loot(v, tid)


for z in mod_jars:
    for n in z.namelist():
        mm = re.match(r"data/([^/]+)/loot_tables?/(.+)\.json$", n)
        if mm:
            walk_loot(load_json(z, n), f"{mm.group(1)}:{mm.group(2)}")


def items_of(tid, seen=None):
    seen = seen or set()
    if tid in seen:
        return set()
    seen.add(tid)
    out = set(table_items.get(tid, set()))
    for ref in table_refs.get(tid, set()):
        out |= items_of(ref, seen)
    return out


sources = defaultdict(list)   # item -> [label]
STRUCT_JA = {
    "citadel_vault": "城塞の宝物庫", "citadel_bookshelf": "城塞の本棚", "citadel": "城塞",
    "catacombs": "カタコンベ", "evoker_fort": "エヴォーカー砦", "mountain_tower": "山の塔",
    "pyromancer_tower": "紅蓮術師の塔", "ice_spider_den": "氷蜘蛛の巣", "mangrove_hut": "マングローブの小屋",
    "impaled_icebreaker": "串刺しの砕氷船", "ancient_battleground": "古戦場", "priest_house": "祭司の家",
    "burning_arena": "燃え盛る闘技場", "soul_black_smith": "魂の鍛冶場", "sunken_city": "沈没した都市",
    "acropolis": "天空の水の神殿", "frosted_prison": "凍った監獄", "cursed_pyramid": "呪われたピラミッド",
    "ruined_citadel": "崩壊した砦", "ancient_factory": "太古の工場",
    "wrought_chamber": "騎士の間", "monastery": "修道院", "umvuthana_grove": "ウムヴーサナの集落",
    "zombie_dungeon": "ゾンビの地下墓地", "skeleton_dungeon": "骸骨の要塞", "spider_dungeon": "クモの洞窟",
    "small_dungeon": "モンスター部屋", "small_nether_dungeon": "ネザーの小ダンジョン",
    "buried_treasure": "埋もれた宝", "desert_pyramid": "砂漠の寺院", "jungle_temple": "ジャングルの寺院",
    "pillager_outpost": "ピリジャーの前哨基地", "shipwreck_map": "難破船（地図）",
    "shipwreck_supply": "難破船（物資）", "shipwreck_treasure": "難破船（宝）", "simple_dungeon": "ダンジョン",
    "abandoned_mineshaft": "廃坑", "stronghold_library": "要塞の図書室", "stronghold_corridor": "要塞の通路",
    "stronghold_crossing": "要塞の交差路", "woodland_mansion": "森の洋館", "ancient_city": "古代都市",
    "ancient_city_ice_box": "古代都市（氷室）", "end_city_treasure": "エンドシティ",
    "nether_bridge": "ネザー要塞", "bastion_treasure": "砦の遺跡（宝物庫）", "bastion_other": "砦の遺跡",
    "bastion_bridge": "砦の遺跡（橋）", "bastion_hoglin_stable": "砦の遺跡（ホグリン小屋）",
    "ruined_portal": "荒廃したポータル", "igloo_chest": "イグルー", "underwater_ruin_big": "海底遺跡（大）",
    "underwater_ruin_small": "海底遺跡（小）", "desert_well": "砂漠の井戸", "trial_chambers": "トライアルチャンバー",
    "battleground": "古戦場", "spawn_bonus_chest": "ボーナスチェスト", "village": "村",
    "bookshelf_loot": "魔法の本棚", "magic_bookshelf_loot": "魔法の本棚", "component_storage": "素材の保管庫",
    "filler_storage_loot": "保管庫", "generic_magic_treasure": "魔法の宝箱", "sewer_loot": "地下水路",
    "badland_miner_outpost_towers": "荒野の鉱夫の前哨基地",
    # When Dungeons Arise
    "illager_corsair": "イリジャーの海賊船", "illager_galley": "イリジャーのガレー船", "mushroom_village": "キノコの村",
    "undead_pirate_ship": "アンデッドの海賊船", "plague_asylum": "疫病の療養所", "shiraz_palace": "シラーズ宮殿",
    "mining_system": "採掘場", "mushroom_mines": "キノコ鉱山", "mines_treasure": "鉱山の宝", "aviary": "鳥小屋",
    "bandit_towers": "山賊の塔", "bandit_village": "山賊の村", "bathhouse": "浴場", "coliseum": "コロシアム",
    "fishing_hut": "釣り小屋", "foundry": "鋳造所", "giant_mushroom": "巨大キノコ", "greenwood_pub": "緑の森の酒場",
    "heavenly_challenger": "天空の飛行船（挑戦者）", "heavenly_conqueror": "天空の飛行船（征服者）",
    "heavenly_rider": "天空の飛行船（騎手）", "illager_campsite": "イリジャーのキャンプ", "illager_fort": "イリジャーの砦",
    "illager_windmill": "イリジャーの風車", "infested_temple": "蝕まれた神殿", "jungle_tree_house": "ジャングルのツリーハウス",
    "keep_kayra": "カイラ城", "kisegi_sanctuary": "キセギの聖域", "lighthouse": "灯台", "mechanical_nest": "機械の巣",
    "merchant_campsite": "商人のキャンプ", "mining_complex": "鉱山施設", "mushroom_house": "キノコの家",
    "scorched_mines": "焦熱の鉱山", "small_blimp": "小型飛行船", "thornborn_towers": "ソーンボーンの塔",
    "typhon": "テュポン", "wishing_well": "願いの井戸", "abandoned_temple": "廃寺院",
    # Cataclysm・Mowzie's・その他
    "abandoned_treasure": "廃墟の宝", "desert_treasure": "砂漠の宝", "trial_chamber": "トライアルチャンバー",
    "monastery": "修道院", "umvuthana_grove": "ウムヴーサナの集落",
}


def struct_ja(segs):
    """パスの各部分から、いちばん長く一致する構造物名を探す（後ろの部分を優先）"""
    for s in reversed(segs):
        best = None
        for k in STRUCT_JA:
            if s == k or s.startswith(k + "_"):
                if best is None or len(k) > len(best):
                    best = k
        if best:
            return STRUCT_JA[best]
    return None


def table_label(tid):
    ns, _, path = tid.partition(":")
    segs = path.split("/")
    if "inject" in segs:   # バニラの表へ差し込む分は、バニラの場所として出す
        ns, segs = "minecraft", [s for s in segs if s != "inject"]
        path = "/".join(segs)
    mod = "バニラ" if ns == "minecraft" else mod_names.get(ns_owner.get(ns, ns), mod_names.get(ns, ns))
    if segs[0] == "entities" or "entities" in segs:
        ent = segs[-1]
        ent = re.sub(r"^additional_|_loot$|_modifier$", "", ent)
        suffix = ""
        if ent.endswith("_ominous"):
            ent, suffix = ent[:-8], "（不吉な姿）"
        name = (lang(f"entity.{ns}.{ent}") or lang(f"entity.minecraft.{ent}") or ent) + suffix
        return f"{name}を倒す（{mod}）"
    if segs[0] == "gameplay" and "fishing" in path:
        return f"釣り（{mod}）"
    if segs[0] == "archaeology":
        return f"考古学：ブラシで掘る（{mod}）"
    jp = struct_ja(segs)
    if jp:
        return f"宝箱：{jp}（{mod}）"
    rest = "/".join(x for x in segs if x not in ("chests", "chest"))
    return f"宝箱：{rest}（{mod}）"


append_keys = set()   # ほかの表へ足すための表（それ自体は入手先ではない）
for z in mod_jars:
    for n in z.namelist():
        if "/loot_modifiers/" in n and n.endswith(".json"):
            j = load_json(z, n) or {}
            for k in ("key", "table", "loot_table"):
                if isinstance(j.get(k), str):
                    append_keys.add(j[k])


def is_direct(tid):
    if tid in append_keys:
        return False
    path = tid.split(":", 1)[1]
    return any(k in path.split("/") for k in ("chests", "chest", "entities", "archaeology")) or path.startswith("gameplay/")


for tid in list(table_items) + list(table_refs):
    if not is_direct(tid):
        continue
    lab = table_label(tid)
    for i in items_of(tid):
        if lab not in sources[i]:
            sources[i].append(lab)

# ブロックを壊したときの落とし物（自分自身以外を落とすものだけ）
for tid in list(table_items) + list(table_refs):
    ns, _, path = tid.partition(":")
    if path.startswith("blocks/"):
        bid = f"{ns}:{path[7:]}"
        for i in items_of(tid):
            if i != bid:
                lab = f"「{item_name(bid) or bid}」を壊す"
                if lab not in sources[i]:
                    sources[i].append(lab)

# Iron's などの append_loot（ほかの宝箱やモブの戦利品に足す）
for z in mod_jars:
    for n in z.namelist():
        if "/loot_modifiers/" not in n or not n.endswith(".json") or n.endswith("global_loot_modifiers.json"):
            continue
        j = load_json(z, n) or {}
        key = j.get("key") or j.get("table") or j.get("loot_table")
        if not isinstance(key, str):
            continue
        s = json.dumps(j.get("conditions", []))
        targets = re.findall(r'"loot_table_id"\s*:\s*"([^"]+)"', s)
        ents = re.findall(r'"type"\s*:\s*"([a-z0-9_]+:[a-z0-9_/]+)"', s)
        labels = []
        for t in targets:
            if t.split(":")[0] in loaded or t.split(":")[0] in ns_owner or t.startswith("minecraft:"):
                labels.append(table_label(t))
        for e in ents:
            if e.startswith("minecraft:") and not e.startswith(("minecraft:any_of", "minecraft:entity_properties")):
                en_ = e.split(":")[1]
                nm = lang(f"entity.minecraft.{en_}")
                if nm:
                    labels.append(f"{nm}を倒す（バニラ）")
        for i in items_of(key):
            for lab in labels:
                if lab not in sources[i]:
                    sources[i].append(lab)

# 鉱石
for z in mod_jars:
    for n in z.namelist():
        if "/worldgen/configured_feature/" in n and n.endswith(".json"):
            j = load_json(z, n) or {}
            if "ore" in str(j.get("type", "")):
                for st in re.findall(r'"Name"\s*:\s*"([^"]+)"', json.dumps(j.get("config", {}))):
                    if not st.startswith("minecraft:") and "鉱石として地中に生成" not in sources[st]:
                        sources[st].append("鉱石として地中に生成")

# ---- まとめ -------------------------------------------------------------------
out_items = []
used = set()
for rid, recs in recipes.items():
    used.add(rid)
    for rec in recs:
        for ing in (rec.get("g") or []) + (rec.get("in") or []):
            if ing and ing.get("i"):
                used.add(ing["i"])
                for a in ing.get("alts", []):
                    used.add(a)

for iid in sorted(registry):
    ns, p = registry[iid]
    if ns in SKIP_NS or SKIP_ID.search(p):
        continue
    name = item_name(iid)
    if not name:
        continue
    owner = ns_owner.get(ns, ns)
    entry = {"id": iid, "n": name, "e": item_name_en(iid), "m": owner}
    if f"block.{ns}.{p}" in ja or f"block.{ns}.{p}" in en:
        entry["b"] = 1
    d = descriptions(iid)
    if d:
        entry["d"] = d
    if recipes.get(iid):
        entry["r"] = recipes[iid]
    if sources.get(iid):
        entry["s"] = sources[iid]
    out_items.append(entry)

known = {e["id"] for e in out_items}
# モデルファイルを持たないが名前のあるアイテム（Apotheosis のジェムなど）
for iid in ("apotheosis:gem",):
    if iid not in known and item_name(iid):
        e = {"id": iid, "n": item_name(iid), "e": item_name_en(iid), "m": ns_owner.get(iid.split(":")[0], iid.split(":")[0])}
        if sources.get(iid):
            e["s"] = sources[iid]
        out_items.append(e)
        known.add(iid)
for iid in sorted(used):
    if iid in known or not isinstance(iid, str) or not iid.startswith("minecraft:"):
        continue
    name = item_name(iid)
    if not name:
        continue
    entry = {"id": iid, "n": name, "e": item_name_en(iid), "m": "minecraft", "v": 1}
    if recipes.get(iid):
        entry["r"] = recipes[iid]
    out_items.append(entry)

tags_out = {}
for rid, recs in recipes.items():
    for rec in recs:
        for ing in (rec.get("g") or []) + (rec.get("in") or []):
            if ing and ing.get("tg") and ing["tg"] not in tags_out:
                members = resolve_tag(ing["tg"])
                tags_out[ing["tg"]] = [m for m in members][:12]

mods_out = {}
for e in out_items:
    mods_out.setdefault(e["m"], mod_names.get(e["m"], e["m"]))

data = {"version": 1, "mods": mods_out, "tags": tags_out, "items": out_items}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

by_mod = defaultdict(int)
for e in out_items:
    by_mod[e["m"]] += 1
print(f"items: {len(out_items)}  with recipes: {sum(1 for e in out_items if e.get('r'))}  with sources: {sum(1 for e in out_items if e.get('s'))}")
for m, c in sorted(by_mod.items(), key=lambda x: -x[1]):
    print(f"  {m:28s} {c}")
print("size:", os.path.getsize(out_path))
