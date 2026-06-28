import json

# XP par node selon le tier (niveau min du node). Source: forum Wynncraft (Megami/Shots/CrunchyCol, 2019)
# valeurs base SANS bonus. min/max = range observé; on utilise la moyenne pour l'estimation.
# Tiers 90/100/110 extrapolés selon le pattern "max d'un tier ~= min du tier suivant" + ratio ~1.49.
node_xp = {
    1:   (12, 18),
    10:  (29, 47),
    20:  (60, 90),
    30:  (99, 148),
    40:  (146, 219),
    50:  (207, 346),
    60:  (334, 507),
    70:  (503, 752),
    80:  (737, 1093),
    90:  (1093, 1630),    # extrapolé
    100: (1630, 2430),    # extrapolé
    110: (2430, 3620),    # extrapolé
    115: (3620, 5400),    # extrapolé (tier max effectif)
}

# Ressources par profession: (niveau_min_node, nom)
woodcutting = [(1,"Oak"),(10,"Birch"),(20,"Willow"),(30,"Acacia"),(40,"Spruce"),(50,"Jungle"),
               (60,"Dark"),(70,"Light"),(80,"Pine"),(90,"Avo"),(100,"Sky"),(105,"Dernic"),(110,"Maple"),(115,"Redwood")]
mining = [(1,"Copper"),(10,"Granite"),(20,"Gold"),(30,"Sandstone"),(40,"Iron"),(50,"Silver"),
          (60,"Cobalt"),(70,"Kanderstone"),(80,"Diamond"),(90,"Molten"),(100,"Voidstone"),(105,"Dernic"),(110,"Karat"),(115,"Adamantite")]
farming = [(1,"Wheat"),(10,"Barley"),(20,"Oat"),(30,"Malt"),(40,"Hops"),(50,"Rye"),
           (60,"Millet"),(70,"Decay Root"),(80,"Rice"),(90,"Sorghum"),(100,"Hemp"),(105,"Dernic"),(110,"Spelt"),(115,"Bamboo")]
fishing = [(1,"Gudgeon"),(10,"Trout"),(20,"Salmon"),(30,"Carp"),(40,"Icefish"),(50,"Piranha"),
           (60,"Koi"),(70,"Gylia Fish"),(80,"Bass"),(90,"Molten Eel"),(100,"Starfish"),(105,"Dernic"),(110,"Pike"),(115,"Anglerfish")]

# Tier le plus proche <= node level pour piocher l'XP (les nodes 105/115 utilisent leur tier propre)
tiers = sorted(node_xp.keys())
def xp_for_node(nodelvl):
    # node de niveau N donne l'XP de son tier; pour 105 -> entre 100 et 110, on prend interpolation
    if nodelvl in node_xp:
        lo,hi = node_xp[nodelvl]
    else:
        # interpole entre tier inférieur et supérieur
        lower = max(t for t in tiers if t<=nodelvl)
        upper = min((t for t in tiers if t>=nodelvl), default=lower)
        if lower==upper:
            lo,hi=node_xp[lower]
        else:
            f=(nodelvl-lower)/(upper-lower)
            l1,h1=node_xp[lower]; l2,h2=node_xp[upper]
            lo=l1+(l2-l1)*f; hi=h1+(h2-h1)*f
    return {"min":round(lo),"max":round(hi),"avg":round((lo+hi)/2)}

def build_prof(resources):
    out=[]
    for nodelvl,name in resources:
        out.append({"nodeLevel":nodelvl,"name":name,"xp":xp_for_node(nodelvl)})
    return out

xp_table = json.load(open('/tmp/xp.json'))

data = {
    "xpTable": xp_table,  # [{level, xpToNext}]
    "professions": {
        "woodcutting": {"label":"Bûcheronnage","resourceWord":"arbres","resources":build_prof(woodcutting)},
        "mining":      {"label":"Minage","resourceWord":"minerais","resources":build_prof(mining)},
        "farming":     {"label":"Agriculture","resourceWord":"récoltes","resources":build_prof(farming)},
        "fishing":     {"label":"Pêche","resourceWord":"poissons","resources":build_prof(fishing)},
    },
    "nodeXpTiers": node_xp,
    "notes": "XP par node = valeurs de base sans bonus (source forum Wynncraft). Tiers 90-115 extrapolés. Table XP/niveau issue du XLSX joueur (niv 1-132)."
}
json.dump(data, open('/sessions/awesome-lucid-mccarthy/mnt/xp calculateur profession wynncraft/public/data.json','w'), ensure_ascii=False, indent=1)
print("data.json écrit. Pro woodcutting niv10 node:", build_prof(woodcutting)[1])
print("total niveaux:", len(xp_table))
