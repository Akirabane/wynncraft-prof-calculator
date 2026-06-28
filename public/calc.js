// Logique de calcul XP / ressources — partagée par l'UI
// data = { xpTable:[{level,xpToNext}], professions:{key:{label,resourceWord,resources:[{nodeLevel,name,xp:{min,max,avg}}]}} }

export function xpToNext(data, level) {
  const row = data.xpTable.find(r => r.level === level);
  return row ? row.xpToNext : null;
}

// XP total restant pour passer du niveau `level` (avec xpPercent% déjà fait) jusqu'à `targetLevel`
export function xpRemaining(data, level, xpPercent, targetLevel) {
  if (targetLevel <= level) return 0;
  let total = 0;
  // niveau courant: il reste (100 - xpPercent)% de xpToNext(level)
  const cur = xpToNext(data, level);
  if (cur != null) total += cur * (1 - (xpPercent || 0) / 100);
  // niveaux intermédiaires pleins
  for (let L = level + 1; L < targetLevel; L++) {
    const x = xpToNext(data, L);
    if (x != null) total += x;
  }
  return Math.round(total);
}

// Choisit la meilleure ressource (node le plus haut débloqué) pour un niveau donné
export function bestResourceForLevel(prof, level) {
  let best = prof.resources[0];
  for (const r of prof.resources) {
    if (r.nodeLevel <= level) best = r;
    else break;
  }
  return best;
}

// Mode de valeur XP: 'avg' | 'min' | 'max'
export function nodeXp(resource, mode) {
  return resource.xp[mode] || resource.xp.avg;
}

// Nombre de ressources à récolter pour un seul palier (level -> level+1),
// en récoltant la meilleure ressource disponible, avec bonus d'XP (%).
export function resourcesForOneLevel(data, prof, level, xpPercentStart, bonusPct, mode) {
  const need = xpToNext(data, level);
  if (need == null) return null;
  const remaining = need * (1 - (xpPercentStart || 0) / 100);
  const res = bestResourceForLevel(prof, level);
  const perNode = nodeXp(res, mode) * (1 + (bonusPct || 0) / 100);
  return {
    level,
    nextLevel: level + 1,
    resource: res,
    xpNeeded: Math.round(remaining),
    xpPerNode: Math.round(perNode),
    count: Math.ceil(remaining / perNode)
  };
}

// Table complète palier par palier de `from` (avec xpPercent) à `to`
export function plan(data, prof, from, xpPercent, to, bonusPct, mode) {
  const rows = [];
  let totalNodes = 0, totalXp = 0;
  for (let L = from; L < to; L++) {
    const startPct = (L === from) ? xpPercent : 0;
    const row = resourcesForOneLevel(data, prof, L, startPct, bonusPct, mode);
    if (!row) continue;
    totalNodes += row.count;
    totalXp += row.xpNeeded;
    rows.push(row);
  }
  return { rows, totalNodes, totalXp };
}
