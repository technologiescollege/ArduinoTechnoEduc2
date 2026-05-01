# Fork Arduino IDE 2.x — synchronisation avec le dépôt officiel

Ce dépôt est un fork d’[arduino/arduino-ide](https://github.com/arduino/arduino-ide). Ce document décrit comment **récupérer les mises à jour Arduino** sans perdre vos travaux, et comment **sauvegarder vos modifications** sous forme de patch avant une fusion qui privilégie le code officiel.

## Prérequis Git

- **`origin`** : votre dépôt (ex. `technologiescollege/ArduinoTechnoEduc2`).
- **`upstream`** : le dépôt Arduino, ajouté une fois avec :

  ```bash
  git remote add upstream https://github.com/arduino/arduino-ide.git
  ```

  Le script `sync-upstream.sh` ajoute ce remote automatiquement s’il manque.

## Script `sync-upstream` (`yarn sync:upstream`)

Synchronise la branche courante avec **`upstream/main`** (ou une autre branche Arduino, voir ci‑dessous).

- Si vous avez des **fichiers modifiés non commités**, Git utilise **`--autostash`** : stash temporaire pendant la fusion, puis réapplication.
- Avec **`STRICT=1`**, la commande **échoue** si l’arbre de travail n’est pas propre (pas d’autostash).

### Menu interactif

En terminal interactif, le script demande :

| Choix | Effet |
|--------|--------|
| **1** | Fusion **classique**. En cas de conflit, vous résolvez à la main. |
| **2** | Fusion en **privilégiant Arduino** (`--strategy-option=theirs`) : en conflit, la version **arduino/arduino-ide** est gardée. **Vos changements sur ces lignes sont perdus pour ces fichiers.** Pensez à exporter un patch avant (voir plus bas). |
| **3** | **Annuler** |

### Ligne de commande (sans menu)

```bash
# Fusion classique (équivalent au choix 1), sans TTY
SYNC_STRATEGY=merge yarn sync:upstream

# Toujours prendre la version Arduino en cas de conflit (équivalent au choix 2)
SYNC_STRATEGY=favor-upstream yarn sync:upstream
```

### Autres variables utiles

| Variable | Description |
|----------|-------------|
| `UPSTREAM_BRANCH` | Branche Arduino à suivre (défaut : `main`). Ex. `2.3.x`. |
| `REBASE=1` | **Rebase** sur `upstream/...` au lieu d’un **merge**. |
| `STRICT=1` | Refuser si des modifications locales non commitées. |
| `SYNC_STRATEGY` | `merge` ou `favor-upstream` (obligatoire hors terminal interactif). |

### Après la synchronisation

- En cas de conflits restants : résoudre, puis `git add` et `git commit` (merge) ou `git rebase --continue` (rebase).
- Publier vers votre fork : `git push origin <branche>`.

---

## Script `export-fork-patch` (`yarn export:fork-patch`)

Produit un **fichier patch** : différence entre **`upstream/<branche>`** et votre **`HEAD`** actuel :

```bash
git diff upstream/main HEAD
```

Cela représente **l’ensemble des changements** de votre arbre Git par rapport à Arduino (fichiers suivis), utile pour **sauvegarder** vos retouches avant un `sync` avec **`favor-upstream`**, puis les **réappliquer** partiellement ou en entier.

### Utilisation

```bash
yarn export:fork-patch
```

- Par défaut, le patch est écrit sous `patches/fork-changes-AAAAMMJJ-hhmmss.patch`.
- Chemin personnalisé :

  ```bash
  OUT=patches/mon-fork.patch yarn export:fork-patch
  ```

- Branche Arduino de référence :

  ```bash
  UPSTREAM_BRANCH=2.3.x yarn export:fork-patch
  ```

### Réappliquer le patch (exemple)

```bash
git apply --reject --whitespace=fix patches/fork-changes-....patch
```

Les sections non applicables automatiquement peuvent laisser des fichiers **`.rej`** à traiter à la main. Les **fichiers binaires** ne sont en général **pas** inclus correctement dans un patch texte ; gérez-les séparément si besoin.

---

## Workflow recommandé

1. **Commiter** ou **stasher** ce que vous voulez figer (ou laisser l’autostash du sync).
2. **`yarn export:fork-patch`** — conserver le fichier `.patch` (copie de secours, hors dépôt si vous préférez).
3. **`yarn sync:upstream`** — choisir **1** ou **2** selon que vous voulez résoudre les conflits à la main ou **aligner sur Arduino** aux points de conflit.
4. Si besoin, **`git apply`** (ou reprise manuelle à partir du patch / de vos branches).

---

## Mode portable (par défaut)

L’IDE crée et utilise toujours un dossier **`portable/`** :

| Contexte | Emplacement |
|----------|-------------|
| **Application compilée** | À côté de l’exécutable : `{dossier de l’exe}/portable/` |
| **Développement** (`yarn --cwd electron-app start`) | `electron-app/portable/` (répertoire de travail courant) |

Contenu typique :

- `portable/data/Arduino15/` — **outilchains**, **cores** et **bibliothèques** installés via le gestionnaire Arduino (réécriture du `directories.data` du CLI).
- `portable/sketchbook/` — carnet de croquis (équivalent `directories.user`).
- `portable/.arduinoIDE/` — préférences / état IDE (Theia).
- `portable/Blockly@rduino/` — interface Blockly@rduino (mise à jour depuis le menu).

Surcharge possible avant lancement : variable d’environnement **`ARDUINO_IDE_PORTABLE_ROOT`** (chemin absolu du dossier racine portable).

Ces dossiers sont listés dans `.gitignore` (données locales, non versionnées).

---

## Références

- Dépôt officiel : [github.com/arduino/arduino-ide](https://github.com/arduino/arduino-ide)
- Scripts : `scripts/sync-upstream.sh`, `scripts/export-fork-patch.sh`
- Commandes Yarn : `sync:upstream`, `export:fork-patch` (définies dans `package.json`)
