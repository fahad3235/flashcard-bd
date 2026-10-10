/* Flashcard BD — app wiring: decks, cards, study sessions, persistence, i18n. */
(function () {
  'use strict';

  var LS_KEY = 'flashcard-bd/v1';
  var EXPORT_FORMAT = 'flashcard-bd/v1';

  var params = new URLSearchParams(location.search);
  var ASOF = params.get('asof'); // test hook: ?asof=YYYY-MM-DD freezes "today"

  var state = load() || { lang: 'en', decks: [] };
  if (state.lang !== 'bn') state.lang = 'en';

  var session = null; // {queue:[{deckId,cardId}], idx, results:{again,hard,good,easy}, flipped}

  /* ---------- helpers ---------- */
  function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key; }
  function todayStr() { return SM2.isoDate(SM2.todayMidnight(ASOF)); }
  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.decks)) return null;
      return s;
    } catch (e) { return null; }
  }
  function findDeck(id) { return state.decks.find(function (d) { return d.id === id; }); }
  function findCard(deck, id) { return deck.cards.find(function (c) { return c.id === id; }); }
  function dueCards(deckIds) {
    var today = todayStr(), out = [];
    state.decks.forEach(function (d) {
      if (deckIds && deckIds.indexOf(d.id) < 0) return;
      d.cards.forEach(function (c) {
        if (SM2.isDue(c, today)) out.push({ deckId: d.id, cardId: c.id });
      });
    });
    return out;
  }
  function deckDueCount(deck) {
    var today = todayStr(), n = 0;
    deck.cards.forEach(function (c) { if (SM2.isDue(c, today)) n++; });
    return n;
  }
  function dueLabel(card) {
    var today = todayStr();
    if (!card.due || card.due <= today) {
      if (!card.due || card.due === today) return t('dueToday');
      return t('overdue');
    }
    return t('dueIn') + ' ' + card.due;
  }

  /* ---------- i18n ---------- */
  function applyI18n() {
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
  }

  /* ---------- views ---------- */
  var views = ['view-decks', 'view-deck', 'view-study', 'view-summary'];
  function show(id) {
    views.forEach(function (v) { document.getElementById(v).classList.toggle('hidden', v !== id); });
    window.scrollTo(0, 0);
  }

  var openDeckId = null;

  function renderDecks() {
    var today = todayStr();
    var totalDue = dueCards(null).length;
    var wrap = $('#deck-list');
    if (!state.decks.length) {
      wrap.innerHTML = '<div class="empty" data-i18n="noDecks">' + esc(t('noDecks')) + '</div>';
    } else {
      wrap.innerHTML = state.decks.map(function (d) {
        var due = deckDueCount(d);
        return '<article class="deck-card" data-deck="' + d.id + '">' +
          '<div class="deck-name">' + esc(d.name) + '</div>' +
          '<div class="deck-meta">' + d.cards.length + ' ' + esc(t('cards')) +
          ' · <span class="due-pill' + (due ? ' hot' : '') + '">' + due + ' ' + esc(t('due')) + '</span></div>' +
          '<div class="deck-actions">' +
          '<button class="btn primary sm" data-act="open">' + esc(t('open')) + '</button>' +
          '<button class="btn ghost sm" data-act="study"' + (due ? '' : ' disabled') + '>' + esc(t('study')) + '</button>' +
          '<button class="btn ghost sm" data-act="rename">' + esc(t('rename')) + '</button>' +
          '<button class="btn danger-ghost sm" data-act="del">' + esc(t('delete')) + '</button>' +
          '</div></article>';
      }).join('');
    }
    var banner = $('#due-banner');
    if (totalDue > 0) {
      banner.classList.remove('hidden');
      banner.innerHTML = '<button class="btn primary" id="btn-study-all">📚 ' + esc(t('studyDue')) +
        ' <span class="count">' + totalDue + '</span></button>' +
        '<span class="muted">' + totalDue + ' ' + esc(t('studyAllDue')) + '</span>';
      $('#btn-study-all').addEventListener('click', function () { startStudy(null); });
    } else {
      banner.classList.add('hidden');
      banner.innerHTML = '';
    }
    applyI18n();
    show('view-decks');
  }

  function renderDeck() {
    var d = findDeck(openDeckId);
    if (!d) { renderDecks(); return; }
    $('#deck-title').textContent = d.name;
    $('#deck-sub').textContent = d.cards.length + ' ' + t('cards') + ' · ' + deckDueCount(d) + ' ' + t('due');
    var wrap = $('#card-list');
    if (!d.cards.length) {
      wrap.innerHTML = '<div class="empty">' + esc(t('noCards')) + '</div>';
    } else {
      wrap.innerHTML = d.cards.map(function (c) {
        return '<article class="card-row" data-card="' + c.id + '">' +
          '<div class="card-text"><div class="card-front">' + esc(c.front) + '</div>' +
          '<div class="card-back muted">' + esc(c.back) + '</div></div>' +
          '<div class="card-due muted">' + esc(dueLabel(c)) + '</div>' +
          '<div class="row-actions">' +
          '<button class="btn ghost sm" data-act="edit">' + esc(t('edit')) + '</button>' +
          '<button class="btn danger-ghost sm" data-act="del">' + esc(t('delete')) + '</button>' +
          '</div></article>';
      }).join('');
    }
    applyI18n();
    show('view-deck');
  }

  /* ---------- study ---------- */
  function startStudy(deckIds) {
    var queue = dueCards(deckIds);
    if (!queue.length) {
      showToast(t('noDue'));
      return;
    }
    session = { queue: queue, idx: 0, flipped: false, results: { again: 0, hard: 0, good: 0, easy: 0 } };
    renderStudyCard();
    applyI18n();
    show('view-study');
  }

  function currentQA() {
    var item = session.queue[session.idx];
    var d = findDeck(item.deckId);
    return { deck: d, card: d ? findCard(d, item.cardId) : null };
  }

  function renderStudyCard() {
    var qa = currentQA();
    if (!qa.card) { session.idx++; nextOrSummary(); return; }
    $('#study-progress').textContent = (session.idx + 1) + ' / ' + session.queue.length;
    $('#study-front').textContent = qa.card.front;
    $('#study-back').textContent = qa.card.back;
    $('#study-deck').textContent = qa.deck.name;
    var inner = $('#flip-inner');
    inner.classList.remove('flipped');
    session.flipped = false;
    $('#grade-row').classList.add('hidden');
    $('#flip-hint').classList.remove('hidden');
    applyI18n();
  }

  function flipCard() {
    if (!session || session.flipped) return;
    session.flipped = true;
    $('#flip-inner').classList.add('flipped');
    $('#grade-row').classList.remove('hidden');
    $('#flip-hint').classList.add('hidden');
    applyI18n();
  }

  function gradeCurrent(g) {
    if (!session || !session.flipped) return;
    var qa = currentQA();
    if (!qa.card) return;
    var next = SM2.grade(qa.card, g, todayStr());
    Object.assign(qa.card, next);
    session.results[g]++;
    save();
    session.idx++;
    nextOrSummary();
  }

  function nextOrSummary() {
    if (session.idx >= session.queue.length) {
      renderSummary();
    } else {
      renderStudyCard();
      show('view-study');
    }
  }

  function renderSummary() {
    var r = session.results;
    var total = r.again + r.hard + r.good + r.easy;
    var recalled = r.good + r.easy;
    var pct = total ? Math.round(recalled / total * 100) : 0;
    $('#sum-reviewed').textContent = total;
    $('#sum-accuracy').textContent = pct + '%';
    $('#sum-breakdown').innerHTML =
      '<span class="g again">' + esc(t('again')) + ': ' + r.again + '</span>' +
      '<span class="g hard">' + esc(t('hard')) + ': ' + r.hard + '</span>' +
      '<span class="g good">' + esc(t('good')) + ': ' + r.good + '</span>' +
      '<span class="g easy">' + esc(t('easy')) + ': ' + r.easy + '</span>';
    applyI18n();
    show('view-summary');
    session = null;
  }

  /* ---------- modal ---------- */
  function openModal(title, bodyHtml, onSubmit) {
    var root = $('#modal-root');
    root.innerHTML =
      '<div class="modal-backdrop"><div class="modal" role="dialog">' +
      '<h3>' + esc(title) + '</h3><div class="modal-body">' + bodyHtml + '</div>' +
      '<div class="modal-err hidden" id="modal-err"></div>' +
      '<div class="modal-actions">' +
      '<button class="btn ghost" id="modal-cancel">' + esc(t('cancel')) + '</button>' +
      '<button class="btn primary" id="modal-ok">' + esc(t('save')) + '</button>' +
      '</div></div></div>';
    $('#modal-cancel').addEventListener('click', closeModal);
    $('.modal-backdrop', root).addEventListener('click', function (e) {
      if (e.target.classList.contains('modal-backdrop')) closeModal();
    });
    $('#modal-ok').addEventListener('click', function () {
      var err = onSubmit();
      if (err) {
        var box = $('#modal-err');
        box.textContent = err;
        box.classList.remove('hidden');
      } else {
        closeModal();
      }
    });
    var first = $('.modal-body input, .modal-body textarea', root);
    if (first) first.focus();
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  function deckModal(existing) {
    openModal(t(existing ? 'renameDeckTitle' : 'newDeckTitle'),
      '<label>' + esc(t('deckName')) + '<input id="f-deck-name" maxlength="80" value="' +
      esc(existing ? existing.name : '') + '" placeholder="' + esc(t('deckNamePh')) + '"></label>',
      function () {
        var name = $('#f-deck-name').value.trim();
        if (!name) return t('errDeckName');
        if (existing) { existing.name = name; }
        else { state.decks.push({ id: uid(), name: name, createdAt: Date.now(), cards: [] }); }
        save(); renderDecks();
      });
  }

  function cardModal(deck, existing) {
    openModal(t(existing ? 'editCardTitle' : 'newCardTitle'),
      '<label>' + esc(t('front')) + '<textarea id="f-front" rows="3" maxlength="2000">' +
      esc(existing ? existing.front : '') + '</textarea></label>' +
      '<label>' + esc(t('back')) + '<textarea id="f-back" rows="3" maxlength="2000">' +
      esc(existing ? existing.back : '') + '</textarea></label>',
      function () {
        var front = $('#f-front').value.trim(), back = $('#f-back').value.trim();
        if (!front || !back) return t('errFrontBack');
        if (existing) { existing.front = front; existing.back = back; }
        else {
          var s = SM2.newCardState();
          deck.cards.push({ id: uid(), front: front, back: back,
            interval: s.interval, ease: s.ease, reps: s.reps, lapses: s.lapses, due: s.due });
        }
        save(); renderDeck();
      });
  }

  /* ---------- export / import ---------- */
  function exportData() {
    return JSON.stringify({ format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), decks: state.decks }, null, 2);
  }
  function importData(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return false; }
    if (!data || data.format !== EXPORT_FORMAT || !Array.isArray(data.decks)) return false;
    for (var i = 0; i < data.decks.length; i++) {
      var d = data.decks[i];
      if (!d || typeof d.name !== 'string' || !Array.isArray(d.cards)) return false;
      d.id = uid() + i;
      d.cards.forEach(function (c, j) {
        c.id = uid() + i + '_' + j;
        if (typeof c.front !== 'string' || typeof c.back !== 'string') throw 0;
        var s = SM2.newCardState();
        c.interval = c.interval | 0; c.ease = +c.ease || 2.5;
        c.reps = c.reps | 0; c.lapses = c.lapses | 0;
        if (typeof c.due !== 'string' && c.due !== null) c.due = s.due;
      });
    }
    state.decks = state.decks.concat(data.decks);
    save();
    return true;
  }

  function doExport() {
    var blob = new Blob([exportData()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flashcard-bd-export.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  var toastTimer = null;
  function showToast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2600);
  }

  /* ---------- events ---------- */
  function bind() {
    $('#btn-new-deck').addEventListener('click', function () { deckModal(null); });
    $('#btn-lang').addEventListener('click', function () {
      state.lang = state.lang === 'en' ? 'bn' : 'en';
      save();
      if (!$('#view-deck').classList.contains('hidden')) renderDeck();
      else if (!$('#view-study').classList.contains('hidden')) { applyI18n(); }
      else renderDecks();
    });
    $('#btn-export').addEventListener('click', doExport);
    $('#btn-import').addEventListener('click', function () { $('#file-import').click(); });
    $('#file-import').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          if (importData(String(r.result))) { showToast(t('imported')); renderDecks(); }
          else showToast(t('importError'));
        } catch (err) { showToast(t('importError')); }
        e.target.value = '';
      };
      r.readAsText(f);
    });
    $('#btn-back-decks').addEventListener('click', renderDecks);
    $('#btn-add-card').addEventListener('click', function () {
      var d = findDeck(openDeckId); if (d) cardModal(d, null);
    });
    $('#btn-study-deck').addEventListener('click', function () { startStudy([openDeckId]); });
    $('#flip-card').addEventListener('click', flipCard);
    document.querySelectorAll('#grade-row .grade-btn').forEach(function (b) {
      b.addEventListener('click', function () { gradeCurrent(b.getAttribute('data-grade')); });
    });
    $('#btn-back-decks-2').addEventListener('click', renderDecks);
    $('#btn-exit-study').addEventListener('click', function () { session = null; renderDecks(); });

    $('#deck-list').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var card = e.target.closest('[data-deck]');
      var d = findDeck(card.getAttribute('data-deck'));
      if (!d) return;
      var act = btn.getAttribute('data-act');
      if (act === 'open') { openDeckId = d.id; renderDeck(); }
      else if (act === 'study') { startStudy([d.id]); }
      else if (act === 'rename') { deckModal(d); }
      else if (act === 'del') {
        if (window.confirm(t('confirmDeleteDeck'))) {
          state.decks = state.decks.filter(function (x) { return x.id !== d.id; });
          save(); renderDecks();
        }
      }
    });
    $('#card-list').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var row = e.target.closest('[data-card]');
      var d = findDeck(openDeckId);
      var c = d && findCard(d, row.getAttribute('data-card'));
      if (!c) return;
      var act = btn.getAttribute('data-act');
      if (act === 'edit') { cardModal(d, c); }
      else if (act === 'del') {
        if (window.confirm(t('confirmDeleteCard'))) {
          d.cards = d.cards.filter(function (x) { return x.id !== c.id; });
          save(); renderDeck();
        }
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
      if (!session || $('#view-study').classList.contains('hidden')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
      if (session.flipped) {
        var map = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
        if (map[e.key]) gradeCurrent(map[e.key]);
      }
    });
  }

  /* test seam (not part of the UI) */
  window.__fc = {
    get state() { return state; },
    todayStr: todayStr,
    exportData: exportData,
    importData: importData,
    reset: function () { state = { lang: state.lang, decks: [] }; save(); }
  };

  bind();
  applyI18n();
  renderDecks();
})();
