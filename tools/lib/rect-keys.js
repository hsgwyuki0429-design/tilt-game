'use strict';
// Board identity for rectangles: up to the rectangle's symmetries (four for a
// rectangle, eight for a square) and swapping the two penguin colours.
//   canonical(rows)          the whole board
//   canonical(rows, 'room')  only the water (walls), so two boards that differ
//                            in where the penguins and auroras are share a room
//   canonical(rows, 'ice')   only the pieces, ignoring the water
function canonical(board, mode) {
  var w = board[0].length, h = board.length, flat = board.join('');
  var count = w === h ? 8 : 4, best = null, room = mode === 'room', ice = mode === 'ice';
  var swapMap = { A: 'B', B: 'A', a: 'b', b: 'a' };
  for (var swap = 0; swap < (room ? 1 : 2); swap++) for (var t = 0; t < count; t++) {
    var out = new Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var nx = t & 1 ? w - 1 - x : x, ny = t & 2 ? h - 1 - y : y;
      if (t & 4) { var v = nx; nx = ny; ny = v; }
      var c = flat[y * w + x];
      if (room) c = c === '#' ? '#' : '.';
      else if (ice) c = c === '#' ? '.' : c;
      if (!room && swap) c = swapMap[c] || c;
      out[ny * w + nx] = c;
    }
    // A square keeps w x h; a rectangle only has the four symmetries that keep its shape.
    var key = w + 'x' + h + ':' + out.join('');
    if (best === null || key < best) best = key;
  }
  return best;
}
module.exports = { canonical: canonical };
