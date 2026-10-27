import assert from 'node:assert';
import { status } from './today.js';

const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi);
// 2026-10-27 è martedì: chiuso, si riapre mercoledì
assert.equal(status(at(2026, 10, 27, 19, 0)).text, 'Domani alle 13:00');
assert.equal(status(at(2026, 10, 26, 12, 0)).text, 'Si riapre mercoledì alle 13:00');
// mercoledì a pranzo, tra i servizi, a cena, dopo cena
assert.deepEqual(status(at(2026, 10, 28, 13, 30)), { open: true, text: 'Aperti adesso, fino alle 14:30' });
assert.equal(status(at(2026, 10, 28, 16, 0)).text, 'Oggi si apre alle 20:00');
assert.equal(status(at(2026, 10, 28, 21, 59)).open, true);
// domenica dopo cena: lunedì e martedì chiusi
assert.equal(status(at(2026, 11, 1, 23, 0)).text, 'Si riapre mercoledì alle 13:00');
console.log('today: ok');
