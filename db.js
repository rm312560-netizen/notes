// 資料庫：SQLite（sql.js，SQLite 的網頁版）
// 整個資料庫檔存在瀏覽器的 IndexedDB，每次修改後自動存檔；可匯出成 study.db 備份，也可匯入還原。
(function () {
  const IDB_NAME = 'jpstudy', IDB_STORE = 'files', IDB_KEY = 'study.db';
  let SQL = null, db = null, saveTimer = null;

  // ---------- IndexedDB：存放資料庫檔 ----------
  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet() {
    const d = await idb();
    return new Promise((resolve, reject) => {
      const r = d.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbPut(bytes) {
    const d = await idb();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS words (
      id       INTEGER PRIMARY KEY,
      kanji    TEXT,
      kana     TEXT NOT NULL,
      meaning  TEXT NOT NULL,
      ex_ja    TEXT,
      ex_zh    TEXT,
      category TEXT NOT NULL,
      custom   INTEGER NOT NULL DEFAULT 0
    );
    -- 單字卡的複習排程（沒有資料列代表還沒學過的新卡）
    CREATE TABLE IF NOT EXISTS cards (
      word_id     INTEGER PRIMARY KEY,
      state       TEXT NOT NULL,          -- learning 學習中 / review 複習中 / relearn 重新學習
      due         INTEGER NOT NULL,       -- 下次複習時間（epoch ms）
      interval    REAL NOT NULL DEFAULT 0,-- 複習間隔（天）
      ease        REAL NOT NULL DEFAULT 2.5,
      step        INTEGER NOT NULL DEFAULT 0,
      reps        INTEGER NOT NULL DEFAULT 0,
      lapses      INTEGER NOT NULL DEFAULT 0,
      last_review INTEGER,
      added       TEXT NOT NULL           -- 第一次學習的日期 YYYY-MM-DD
    );
    CREATE TABLE IF NOT EXISTS review_log (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      INTEGER NOT NULL,
      day     TEXT NOT NULL,
      kind    TEXT NOT NULL,              -- word 單字卡 / kana 五十音
      item    TEXT NOT NULL,              -- 單字 id 或假名
      rating  INTEGER NOT NULL,           -- 單字：1 忘了 2 困難 3 記得 4 簡單；五十音：0 答錯 1 答對
      ms      INTEGER                     -- 作答花費時間
    );
    CREATE INDEX IF NOT EXISTS idx_log_day ON review_log (day);
    CREATE TABLE IF NOT EXISTS kana_stats (
      kana    TEXT PRIMARY KEY,
      correct INTEGER NOT NULL DEFAULT 0,
      wrong   INTEGER NOT NULL DEFAULT 0,
      streak  INTEGER NOT NULL DEFAULT 0, -- 連續答對次數
      last_ts INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `;

  // 內建單字：新版本加了字就補進去；內建字的內容以程式為準，自訂單字（custom = 1）不動
  function seedWords() {
    const up = db.prepare(`INSERT INTO words (id, kanji, kana, meaning, ex_ja, ex_zh, category, custom) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET kanji = excluded.kanji, kana = excluded.kana, meaning = excluded.meaning,
        ex_ja = excluded.ex_ja, ex_zh = excluded.ex_zh, category = excluded.category WHERE words.custom = 0`);
    db.exec('BEGIN');
    for (const w of window.WORDS) up.run([w.id, w.kanji && w.kanji !== w.kana ? w.kanji : null, w.kana, w.meaning, w.exJa || null, w.exZh || null, w.category]);
    db.exec('COMMIT');
    up.free();
  }

  // ---------- 對外介面 ----------
  const DB = {
    async open() {
      SQL = await initSqlJs({ locateFile: f => `vendor/${f}` });
      const bytes = await idbGet().catch(() => null);
      db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
      db.exec(SCHEMA);
      seedWords();
      await DB.saveNow();
      // 要求瀏覽器不要自動清除資料（加到主畫面後通常會允許）
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    },
    // 查詢：回傳物件陣列
    all(sql, params = []) {
      const st = db.prepare(sql);
      st.bind(params);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      st.free();
      return rows;
    },
    get(sql, params = []) { return DB.all(sql, params)[0] || null; },
    run(sql, params = []) { db.run(sql, params); DB.save(); },
    // 修改後延遲存檔（連續作答時合併成一次）
    save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => DB.saveNow(), 400); },
    async saveNow() { clearTimeout(saveTimer); await idbPut(db.export()); },
    setting(key, fallback) { const r = DB.get('SELECT value FROM settings WHERE key = ?', [key]); return r ? JSON.parse(r.value) : fallback; },
    setSetting(key, value) { DB.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]); },
    exportBytes() { return db.export(); },
    // 匯入備份：先確認是有效的 SQLite 檔，再取代目前的資料庫
    async importBytes(bytes) {
      const test = new SQL.Database(new Uint8Array(bytes));
      const ok = test.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('words', 'cards')");
      test.close();
      if (!ok.length || ok[0].values.length < 2) throw new Error('這不是學習卡的備份檔');
      db.close();
      db = new SQL.Database(new Uint8Array(bytes));
      db.exec(SCHEMA);
      seedWords();
      await DB.saveNow();
    },
    async reset() {
      db.close();
      db = new SQL.Database();
      db.exec(SCHEMA);
      seedWords();
      await DB.saveNow();
    },
  };
  // 離開 App 前立刻存檔（iPhone 切到背景時可能直接被關掉）
  document.addEventListener('visibilitychange', () => { if (document.hidden && db) DB.saveNow(); });
  window.DB = DB;
})();
