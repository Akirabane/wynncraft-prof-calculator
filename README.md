# ⛏️ Calculateur de Professions — Wynncraft

Webapp **locale** qui calcule, pour chaque profession de récolte, **combien de ressources tu dois récolter pour passer chaque niveau** (ex : « 25 Spruce pour passer le niveau 40→41 »), avec ou sans bonus d'XP. Tes données sont **sauvegardées en SQLite** sur ta machine — rien n'est perdu.

## Lancer l'app

**Pré-requis :** [Node.js](https://nodejs.org) version **22 ou plus récente** (le seul logiciel à installer ; aucune autre dépendance).

- **Windows** : double-clique sur **`Lancer.bat`**. Le navigateur s'ouvre tout seul.
- **macOS / Linux** : dans un terminal, `chmod +x lancer.sh` puis `./lancer.sh`.
- **Manuel** : `node server.js`, puis ouvre `http://localhost:3000`.

Garde la fenêtre/terminal ouvert pendant que tu utilises l'app. Ferme-la pour arrêter.

## Utilisation

1. **Pseudo Wynncraft** → bouton *Charger via l'API* : récupère automatiquement les niveaux de profession de tes personnages (API officielle v3). Choisis le personnage.
2. Choisis la **profession**, ton **niveau cible**, et ton **bonus XP total** (cumul armure + items + passifs, en %).
3. **Calculer** : tu obtiens le nombre de ressources par palier de niveau, le type de ressource, et le total.
4. **💾 Sauvegarder ce point** : enregistre ton niveau actuel dans la base locale (historique en bas de page).

Tu peux aussi tout saisir **à la main** sans passer par l'API.

## Ce que fait le calcul

- **XP par niveau** : table exacte issue du fichier joueur fourni (`Copie de Calculating Prof XP.xlsx`), niveaux 1 → 132. Vérifiée : XP cumulée totale = 593 742 429 (identique au tableur).
- **XP par ressource (node)** : valeurs de base mesurées en jeu (sans bonus), par palier de node. Source : forum Wynncraft. Avec bonus : `xp_par_node × (1 + bonus%)`.
- **Choix de la ressource** : l'app prend automatiquement la **meilleure ressource débloquée** à ton niveau (celle qui donne le plus d'XP).
- Tu peux choisir une estimation **moyenne / pessimiste / optimiste** (l'XP par node varie dans une fourchette en jeu).

## Précision des données

| Donnée | Fiabilité |
|---|---|
| Courbe XP niv 1→132 | Exacte (fichier joueur, recoupée) |
| Mapping niveau → ressource (4 professions) | Wiki officiel Wynncraft |
| XP/node tiers 1 à 80 | Mesuré en jeu (forum) |
| XP/node tiers 90 à 115 | **Extrapolé** (pattern observé) — estimations |

Les paliers hauts (90+) sont des estimations ; si tu mesures les vraies valeurs en jeu, elles s'éditent dans `data/build_data.py` (variable `node_xp`) puis relance `python3 data/build_data.py` pour régénérer `public/data.json`.

## Fichiers

- `server.js` — serveur local (Node natif, SQLite intégré, proxy API Wynncraft)
- `public/` — interface (HTML/CSS/JS) + `data.json` (données de référence)
- `data/build_data.py` — script qui génère `data.json`
- `wynn_prof.db` — ta base SQLite (créée au 1er lancement)

> Note : si un dossier `node_modules` est présent, il est **inutile** et peut être supprimé — l'app ne dépend d'aucun paquet externe.

## API Wynncraft

`GET https://api.wynncraft.com/v3/player/<pseudo>?fullResult=true` — champ `professions.{woodcutting,mining,farming,fishing}.{level,xpPercent}`. Pas de clé requise pour cet usage.
