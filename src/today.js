// The two live facts on the page: whether the kitchen is open now, and what the Adriatic gives this month.

// 0 = domenica. Lunedì e martedì chiuso. Orari da confermare con il locale.
const SERVICES = [[13 * 60, 14 * 60 + 30], [20 * 60, 22 * 60]];
const OPEN_DAYS = [0, 3, 4, 5, 6];
const DAY = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const hhmm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export function status(now = new Date()) {
  const d = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
  if (OPEN_DAYS.includes(d)) {
    for (const [a, b] of SERVICES) {
      if (m >= a && m < b) return { open: true, text: `Aperti adesso, fino alle ${hhmm(b)}` };
      if (m < a) return { open: false, text: `Oggi si apre alle ${hhmm(a)}` };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const n = (d + i) % 7;
    if (OPEN_DAYS.includes(n)) return { open: false, text: `${i === 1 ? 'Domani' : 'Si riapre ' + DAY[n]} alle ${hhmm(SERVICES[0][0])}` };
  }
}
