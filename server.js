// Mini serveur statique pour l'aperçu local du jeu.
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = 5173;
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(root, p);
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(port, () => console.log('MiniCraft sur http://localhost:' + port));
