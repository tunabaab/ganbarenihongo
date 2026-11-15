/* 간바레간바레니혼고 · 가나/한글 변환과 검색 도구 */
(function (G) {
  'use strict';

  /* ---------- 가타카나 → 히라가나 ---------- */
  const toHira = s => String(s || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const isKanji = c => /[㐀-鿿豈-﫿々〆ヶ]/.test(c);
  const hasKanji = s => /[㐀-鿿豈-﫿々]/.test(s || '');
  const isKana = s => /^[぀-ヿー\s・、。？！?!～〜]+$/.test(s || '');
  const isHangul = s => /[가-힣]/.test(s || '');

  /* ---------- 한글 조합/분해 ---------- */
  const SBase = 0xAC00;
  const decompose = ch => {
    const c = ch.charCodeAt(0) - SBase;
    if (c < 0 || c > 11171) return null;
    return { L: Math.floor(c / 588), V: Math.floor((c % 588) / 28), T: c % 28 };
  };
  const compose = (L, V, T) => String.fromCharCode(SBase + (L * 21 + V) * 28 + (T || 0));
  const addFinal = (str, T) => {
    if (!str) return str;
    const last = str[str.length - 1], d = decompose(last);
    if (!d || d.T) return str;
    return str.slice(0, -1) + compose(d.L, d.V, T);
  };

  /* ---------- 가나 → 한글 발음 ---------- */
  const K2H = {};
  const add = (kana, hangul) => kana.split(' ').forEach((k, i) => { K2H[k] = hangul.split(' ')[i]; });
  add('あ い う え お', '아 이 우 에 오');
  add('か き く け こ', '카 키 쿠 케 코');
  add('が ぎ ぐ げ ご', '가 기 구 게 고');
  add('さ し す せ そ', '사 시 스 세 소');
  add('ざ じ ず ぜ ぞ', '자 지 즈 제 조');
  add('た ち つ て と', '타 치 츠 테 토');
  add('だ ぢ づ で ど', '다 지 즈 데 도');
  add('な に ぬ ね の', '나 니 누 네 노');
  add('は ひ ふ へ ほ', '하 히 후 헤 호');
  add('ば び ぶ べ ぼ', '바 비 부 베 보');
  add('ぱ ぴ ぷ ぺ ぽ', '파 피 푸 페 포');
  add('ま み む め も', '마 미 무 메 모');
  add('や ゆ よ わ を ゔ', '야 유 요 와 오 부');
  add('ら り る れ ろ', '라 리 루 레 로');
  add('ぁ ぃ ぅ ぇ ぉ ゃ ゅ ょ ゎ', '아 이 우 에 오 야 유 요 와');
  add('きゃ きゅ きょ ぎゃ ぎゅ ぎょ', '캬 큐 쿄 갸 규 교');
  add('しゃ しゅ しょ じゃ じゅ じょ', '샤 슈 쇼 자 주 조');
  add('ちゃ ちゅ ちょ ぢゃ ぢゅ ぢょ', '차 추 초 자 주 조');
  add('にゃ にゅ にょ ひゃ ひゅ ひょ', '냐 뉴 뇨 햐 휴 효');
  add('びゃ びゅ びょ ぴゃ ぴゅ ぴょ', '뱌 뷰 뵤 퍄 퓨 표');
  add('みゃ みゅ みょ りゃ りゅ りょ', '먀 뮤 묘 랴 류 료');
  add('てぃ でぃ とぅ どぅ ふぁ ふぃ ふぇ ふぉ', '티 디 투 두 화 휘 훼 훠');
  add('うぃ うぇ うぉ ちぇ しぇ じぇ つぁ', '위 웨 워 체 셰 제 차');
  add('ゔぁ ゔぃ ゔぇ ゔぉ でゅ てゅ ふゅ', '바 비 베 보 듀 튜 퓨');

  function kanaToHangul(src) {
    const s = toHira(src);
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const two = s.substr(i, 2), one = s[i];
      if (K2H[two]) { out += K2H[two]; i++; continue; }
      if (one === 'っ') { const n = addFinal(out, 19); out = n === out ? out : n; continue; }      // ㅅ받침
      if (one === 'ん') {   // 끝·모음·か행/が행 앞은 ㅇ받침(마셍, 고항), 그 밖은 ㄴ받침(센세이)
        const nx = s[i + 1] || '';
        const ng = !nx || /[\sー、。？！?!,.]/.test(nx) || /[あいうえおやゆよわをかきくけこがぎぐげご]/.test(nx);
        const n = addFinal(out, ng ? 21 : 4); out = n === out ? out + '응' : n; continue;
      }
      if (one === 'ー') { out += '-'; continue; }
      if (K2H[one]) { out += K2H[one]; continue; }
      out += one;
    }
    return out;
  }

  /* 띄어쓰기 된 문장용: 조사 は→와, へ→에 로 읽기 (예: にくは たべません → 니쿠와 타베마셍) */
  function sentenceToHangul(src) {
    return String(src || '').split(/(\s+|[、。？！?!,.]+)/).map(chunk => {
      if (!chunk || /^(\s+|[、。？！?!,.]+)$/.test(chunk)) return chunk;
      const h = toHira(chunk), last = h.slice(-1);
      if (h.length > 1 && (last === 'は' || last === 'へ')) return kanaToHangul(chunk.slice(0, -1)) + (last === 'は' ? '와' : '에');
      if (h === 'は') return '와'; if (h === 'へ') return '에';
      return kanaToHangul(chunk);
    }).join('').replace(/、/g, ', ').replace(/。/g, '.').replace(/？/g, '?').replace(/！/g, '!').replace(/\s+/g, ' ').trim();
  }

  /* ---------- 한글 발음 → 히라가나 (입력 도우미, 최선의 추측) ---------- */
  const LCLS = ['g', 'k', 'n', 'd', 't', 'r', 'm', 'b', 'p', 's', 'ss', '', 'j', 'ch', 'ch', 'k', 't', 'p', 'h'];
  const VCLS = ['a', 'e', 'ya', 'e', 'o', 'e', 'yo', 'e', 'o', 'wa', 'e', 'e', 'yo', 'u', 'wo', 'e', 'i', 'yu', 'eu', 'i', 'i'];
  const ORDER = ['a', 'i', 'u', 'eu', 'e', 'o', 'ya', 'yu', 'yo'];
  const ROWS = {
    k: 'か き く く け こ きゃ きゅ きょ', g: 'が ぎ ぐ ぐ げ ご ぎゃ ぎゅ ぎょ',
    s: 'さ し す す せ そ しゃ しゅ しょ', ss: 'さ し す つ せ そ しゃ しゅ しょ',
    j: 'ざ じ じゅ ず ぜ じょ じゃ じゅ じょ', ch: 'ちゃ ち ちゅ つ ちぇ ちょ ちゃ ちゅ ちょ',
    t: 'た ち つ と て と ちゃ ちゅ ちょ', d: 'だ でぃ づ ど で ど ぢゃ ぢゅ ぢょ',
    n: 'な に ぬ ぬ ね の にゃ にゅ にょ', h: 'は ひ ふ ふ へ ほ ひゃ ひゅ ひょ',
    b: 'ば び ぶ ぶ べ ぼ びゃ びゅ びょ', p: 'ぱ ぴ ぷ ぷ ぺ ぽ ぴゃ ぴゅ ぴょ',
    m: 'ま み む む め も みゃ みゅ みょ', r: 'ら り る る れ ろ りゃ りゅ りょ',
    '': 'あ い う う え お や ゆ よ'
  };
  const ROW = {};
  Object.keys(ROWS).forEach(k => { const a = ROWS[k].split(' '); ROW[k] = {}; ORDER.forEach((v, i) => { ROW[k][v] = a[i]; }); });
  const N_FINALS = [4, 5, 6, 16, 21];
  const Q_FINALS = [1, 2, 3, 7, 17, 18, 19, 20, 22, 23, 24, 25, 26];

  function hangulToKana(src) {
    let out = '';
    for (const ch of String(src || '')) {
      if (ch === '-' || ch === 'ー') { out += 'ー'; continue; }
      const d = decompose(ch);
      if (!d) { out += ch; continue; }
      const c = LCLS[d.L]; let v = VCLS[d.V];
      if (v === 'wa') v = c === '' ? 'wa' : 'a';
      if (v === 'wo') v = c === '' ? 'wo' : 'o';
      if (v === 'wa') out += 'わ'; else if (v === 'wo') out += 'を'; else out += ROW[c][v];
      if (N_FINALS.includes(d.T)) out += 'ん';
      else if (Q_FINALS.includes(d.T)) out += 'っ';
    }
    return out;
  }

  /* ---------- 발음 검색 키 (표기가 조금 달라도 같게 취급) ---------- */
  const KEY_L = ['k', 'k', 'n', 't', 't', 'r', 'm', 'p', 'p', 's', 'c', '', 'c', 'c', 'c', 'k', 't', 'p', 'h'];
  const KEY_V = ['a', 'e', 'ya', 'e', 'o', 'e', 'yo', 'e', 'o', 'wa', 'e', 'e', 'yo', 'u', 'o', 'e', 'i', 'yu', 'u', 'i', 'i'];
  const LONG = { a: ['a'], i: ['i'], u: ['u'], e: ['e', 'i'], o: ['o', 'u'] };
  function soundKey(hangulStr) {
    const toks = [];
    for (const ch of String(hangulStr || '')) {
      const d = decompose(ch);
      if (!d) continue;                       // 하이픈(장음), 공백, 기호는 무시
      const t = { c: KEY_L[d.L], v: KEY_V[d.V], n: N_FINALS.includes(d.T) };
      if (t.c === 'c' && t.v[0] === 'y') t.v = t.v.slice(1);   // 쥬/주, 쵸/초 같게
      const p = toks[toks.length - 1];
      if (p && !p.n && t.c === '' && t.v.length === 1 && (LONG[p.v.slice(-1)] || []).includes(t.v)) {
        p.n = t.n || p.n; continue;          // 장음(오우, 에이 등)은 하나로
      }
      toks.push(t);
    }
    return toks.map(t => t.c + t.v + (t.n ? 'N' : '')).join('');
  }
  const kanaKey = kana => soundKey(kanaToHangul(kana));

  /* ---------- 히라가나 읽기 배치: 覚える + おぼえる → {覚|おぼ}える ---------- */
  function toBrace(word, reading) {
    word = String(word || ''); reading = String(reading || '');
    if (!hasKanji(word) || !reading) return word;
    const runs = [];
    for (const ch of word) {
      const k = isKanji(ch);
      if (runs.length && runs[runs.length - 1].k === k) runs[runs.length - 1].s += ch;
      else runs.push({ k, s: ch });
    }
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('^' + runs.map(r => r.k ? '(.+?)' : esc(toHira(r.s))).join('') + '$');
    const m = toHira(reading).match(re);
    if (!m) return `{${word}|${reading}}`;
    let gi = 1;
    return runs.map(r => r.k ? `{${r.s}|${m[gi++]}}` : r.s).join('');
  }
  const escHTML = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const braceToRuby = s => escHTML(s).replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>');
  const rubyHTML = (word, reading) => braceToRuby(toBrace(word, reading));

  G.Kana = { toHira, hasKanji, isKana, isHangul, kanaToHangul, sentenceToHangul, hangulToKana, soundKey, kanaKey, toBrace, braceToRuby, rubyHTML, escHTML };
})(window);
