// 五十音資料：平假名、片假名、羅馬拼音、所屬行
// group：basic 清音 / dakuon 濁音・半濁音 / yoon 拗音
(function () {
  const rows = [
    // [行名, 羅馬拼音陣列, 平假名, 片假名]
    ['あ行', ['a', 'i', 'u', 'e', 'o'], 'あいうえお', 'アイウエオ', 'basic'],
    ['か行', ['ka', 'ki', 'ku', 'ke', 'ko'], 'かきくけこ', 'カキクケコ', 'basic'],
    ['さ行', ['sa', 'shi', 'su', 'se', 'so'], 'さしすせそ', 'サシスセソ', 'basic'],
    ['た行', ['ta', 'chi', 'tsu', 'te', 'to'], 'たちつてと', 'タチツテト', 'basic'],
    ['な行', ['na', 'ni', 'nu', 'ne', 'no'], 'なにぬねの', 'ナニヌネノ', 'basic'],
    ['は行', ['ha', 'hi', 'fu', 'he', 'ho'], 'はひふへほ', 'ハヒフヘホ', 'basic'],
    ['ま行', ['ma', 'mi', 'mu', 'me', 'mo'], 'まみむめも', 'マミムメモ', 'basic'],
    ['や行', ['ya', '', 'yu', '', 'yo'], 'や　ゆ　よ', 'ヤ　ユ　ヨ', 'basic'],
    ['ら行', ['ra', 'ri', 'ru', 're', 'ro'], 'らりるれろ', 'ラリルレロ', 'basic'],
    ['わ行', ['wa', '', '', '', 'wo'], 'わ　　　を', 'ワ　　　ヲ', 'basic'],
    ['ん', ['n', '', '', '', ''], 'ん　　　　', 'ン　　　　', 'basic'],
    ['が行', ['ga', 'gi', 'gu', 'ge', 'go'], 'がぎぐげご', 'ガギグゲゴ', 'dakuon'],
    ['ざ行', ['za', 'ji', 'zu', 'ze', 'zo'], 'ざじずぜぞ', 'ザジズゼゾ', 'dakuon'],
    ['だ行', ['da', 'ji', 'zu', 'de', 'do'], 'だぢづでど', 'ダヂヅデド', 'dakuon'],
    ['ば行', ['ba', 'bi', 'bu', 'be', 'bo'], 'ばびぶべぼ', 'バビブベボ', 'dakuon'],
    ['ぱ行', ['pa', 'pi', 'pu', 'pe', 'po'], 'ぱぴぷぺぽ', 'パピプペポ', 'dakuon'],
  ];
  const yoon = [
    ['きゃ', 'キャ', 'kya'], ['きゅ', 'キュ', 'kyu'], ['きょ', 'キョ', 'kyo'],
    ['しゃ', 'シャ', 'sha'], ['しゅ', 'シュ', 'shu'], ['しょ', 'ショ', 'sho'],
    ['ちゃ', 'チャ', 'cha'], ['ちゅ', 'チュ', 'chu'], ['ちょ', 'チョ', 'cho'],
    ['にゃ', 'ニャ', 'nya'], ['にゅ', 'ニュ', 'nyu'], ['にょ', 'ニョ', 'nyo'],
    ['ひゃ', 'ヒャ', 'hya'], ['ひゅ', 'ヒュ', 'hyu'], ['ひょ', 'ヒョ', 'hyo'],
    ['みゃ', 'ミャ', 'mya'], ['みゅ', 'ミュ', 'myu'], ['みょ', 'ミョ', 'myo'],
    ['りゃ', 'リャ', 'rya'], ['りゅ', 'リュ', 'ryu'], ['りょ', 'リョ', 'ryo'],
    ['ぎゃ', 'ギャ', 'gya'], ['ぎゅ', 'ギュ', 'gyu'], ['ぎょ', 'ギョ', 'gyo'],
    ['じゃ', 'ジャ', 'ja'], ['じゅ', 'ジュ', 'ju'], ['じょ', 'ジョ', 'jo'],
    ['びゃ', 'ビャ', 'bya'], ['びゅ', 'ビュ', 'byu'], ['びょ', 'ビョ', 'byo'],
    ['ぴゃ', 'ピャ', 'pya'], ['ぴゅ', 'ピュ', 'pyu'], ['ぴょ', 'ピョ', 'pyo'],
  ];

  const list = [];
  for (const [row, roma, hira, kata, group] of rows) {
    [...hira].forEach((h, i) => {
      if (h === '　') return;
      list.push({ hira: h, kata: kata[i], romaji: roma[i], row, group, col: i });
    });
  }
  for (const [h, k, r] of yoon) list.push({ hira: h, kata: k, romaji: r, row: `${h[0]}行拗音`, group: 'yoon', col: null });

  // 表格排版用：清音 5 欄、濁音 5 欄、拗音 3 欄
  window.KANA = {
    list,
    table: {
      basic: rows.filter(r => r[4] === 'basic').map(r => ({ row: r[0], cells: [...r[2]].map((h, i) => h === '　' ? null : { hira: h, kata: r[3][i], romaji: r[1][i] }) })),
      dakuon: rows.filter(r => r[4] === 'dakuon').map(r => ({ row: r[0], cells: [...r[2]].map((h, i) => ({ hira: h, kata: r[3][i], romaji: r[1][i] })) })),
      yoon: Array.from({ length: yoon.length / 3 }, (_, i) => ({ row: `${yoon[i * 3][0][0]}`, cells: yoon.slice(i * 3, i * 3 + 3).map(([h, k, r]) => ({ hira: h, kata: k, romaji: r })) })),
    },
  };
})();
