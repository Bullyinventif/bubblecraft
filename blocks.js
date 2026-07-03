window.GameData = (function () {

  // ════════════════ BLOCS (id 1-99) ════════════════
  const DEF = {
    air:          { id:0,  name:'Air' },   // spécial : pas de texture, traversable

    grass:        { id:1,  name:'Herbe',            tex:{top:'grass_top',side:'grass_side',bottom:'dirt'}, hardness:0.4, minedBy:'shovel', drops:'dirt', sound:'dirt' },
    dirt:         { id:2,  name:'Terre',            tex:'dirt',           hardness:0.4,  minedBy:'shovel', sound:'dirt' },
    stone:        { id:3,  name:'Pierre',           tex:'stone',          hardness:1.3,  minedBy:'pick',   drops:'cobble', sound:'stone' },
    cobble:       { id:4,  name:'Pavé',             tex:'cobblestone',    hardness:1.3,  minedBy:'pick',   smeltTo:'stone', sound:'stone' },
    sand:         { id:5,  name:'Sable',            tex:'sand',           hardness:0.45, minedBy:'shovel', fall:true, smeltTo:'glass', sound:'sand' },
    wood:         { id:6,  name:'Bois',             tex:{top:'wood_top',side:'wood_side',bottom:'wood_top'}, hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    leaves:       { id:7,  name:'Feuilles',         tex:'leaves',         hardness:0.2,  transparent:true, cutout:true, sound:'leaves' },
    planks:       { id:8,  name:'Planches',         tex:'planks',         hardness:0.7,  minedBy:'axe',    fuel:2, sound:'wood' },
    water:        { id:9,  name:'Eau',              tex:'water',          hardness:9999, transparent:true, fluid:true, sound:'wood' },
    brick:        { id:10, name:'Brique',           tex:'brick',          hardness:1.3,  minedBy:'pick',   sound:'stone' },
    glass:        { id:11, name:'Verre',            tex:'glass',          hardness:0.3,  transparent:true, sound:'glass' },
    bedrock:      { id:12, name:'Bedrock',          tex:'bedrock',        hardness:9999, sound:'stone' },
    torch:        { id:13, name:'Torche',           tex:'torch',          hardness:0.1,  transparent:true, noCube:true, deco:'torch', light:10, sound:'wood' },
    coal_ore:     { id:14, name:'Minerai de charbon', tex:'coal_ore',     hardness:1.6,  minedBy:'pick',   drops:'coal', sound:'stone' },
    craft_table:  { id:15, name:'Établi',           tex:{top:'craft_table_top',side:'craft_table_side',bottom:'planks'}, hardness:0.7, minedBy:'axe', onUse:'table', fuel:2, sound:'wood' },
    iron_ore:     { id:16, name:'Minerai de fer',   tex:'iron_ore',       hardness:2.2,  minedBy:'pick',   drops:'iron_raw', sound:'stone' },
    furnace:      { id:17, name:'Four',             tex:{top:'furnace_top',side:'furnace_front',bottom:'furnace_top'}, hardness:1.6, minedBy:'pick', onUse:'furnace', sound:'stone' },
    snow:         { id:18, name:'Neige',            tex:'snow',           hardness:0.25, minedBy:'shovel', sound:'snow' },
    cactus:       { id:19, name:'Cactus',           tex:{top:'cactus_top',side:'cactus_side',bottom:'cactus_top'}, hardness:0.4, minedBy:'axe', sound:'leaves' },
    gravel:       { id:20, name:'Gravier',          tex:'gravel',         hardness:0.4,  minedBy:'shovel', fall:true, sound:'dirt' },
    mossy_cobble: { id:21, name:'Pavé moussu',      tex:'mossy_cobblestone', hardness:1.3, minedBy:'pick', drops:'cobble', sound:'stone' },
    bookshelf:    { id:22, name:'Bibliothèque',     tex:{top:'planks',side:'bookshelf_side',bottom:'planks'}, hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    gold_ore:     { id:23, name:'Minerai d\'or',    tex:'gold_ore',       hardness:2.4,  minedBy:'pick',   drops:'gold_raw', sound:'stone' },
    ladder:       { id:24, name:'Échelle',          tex:'ladder',         hardness:0.3,  minedBy:'axe',    transparent:true, noCube:true, deco:'ladder', climb:true, sound:'wood' },
    door:         { id:25, name:'Porte',            tex:{top:'door_upper',side:'door_lower',bottom:'door_lower'}, hardness:0.7, minedBy:'axe', transparent:true, noCube:true, deco:'door', solid:true, onUse:'door', sound:'wood' },
    door_open:    { id:26, name:'Porte ouverte',    tex:{top:'door_upper',side:'door_lower',bottom:'door_lower'}, hardness:0.7, minedBy:'axe', transparent:true, noCube:true, deco:'door', solid:false, onUse:'door', drops:'door', sound:'wood' },
    chest:        { id:27, name:'Coffre',           tex:{top:'chest_top',side:'chest_side',bottom:'chest_top'}, hardness:1.0, minedBy:'axe', onUse:'chest', sound:'wood' },

    // ── v27 : roches & minerais ──
    andesite:     { id:28, name:'Andésite',         tex:'andesite',     hardness:1.3, minedBy:'pick', sound:'stone' },
    granite:      { id:29, name:'Granite',          tex:'granite',      hardness:1.3, minedBy:'pick', sound:'stone' },
    diorite:      { id:30, name:'Diorite',          tex:'diorite',      hardness:1.3, minedBy:'pick', sound:'stone' },
    stone_bricks: { id:31, name:'Pierre taillée',   tex:'stone_bricks', hardness:1.4, minedBy:'pick', sound:'stone' },
    obsidian:     { id:32, name:'Obsidienne',       tex:'obsidian',     hardness:12,  minedBy:'pick', sound:'stone' },
    diamond_ore:  { id:33, name:'Minerai de diamant', tex:'diamond_ore', hardness:3, minedBy:'pick', drops:'diamond',  sound:'stone' },
    emerald_ore:  { id:34, name:'Minerai d\'émeraude', tex:'emerald_ore', hardness:3, minedBy:'pick', drops:'emerald',  sound:'stone' },
    redstone_ore: { id:35, name:'Minerai de redstone', tex:'redstone_ore', hardness:3, minedBy:'pick', drops:'redstone', sound:'stone' },
    lapis_ore:    { id:36, name:'Minerai de lapis', tex:'lapis_ore',    hardness:3, minedBy:'pick', drops:'lapis',    sound:'stone' },
    // ── v27 : désert & mesa ──
    sandstone:    { id:37, name:'Grès',             tex:'sandstone',    hardness:0.8, minedBy:'pick', sound:'stone' },
    red_sand:     { id:38, name:'Sable rouge',      tex:'red_sand',     hardness:0.45, minedBy:'shovel', fall:true, smeltTo:'glass', sound:'sand' },
    red_sandstone:{ id:39, name:'Grès rouge',       tex:'red_sandstone',hardness:0.8, minedBy:'pick', sound:'stone' },
    terracotta:   { id:40, name:'Terre cuite',      tex:'terracotta',   hardness:1.25, minedBy:'pick', sound:'stone' },
    // ── v27 : froid ──
    ice:          { id:41, name:'Glace',            tex:'ice',          hardness:0.5, minedBy:'pick', transparent:true, sound:'glass' },
    packed_ice:   { id:42, name:'Glace compacte',   tex:'packed_ice',   hardness:0.6, minedBy:'pick', sound:'glass' },
    podzol:       { id:43, name:'Podzol',           tex:{top:'podzol_top',side:'dirt',bottom:'dirt'}, hardness:0.5, minedBy:'shovel', drops:'dirt', sound:'dirt' },
    coarse_dirt:  { id:44, name:'Terre grossière',  tex:'coarse_dirt',  hardness:0.5, minedBy:'shovel', sound:'dirt' },
    // ── v27 : essences de bois ──
    birch_log:    { id:45, name:'Tronc de bouleau', tex:{top:'birch_log_top',side:'birch_log_side',bottom:'birch_log_top'}, hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    birch_planks: { id:46, name:'Planches de bouleau', tex:'birch_planks', hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    birch_leaves: { id:47, name:'Feuilles de bouleau', tex:'birch_leaves', hardness:0.2, transparent:true, cutout:true, sound:'leaves' },
    spruce_log:   { id:48, name:'Tronc de sapin',   tex:{top:'spruce_log_top',side:'spruce_log_side',bottom:'spruce_log_top'}, hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    spruce_planks:{ id:49, name:'Planches de sapin', tex:'spruce_planks', hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    spruce_leaves:{ id:50, name:'Feuilles de sapin', tex:'spruce_leaves', hardness:0.2, transparent:true, cutout:true, sound:'leaves' },
    jungle_log:   { id:51, name:'Tronc de jungle',  tex:{top:'jungle_log_top',side:'jungle_log_side',bottom:'jungle_log_top'}, hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    jungle_planks:{ id:52, name:'Planches de jungle', tex:'jungle_planks', hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    jungle_leaves:{ id:53, name:'Feuilles de jungle', tex:'jungle_leaves', hardness:0.2, transparent:true, cutout:true, sound:'leaves' },
    acacia_log:   { id:54, name:'Tronc d\'acacia',  tex:{top:'acacia_log_top',side:'acacia_log_side',bottom:'acacia_log_top'}, hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    acacia_planks:{ id:55, name:'Planches d\'acacia', tex:'acacia_planks', hardness:0.7, minedBy:'axe', fuel:2, sound:'wood' },
    acacia_leaves:{ id:56, name:'Feuilles d\'acacia', tex:'acacia_leaves', hardness:0.2, transparent:true, cutout:true, sound:'leaves' },
    // ── v27 : plantes (rendu en croix) ──
    tall_grass:   { id:57, name:'Herbe haute',      tex:'tall_grass',   hardness:0.05, transparent:true, noCube:true, deco:'cross', sound:'leaves' },
    flower_red:   { id:58, name:'Coquelicot',       tex:'flower_red',   hardness:0.05, transparent:true, noCube:true, deco:'cross', sound:'leaves' },
    flower_yellow:{ id:59, name:'Pissenlit',        tex:'flower_yellow',hardness:0.05, transparent:true, noCube:true, deco:'cross', sound:'leaves' },
    dead_bush:    { id:60, name:'Buisson mort',     tex:'dead_bush',    hardness:0.05, transparent:true, noCube:true, deco:'cross', sound:'leaves' },
    // ── v27 : lumière ──
    glowstone:    { id:61, name:'Pierre lumineuse', tex:'glowstone',    hardness:0.3, light:14, sound:'glass' },

    // ════════════════ OBJETS (id 100+) ════════════════
    stick:        { id:100, name:'Bâton',           tex:'stick',          item:true, fuel:1 },
    coal:         { id:101, name:'Charbon',         tex:'coal',           item:true, fuel:8 },
    wood_pick:    { id:102, name:'Pioche en bois',  tex:'wood_pickaxe',   item:true, maxStack:1, tool:{kind:'pick',mult:2.5} },
    wood_shovel:  { id:103, name:'Pelle en bois',   tex:'wood_shovel',    item:true, maxStack:1, tool:{kind:'shovel',mult:2.5} },
    wood_axe:     { id:104, name:'Hache en bois',   tex:'wood_axe',       item:true, maxStack:1, tool:{kind:'axe',mult:2.5} },
    stone_pick:   { id:105, name:'Pioche en pierre',tex:'stone_pickaxe',  item:true, maxStack:1, tool:{kind:'pick',mult:4.5} },
    stone_shovel: { id:106, name:'Pelle en pierre', tex:'stone_shovel',   item:true, maxStack:1, tool:{kind:'shovel',mult:4.5} },
    stone_axe:    { id:107, name:'Hache en pierre', tex:'stone_axe',      item:true, maxStack:1, tool:{kind:'axe',mult:4.5} },
    viande:       { id:110, name:'Viande crue',     tex:'raw_meat',       item:true, eat:4, smeltTo:'viande_cuite' },
    iron_raw:     { id:111, name:'Fer brut',        tex:'raw_iron',       item:true, smeltTo:'iron_ingot' },
    iron_ingot:   { id:112, name:'Lingot de fer',   tex:'iron_ingot',     item:true },
    viande_cuite: { id:113, name:'Viande cuite',    tex:'cooked_meat',    item:true, eat:8 },
    iron_pick:    { id:114, name:'Pioche en fer',   tex:'iron_pickaxe',   item:true, maxStack:1, tool:{kind:'pick',mult:7} },
    iron_shovel:  { id:115, name:'Pelle en fer',    tex:'iron_shovel',    item:true, maxStack:1, tool:{kind:'shovel',mult:7} },
    iron_axe:     { id:116, name:'Hache en fer',    tex:'iron_axe',       item:true, maxStack:1, tool:{kind:'axe',mult:7} },
    gold_raw:     { id:117, name:'Or brut',         tex:'raw_gold',       item:true, smeltTo:'gold_ingot' },
    gold_ingot:   { id:118, name:'Lingot d\'or',    tex:'gold_ingot',     item:true },
    // ── v27 : gemmes & outils diamant ──
    diamond:      { id:119, name:'Diamant',         tex:'diamond',        item:true },
    emerald:      { id:120, name:'Émeraude',        tex:'emerald',        item:true },
    redstone:     { id:121, name:'Redstone',        tex:'redstone',       item:true },
    lapis:        { id:122, name:'Lapis-lazuli',    tex:'lapis',          item:true },
    diamond_pick: { id:123, name:'Pioche en diamant', tex:'diamond_pickaxe', item:true, maxStack:1, tool:{kind:'pick',mult:12} },
    diamond_shovel:{ id:124, name:'Pelle en diamant', tex:'diamond_shovel', item:true, maxStack:1, tool:{kind:'shovel',mult:12} },
    diamond_axe:  { id:125, name:'Hache en diamant',  tex:'diamond_axe',  item:true, maxStack:1, tool:{kind:'axe',mult:12} },
  };

  // ════════════════ RECETTES ════════════════
  // out: ce qu'on obtient · n: quantité · shape: grille (slugs, 0 = vide) · shapeless: liste sans forme
  const RECIPES_DEF = [
    { out:'planks',      n:4, shapeless:['wood'] },
    { out:'stick',       n:4, shape:[['planks'],['planks']] },
    { out:'craft_table', n:1, shape:[['planks','planks'],['planks','planks']] },
    { out:'torch',       n:4, shape:[['coal'],['stick']] },
    { out:'brick',       n:2, shape:[['cobble','cobble'],['cobble','cobble']] },
    { out:'furnace',     n:1, shape:[['cobble','cobble','cobble'],['cobble',0,'cobble'],['cobble','cobble','cobble']] },
    { out:'wood_pick',   n:1, shape:[['planks','planks','planks'],[0,'stick',0],[0,'stick',0]] },
    { out:'wood_axe',    n:1, shape:[['planks','planks'],['planks','stick'],[0,'stick']] },
    { out:'wood_shovel', n:1, shape:[['planks'],['stick'],['stick']] },
    { out:'stone_pick',  n:1, shape:[['cobble','cobble','cobble'],[0,'stick',0],[0,'stick',0]] },
    { out:'stone_axe',   n:1, shape:[['cobble','cobble'],['cobble','stick'],[0,'stick']] },
    { out:'stone_shovel',n:1, shape:[['cobble'],['stick'],['stick']] },
    { out:'iron_pick',   n:1, shape:[['iron_ingot','iron_ingot','iron_ingot'],[0,'stick',0],[0,'stick',0]] },
    { out:'iron_axe',    n:1, shape:[['iron_ingot','iron_ingot'],['iron_ingot','stick'],[0,'stick']] },
    { out:'iron_shovel', n:1, shape:[['iron_ingot'],['stick'],['stick']] },
    { out:'bookshelf',   n:1, shape:[['planks','planks','planks'],['coal','coal','coal'],['planks','planks','planks']] },
    { out:'ladder',      n:3, shape:[['stick',0,'stick'],['stick','stick','stick'],['stick',0,'stick']] },
    { out:'door',        n:1, shape:[['planks','planks'],['planks','planks'],['planks','planks']] },
    { out:'chest',       n:1, shape:[['planks','planks','planks'],['planks',0,'planks'],['planks','planks','planks']] },
    // ── v27 ──
    { out:'birch_planks',  n:4, shapeless:['birch_log'] },
    { out:'spruce_planks', n:4, shapeless:['spruce_log'] },
    { out:'jungle_planks', n:4, shapeless:['jungle_log'] },
    { out:'acacia_planks', n:4, shapeless:['acacia_log'] },
    { out:'stone_bricks',  n:4, shape:[['stone','stone'],['stone','stone']] },
    { out:'sandstone',     n:1, shape:[['sand','sand'],['sand','sand']] },
    { out:'red_sandstone', n:1, shape:[['red_sand','red_sand'],['red_sand','red_sand']] },
    { out:'coarse_dirt',   n:4, shape:[['dirt','gravel'],['gravel','dirt']] },
    { out:'glowstone',     n:1, shape:[['redstone','redstone'],['redstone','redstone']] },
    { out:'diamond_pick',  n:1, shape:[['diamond','diamond','diamond'],[0,'stick',0],[0,'stick',0]] },
    { out:'diamond_axe',   n:1, shape:[['diamond','diamond'],['diamond','stick'],[0,'stick']] },
    { out:'diamond_shovel',n:1, shape:[['diamond'],['stick'],['stick']] },
  ];

  // ════════════════ CONSTRUCTION (ne pas toucher) ════════════════
  const idOf = {}; for (const slug in DEF) idOf[slug] = DEF[slug].id;

  // 1) Atlas : collecter les noms de texture et leur attribuer une tuile
  const texIndex = {}, texList = [];
  function reg(name){ if(name==null) return; if(!(name in texIndex)){ texIndex[name]=texList.length; texList.push(name); } }
  for (const slug in DEF){ const t=DEF[slug].tex; if(!t) continue;
    if(typeof t==='string') reg(t); else { reg(t.top); reg(t.side); reg(t.bottom); } }
  const ATLAS_TILES = Math.max(8, Math.ceil(Math.sqrt(texList.length)));
  const TILE_FILES = {}; texList.forEach((n,i)=>{ TILE_FILES[i]=n; });
  const tile = n => (n==null ? 0 : texIndex[n]);

  // 2) Construire les tables que game.js utilise
  const BLOCKS={}, HARD={}, DROPS={}, BLOCK_TOOL={}, TOOL={}, SMELT={}, FUEL={}, EAT={};
  for (const slug in DEF){
    const d = DEF[slug];
    window[slug.toUpperCase()] = d.id;       // → constantes globales (GRASS=1, DOOR=25, …)
    if (d.id === 0) continue;                 // AIR : pas d'entrée bloc

    let top, side, bottom;
    if (typeof d.tex==='string'){ top=side=bottom=tile(d.tex); }
    else if (d.tex){ side=tile(d.tex.side); top=d.tex.top!=null?tile(d.tex.top):side; bottom=d.tex.bottom!=null?tile(d.tex.bottom):side; }
    const b = { name:d.name, top, side, bottom, sound:d.sound||'wood' };
    if (d.transparent) b.transparent=true;
    if (d.cutout)      b.cutout=true;
    if (d.noCube)      b.noCube=true;
    if (d.fluid)       b.fluid=true;
    if (d.light)       b.light=d.light;
    if (d.item)        b.item=true;
    if (d.maxStack)    b.maxStack=d.maxStack;
    if (d.solid!=null) b.solid=d.solid;
    if (d.deco)        b.deco=d.deco;
    if (d.climb)       b.climb=true;
    if (d.fall)        b.fall=true;
    if (d.onUse)       b.onUse=d.onUse;
    BLOCKS[d.id]=b;

    if (d.hardness!=null) HARD[d.id]=d.hardness;
    if (d.drops!=null)    DROPS[d.id]=idOf[d.drops];
    if (d.minedBy)        BLOCK_TOOL[d.id]=d.minedBy;
    if (d.tool)           TOOL[d.id]={k:d.tool.kind,m:d.tool.mult};
    if (d.smeltTo!=null)  SMELT[d.id]=idOf[d.smeltTo];
    if (d.fuel!=null)     FUEL[d.id]=d.fuel;
    if (d.eat!=null)      EAT[d.id]=d.eat;
  }

  // 3) Recettes : convertir les slugs en ids
  const rid = x => (x===0||x==null ? 0 : idOf[x]);
  const RECIPES = RECIPES_DEF.map(r => {
    const res = { result:{ id:idOf[r.out], count:r.n||1 } };
    if (r.shapeless) res.shapeless = r.shapeless.map(s=>idOf[s]);
    else res.shape = r.shape.map(row => row.map(rid));
    return res;
  });

  // 4) Exposer en global pour game.js
  Object.assign(window, { BLOCKS, HARD, DROPS, BLOCK_TOOL, TOOL, SMELT, FUEL, EAT, RECIPES, TILE_FILES, ATLAS_TILES });
  return { DEF, RECIPES_DEF, idOf, TILE_FILES, ATLAS_TILES };
})();
