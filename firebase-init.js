// ============================================================
// 🔥 FIREBASE — config + contrôle d'accès mutualisés
// Script classique (version "compat" de Firebase) : fonctionne
// en double-clic (file://) comme sur GitHub Pages.
// Charge AVANT ce fichier les scripts firebase-*-compat.js.
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAbtOtU3EZd3yccR8gPCef_wME-5qoNk3Y",
  authDomain: "bubble-game-fa894.firebaseapp.com",
  projectId: "bubble-game-fa894",
  storageBucket: "bubble-game-fa894.firebasestorage.app",
  messagingSenderId: "60256418096",
  appId: "1:60256418096:web:dbdc555819793d8c20f0f5"
};

const SUB_ORDER = { basic: 0, plus: 1, x: 2, max: 3 };
const SUB_LABELS = { basic: "BASIC", plus: "BUBBLE+", x: "BUBBLE X", max: "BUBBLE MAX" };

// Niveau d'abonnement minimum requis pour accéder au site
const MIN_SUB = 'x';

// En local (double-clic depuis les fichiers = hostname '', ou localhost)
// on saute la connexion pour pouvoir prévisualiser sans se logguer.
// En prod (github.io) le contrôle d'accès s'applique normalement.
const IS_DEV = ['localhost', '127.0.0.1', ''].includes(location.hostname);

function reveal() { document.body.style.visibility = 'visible'; }

function redirect() {
  document.body.style.visibility = 'visible';
  window.location.href = "./login.html";
}

function fillProfile(pseudo, subscription, avatarId) {
  const nameEl = document.getElementById('navProfileName');
  const subEl = document.getElementById('navProfileSub');
  const avEl = document.getElementById('navAvatarBubble');
  if (nameEl) nameEl.textContent = pseudo;
  if (subEl) subEl.textContent = SUB_LABELS[subscription] || 'BASIC';
  if (avEl && avatarId) avEl.innerHTML = `<img src="${avatarId}.png" alt="avatar" onerror="this.style.display='none'">`;
}

// Protège la page + remplit le widget profil de la nav.
// À appeler une fois au chargement de chaque page protégée.
function requireAccess() {
  if (IS_DEV) {
    fillProfile('DEV', 'max', null);
    reveal();
    return;
  }

  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db = firebase.firestore();

  // Filet de sécurité : si l'auth ne répond jamais, on affiche après 5s
  const fallback = setTimeout(reveal, 5000);

  auth.onAuthStateChanged(async user => {
    clearTimeout(fallback);
    if (!user) return redirect();
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      const data = snap.exists ? snap.data() : {};
      const sub = data.subscription || 'basic';
      if (SUB_ORDER[sub] < SUB_ORDER[MIN_SUB]) return redirect();
      fillProfile(
        user.displayName || user.email.split('@')[0],
        sub,
        data.avatarId || 'bully_1'
      );
      reveal();
    } catch (e) {
      redirect();
    }
  });
}
