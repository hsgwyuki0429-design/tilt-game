'use strict';
/*
 * Minimal static server for local play.
 *
 *   node tools/serve.js [port]
 *
 * The game itself has no build step and no dependencies — opening index.html
 * straight off disk works too. This exists mainly so a phone on the same
 * network can load and test the responsive touch interface.
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');

var ROOT = path.join(__dirname, '..');
var PORT = Number(process.argv[2] || 8080);

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
};

http.createServer(function (req, res) {
  var rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  var file = path.resolve(path.join(ROOT, rel));
  // Never serve outside the project directory.
  if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, function () {
  console.log('TILT running:');
  console.log('  http://localhost:' + PORT);
  var nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  http://' + net.address + ':' + PORT + '   (open this on a phone)');
      }
    });
  });
});
