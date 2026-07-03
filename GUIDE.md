# 🛠️ Guide de modification — BlockCraft

Tout ce qu'il faut savoir pour modifier le jeu, du plus simple au plus avancé.

---

## 📁 Les fichiers (et à quoi ils servent)

| Fichier | Rôle | Tu y touches pour… |
|---|---|---|
| **`blocks.js`** | ⭐ TOUTES les données (blocs, objets, recettes) | ajouter/modifier un bloc, un objet, une recette |
| **`assets/`** | les images 16×16 (1 PNG par texture) | changer à quoi ressemble un bloc |
| `gen-textures.js` | génère les PNG par code | recréer/ajuster une texture par programmation |
| `bundle-textures.js` | regroupe `assets/*.png` → `textures.js` | **à lancer après chaque changement de texture** |
| `textures.js` | textures encodées (auto-généré) | ⚠️ ne pas éditer à la main |
| **`game.js`** | le moteur (monde, physique, mobs, ciel…) | changer une mécanique, la génération, les mobs |
| `game.html` | l'interface (HUD, inventaire, menu pause) + le style | changer l'apparence des menus / barres |
| `index.html` | l'écran-titre | changer le menu de départ |
| `server.js` | mini-serveur local | rien (juste pour tester) |

> ⚠️ **RÈGLE D'OR** : après avoir modifié `game.js` ou `blocks.js`, ouvre `game.html` et **augmente le numéro de version** dans les 2 lignes du bas :
> ```html
> <script src="blocks.js?v=27"></script>
> <script src="game.js?v=27"></script>
> ```
> Sinon le navigateur garde l'ancienne version en cache et tu ne vois pas tes changements.

---

## 1) ➕ Ajouter un nouveau bloc

**Tout se passe dans `blocks.js`**, dans l'objet `DEF`.

### Étape 1 — l'image
Mets une image **16×16 PNG** dans `assets/`, ex. `assets/diamond_ore.png`.
Puis lance dans un terminal :
```
node bundle-textures.js
```

### Étape 2 — la définition
Ajoute une ligne dans `DEF` (choisis un **`id` unique non utilisé** : blocs = 1 à 99) :
```js
diamond_ore: { id:28, name:'Minerai de diamant', tex:'diamond_ore',
               hardness:3, minedBy:'pick', drops:'diamond_ore', sound:'stone' },
```

### Étape 3 (option) — le faire apparaître dans le monde
Dans `game.js`, fonction `genChunk` (cherche `id=GOLD_ORE`), copie la ligne de l'or :
```js
if(y<=9 && hash3(wx*4+1,y,wz*4+1)<0.002) id=DIAMOND_ORE;
```
(`DIAMOND_ORE` existe automatiquement comme constante, dérivée du nom `diamond_ore`.)

C'est tout. L'atlas, le drop, le son, l'icône d'inventaire… se font **tout seuls**.

---

## 2) 🎨 Changer la texture d'un bloc

1. Édite (ou remplace) le PNG dans `assets/`, ex. `assets/stone.png`
2. `node bundle-textures.js`
3. Recharge le jeu

**Faces différentes** ? Dans `blocks.js`, au lieu de `tex:'stone'` :
```js
tex: { top:'mon_dessus', side:'mon_cote', bottom:'mon_dessous' },
```
(les valeurs sont des **noms de fichiers** dans `assets/`, sans `.png`)

---

## 3) 🧱 Toutes les propriétés d'un bloc (dans `blocks.js`)

```js
mon_bloc: {
  id: 30,                 // numéro unique (1-99 blocs, 100+ objets)
  name: 'Mon bloc',       // nom affiché
  tex: 'mon_bloc',        // ou { top, side, bottom }
  hardness: 1.0,          // temps de minage (0.4 rapide … 2.4 lent … 9999 incassable)
  minedBy: 'pick',        // 'pick' | 'axe' | 'shovel' (outil qui va plus vite)
  drops: 'cobble',        // ce qu'il lâche (par défaut : lui-même)
  sound: 'stone',         // stone|dirt|sand|snow|glass|leaves|wood
  transparent: true,      // on voit à travers (verre, feuilles…)
  light: 10,              // émet de la lumière (torche)
  fall: true,             // tombe s'il n'a rien dessous (sable, gravier)
  climb: true,            // on grimpe dessus (échelle)
  solid: false,           // on le traverse (porte ouverte)
  onUse: 'chest',         // action clic droit : 'table'|'furnace'|'chest'|'door'
  smeltTo: 'glass',       // résultat au four
  fuel: 8,                // combustible (nb d'objets cuits)
}
```
Toutes les propriétés sont optionnelles sauf `id`, `name` et `tex`.

---

## 4) 🔨 Ajouter / changer une recette

Toujours dans `blocks.js`, tableau **`RECIPES_DEF`** (en bas). On écrit avec des **noms**, pas des chiffres.

**Recette en forme** (placement précis, `0` = case vide) :
```js
{ out:'diamond_pick', n:1, shape:[
    ['diamond','diamond','diamond'],
    [0,'stick',0],
    [0,'stick',0]
] },
```

**Recette sans forme** (n'importe où dans la grille) :
```js
{ out:'planks', n:4, shapeless:['wood'] },
```
`out` = objet produit · `n` = quantité.

---

## 5) 🍖 Ajouter un objet (outil, nourriture…)

Dans `DEF`, avec `item:true` (id ≥ 100) :
```js
diamond_pick: { id:120, name:'Pioche en diamant', tex:'diamond_pickaxe',
                item:true, maxStack:1, tool:{kind:'pick', mult:10} },

pomme: { id:121, name:'Pomme', tex:'apple', item:true, eat:6 },
```
- `tool:{kind, mult}` → vitesse de minage (`kind`: pick/axe/shovel)
- `eat:n` → nourriture rendue · `maxStack:1` → ne s'empile pas

---

## 6) 🌍 Régler la génération du monde (dans `game.js`)

| Quoi | Où chercher |
|---|---|
| Relief (hauteur des collines) | fonction `heightAt` / `fbm` |
| Biomes (seuils plaine/forêt/désert/neige) | fonction `biomeAt` |
| Arbres, cactus, densité | dans `genChunk` (cherche `plantTree`) |
| Grottes | dans `genChunk` (cherche `a*a+b*b<0.28`) |
| Minerais (profondeur, rareté) | dans `genChunk` (cherche `hash3`) |
| Villages / structures | `buildVillageHouse`, `buildStructures` |

Exemple — rendre l'or plus fréquent : dans `genChunk`, change `<0.004` en `<0.01`.

---

## 7) 👾 Mobs, ciel, sons (dans `game.js`)

| Quoi | Où chercher |
|---|---|
| Apparence des animaux/zombies/villageois | `makeMobModel` |
| Vie / vitesse d'un mob | `spawnMob` (les stats `hw/h/sp/hp`) |
| Comportement (poursuite, attaque) | `updateMobs` |
| Soleil / lune / nuages / couleurs du ciel | `updateSky` |
| Sons (par matériau) | `digSound`, `placeSound`, et l'objet `SFX` |
| Vie, faim, dégâts de chute | `updateStats`, `damage` |

---

## 8) 🖼️ Interface (menus, barres, inventaire)

- **Style / couleurs / disposition** → le `<style>` dans `game.html`
- **Logique de l'inventaire / craft / coffre** → `game.js` (cherche `renderInvScreen`)
- **Écran-titre** → `index.html`

---

## 🔁 Le cycle de travail typique

1. J'édite `blocks.js` (et/ou une image dans `assets/`)
2. Si j'ai touché une texture → `node bundle-textures.js`
3. J'augmente `?v=N` dans `game.html`
4. Je recharge `index.html` dans le navigateur → je teste

Voilà ! 90 % des modifications se font juste dans **`blocks.js`** + **`assets/`**.
