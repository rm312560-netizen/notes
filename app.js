// 學習卡：單字卡（間隔重複）、五十音、發音、單字本、設定與備份
const APP_VERSION = '1.0.0';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400e3, MIN = 60e3;
const today = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200); }

// ---------- 設定 ----------
const S = {};
function loadSettings() {
  Object.assign(S, {
    theme: DB.setting('theme', 'normal'), newPerDay: DB.setting('newPerDay', 10), dir: DB.setting('dir', 'ja'),
    autoSpeak: DB.setting('autoSpeak', true), rate: DB.setting('rate', 0.8), voice: DB.setting('voice', ''),
    cats: DB.setting('cats', null),            // null 代表全部主題
  });
}
function setS(key, value) { S[key] = value; DB.setSetting(key, value); }

// ---------- 外觀：一般／低調 ----------
function applyTheme() {
  const stealth = S.theme === 'stealth';
  document.body.classList.toggle('stealth', stealth);
  document.querySelectorAll('[data-alt]').forEach(el => {
    if (!el.dataset.orig) el.dataset.orig = el.textContent;
    el.textContent = stealth ? el.dataset.alt : el.dataset.orig;
  });
  document.title = stealth ? '筆記' : '學習卡';
  document.querySelectorAll('#sTheme button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.theme)));
}

// ---------- 發音（手機內建的日文語音） ----------
let voices = [];
function loadVoices() {
  voices = (speechSynthesis.getVoices() || []).filter(v => /^ja/i.test(v.lang));
  const sel = $('sVoice');
  sel.innerHTML = '<option value="">自動選擇</option>' + voices.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('');
  sel.value = S.voice || '';
}
function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = Number(S.rate) || 0.8;
  const v = voices.find(x => x.voiceURI === S.voice) || voices.find(x => /Kyoko|O-Ren|Otoya|Hattori|Google/i.test(x.name)) || voices[0];
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
if ('speechSynthesis' in window) { speechSynthesis.onvoiceschanged = loadVoices; }

// ---------- 分頁 ----------
let view = 'home';
function go(v) {
  if (view === 'review' && v !== 'review') endReview(false);
  view = v;
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== `v-${v}`; });
  document.querySelectorAll('.tabbar button').forEach(b => b.toggleAttribute('aria-current', b.dataset.tab === v));
  if (v === 'review') startReview();
  if (v === 'home') renderHome();
  if (v === 'kana') { $('kaQuiz').hidden = true; renderKanaTable(); }
  if (v === 'words') renderWords();
  if (v === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

// ---------- 間隔重複排程 ----------
// 新卡：1 分鐘 → 10 分鐘 → 畢業（1 天）；按「簡單」直接 4 天。
// 複習卡：記得 = 間隔 × 難易度；困難 = × 1.2；簡單 = × 難易度 × 1.3；忘了 → 10 分鐘後重學，間隔減半。
const STEPS = [1, 10], RELEARN = [10];
function schedule(c, r, now = Date.now()) {
  const n = c ? { ...c } : { state: 'learning', step: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, added: today(now) };
  if (n.state === 'learning' || n.state === 'relearn') {
    const steps = n.state === 'learning' ? STEPS : RELEARN;
    if (r === 1) { n.step = 0; n.due = now + steps[0] * MIN; }
    else if (r === 2) { n.due = now + Math.max(1, steps[n.step] * 1.5) * MIN; }
    else if (r === 3 && n.step + 1 < steps.length) { n.step++; n.due = now + steps[n.step] * MIN; }
    else {
      n.interval = n.state === 'relearn' ? Math.max(1, n.interval) : (r === 4 ? 4 : 1);
      if (r === 4 && n.state === 'learning') n.ease += 0.15;
      n.state = 'review'; n.step = 0; n.due = now + n.interval * DAY;
    }
  } else {
    if (r === 1) {
      n.lapses++; n.ease = Math.max(1.3, n.ease - 0.2); n.interval = Math.max(1, n.interval * 0.5);
      n.state = 'relearn'; n.step = 0; n.due = now + RELEARN[0] * MIN;
    } else {
      if (r === 2) { n.interval = Math.max(n.interval + 1, n.interval * 1.2); n.ease = Math.max(1.3, n.ease - 0.15); }
      if (r === 3) n.interval = Math.max(n.interval + 1, n.interval * n.ease);
      if (r === 4) { n.interval = Math.max(n.interval + 1, n.interval * n.ease * 1.3); n.ease += 0.15; }
      if (n.interval > 3) n.interval *= 0.95 + Math.random() * 0.1;    // 稍微錯開，避免同一天堆太多
      n.due = now + n.interval * DAY;
    }
  }
  n.reps++; n.last_review = now;
  return n;
}
function fmtGap(ms) {
  const m = ms / MIN;
  if (m < 60) return `${Math.max(1, Math.round(m))} 分`;
  if (m < 60 * 24) return `${Math.round(m / 60)} 小時`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)} 天`;
  if (d < 365) return `${Math.round(d / 30)} 個月`;
  return `${(d / 365).toFixed(1)} 年`;
}

// ---------- 今日的卡片 ----------
const catFilter = () => S.cats && S.cats.length ? `AND w.category IN (${S.cats.map(() => '?').join(',')})` : '';
const catArgs = () => S.cats && S.cats.length ? S.cats : [];
function newToday() { return DB.get('SELECT COUNT(*) AS n FROM cards WHERE added = ?', [today()]).n; }
function counts() {
  const now = Date.now();
  const learnDue = DB.get("SELECT COUNT(*) AS n FROM cards WHERE state IN ('learning','relearn') AND due <= ?", [now]).n;
  const reviewDue = DB.get("SELECT COUNT(*) AS n FROM cards WHERE state = 'review' AND due <= ?", [endOfToday()]).n;
  const unseen = DB.get(`SELECT COUNT(*) AS n FROM words w LEFT JOIN cards c ON c.word_id = w.id WHERE c.word_id IS NULL ${catFilter()}`, catArgs()).n;
  const newLeft = Math.max(0, Math.min(S.newPerDay - newToday(), unseen));
  return { due: learnDue + reviewDue, newLeft, unseen };
}
function nextCard() {
  const now = Date.now();
  const learn = DB.get("SELECT * FROM cards WHERE state IN ('learning','relearn') AND due <= ? ORDER BY due LIMIT 1", [now]);
  if (learn) return { card: learn, word: DB.get('SELECT * FROM words WHERE id = ?', [learn.word_id]) };
  const rev = DB.get("SELECT * FROM cards WHERE state = 'review' AND due <= ? ORDER BY due LIMIT 1", [endOfToday()]);
  if (rev) return { card: rev, word: DB.get('SELECT * FROM words WHERE id = ?', [rev.word_id]) };
  if (S.newPerDay - newToday() > 0) {
    const w = DB.get(`SELECT w.* FROM words w LEFT JOIN cards c ON c.word_id = w.id WHERE c.word_id IS NULL ${catFilter()} ORDER BY w.custom DESC, w.id LIMIT 1`, catArgs());
    if (w) return { card: null, word: w };
  }
  // 學習中的卡片 30 分鐘內就到期：提前拿出來，不用乾等
  const soon = DB.get("SELECT * FROM cards WHERE state IN ('learning','relearn') AND due <= ? ORDER BY due LIMIT 1", [now + 30 * MIN]);
  if (soon) return { card: soon, word: DB.get('SELECT * FROM words WHERE id = ?', [soon.word_id]) };
  return null;
}

// ---------- 複習畫面 ----------
let cur = null, shownAt = 0, sessionDone = 0;
function startReview() { sessionDone = 0; $('rvDone').hidden = true; showNext(); }
function endReview(toHome = true) { cur = null; speechSynthesis?.cancel(); if (toHome) go('home'); }
const disp = w => w.kanji || w.kana;
function showNext() {
  cur = nextCard();
  const c = counts();
  $('rvProg').textContent = `本次已完成 ${sessionDone}・剩餘約 ${c.due + c.newLeft}`;
  const flash = $('flash');
  if (!cur) {
    flash.hidden = true; $('rvShow').hidden = true; $('rvRates').hidden = true;
    $('rvDone').hidden = false;
    $('rvDone').innerHTML = `<div class="big-ja">おつかれさま</div><div>今天的卡片都完成了${sessionDone ? `（這次複習了 ${sessionDone} 張）` : ''}。</div>
      <div class="muted small">想多學一點，可以到「設定」調高每日新單字數，或去練習五十音。</div><button class="primary" onclick="go('home')">回首頁</button>`;
    return;
  }
  flash.hidden = false; $('rvDone').hidden = true;
  const w = cur.word;
  cur.dir = S.dir === 'mix' ? (Math.random() < 0.5 ? 'ja' : 'zh') : S.dir;
  const tag = cur.card ? (cur.card.state === 'review' ? '複習' : '學習中') : '新單字';
  $('rvFront').innerHTML = cur.dir === 'ja'
    ? `<span class="tag">${tag}・${esc(w.category)}</span><div class="word">${esc(disp(w))}</div>${w.kanji ? '' : ''}<button class="say" data-say="${esc(w.kana)}">🔊 聽發音</button>`
    : `<span class="tag">${tag}・${esc(w.category)}・想想日文怎麼說</span><div class="meaning">${esc(w.meaning)}</div>`;
  $('rvBack').hidden = true; $('rvShow').hidden = false; $('rvRates').hidden = true;
  shownAt = Date.now();
  if (cur.dir === 'ja' && S.autoSpeak) speak(w.kana);
}
function showAnswer() {
  if (!cur) return;
  const w = cur.word;
  $('rvBack').innerHTML = `${cur.dir === 'zh' ? `<div class="word">${esc(disp(w))}</div>` : ''}
    ${w.kanji ? `<div class="reading">${esc(w.kana)}</div>` : ''}
    ${cur.dir === 'ja' ? `<div class="meaning">${esc(w.meaning)}</div>` : ''}
    ${cur.dir === 'zh' ? `<button class="say" data-say="${esc(w.kana)}">🔊 聽發音</button>` : ''}
    ${w.ex_ja ? `<div class="ex"><span class="exja">${esc(w.ex_ja)}</span><button class="say inline" data-say="${esc(w.ex_ja)}">🔊</button><br><span class="muted">${esc(w.ex_zh || '')}</span></div>` : ''}`;
  $('rvBack').hidden = false; $('rvShow').hidden = true; $('rvRates').hidden = false;
  const now = Date.now();
  [1, 2, 3, 4].forEach(r => { $(`rt${r}`).textContent = fmtGap(schedule(cur.card, r, now).due - now); });
  if (cur.dir === 'zh' && S.autoSpeak) speak(w.kana);
}
function rate(r) {
  if (!cur) return;
  const now = Date.now(), n = schedule(cur.card, r, now);
  DB.run(`INSERT INTO cards (word_id, state, due, interval, ease, step, reps, lapses, last_review, added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(word_id) DO UPDATE SET state = excluded.state, due = excluded.due, interval = excluded.interval, ease = excluded.ease,
      step = excluded.step, reps = excluded.reps, lapses = excluded.lapses, last_review = excluded.last_review`,
    [cur.word.id, n.state, n.due, n.interval, n.ease, n.step, n.reps, n.lapses, n.last_review, n.added]);
  DB.run('INSERT INTO review_log (ts, day, kind, item, rating, ms) VALUES (?, ?, ?, ?, ?, ?)', [now, today(now), 'word', String(cur.word.id), r, now - shownAt]);
  sessionDone++;
  showNext();
}
$('rvShow').addEventListener('click', showAnswer);
$('flash').addEventListener('click', e => { const b = e.target.closest('[data-say]'); if (b) { e.stopPropagation(); speak(b.dataset.say); } else if (!$('rvShow').hidden) showAnswer(); });
$('rvRates').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) rate(Number(b.dataset.r)); });
$('rvExit').addEventListener('click', () => endReview(true));
$('hStart').addEventListener('click', () => go('review'));

// ---------- 首頁 ----------
function streak() {
  const days = new Set(DB.all('SELECT DISTINCT day FROM review_log WHERE ts > ?', [Date.now() - 400 * DAY]).map(r => r.day));
  let n = 0, t = Date.now();
  if (!days.has(today(t))) t -= DAY;           // 今天還沒練習，從昨天開始算
  while (days.has(today(t))) { n++; t -= DAY; }
  return n;
}
function renderHome() {
  const c = counts();
  const done = DB.get("SELECT COUNT(*) AS n FROM review_log WHERE day = ? AND kind = 'word'", [today()]).n;
  $('hDue').textContent = c.due; $('hNew').textContent = c.newLeft; $('hDone').textContent = done; $('hStreak').textContent = `${streak()} 天`;
  const total = done + c.due + c.newLeft;
  $('hGoalBar').style.width = `${total ? done / total * 100 : 100}%`;
  $('hGoalTxt').textContent = total ? `今日進度 ${done} / ${total}` : '今天還沒有卡片，先開始學新單字吧';
  $('hStart').textContent = c.due + c.newLeft ? `開始複習（${c.due + c.newLeft} 張）` : '今天的卡片都完成了';
  // 近 14 天
  const rows = DB.all('SELECT day, COUNT(*) AS n FROM review_log WHERE ts > ? GROUP BY day', [Date.now() - 15 * DAY]);
  const map = Object.fromEntries(rows.map(r => [r.day, r.n]));
  const days = Array.from({ length: 14 }, (_, i) => today(Date.now() - (13 - i) * DAY));
  const max = Math.max(1, ...days.map(d => map[d] || 0));
  $('hChart').innerHTML = days.map(d => `<span title="${d}：${map[d] || 0}">${map[d] || ''}<b style="height:${(map[d] || 0) / max * 80}%"></b></span>`).join('');
  const w7 = DB.get("SELECT COUNT(*) AS n, SUM(rating >= 3) AS ok FROM review_log WHERE kind = 'word' AND ts > ?", [Date.now() - 7 * DAY]);
  const k7 = DB.get("SELECT COUNT(*) AS n, SUM(rating) AS ok FROM review_log WHERE kind = 'kana' AND ts > ?", [Date.now() - 7 * DAY]);
  $('hAcc').textContent = [w7.n ? `單字記得率 ${Math.round(w7.ok / w7.n * 100)}%` : '', k7.n ? `五十音答對率 ${Math.round(k7.ok / k7.n * 100)}%` : ''].filter(Boolean).join('・') || '近 7 天還沒有紀錄';
  const st = DB.get(`SELECT COUNT(*) AS seen, SUM(state = 'review' AND interval >= 21) AS mature, SUM(state != 'review') AS learning FROM cards`);
  const totalW = DB.get('SELECT COUNT(*) AS n FROM words').n;
  const kanaOk = DB.get('SELECT COUNT(*) AS n FROM kana_stats WHERE streak >= 3').n;
  $('hCounts').innerHTML = `<span>已學過的單字</span><b>${st.seen || 0} / ${totalW}</b>
    <span>已熟悉（間隔 3 週以上）</span><b>${st.mature || 0}</b>
    <span>學習中</span><b>${st.learning || 0}</b>
    <span>五十音已掌握（連續答對 3 次）</span><b>${kanaOk} / ${KANA.list.length * 2}</b>`;
  $('topinfo').textContent = c.due + c.newLeft ? `今日 ${c.due + c.newLeft} 張` : '';
}

// ---------- 五十音表 ----------
let kaSet = 'hira', kaGroup = 'basic';
function kanaStat(k) { return DB.get('SELECT * FROM kana_stats WHERE kana = ?', [k]); }
function renderKanaTable() {
  const rows = KANA.table[kaGroup];
  const stats = Object.fromEntries(DB.all('SELECT * FROM kana_stats').map(s => [s.kana, s]));
  $('kaTable').innerHTML = rows.map(r => `<div class="krow" style="--cols:${r.cells.length}">${r.cells.map(c => {
    if (!c) return '<div class="kcell empty"></div>';
    const k = kaSet === 'hira' ? c.hira : c.kata, s = stats[k];
    const tries = s ? s.correct + s.wrong : 0, wr = tries >= 2 ? s.wrong / tries : 0;
    const cls = wr > 0.4 ? 'w3' : wr > 0.25 ? 'w2' : wr > 0.1 ? 'w1' : s && s.streak >= 3 ? 'ok' : '';
    return `<button class="kcell ${cls}" data-say="${esc(k)}"><span class="k">${esc(k)}</span><span class="r">${esc(c.romaji)}</span></button>`;
  }).join('')}</div>`).join('');
}
function segPick(containerId, attr, val) { document.querySelectorAll(`#${containerId} button`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === val))); }
$('kaSet').addEventListener('click', e => { const b = e.target.closest('[data-set]'); if (!b) return; kaSet = b.dataset.set; segPick('kaSet', 'set', kaSet); renderKanaTable(); });
$('kaGroup').addEventListener('click', e => { const b = e.target.closest('[data-group]'); if (!b) return; kaGroup = b.dataset.group; segPick('kaGroup', 'group', kaGroup); renderKanaTable(); });
$('kaTable').addEventListener('click', e => { const b = e.target.closest('[data-say]'); if (b) speak(b.dataset.say); });

// ---------- 五十音測驗 ----------
let quiz = null;
function kanaPool(scope) {
  const groups = scope === 'current' ? [kaGroup] : scope === 'basic' ? ['basic'] : ['basic', 'dakuon', 'yoon'];
  return KANA.list.filter(k => groups.includes(k.group)).map(k => ({ ...k, k: kaSet === 'hira' ? k.hira : k.kata }));
}
// 越常答錯的字越常出現；連續答對 3 次以上的少出現
function weightOf(k) { const s = kanaStat(k.k); return s ? Math.max(0.3, 1 + s.wrong * 2 - Math.min(s.streak, 3) * 0.3) : 1.5; }
function pickWeighted(pool, last) {
  const cand = pool.filter(p => p.k !== last);
  const ws = cand.map(weightOf), sum = ws.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < cand.length; i++) { r -= ws[i]; if (r <= 0) return cand[i]; }
  return cand[cand.length - 1];
}
function startQuiz() {
  const pool = kanaPool($('kaScope').value);
  if (pool.length < 4) return toast('範圍太小，請選多一點');
  quiz = { pool, mode: $('kaMode').value, n: 0, total: 20, right: 0, last: null, wrongs: [] };
  $('kaQuiz').hidden = false; $('kqDone').hidden = true;
  document.querySelector('#kaQuiz .flash').hidden = false; $('kqChoices').hidden = false;
  $('kaQuiz').scrollIntoView({ behavior: 'smooth' });
  nextQ();
}
function nextQ() {
  if (quiz.n >= quiz.total) return endQuiz();
  const a = pickWeighted(quiz.pool, quiz.last);
  quiz.last = a.k; quiz.answer = a; quiz.locked = false; quiz.t0 = Date.now();
  const others = quiz.pool.filter(p => p.romaji !== a.romaji).sort(() => Math.random() - 0.5);
  const opts = [a];
  for (const o of others) { if (opts.length >= 4) break; if (!opts.some(x => x.romaji === o.romaji)) opts.push(o); }
  opts.sort(() => Math.random() - 0.5);
  $('kqProg').textContent = `第 ${quiz.n + 1} / ${quiz.total} 題・答對 ${quiz.right}`;
  const q = $('kqQ');
  if (quiz.mode === 'read') q.innerHTML = `<div class="q">${esc(a.k)}</div>`;
  if (quiz.mode === 'roma') q.innerHTML = `<div class="q roma">${esc(a.romaji)}</div>`;
  if (quiz.mode === 'listen') { q.innerHTML = `<button class="say" data-say="${esc(a.k)}">🔊 再聽一次</button>`; speak(a.k); }
  const showKana = quiz.mode !== 'read';
  $('kqChoices').innerHTML = opts.map(o => `<button class="${showKana ? 'ja' : ''}" data-ans="${esc(o.k)}">${esc(showKana ? o.k : o.romaji)}</button>`).join('');
}
function answerQ(btn) {
  if (!quiz || quiz.locked) return;
  quiz.locked = true;
  const a = quiz.answer, ok = btn.dataset.ans === a.k;
  btn.classList.add(ok ? 'right' : 'wrong');
  if (!ok) { [...$('kqChoices').children].find(b => b.dataset.ans === a.k)?.classList.add('right'); quiz.wrongs.push(a); }
  quiz.n++; if (ok) quiz.right++;
  const now = Date.now();
  DB.run(`INSERT INTO kana_stats (kana, correct, wrong, streak, last_ts) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(kana) DO UPDATE SET correct = correct + excluded.correct, wrong = wrong + excluded.wrong,
      streak = CASE WHEN excluded.correct = 1 THEN streak + 1 ELSE 0 END, last_ts = excluded.last_ts`, [a.k, ok ? 1 : 0, ok ? 0 : 1, ok ? 1 : 0, now]);
  DB.run('INSERT INTO review_log (ts, day, kind, item, rating, ms) VALUES (?, ?, ?, ?, ?, ?)', [now, today(now), 'kana', a.k, ok ? 1 : 0, now - quiz.t0]);
  if (quiz.mode !== 'listen') speak(a.k);
  setTimeout(nextQ, ok ? 700 : 1600);
}
function endQuiz() {
  document.querySelector('#kaQuiz .flash').hidden = true; $('kqChoices').hidden = true;
  const uniq = [...new Map(quiz.wrongs.map(w => [w.k, w])).values()];
  $('kqDone').hidden = false;
  $('kqDone').innerHTML = `<div class="big-ja">${quiz.right} / ${quiz.total}</div>
    <div>${quiz.right === quiz.total ? '全對，太厲害了！' : quiz.right >= 16 ? '很不錯！' : '多練習幾次就會記住。'}</div>
    ${uniq.length ? `<div class="muted small">這次答錯：${uniq.map(w => `${esc(w.k)}（${esc(w.romaji)}）`).join('、')}</div>` : ''}
    <div class="btnrow"><button class="primary" id="kqAgain">再練一次</button><button class="ghost" id="kqBack">回五十音表</button></div>`;
  $('kqAgain').onclick = startQuiz;
  $('kqBack').onclick = () => { $('kaQuiz').hidden = true; renderKanaTable(); window.scrollTo(0, 0); };
  renderKanaTable();
}
$('kaStart').addEventListener('click', startQuiz);
$('kqChoices').addEventListener('click', e => { const b = e.target.closest('[data-ans]'); if (b) answerQ(b); });
$('kqQ').addEventListener('click', e => { const b = e.target.closest('[data-say]'); if (b) speak(b.dataset.say); });
$('kqExit').addEventListener('click', () => { quiz = null; $('kaQuiz').hidden = true; renderKanaTable(); window.scrollTo(0, 0); });

// ---------- 單字本 ----------
let wCat = '全部';
function renderWords() {
  const cats = ['全部', ...WORD_CATEGORIES, ...(DB.get("SELECT 1 FROM words WHERE custom = 1") ? ['自訂'] : [])];
  $('wCats').innerHTML = cats.map(c => `<button data-cat="${esc(c)}" aria-pressed="${c === wCat}">${esc(c)}</button>`).join('');
  const q = $('wQ').value.trim();
  const where = [], args = [];
  if (wCat === '自訂') where.push('w.custom = 1');
  else if (wCat !== '全部') { where.push('w.category = ?'); args.push(wCat); }
  if (q) { where.push('(w.kanji LIKE ? OR w.kana LIKE ? OR w.meaning LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = DB.all(`SELECT w.*, c.state, c.interval, c.due FROM words w LEFT JOIN cards c ON c.word_id = w.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY w.custom DESC, w.id LIMIT 2000`, args);
  const learned = rows.filter(r => r.state).length;
  $('wMeta').textContent = `${rows.length} 個單字・已學 ${learned} 個`;
  const stTxt = r => !r.state ? '未學' : r.state === 'review' ? (r.interval >= 21 ? '熟悉' : '複習中') : '學習中';
  $('wList').innerHTML = rows.map(r => `<details class="witem">
    <summary><span><span class="w">${esc(r.kanji || r.kana)}</span>${r.kanji ? `<span class="rd">${esc(r.kana)}</span>` : ''}</span>
      <span class="m">${esc(r.meaning)}</span><span class="st ${r.state === 'review' ? 'review' : r.state ? 'learning' : ''}">${stTxt(r)}</span></summary>
    <div class="wb">
      <div><button class="say" data-say="${esc(r.kana)}">🔊 ${esc(r.kana)}</button></div>
      ${r.ex_ja ? `<div><span class="exja">${esc(r.ex_ja)}</span><button class="say inline" data-say="${esc(r.ex_ja)}">🔊</button><br><span class="muted">${esc(r.ex_zh || '')}</span></div>` : ''}
      <div class="muted small">${esc(r.category)}${r.state ? `・下次複習 ${new Date(r.due).toLocaleDateString('zh-TW')}` : ''}${r.custom ? `・<button class="ghost" data-delw="${r.id}">刪除這個單字</button>` : ''}</div>
    </div></details>`).join('') || '<p class="muted">找不到符合的單字。</p>';
}
$('wCats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { wCat = b.dataset.cat; renderWords(); } });
$('wQ').addEventListener('input', () => renderWords());
$('wList').addEventListener('click', e => {
  const s = e.target.closest('[data-say]'); if (s) { e.preventDefault(); speak(s.dataset.say); return; }
  const d = e.target.closest('[data-delw]');
  if (d) {
    if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = '再按一次確定刪除'; return; }
    DB.run('DELETE FROM cards WHERE word_id = ?', [Number(d.dataset.delw)]);
    DB.run('DELETE FROM words WHERE id = ? AND custom = 1', [Number(d.dataset.delw)]);
    toast('已刪除'); renderWords();
  }
});
$('wAdd').addEventListener('submit', e => {
  e.preventDefault();
  const kana = $('aKana').value.trim(), meaning = $('aMeaning').value.trim();
  if (!kana || !meaning) return toast('請填假名讀音和中文意思');
  const id = Math.max(100000, (DB.get('SELECT MAX(id) AS m FROM words').m || 0) + 1);
  DB.run('INSERT INTO words (id, kanji, kana, meaning, ex_ja, ex_zh, category, custom) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    [id, $('aKanji').value.trim() || null, kana, meaning, $('aEx').value.trim() || null, $('aExZh').value.trim() || null, '自訂']);
  ['aKanji', 'aKana', 'aMeaning', 'aEx', 'aExZh'].forEach(i => { $(i).value = ''; });
  toast('已加入，會排在新單字的最前面'); wCat = '自訂'; renderWords();
});

// ---------- 設定 ----------
function renderSettings() {
  applyTheme();
  $('sNew').value = String(S.newPerDay); $('sDir').value = S.dir; $('sAuto').checked = !!S.autoSpeak; $('sRate').value = String(S.rate);
  loadVoices();
  const sel = new Set(S.cats || WORD_CATEGORIES);
  $('sCats').innerHTML = WORD_CATEGORIES.map(c => `<label><input type="checkbox" value="${esc(c)}" ${sel.has(c) ? 'checked' : ''}>${esc(c)}</label>`).join('');
  const last = DB.setting('lastBackup', null);
  $('sBackupInfo').textContent = last ? `上次匯出：${last}` : '還沒有匯出過備份。';
  $('sVer').textContent = `版本 ${APP_VERSION}・單字 ${DB.get('SELECT COUNT(*) AS n FROM words').n} 個`;
}
$('sTheme').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { setS('theme', b.dataset.v); applyTheme(); } });
$('sNew').addEventListener('change', e => setS('newPerDay', Number(e.target.value)));
$('sDir').addEventListener('change', e => setS('dir', e.target.value));
$('sAuto').addEventListener('change', e => setS('autoSpeak', e.target.checked));
$('sRate').addEventListener('change', e => setS('rate', Number(e.target.value)));
$('sVoice').addEventListener('change', e => setS('voice', e.target.value));
$('sTest').addEventListener('click', () => speak('こんにちは。よろしくおねがいします。'));
$('sCats').addEventListener('change', () => {
  const v = [...$('sCats').querySelectorAll('input:checked')].map(i => i.value);
  if (!v.length) { toast('至少要選一個主題'); renderSettings(); return; }
  setS('cats', v.length === WORD_CATEGORIES.length ? null : v);
});
// 匯出：iPhone 用「分享」存到檔案 App；其他瀏覽器直接下載
$('sExport').addEventListener('click', async () => {
  await DB.saveNow();
  const name = `study-${today().replace(/-/g, '')}.db`;
  const file = new File([DB.exportBytes()], name, { type: 'application/octet-stream' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    setS('lastBackup', new Date().toLocaleString('zh-TW', { hour12: false }));
    renderSettings();
  } catch (err) { if (err.name !== 'AbortError') toast(`匯出失敗：${err.message}`); }
});
$('sImport').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { await DB.importBytes(await f.arrayBuffer()); loadSettings(); applyTheme(); toast('已匯入備份'); go('home'); }
  catch (err) { toast(`匯入失敗：${err.message}`); }
});
$('sReset').addEventListener('click', async e => {
  const b = e.currentTarget;
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '再按一次確定清除（無法復原）'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '清除所有學習紀錄'; }, 4000); return; }
  await DB.reset(); loadSettings(); applyTheme(); toast('已清除'); go('home');
});

// ---------- 啟動 ----------
(async () => {
  try {
    await DB.open();
    loadSettings();
    applyTheme();
    if ('speechSynthesis' in window) loadVoices();
    go('home');
  } catch (e) {
    $('loading').textContent = `載入失敗：${e.message}`;
    return;
  }
  $('loading').hidden = true;
  // 離線用：註冊 Service Worker（https 或 localhost 才能用）
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
