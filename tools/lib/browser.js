'use strict';
/*
 * How the browser tests launch Chromium. The game draws with WebGL, and a
 * headless browser on a machine without a GPU only offers WebGL through
 * SwiftShader, which current Chromium wants asked for by name.
 */
var fs = require('fs');

function launchOptions() {
  var opts = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
  ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROME_PATH].forEach(function (p) {
    if (!opts.executablePath && p && fs.existsSync(p)) opts.executablePath = p;
  });
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) opts.executablePath = process.env.CHROME_PATH;
  return opts;
}

module.exports = { launchOptions: launchOptions };
