# Déploiement sur VPS OVH (GitHub + Nginx + HTTPS)

Objectif : héberger l'app sur ton VPS, code versionné sur GitHub, accessible via `https://calc.tondomaine.fr`.

---

## 1. Mettre le code sur GitHub

Sur ton PC, dans le dossier du projet :

```bash
git init
git add .
git commit -m "Calculateur professions Wynncraft"
```

Crée un dépôt vide sur github.com (bouton **New repository**, ne coche rien), puis :

```bash
git remote add origin https://github.com/TON_PSEUDO/wynn-prof-calc.git
git branch -M main
git push -u origin main
```

> `.gitignore` exclut déjà `node_modules/` et la base `*.db` — c'est voulu (la base se recrée sur le serveur).

---

## 2. Préparer le VPS (une seule fois)

Connecte-toi en SSH : `ssh ton_user@IP_DU_VPS`

Installe Node.js 22+ (via nodesource) :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node --version   # doit afficher v22.x
```

---

## 3. Récupérer le code sur le VPS

```bash
sudo mkdir -p /opt/wynn-calc
sudo chown $USER:$USER /opt/wynn-calc
git clone https://github.com/TON_PSEUDO/wynn-prof-calc.git /opt/wynn-calc
cd /opt/wynn-calc
```

Pas de `npm install` à faire : l'app n'a **aucune dépendance externe** (tout est natif Node).

Test rapide :

```bash
node --experimental-sqlite server.js
# -> "Ouvre ton navigateur sur http://localhost:3000"
# Ctrl+C pour arrêter
```

---

## 4. Lancer en service permanent (systemd)

Le fichier `wynn-calc.service` est fourni. Édite-le si besoin (User, chemin), puis :

```bash
sudo cp /opt/wynn-calc/wynn-calc.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wynn-calc
sudo systemctl status wynn-calc      # doit être "active (running)"
```

L'app tourne maintenant sur `http://127.0.0.1:3000` du VPS, et redémarre toute seule au reboot.

Logs : `journalctl -u wynn-calc -f`

---

## 5. Nginx en reverse proxy + HTTPS

Pointe d'abord ton sous-domaine (`calc.tondomaine.fr`) vers l'IP du VPS dans ta zone DNS OVH (enregistrement **A**).

Crée `/etc/nginx/sites-available/wynn-calc` :

```nginx
server {
    listen 80;
    server_name calc.tondomaine.fr;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Active et recharge :

```bash
sudo ln -s /etc/nginx/sites-available/wynn-calc /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Puis HTTPS gratuit avec Certbot :

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d calc.tondomaine.fr
```

Certbot configure le SSL et la redirection HTTP→HTTPS tout seul. Renouvellement automatique.

---

## 6. Mettre à jour l'app plus tard

Sur ton PC : modifie, puis `git add . && git commit -m "..." && git push`.

Sur le VPS :

```bash
cd /opt/wynn-calc
git pull
sudo systemctl restart wynn-calc
```

---

## Notes

- **Base SQLite** : `/opt/wynn-calc/wynn_prof.db`. Elle persiste entre les redémarrages (elle est hors de git). Pour la sauvegarder : `cp wynn_prof.db wynn_prof.backup.db`.
- **Port** : modifiable via `Environment=PORT=xxxx` dans le service.
- **Sécurité** : le proxy Wynncraft est en lecture seule et l'app n'expose pas d'écriture sensible, mais si l'instance est publique, pense à éventuellement protéger l'accès (auth basique Nginx) si tu ne veux pas qu'elle soit ouverte à tous.
- **Rate-limit API Wynncraft** : 180 requêtes / minute par IP. Largement suffisant pour un usage normal.
