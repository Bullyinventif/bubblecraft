// ============================================================
// 🎨 RENDU PARTAGÉ — style NÉO-BRUTALISME
// Script classique (pas de module). Dépend de games-data.js
// chargé AVANT ce fichier (variable globale GAMES).
// ============================================================

const MAX_ID = Math.max(...GAMES.map(g => g.id));

function isNew(g) { return g.id >= MAX_ID - 1; }
function isPopular(g) { return (g.categories || []).includes('popular'); }
function gamesByRecent() { return [...GAMES].sort((a, b) => b.id - a.id); }

function sticker(g) {
  if (isNew(g)) return '<span class="sticker">NEW</span>';
  if (isPopular(g)) return '<span class="sticker pop">POP</span>';
  return '';
}

// Carte "sticker" à gros contour noir
function gameCard(g) {
  return `
    <a class="card" href="${g.url}" target="_blank" rel="noopener" data-id="${g.id}">
      ${sticker(g)}
      <div class="shot"><img src="${g.image}" alt="${g.name}" onerror="this.style.opacity=.2"></div>
      <div class="cbody">
        <div class="cname">${g.name}</div>
        <div class="cdesc">${g.desc}</div>
        <span class="cplay">▶ JOUER</span>
      </div>
    </a>`;
}

// Bloc "jeu à la une" (rempli dans .hero)
function heroMarkup(g) {
  return `
    <div class="hero-in">
      <span class="hero-kick">★ JEU À LA UNE</span>
      <div class="hero-title">${g.name}</div>
      <div class="hero-desc">${g.desc}</div>
      <a class="btn" href="${g.url}" target="_blank" rel="noopener">▶ JOUER MAINTENANT</a>
    </div>
    <div class="hero-img"><img src="${g.image}" alt="${g.name}" onerror="this.style.opacity=.2"></div>`;
}

// Menu mobile + année du footer
function initChrome() {
  const toggle = document.getElementById('menuToggle');
  const menu = document.getElementById('mobileMenu');
  const close = document.getElementById('menuClose');
  if (toggle && menu) {
    const shut = () => menu.classList.remove('open');
    toggle.addEventListener('click', () => menu.classList.toggle('open'));
    if (close) close.addEventListener('click', shut);
    window.addEventListener('resize', () => { if (window.innerWidth > 640) shut(); });
  }
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
}
