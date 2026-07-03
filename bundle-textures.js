// Regroupe toutes les textures de assets/*.png dans textures.js (encodées en base64),
// pour que le jeu soit autonome (marche en double-clic et dans Bubble, sans serveur).
// Lance après avoir modifié des textures :  node bundle-textures.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'assets');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
const out = {};
for (const f of files) {
  const name = f.replace(/\.png$/, '');
  out[name] = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
}
fs.writeFileSync(path.join(__dirname, 'textures.js'), 'window.TEX=' + JSON.stringify(out) + ';\n');
console.log(files.length + ' textures intégrées dans textures.js');
