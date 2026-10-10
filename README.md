# Flashcard BD — ফ্ল্যাশকার্ড বিডি

A free, fully offline spaced-repetition flashcard app for exam prep — in English and বাংলা.

## 1. Name
**Flashcard BD** (`flashcard-bd`) — self-graded flashcards with SM-2-lite scheduling.

## 2. Problem
Students re-read notes instead of actively recalling. Flashcards with spaced repetition fix that, but most apps need accounts, subscriptions, or internet. Flashcard BD is a single static site: your decks live in your browser, your reviews follow a real scheduling algorithm, and it works fully offline.

## 3. Features
- **Decks** — create, rename, delete decks (e.g. "DS Quiz 1"); per-deck card and due counts
- **Cards** — front/back text with full Bangla support; add, edit, delete
- **Study mode** — 3D flip animation; self-grade **Again / Hard / Good / Easy** (buttons or keys 1–4)
- **SM-2-lite scheduling** — Again = 1 day, Hard = ×1.2, Good = ×2.5, Easy = ×3.5, with ease-factor adjustments (floor 1.3); all date math in one pure, commented module (`js/sm2.js`)
- **Due queue** — "Study due" banner across all decks; per-deck study
- **Session summary** — reviewed count, recall accuracy, per-grade breakdown
- **Persistence** — everything in `localStorage`; JSON export/import (format documented below)
- **Bilingual UI** — full EN ⇄ বাংলা toggle
- **Responsive** — mobile (390px) and desktop layouts; empty states everywhere

## 4. Stack
Vanilla HTML + CSS + JavaScript. No frameworks, no build step, no external libraries, zero network requests.

## 5. Prerequisites
Any modern browser. For development/tests: Node.js 18+ and Python 3 (for a static server).

## 6. Install
No install. Open `index.html` directly, or serve the folder:
```bash
cd flashcard-bd
python3 -m http.server 8080
# → http://localhost:8080
```

## 7. Dev commands
There is no build. Useful test hook: `?asof=YYYY-MM-DD` freezes "today" for deterministic scheduling (used by the test suite).

## 8. Env
None. No API keys, no backend, no `.env`. Nothing leaves the browser.

## 9. Testing
Headless-Chromium suite (puppeteer-core + system Chrome), run against a local server:
```bash
cd /tmp/fc-test && npm install puppeteer-core
python3 -m http.server 8123 --directory ~/workspace/muse-project-factory/builds/flashcard-bd &
node test.js
```
**35 checks, all passing**: zero console/page errors; deck + card CRUD; validation of empty front/back; 3D flip reveals back; Again → due tomorrow (exact date asserted); Easy twice → interval grows (1 → 4 days); due counts with seeded past-due cards; study-due banner; export/import round-trip; reset; reload persistence; deck/card deletion; BN/EN toggle with Bangla card content; mobile 390px no horizontal overflow.

## 10. Deployment
GitHub Pages compatible: push the folder contents to a repo's `main` branch root and enable Pages (Deploy from a branch → `main` / `/ (root)`).

## 11. Limitations
- **Self-graded SM-2-lite, not validated science**: grades are your own judgment; intervals are a motivational scheduling aid, not a medical or learning-science claim.
- Data is per-browser `localStorage` (no sync); JSON export is the backup path.
- Timers/due dates use the device's local timezone.
- Clearing site data deletes decks — export regularly.

## 12. Status
Complete and verified. `PUBLISHED_AND_VERIFIED` pending parent publish step.

### Export format
```json
{
  "format": "flashcard-bd/v1",
  "exportedAt": "2026-10-11T00:00:00.000Z",
  "decks": [
    { "id": "...", "name": "DS Quiz 1", "createdAt": 0,
      "cards": [
        { "id": "...", "front": "…", "back": "…",
          "interval": 4, "ease": 2.5, "reps": 2, "lapses": 0, "due": "2026-10-15" }
      ] }
  ]
}
```
