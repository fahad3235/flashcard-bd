/* Flashcard BD — SM-2-lite scheduling engine.
 *
 * Pure module: no DOM, no storage, no network. All date math is done on
 * local-midnight calendar days so daylight-saving shifts never move a
 * due date by a fraction of a day.
 *
 * Grade semantics (self-graded after flipping the card):
 *   again → the card is re-learned: interval resets to 1 day, ease −0.20
 *   hard  → interval × 1.2, ease −0.15
 *   good  → interval × 2.5, ease unchanged
 *   easy  → interval × 3.5, ease +0.15
 * Ease is clamped to a floor of 1.3 so intervals can never collapse to 0.
 * New cards start with interval 0, so the first "good" gives interval 1.
 */
(function (global) {
  'use strict';

  var MIN_EASE = 1.3;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* Local-midnight "today". `asof` is a YYYY-MM-DD override used by tests
   * (via ?asof=) to freeze time deterministically. */
  function todayMidnight(asof) {
    if (asof) {
      var p = String(asof).split('-');
      if (p.length === 3) {
        var y = +p[0], m = +p[1], d = +p[2];
        if (y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return new Date(y, m - 1, d);
        }
      }
    }
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function addDays(dateStr, n) {
    var p = String(dateStr).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }

  function newCardState() {
    return { interval: 0, ease: 2.5, reps: 0, lapses: 0, due: null };
  }

  /* Returns a NEW state object; never mutates the input card. */
  function grade(card, g, todayStr) {
    var c = {
      interval: Math.max(0, card.interval | 0),
      ease: typeof card.ease === 'number' ? card.ease : 2.5,
      reps: Math.max(0, card.reps | 0),
      lapses: Math.max(0, card.lapses | 0)
    };
    if (g === 'again') {
      c.lapses += 1;
      c.interval = 1;
      c.ease = Math.max(MIN_EASE, round2(c.ease - 0.20));
    } else if (g === 'hard') {
      c.interval = Math.max(1, Math.round(c.interval * 1.2));
      c.ease = Math.max(MIN_EASE, round2(c.ease - 0.15));
    } else if (g === 'good') {
      c.interval = Math.max(1, Math.round(c.interval * 2.5));
    } else if (g === 'easy') {
      c.interval = Math.max(1, Math.round(c.interval * 3.5));
      c.ease = round2(c.ease + 0.15);
    } else {
      throw new Error('sm2.grade: unknown grade "' + g + '"');
    }
    c.reps += 1;
    c.due = addDays(todayStr, c.interval);
    return c;
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  /* A card with no due date yet (brand new) is always due. */
  function isDue(card, todayStr) {
    return !card.due || card.due <= todayStr;
  }

  global.SM2 = {
    grade: grade,
    newCardState: newCardState,
    isDue: isDue,
    addDays: addDays,
    todayMidnight: todayMidnight,
    isoDate: isoDate,
    MIN_EASE: MIN_EASE
  };
})(typeof window !== 'undefined' ? window : globalThis);
