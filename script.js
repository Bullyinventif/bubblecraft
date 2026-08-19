// ============================================
// IMPORTS FIREBASE (doivent être en haut)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================
// ATTEND QUE LE DOM SOIT PRÊT
document.addEventListener('DOMContentLoaded', () => {

  // ============================================
  // 🫧 BULLES CYBER
  const bubbleBg = document.getElementById('bubbleBg');
  for (let i = 0; i < 20; i++) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const size = 15 + Math.random() * 80;
    const left = Math.random() * 100;
    const delay = Math.random() * 12;
    const duration = 8 + Math.random() * 12;
    const colors = ['#00FFFF', '#FF00FF', '#00FF88', '#FFFF00', '#FF44AA'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    bubble.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${left}%;
      animation-delay: ${delay}s;
      animation-duration: ${duration}s;
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.15), ${color}30, transparent);
      border: 1px solid ${color}60;
      box-shadow: 0 0 ${size/2}px ${color}40;
      filter: blur(0.5px);
    `;
    bubbleBg.appendChild(bubble);
  }

  // ============================================
  // ✨ PARTICULES
  const particlesContainer = document.getElementById('particles');
  const particleColors = ['#00FFFF', '#FF00FF', '#00FF88', '#FFFF00'];
  document.addEventListener('mousemove', (e) => {
    for (let i = 0; i < 3; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      const color = particleColors[Math.floor(Math.random() * particleColors.length)];
      particle.style.background = color;
      particle.style.left = `${e.clientX}px`;
      particle.style.top = `${e.clientY}px`;
      particle.style.boxShadow = `0 0 8px ${color}`;
      particlesContainer.appendChild(particle);
      setTimeout(() => particle.remove(), 800);
    }
  });

  // ============================================
  // 📱 MENU MOBILE
  const menuToggle = document.getElementById('menuToggle');
  const mobileMenu = document.getElementById('mobileMenu');
  const menuClose = document.getElementById('menuClose');
  function openMenu() {
    mobileMenu.classList.add('open');
    menuToggle.style.transform = 'scale(1.15) rotate(20deg)';
  }
  function closeMenu() {
    mobileMenu.classList.remove('open');
    menuToggle.style.transform = '';
  }
  menuToggle.addEventListener('click', () => mobileMenu.classList.contains('open') ? closeMenu() : openMenu());
  menuClose.addEventListener('click', closeMenu);
  window.addEventListener('resize', () => { if (window.innerWidth > 540) closeMenu(); });

  // ============================================
  // 📅 ANNÉE DYNAMIQUE
  const yearSpan = document.querySelector('footer span:last-child');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // ============================================
  // 🔥 FIREBASE
  const BUBBLE_SITE = "https://bullyinventif.github.io/bubble-site/";
  const SUB_ORDER = { basic: 0, plus: 1, x: 2, max: 3 };
  const SUB_LABELS = { basic: "BASIC", plus: "BUBBLE+", x: "BUBBLE X", max: "BUBBLE MAX" };

  const app = initializeApp({
    apiKey: "AIzaSyAbtOtU3EZd3yccR8gPCef_wME-5qoNk3Y",
    authDomain: "bubble-game-fa894.firebaseapp.com",
    projectId: "bubble-game-fa894",
    storageBucket: "bubble-game-fa894.firebasestorage.app",
    messagingSenderId: "60256418096",
    appId: "1:60256418096:web:dbdc555819793d8c20f0f5"
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  onAuthStateChanged(auth, async user => {
    if (!user) {
      document.body.style.visibility = 'visible';
      window.location.href = "./login.html";
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const d = snap.exists() ? snap.data() : {};
      if (SUB_ORDER[d.subscription || 'basic'] < SUB_ORDER['x']) {
        window.location.href = "./login.html";
        return;
      }
      const nameEl = document.getElementById('navProfileName');
      const subEl = document.getElementById('navProfileSub');
      const avEl = document.getElementById('navAvatarBubble');
      const pseudo = user.displayName || user.email.split('@')[0];
      if (nameEl) nameEl.textContent = pseudo;
      if (subEl) subEl.textContent = SUB_LABELS[d.subscription || 'basic'] || 'BASIC';
      document.body.style.visibility = 'visible';
      const avatarId = d.avatarId || 'bully_1';
      if (avEl) avEl.innerHTML = `<img src="${avatarId}.png" alt="avatar" onerror="this.style.display='none'">`;
    } catch (e) {
      window.location.href = "./login.html";
    }
  });
});