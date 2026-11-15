/* 간바레간바레니혼고 · 앱 */
(function () {
  'use strict';
  const K = window.Kana, CFG = window.GANBARE_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = K.escHTML;
  const DEMO = new URLSearchParams(location.search).has('demo') || !window.supabase;

  /* =========================================================
     데이터 저장소: Supabase (실제) / 데모 (이 브라우저에만)
     ========================================================= */
  function supabaseStore() {
    const sb = window.supabase.createClient(CFG.url, CFG.key);
    const chk = r => { if (r.error) throw r.error; return r.data; };
    return {
      async session() { const { data } = await sb.auth.getSession(); return !!data.session; },
      async signIn(pw) { chk(await sb.auth.signInWithPassword({ email: CFG.email, password: pw })); },
      async signOut() { await sb.auth.signOut(); },
      async list(table, eq) {
        const out = [];
        for (let from = 0; ; from += 1000) {
          let q = sb.from(table).select('*').order('id', { ascending: true }).range(from, from + 999);
          Object.entries(eq || {}).forEach(([k, v]) => { q = q.eq(k, v); });
          const rows = chk(await q); out.push(...rows);
          if (rows.length < 1000) return out;
        }
      },
      async count(table, eq) {
        let q = sb.from(table).select('*', { count: 'exact', head: true });
        Object.entries(eq || {}).forEach(([k, v]) => { q = q.eq(k, v); });
        const r = await q; if (r.error) throw r.error; return r.count || 0;
      },
      async latest(table, n) { return chk(await sb.from(table).select('*').order('created_at', { ascending: false }).limit(n)); },
      async insert(table, row) { return chk(await sb.from(table).insert(row).select().single()); },
      async insertMany(table, rows) { return chk(await sb.from(table).insert(rows).select()); },
      async update(table, id, patch) { return chk(await sb.from(table).update(patch).eq('id', id).select().single()); },
      async remove(table, id) { chk(await sb.from(table).delete().eq('id', id)); }
    };
  }
  function demoStore() {
    const KEY = 'ganbare-demo-v1';
    let db; try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!db) {
      db = { seq: 1, words: [], word_marks: [], patterns: [], wrong_notes: [], memos: [], memo_comments: [] };
      const now = new Date().toISOString(), d1 = '2026-11-15', d0 = '2026-11-08';
      [['寝る', 'ねる', '자다', '1단 동사', d1, '3과'], ['覚える', 'おぼえる', '외우다', '1단 동사', d1, '3과'], ['かける', 'かける', '(전화를) 걸다', '1단 동사', d1, '3과'],
       ['今朝', 'けさ', '오늘 아침', '명사', d1, '3과'], ['ゆうべ', 'ゆうべ', '어젯밤', '명사', d1, '3과'], ['書く', 'かく', '쓰다', '5단 동사', d0, '2과'],
       ['来る', 'くる', '오다', '불규칙 동사', d0, '2과'], ['高い', 'たかい', '비싸다, 높다', 'い형용사', d0, '2과'], ['静か', 'しずか', '조용함', 'な형용사', d0, '2과']]
        .forEach(([word, reading, meaning, category, study_date, lesson]) => db.words.push({ id: db.seq++, word, reading, pron_ko: K.kanaToHangul(reading), meaning, category, study_date, lesson, memo: '', created_by: '데모', updated_by: '데모', created_at: now, updated_at: now }));
      db.memos.push({ id: db.seq++, tag: '질문', body: 'かける는 1단인데 かく는 5단이죠? 둘이 헷갈려요', pinned: false, created_by: '민지', created_at: now, updated_at: now });
    }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
    const match = (r, eq) => Object.entries(eq || {}).every(([k, v]) => r[k] === v);
    const clone = o => JSON.parse(JSON.stringify(o));
    return {
      async session() { return sessionStorage.getItem('ganbare-demo-in') === '1'; },
      async signIn(pw) { if (!pw) throw new Error('비밀번호'); sessionStorage.setItem('ganbare-demo-in', '1'); },
      async signOut() { sessionStorage.removeItem('ganbare-demo-in'); },
      async list(t, eq) { db[t] = db[t] || []; return clone(db[t].filter(r => match(r, eq))); },
      async count(t, eq) { return db[t].filter(r => match(r, eq)).length; },
      async latest(t, n) { return clone(db[t].slice().reverse().slice(0, n)); },
      async insert(t, row) {
        if (t === 'word_marks' && db[t].some(m => m.word_id === row.word_id && m.nickname === row.nickname && m.kind === row.kind)) throw new Error('duplicate');
        const now = new Date().toISOString(); const r = { id: db.seq++, created_at: now, updated_at: now, ...row }; (db[t] = db[t] || []).push(r); save(); return clone(r);
      },
      async insertMany(t, rows) { const out = []; for (const r of rows) out.push(await this.insert(t, r)); return out; },
      async update(t, id, patch) { const r = db[t].find(x => x.id === id); Object.assign(r, patch, { updated_at: new Date().toISOString() }); save(); return clone(r); },
      async remove(t, id) {
        db[t] = db[t].filter(x => x.id !== id);
        if (t === 'words') db.word_marks = db.word_marks.filter(m => m.word_id !== id);
        if (t === 'memos') db.memo_comments = (db.memo_comments || []).filter(c => c.memo_id !== id);
        save();
      }
    };
  }
  const store = DEMO ? demoStore() : supabaseStore();

  /* =========================================================
     공통
     ========================================================= */
  const CATS = [['명사', 'c-noun'], ['1단 동사', 'c-v1'], ['5단 동사', 'c-v5'], ['불규칙 동사', 'c-vir'], ['い형용사', 'c-ai'], ['な형용사', 'c-na'],
    ['부사', 'c-adv'], ['조사', 'c-pt'], ['관용표현', 'c-ex'], ['의문사', 'c-q'], ['접속사', 'c-cj'], ['기타', 'c-etc']];
  const CAT_CLASS = Object.fromEntries(CATS);
  const DICT_CAT = { n: '명사', v1: '1단 동사', v5: '5단 동사', vx: '불규칙 동사', ai: 'い형용사', na: 'な형용사', ad: '부사', pt: '조사', ex: '관용표현', q: '의문사', cj: '접속사' };
  const catTag = c => `<span class="cat ${CAT_CLASS[c] || 'c-etc'}">${esc(c || '기타')}</span>`;
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtDate = s => { if (!s) return ''; const [, m, d] = s.split('-'); return `${+m}월 ${+d}일`; };
  const fmtDay = s => { if (!s) return ''; const d = new Date(s + 'T00:00:00'); return `${fmtDate(s)} (${'일월화수목금토'[d.getDay()]})`; };
  const ago = iso => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return '방금'; if (s < 3600) return Math.floor(s / 60) + '분 전'; if (s < 86400) return Math.floor(s / 3600) + '시간 전'; if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전'; return fmtDate(iso.slice(0, 10)); };
  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
  function fail(e, what) { console.error(e); toast(`${what} 실패: ${e && e.message ? e.message : '네트워크를 확인해 주세요'}`); }

  /* 음성 */
  let jaVoice = null;
  const pickVoice = () => { try { const v = speechSynthesis.getVoices(); jaVoice = v.find(x => /ja[-_]JP/i.test(x.lang)) || v.find(x => /^ja/i.test(x.lang)) || null; } catch (e) {} };
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text) {
    if (!('speechSynthesis' in window)) { toast('이 브라우저는 음성 기능을 지원하지 않아요'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = 0.85; if (jaVoice) u.voice = jaVoice;
    speechSynthesis.speak(u);
  }

  /* =========================================================
     상태
     ========================================================= */
  const S = {
    me: localStorage.getItem('ganbare-nick') || '',
    words: [], marks: [], sel: new Set(), patterns: [], psel: new Set(),
    pf: { style: 'all', apply: '', date: '', lesson: '', q: '' },
    f: { list: 'all', cat: '', date: '', lesson: '', q: '', sort: 'new' },
    page: 'home'
  };
  const markOf = (wid, kind) => S.marks.find(m => m.word_id === wid && m.kind === kind);
  const prep = w => { w._key = K.kanaKey(w.reading); w._pron = w.pron_ko || K.kanaToHangul(w.reading); return w; };

  /* =========================================================
     로그인
     ========================================================= */
  async function boot() {
    if (DEMO) $('demoBanner').classList.remove('hidden');
    $('lgVer').textContent = (DEMO ? '데모 모드' : '연결: ' + (CFG.url || '').replace('https://', '').split('.')[0] + ' / ' + CFG.email);
    $('lgNick').value = S.me;
    let ok = false; try { ok = await store.session(); } catch (e) {}
    if (ok && S.me) enter(); else showLogin();
  }
  function showLogin() { $('login').classList.remove('hidden'); $('app').classList.add('hidden'); (S.me ? $('lgPw') : $('lgNick')).focus(); }
  $('loginForm').onsubmit = async e => {
    e.preventDefault();
    const nick = $('lgNick').value.trim(), pw = $('lgPw').value;
    if (!nick) { $('lgErr').textContent = '닉네임을 입력해 주세요'; return; }
    $('lgBtn').disabled = true; $('lgErr').textContent = '';
    try {
      await store.signIn(pw);
      S.me = nick; localStorage.setItem('ganbare-nick', nick); $('lgPw').value = '';
      enter();
    } catch (err) {
      const m = (err && err.message) || String(err);
      $('lgErr').textContent = /invalid login credentials/i.test(m) ? '비밀번호가 맞지 않아요 (또는 공용 계정 이메일이 달라요)'
        : /not confirmed/i.test(m) ? '공용 계정이 아직 확인(Confirm)되지 않았어요'
        : /fetch|network/i.test(m) ? '서버에 연결하지 못했어요 (인터넷 또는 파일 여는 방식 확인)'
        : '로그인하지 못했어요';
      $('lgErr').textContent += `  [${m}]`;
    } finally { $('lgBtn').disabled = false; }
  };
  async function enter() {
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    $('meName').textContent = S.me; $('meAv').textContent = S.me.slice(0, 1); $('hiName').textContent = S.me;
    await loadAll();
    go(location.hash.replace('#', '') || 'home');
    if (localStorage.getItem('ganbare-notice') !== 'v1') $('rm').classList.add('on');
  }
  $('me').onclick = e => {
    if (e.target.closest('#meMenu')) { $('meMenu').classList.add('hidden'); return; }   // 메뉴 항목은 그대로 처리되게
    e.stopPropagation(); $('meMenu').classList.toggle('hidden');
  };
  document.addEventListener('click', () => $('meMenu').classList.add('hidden'));
  $('mnNick').onclick = async () => {
    const n = (prompt('새 닉네임을 입력하세요', S.me) || '').trim().slice(0, 12);
    if (!n || n === S.me) return;
    S.me = n; localStorage.setItem('ganbare-nick', n);
    $('meName').textContent = n; $('meAv').textContent = n.slice(0, 1); $('hiName').textContent = n;
    await loadMarks(); drawAll(); toast('닉네임을 바꿨어요. ⭐ 표시는 닉네임별로 따로 저장돼요');
  };
  $('mnOut').onclick = async () => { await store.signOut(); showLogin(); };

  /* =========================================================
     데이터 불러오기
     ========================================================= */
  async function loadWords() { S.words = (await store.list('words')).map(prep); }
  async function loadMarks() { S.marks = await store.list('word_marks', { nickname: S.me }); }
  async function loadPatterns() { S.patterns = await store.list('patterns'); }
  async function loadAll() {
    try { await Promise.all([loadWords(), loadMarks(), loadPatterns(), loadNotes(), loadMemos(), loadComments()]); } catch (e) { fail(e, '불러오기'); }
    drawAll(); loadHomeExtras();
  }
  async function loadHomeExtras() {
    try {
      const memos = await store.latest('memos', 2);
      $('recentMemos').innerHTML = memos.length ? memos.map(m => `<div class="m"><span class="tagm ${m.tag === '질문' ? 'q' : m.tag === '헷갈림' ? 'h' : 's'}">${esc(m.tag)}</span>${esc(m.body)}<div class="who">${esc(m.created_by || '')} · ${ago(m.created_at)}${cmtsOf(m.id).length ? ' · 💬 ' + cmtsOf(m.id).length : ''}</div></div>`).join('')
        : '<div class="muted">아직 메모가 없어요.</div>';
    } catch (e) { console.error(e); }
  }
  const latestDate = () => S.words.concat(S.patterns).map(w => w.study_date).filter(Boolean).sort().pop() || '';
  const lessonsOf = list => [...new Set(list.map(x => x.lesson).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  const lessonOpts = (list, cur) => { const ls = lessonsOf(list); return `<option value="">${ls.length ? '모든 교재 과' : '교재 과 (아직 없음)'}</option>` + ls.map(l => `<option ${l === cur ? 'selected' : ''}>${esc(l)}</option>`).join(''); };
  const styleBadge = st => `<span class="badge ${st === '존댓말' ? 'jon' : st === '공통' ? 'com' : 'ban'}">${esc(st)}</span>`;

  /* =========================================================
     화면 전환
     ========================================================= */
  function go(p) {
    if (!$('p-' + p)) p = 'home';
    if (p === 'flash' && !FC.cards.length) p = 'words';
    S.page = p;
    document.querySelectorAll('.page').forEach(e => e.classList.toggle('on', e.id === 'p-' + p));
    document.querySelectorAll('#tabs button,#bottom button').forEach(b => b.classList.toggle('on', b.dataset.p === (p === 'flash' ? 'words' : p)));
    if (location.hash !== '#' + p) history.replaceState(null, '', '#' + p);
    if (p === 'guide') drawGuide();
    if (p === 'test') { if (!$('tSetup').classList.contains('hidden')) drawTestSetup(); if (!$('ptSetup').classList.contains('hidden')) drawPT(); }
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('#tabs button,#bottom button').forEach(b => b.onclick = () => go(b.dataset.p));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'addWord') { go('words'); openWord(); }
    if (act === 'addPattern') { go('patterns'); openPattern(); }
    if (act === 'seedPatterns') seedPatterns();
    if (act === 'pasteWrong') { go('wrong'); $('nPaste').classList.remove('hidden'); $('nText').focus(); }
    if (act === 'patTest') { go('test'); setTMode('pat'); }
    if (act === 'goWordTest') { go('test'); setTMode('word'); }
    if (act === 'openExport') openExport();
    if (act === 'flashHard') { const ws = S.words.filter(w => markOf(w.id, 'hard')); if (!ws.length) { toast('⭐ 표시한 단어가 아직 없어요'); return; } openFlash(ws); return; }
    if (act === 'myHard') { S.f = { ...S.f, list: 'hard', cat: '', date: '', lesson: '', q: '' }; $('wQ').value = ''; go('words'); drawWords(); }
    if (act === 'recentToWords') { S.f = { ...S.f, list: 'all', cat: '', date: latestDate(), lesson: '', q: '' }; $('wQ').value = ''; go('words'); drawWords(); }
  });

  function drawAll() {
    drawHome(); drawWords(); drawPatterns(); drawNotes(); drawMemos();
    if (!$('tSetup').classList.contains('hidden')) drawTestSetup();
    if (!$('ptSetup').classList.contains('hidden')) drawPT();
  }

  /* =========================================================
     홈
     ========================================================= */
  function drawHome() {
    $('stWords').textContent = S.words.length;
    $('stHard').textContent = S.marks.filter(m => m.kind === 'hard').length;
    const d = latestDate();
    $('recentDate').textContent = d ? fmtDay(d) : '';
    const ws = S.words.filter(w => w.study_date === d);
    $('stPatterns').textContent = S.patterns.length;
    $('stWrong').textContent = (S.notes || []).filter(n => n.created_by === S.me && !n.resolved).length;
    const ps = S.patterns.filter(p => d && p.study_date === d);
    $('recentPats').innerHTML = ps.map(p => `<li><span class="jp">${esc(p.form)}</span>${styleBadge(p.style)}<span>${esc(p.meaning)}</span></li>`).join('');
    $('recentChips').innerHTML = ws.length ? ws.slice(0, 24).map(w => `<span class="chip"><b>${esc(w.reading)}</b>${esc(w.meaning)}</span>`).join('') + (ws.length > 24 ? `<span class="chip">+${ws.length - 24}</span>` : '')
      : (ps.length ? '' : '<div class="muted">아직 등록된 단어가 없어요. ＋ 단어 등록으로 시작해 보세요.</div>');
  }

  /* =========================================================
     단어장
     ========================================================= */
  function matchQuery(w, q) {
    if (!q) return 0;
    const ql = q.toLowerCase();
    let s = 0;
    if (w.meaning.includes(q)) s = Math.max(s, 90);
    if (w.word.includes(q) || w.reading.includes(K.toHira(q))) s = Math.max(s, 95);
    if (w._pron.replace(/-/g, '').includes(q.replace(/-/g, ''))) s = Math.max(s, 85);
    if (w.memo && w.memo.includes(q)) s = Math.max(s, 30);
    if (K.isHangul(q)) {
      const qk = K.soundKey(q);
      if (qk.length >= 2) {
        if (w._key === qk) s = Math.max(s, 88);
        else if (w._key.startsWith(qk)) s = Math.max(s, 70);
        else if (qk.length >= 5 && w._key[0] === qk[0] && near(w._key, qk)) s = Math.max(s, 55);
      }
    }
    return ql ? s : 0;
  }
  // 점수순 정렬 + 확실한 결과가 있으면 애매한 결과는 빼기
  function trim(scored, tie) {
    const ok = scored.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1] || (tie ? tie(a, b) : 0));
    const top = ok.length ? ok[0][1] : 0;
    return top >= 85 ? ok.filter(x => x[1] >= 70) : ok;
  }
  function near(a, b) { // 편집 거리 1~2 이내
    const lim = b.length >= 7 ? 2 : 1;
    if (Math.abs(a.length - b.length) > lim) return false;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length] <= lim;
  }

  function visibleWords() {
    const f = S.f;
    let rows = S.words.filter(w =>
      (f.list === 'all' || markOf(w.id, f.list)) &&
      (!f.cat || w.category === f.cat) && (!f.date || w.study_date === f.date) && (!f.lesson || w.lesson === f.lesson));
    if (f.q) {
      rows = trim(rows.map(w => [w, matchQuery(w, f.q)])).map(x => x[0]);
    } else if (f.sort === 'kana') rows.sort((a, b) => K.toHira(a.reading).localeCompare(K.toHira(b.reading), 'ja'));
    else if (f.sort === 'ko') rows.sort((a, b) => a.meaning.localeCompare(b.meaning, 'ko'));
    else rows.sort((a, b) => (b.study_date || '').localeCompare(a.study_date || '') || b.id - a.id);
    return rows;
  }

  function drawWords() {
    const f = S.f;
    const cnt = { all: S.words.length, hard: S.marks.filter(m => m.kind === 'hard').length, wrong: S.marks.filter(m => m.kind === 'wrong').length };
    $('wLists').innerHTML = [['all', '전체'], ['hard', '⭐ 내가 안 외워지는 단어'], ['wrong', '❌ 내가 틀린 단어']]
      .map(([k, l]) => `<button class="${f.list === k ? 'on' : ''}" data-list="${k}">${l}<span class="c">${cnt[k]}</span></button>`).join('');

    const dates = [...new Set(S.words.map(w => w.study_date).filter(Boolean))].sort().reverse();
    $('wDate').innerHTML = `<option value="">모든 수업 날짜</option>` + dates.map(d => `<option value="${d}" ${d === f.date ? 'selected' : ''}>${fmtDate(d)}</option>`).join('');
    const lessons = [...new Set(S.words.map(w => w.lesson).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    $('wLesson').innerHTML = lessonOpts(S.words, f.lesson);
    $('lessonList').innerHTML = lessons.map(l => `<option value="${esc(l)}">`).join('');
    $('wSort').value = f.sort;

    const base = S.words.filter(w => (f.list === 'all' || markOf(w.id, f.list)) && (!f.date || w.study_date === f.date) && (!f.lesson || w.lesson === f.lesson));
    $('wCats').innerHTML = `<button class="${f.cat === '' ? 'on' : ''}" data-cat="">전체 품사 ${base.length}</button>` +
      CATS.map(([c]) => { const n = base.filter(w => w.category === c).length; return n ? `<button class="${f.cat === c ? 'on' : ''}" data-cat="${c}">${c} ${n}</button>` : ''; }).join('');

    const rows = visibleWords();
    S.visible = rows;
    const who = w => `등록: ${w.created_by || '-'}${w.updated_by && w.updated_by !== w.created_by ? ' · 수정: ' + w.updated_by : ''}`;
    const star = w => `<button class="starb ${markOf(w.id, 'hard') ? 'on' : ''}" data-star="${w.id}" title="안 외워지는 단어">★</button>`;
    const doneBtn = w => markOf(w.id, 'wrong') ? `<button class="markx" data-unwrong="${w.id}" title="다 외웠어요 (틀린 단어에서 빼기)">✅ 외웠어요</button>` : '';
    const lessonTxt = w => [w.lesson, fmtDate(w.study_date)].filter(Boolean).join(' · ');

    if (!rows.length) {
      const msg = S.words.length ? (f.list !== 'all' && !f.q ? (f.list === 'hard' ? '⭐ 표시한 단어가 없어요. 단어 옆 ★을 눌러 모아 보세요.' : '틀린 단어가 없어요. 단어 테스트에서 틀리면 여기에 모여요.') : '조건에 맞는 단어가 없어요.')
        : '아직 등록된 단어가 없어요.';
      $('wBody').innerHTML = `<tr><td colspan="7"><div class="empty"><b>텅 비었어요</b>${msg}</div></td></tr>`;
      $('wCards').innerHTML = `<div class="card empty"><b>텅 비었어요</b>${msg}</div>`;
    } else {
      $('wBody').innerHTML = rows.map(w => `<tr title="${esc(who(w))}">
        <td><input type="checkbox" data-sel="${w.id}" ${S.sel.has(w.id) ? 'checked' : ''}></td>
        <td>${star(w)}</td>
        <td><span class="w-jp jp">${K.rubyHTML(w.word, w.reading)}</span> <span class="w-pron">${esc(w._pron)}</span></td>
        <td>${esc(w.meaning)}${w.memo ? `<div class="w-memo">${esc(w.memo)}</div>` : ''}</td>
        <td>${catTag(w.category)}</td><td class="muted">${esc(lessonTxt(w))}</td>
        <td style="text-align:right;white-space:nowrap">${doneBtn(w)}<button class="icon" data-say="${w.id}" title="듣기">🔊</button><button class="icon" data-edit="${w.id}" title="수정">✏️</button></td></tr>`).join('');
      $('wCards').innerHTML = rows.map(w => `<div class="wcard">
        <input type="checkbox" data-sel="${w.id}" ${S.sel.has(w.id) ? 'checked' : ''}>
        <div class="mid" data-edit="${w.id}"><div class="w-jp jp">${K.rubyHTML(w.word, w.reading)}</div>
          <div class="row2">${esc(w.meaning)} ${catTag(w.category)} <span class="w-pron">${esc(w._pron)}</span></div>
          ${w.memo ? `<div class="w-memo">${esc(w.memo)}</div>` : ''}${doneBtn(w) ? `<div style="margin-top:4px">${doneBtn(w)}</div>` : ''}</div>
        ${star(w)}<button class="icon" data-say="${w.id}">🔊</button></div>`).join('');
    }
    updSel();
  }
  function updSel() {
    [...S.sel].forEach(id => { if (!S.words.some(w => w.id === id)) S.sel.delete(id); });
    $('wSelN').textContent = S.sel.size;
    const vis = S.visible || [];
    $('wAll').checked = vis.length > 0 && vis.every(w => S.sel.has(w.id));
  }

  $('wLists').onclick = e => { const b = e.target.closest('[data-list]'); if (b) { S.f.list = b.dataset.list; S.f.cat = ''; drawWords(); } };
  $('wCats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { S.f.cat = b.dataset.cat; drawWords(); } };
  $('wDate').onchange = e => { S.f.date = e.target.value; drawWords(); };
  $('wLesson').onchange = e => { S.f.lesson = e.target.value; drawWords(); };
  $('wSort').onchange = e => { S.f.sort = e.target.value; drawWords(); };
  let qT; $('wQ').oninput = e => { clearTimeout(qT); qT = setTimeout(() => { S.f.q = e.target.value.trim(); drawWords(); }, 150); };
  $('wRefresh').onclick = async () => { await loadAll(); toast('최신 내용으로 새로고침했어요'); };
  $('wAll').onchange = e => { (S.visible || []).forEach(w => e.target.checked ? S.sel.add(w.id) : S.sel.delete(w.id)); drawWords(); };
  $('wTest').onclick = () => {
    if (!S.sel.size) { toast('테스트할 단어를 먼저 체크해 주세요'); return; }
    T.sel = new Set(S.sel); T.f = { list: 'all', cat: '', date: '', lesson: '' }; go('test'); setTMode('word');
    toast(`단어 ${S.sel.size}개를 골라 왔어요. 테스트 유형을 정하세요`);
  };
  $('wPrompt').onclick = () => {
    if (!S.sel.size) { toast('문제에 쓸 단어를 먼저 체크해 주세요'); return; }
    PT.wsel = new Set(S.sel); go('test'); setTMode('pat');
    toast(`단어 ${S.sel.size}개를 골라 왔어요. 문형을 고르세요`);
  };
  $('wBulkStar').onclick = async () => {
    const ids = [...S.sel].filter(id => !markOf(id, 'hard'));
    if (!S.sel.size) { toast('먼저 단어를 선택해 주세요'); return; }
    try { for (const id of ids) S.marks.push(await store.insert('word_marks', { word_id: id, nickname: S.me, kind: 'hard' })); toast(`⭐ ${ids.length}개 표시했어요`); }
    catch (e) { fail(e, '표시'); }
    drawAll();
  };

  async function toggleMark(id, kind) {
    const m = markOf(id, kind);
    try {
      if (m) { await store.remove('word_marks', m.id); S.marks = S.marks.filter(x => x !== m); }
      else S.marks.push(await store.insert('word_marks', { word_id: id, nickname: S.me, kind }));
    } catch (e) { fail(e, '표시'); }
    drawAll();
  }
  const wordsArea = e => {
    const t = e.target;
    const sel = t.closest('[data-sel]'); if (sel) { const id = +sel.dataset.sel; sel.checked ? S.sel.add(id) : S.sel.delete(id); updSel(); return; }
    const st = t.closest('[data-star]'); if (st) { toggleMark(+st.dataset.star, 'hard'); return; }
    const uw = t.closest('[data-unwrong]'); if (uw) { toggleMark(+uw.dataset.unwrong, 'wrong'); toast('틀린 단어에서 뺐어요'); return; }
    const sy = t.closest('[data-say]'); if (sy) { const w = S.words.find(x => x.id === +sy.dataset.say); if (w) speak(w.reading); return; }
    const ed = t.closest('[data-edit]'); if (ed) { const w = S.words.find(x => x.id === +ed.dataset.edit); if (w) openWord(w); }
  };
  $('wBody').onclick = wordsArea; $('wCards').onclick = wordsArea;

  /* =========================================================
     단어 등록/수정 창
     ========================================================= */
  let DICT = null;
  function dict() {
    if (DICT) return DICT;
    DICT = [];
    Object.entries(window.DICT_RAW || {}).forEach(([lv, txt]) => txt.trim().split('\n').forEach(line => {
      const [word, r, meaning, c] = line.split('|');
      const reading = r || word;
      DICT.push(prep({ word, reading, meaning, category: DICT_CAT[c] || '기타', lv, pron_ko: '' }));
    }));
    return DICT;
  }
  $('fCat').innerHTML = CATS.map(([c]) => `<option>${c}</option>`).join('');

  let editing = null, pronTouched = false, readingAuto = false;
  function openWord(w) {
    editing = w || null;
    $('wmTitle').textContent = w ? '단어 수정' : '단어 등록';
    $('wmSub').textContent = w ? `등록: ${w.created_by || '-'}${w.updated_by ? ' · 마지막 수정: ' + w.updated_by : ''}` : '사전에서 찾아 고르거나, 아래 칸에 직접 입력하세요.';
    $('wmFind').classList.toggle('hidden', !!w);
    $('wmFormTitle').textContent = w ? '내용 수정' : '직접 입력 · 확인';
    $('wmDel').classList.toggle('hidden', !w);
    $('wmSave').textContent = w ? '저장' : '등록';
    $('wmErr').textContent = '';
    $('dQ').value = ''; $('dRes').innerHTML = '';
    fill(w || { word: '', reading: '', pron_ko: '', meaning: '', category: '명사', lesson: localStorage.getItem('ganbare-lesson') || '', study_date: localStorage.getItem('ganbare-date') || today(), memo: '' });
    pronTouched = !!(w && w.pron_ko); readingAuto = false;
    $('wm').classList.add('on');
    setTimeout(() => (w ? $('fMeaning') : $('dQ')).focus(), 50);
  }
  function fill(w) {
    $('fWord').value = w.word === w.reading ? '' : (w.word || '');
    $('fReading').value = w.reading || ''; $('fPron').value = w.pron_ko || (w.reading ? K.kanaToHangul(w.reading) : '');
    $('fMeaning').value = w.meaning || ''; $('fCat').value = w.category || '명사';
    if (w.lesson !== undefined) $('fLesson').value = w.lesson || '';
    if (w.study_date !== undefined) $('fDate').value = w.study_date || '';
    if (w.memo !== undefined) $('fMemo').value = w.memo || '';
    $('fPronNote').classList.add('hidden');
    preview();
  }
  function preview() {
    const reading = $('fReading').value.trim(), word = $('fWord').value.trim() || reading;
    $('pvJp').innerHTML = reading ? K.rubyHTML(word, reading) : '<span class="muted" style="font-size:14px">여기에 미리 보여요</span>';
    $('pvKo').textContent = $('fMeaning').value.trim();
  }
  function closeWord() { $('wm').classList.remove('on'); hideKbd(); editing = null; }
  $('wmCancel').onclick = closeWord;
  $('wm').onclick = e => { if (e.target.id === 'wm') closeWord(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('wm').classList.contains('on')) closeWord(); });
  $('pvSay').onclick = () => { const r = $('fReading').value.trim(); if (r) speak(r); };

  $('fReading').oninput = () => { readingAuto = false; if (!pronTouched) $('fPron').value = K.kanaToHangul($('fReading').value.trim()); $('fPronNote').classList.add('hidden'); preview(); };
  $('fPron').oninput = () => {
    pronTouched = !!$('fPron').value.trim();
    if (!$('fReading').value.trim() || readingAuto) {
      const k = K.hangulToKana($('fPron').value.trim());
      $('fReading').value = k; readingAuto = !!k;
      $('fPronNote').classList.toggle('hidden', !k);
    }
    preview();
  };
  $('fWord').oninput = preview; $('fMeaning').oninput = preview;

  /* 사전 검색 */
  function dictSearch(q) {
    q = q.trim(); if (!q) return [];
    return trim(dict().map(w => [w, matchQuery(w, q)]), (a, b) => (a[0].lv > b[0].lv ? -1 : 1)).slice(0, 12).map(x => x[0]);
  }
  let dT;
  $('dQ').oninput = () => { clearTimeout(dT); dT = setTimeout(drawDict, 120); };
  function drawDict() {
    const q = $('dQ').value.trim(), res = dictSearch(q);
    if (!q) { $('dRes').innerHTML = ''; return; }
    $('dRes').innerHTML = res.length ? res.map((w, i) => {
      const have = S.words.some(x => x.word === w.word && x.reading === w.reading);
      return `<button class="res" data-pick="${i}"><span class="jpw jp">${K.rubyHTML(w.word, w.reading)}</span>
        <span class="info">${esc(w.meaning)}<div class="muted">${esc(w._pron)} · ${w.category}<span class="lv">${w.lv}</span>${have ? ' · <b style="color:var(--accent)">이미 단어장에 있음</b>' : ''}</div></span>
        <span class="icon" data-dsay="${i}">🔊</span></button>`;
    }).join('') : `<div class="hint">사전에 없는 단어예요. 아래 칸에 직접 입력해 주세요.<br>한글 발음을 쓰면 히라가나가 자동으로 채워져요.</div>`;
    $('dRes')._res = res;
  }
  $('dRes').onclick = e => {
    const res = $('dRes')._res || [];
    const s = e.target.closest('[data-dsay]'); if (s) { e.stopPropagation(); speak(res[+s.dataset.dsay].reading); return; }
    const p = e.target.closest('[data-pick]'); if (!p) return;
    const w = res[+p.dataset.pick];
    document.querySelectorAll('#dRes .res').forEach(r => r.classList.toggle('picked', r === p));
    fill({ word: w.word, reading: w.reading, pron_ko: w._pron, meaning: w.meaning, category: w.category });
    pronTouched = false; readingAuto = false;
    $('wmFormTitle').textContent = '사전에서 가져왔어요 · 확인 후 등록하세요';
  };

  $('wmSave').onclick = async () => {
    const reading = $('fReading').value.trim(), meaning = $('fMeaning').value.trim();
    const row = {
      word: $('fWord').value.trim() || reading, reading, pron_ko: $('fPron').value.trim() || K.kanaToHangul(reading),
      meaning, category: $('fCat').value, lesson: $('fLesson').value.trim() || null, study_date: $('fDate').value || null,
      memo: $('fMemo').value.trim() || null, updated_by: S.me
    };
    if (!reading) { $('wmErr').textContent = '읽기(히라가나·가타카나)를 입력해 주세요. 한글 발음을 쓰면 자동으로 채워지고, 옆의 あ/ア 자판으로도 입력할 수 있어요'; return; }
    if (!K.isKana(reading)) { $('wmErr').textContent = '읽기 칸에는 히라가나·가타카나만 써 주세요. 옆의 あ/ア 자판 버튼을 누르면 클릭으로 입력할 수 있어요.'; return; }
    if (!meaning) { $('wmErr').textContent = '한국어 뜻을 입력해 주세요'; return; }
    if (!editing && S.words.some(x => x.word === row.word && x.reading === row.reading) && !confirm('이미 단어장에 있는 단어예요. 그래도 등록할까요?')) return;
    $('wmSave').disabled = true;
    try {
      if (editing) {
        const r = prep(await store.update('words', editing.id, row));
        S.words = S.words.map(x => x.id === r.id ? r : x); toast('수정했어요');
      } else {
        const r = prep(await store.insert('words', { ...row, created_by: S.me }));
        S.words.push(r); toast(`「${r.word}」 등록했어요`);
        if (row.study_date) localStorage.setItem('ganbare-date', row.study_date);
        localStorage.setItem('ganbare-lesson', row.lesson || '');
      }
      const keepOpen = !editing;
      drawAll();
      if (keepOpen) { openWord(); $('wmSub').textContent = '계속해서 다음 단어를 등록할 수 있어요. 다 했으면 취소를 누르세요.'; }
      else closeWord();
    } catch (e) { fail(e, '저장'); }
    finally { $('wmSave').disabled = false; }
  };
  $('wmDel').onclick = async () => {
    if (!editing || !confirm(`「${editing.word}」를 단어장에서 삭제할까요?\n스터디원 모두의 단어장에서 사라져요.`)) return;
    try {
      await store.remove('words', editing.id);
      S.words = S.words.filter(x => x.id !== editing.id); S.marks = S.marks.filter(m => m.word_id !== editing.id);
      toast('삭제했어요'); closeWord(); drawAll();
    } catch (e) { fail(e, '삭제'); }
  };

  /* =========================================================
     단어 테스트
     ========================================================= */
  const VERBS = ['1단 동사', '5단 동사', '불규칙 동사'];
  const TT_NAME = { j2k: '일본어 보고 뜻 고르기', k2j: '뜻 보고 일본어 고르기', verb: '동사 구분', match: '비슷한 발음 짝 맞추기' };
  const T = { sel: new Set(), f: { list: 'all', cat: '', date: '', lesson: '' }, type: 'j2k', qs: [], idx: 0, res: {}, answered: false, cur: null, lastIds: [] };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const NUM = ['①', '②', '③', '④', '⑤'];
  function lev(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }
  const sameW = (a, b) => a.word === b.word && a.reading === b.reading;

  /* 문제 수: 선택지 + 직접 입력 (잘못된 값이면 -1) */
  function countOf(selId, inId) {
    if ($(selId).value !== 'custom') return +$(selId).value;
    const v = parseInt($(inId).value, 10), max = +$(inId).max || 500;
    return v >= 1 && v <= max ? v : -1;
  }
  [['tCount', 'tCountIn'], ['ptCount', 'ptCountIn']].forEach(([sid, iid]) => {
    $(sid).addEventListener('change', () => { const c = $(sid).value === 'custom'; $(iid).classList.toggle('hidden', !c); if (c) $(iid).focus(); });
  });

  /* 설정 화면 */
  function tBase() {
    const f = T.f;
    return S.words.filter(w => (f.list === 'all' || markOf(w.id, f.list)) && (!f.cat || w.category === f.cat) && (!f.date || w.study_date === f.date) && (!f.lesson || w.lesson === f.lesson));
  }
  function drawTestSetup() {
    const f = T.f;
    [...T.sel].forEach(id => { if (!S.words.some(w => w.id === id)) T.sel.delete(id); });
    const cnt = { all: S.words.length, hard: S.marks.filter(m => m.kind === 'hard').length, wrong: S.marks.filter(m => m.kind === 'wrong').length };
    $('tLists').innerHTML = [['all', '전체'], ['hard', '⭐ 안 외워지는 단어'], ['wrong', '❌ 틀린 단어']]
      .map(([k, l]) => `<button class="${f.list === k ? 'on' : ''}" data-tlist="${k}">${l}<span class="c">${cnt[k]}</span></button>`).join('');
    $('tCat').innerHTML = `<option value="">모든 품사</option>` + CATS.map(([c]) => `<option ${c === f.cat ? 'selected' : ''}>${c}</option>`).join('');
    const dates = [...new Set(S.words.map(w => w.study_date).filter(Boolean))].sort().reverse();
    $('tDate').innerHTML = `<option value="">모든 수업 날짜</option>` + dates.map(d => `<option value="${d}" ${d === f.date ? 'selected' : ''}>${fmtDate(d)}</option>`).join('');
    const lessons = [...new Set(S.words.map(w => w.lesson).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    $('tLesson').innerHTML = lessonOpts(S.words, f.lesson);
    const base = tBase();
    $('tChips').innerHTML = base.length ? base.map(w => `<button class="tchip ${T.sel.has(w.id) ? 'on' : ''}" data-tpick="${w.id}"><b>${esc(w.reading)}</b>${esc(w.meaning)}</button>`).join('')
      : '<div class="muted">조건에 맞는 단어가 없어요.</div>';
    const picked = S.words.filter(w => T.sel.has(w.id));
    const nv = picked.filter(w => VERBS.includes(w.category)).length;
    $('tSelInfo').textContent = `· ${picked.length}개 선택됨 (동사 ${nv}개)`;
    document.querySelectorAll('#tTypes [data-tt]').forEach(b => b.classList.toggle('on', b.dataset.tt === T.type));
    const fv = $('tFormat').value;
    $('tFormat').disabled = T.type === 'match';
    $('tFormatNote').textContent = T.type === 'match' ? '· 짝 맞추기는 보기 형식과 상관없어요' : T.type === 'verb' && (fv === '4' || fv === '5') ? '· 동사 구분은 1단·5단·불규칙 3지선다로 나와요' : '';
    $('tErr').textContent = '';
  }
  $('tLists').onclick = e => { const b = e.target.closest('[data-tlist]'); if (b) { T.f.list = b.dataset.tlist; drawTestSetup(); } };
  $('tCat').onchange = e => { T.f.cat = e.target.value; drawTestSetup(); };
  $('tDate').onchange = e => { T.f.date = e.target.value; drawTestSetup(); };
  $('tLesson').onchange = e => { T.f.lesson = e.target.value; drawTestSetup(); };
  $('tPickAll').onclick = () => { tBase().forEach(w => T.sel.add(w.id)); drawTestSetup(); };
  $('tPickNone').onclick = () => { T.sel.clear(); drawTestSetup(); };
  $('tChips').onclick = e => { const b = e.target.closest('[data-tpick]'); if (!b) return; const id = +b.dataset.tpick; T.sel.has(id) ? T.sel.delete(id) : T.sel.add(id); drawTestSetup(); };
  $('tTypes').onclick = e => { const b = e.target.closest('[data-tt]'); if (b) { T.type = b.dataset.tt; drawTestSetup(); } };
  $('tFormat').onchange = () => drawTestSetup();
  $('tPron').onchange = e => document.body.classList.toggle('no-tpron', !e.target.checked);
  ['tFormat', 'ptFormat'].forEach(id => { const v = localStorage.getItem('ganbare-' + id); if (v) $(id).value = v; $(id).addEventListener('change', e => localStorage.setItem('ganbare-' + id, e.target.value)); });
  ['tAuto', 'tPron'].forEach(id => { const v = localStorage.getItem('ganbare-' + id); if (v !== null) $(id).checked = v === '1'; $(id).addEventListener('change', e => localStorage.setItem('ganbare-' + id, e.target.checked ? '1' : '0')); });
  document.body.classList.toggle('no-tpron', !$('tPron').checked);

  function tShow(view) { ['tSetup', 'tQuiz', 'tMatch', 'tResult'].forEach(v => $(v).classList.toggle('hidden', v !== view)); window.scrollTo({ top: 0 }); }
  $('tStart').onclick = () => startTest([...T.sel]);
  function startTest(ids) {
    let words = S.words.filter(w => ids.includes(w.id));
    if (T.type === 'verb') words = words.filter(w => VERBS.includes(w.category));
    if (!words.length) { $('tErr').textContent = T.type === 'verb' ? '고른 단어 중에 동사(1단·5단·불규칙)가 없어요.' : '테스트할 단어를 먼저 골라 주세요.'; tShow('tSetup'); return; }
    const n = countOf('tCount', 'tCountIn');
    if (n < 0) { $('tErr').textContent = '문제 수를 1 이상의 숫자로 입력해 주세요.'; tShow('tSetup'); return; }
    words = shuffle(words); if (n) words = words.slice(0, n);
    T.format = $('tFormat').value;
    T.lastIds = ids; T.res = {}; T.idx = 0; T.inTest = new Set(words.map(w => w.id));
    if (T.type === 'match') { T.rounds = buildRounds(words); tShow('tMatch'); drawRound(); return; }
    T.qs = words.map(w => makeQ(w));
    tShow('tQuiz'); drawQ();
  }

  /* 보기 만들기: 같은 품사 → 단어장 → 내장 사전 순서로 그럴듯한 오답 */
  function distractors(w, k, key) {
    const pool = [];
    const add = list => list.forEach(x => { if (!sameW(x, w) && x[key] !== w[key] && !pool.some(p => p[key] === x[key])) pool.push(x); });
    add(shuffle(S.words.filter(x => x.category === w.category)));
    if (pool.length < k) add(shuffle(dict().filter(x => x.category === w.category)));
    if (pool.length < k) add(shuffle(S.words.concat(dict())));
    return pool.slice(0, k);
  }
  function makeQ(w) {
    const f = T.format, ox = f === 'ox', truth = Math.random() < 0.5;
    const oxOpts = t => [{ ox: 'O', correct: t }, { ox: 'X', correct: !t }];
    if (T.type === 'verb') {
      if (!ox) return { w, opts: VERBS.map(c => ({ c, correct: c === w.category })) };
      const claim = truth ? w.category : shuffle(VERBS.filter(c => c !== w.category))[0];
      return { w, ox: true, claim: { c: claim }, opts: oxOpts(truth) };
    }
    const key = T.type === 'j2k' ? 'meaning' : 'reading';
    if (ox) { const claim = truth ? w : (distractors(w, 1, key)[0] || w); return { w, ox: true, claim: { x: claim }, opts: oxOpts(claim === w) }; }
    const n = +f || 5;
    return { w, opts: shuffle([{ x: w, correct: true }].concat(distractors(w, n - 1, key).map(x => ({ x, correct: false })))) };
  }
  const jpBlock = (w, cls) => `<span class="${cls} jp">${K.rubyHTML(w.word, w.reading)}</span>`;

  function drawQ() {
    const q = T.qs[T.idx], w = q.w; T.answered = false;
    $('tPt').textContent = `${T.idx + 1} / ${T.qs.length}`;
    $('tPb').style.width = (T.idx / T.qs.length * 100) + '%';
    $('tPs').textContent = `${Object.values(T.res).filter(Boolean).length}점`;
    $('tQno').textContent = `Q${T.idx + 1} · ${TT_NAME[T.type]}`;
    if (T.type === 'j2k') {
      $('tAsk').textContent = '이 단어의 뜻은?';
      $('tQ').innerHTML = `${jpBlock(w, 'big')} <button class="icon" data-tsay title="듣기">🔊</button><div class="p tp">${esc(w._pron)}</div>`;
    } else if (T.type === 'k2j') {
      $('tAsk').textContent = '이 뜻에 맞는 일본어는?';
      $('tQ').innerHTML = `<div class="bigk">${esc(w.meaning)}</div>`;
    } else {
      $('tAsk').textContent = '이 동사는 어떤 동사일까요?';
      $('tQ').innerHTML = `${jpBlock(w, 'big')} <button class="icon" data-tsay title="듣기">🔊</button><div class="p tp">${esc(w._pron)} · ${esc(w.meaning)}</div>`;
    }
    if (q.ox) {
      const c = q.claim;
      if (T.type === 'j2k') { $('tAsk').textContent = '이 단어의 뜻이 맞을까요?'; $('tQ').innerHTML += `<div class="claim">뜻: <b>${esc(c.x.meaning)}</b></div>`; }
      else if (T.type === 'k2j') { $('tAsk').textContent = '이 뜻의 일본어가 맞을까요?'; $('tQ').innerHTML += `<div class="claim">${jpBlock(c.x, 'oj')} <button class="icon" data-tclaim title="듣기">🔊</button><div class="p tp">${esc(c.x._pron)}</div></div>`; }
      else { $('tAsk').textContent = '이 동사의 종류가 맞을까요?'; $('tQ').innerHTML += `<div class="claim">→ <b>${c.c}</b></div>`; }
    }
    $('tOpts').className = 'opts' + (q.ox ? ' ox' : '');
    $('tOpts').innerHTML = q.opts.map((o, i) => {
      let inner;
      if (o.ox) inner = `<span class="oxk">${o.ox === 'O' ? '⭕ 맞다' : '❌ 틀리다'}</span>`;
      else if (T.type === 'verb') inner = `<span class="ok2">${o.c}</span>`;
      else if (T.type === 'j2k') inner = `<span class="ok2">${esc(o.x.meaning)}</span>`;
      else inner = `${jpBlock(o.x, 'oj')}<span class="op tp">${esc(o.x._pron)}</span>`;
      return `<button class="opt" data-topt="${i}"><span class="n">${i + 1}</span><span>${inner}</span></button>`;
    }).join('');
    $('tFb').className = 'fb'; $('tFb').innerHTML = '';
    document.querySelector('#tQuiz .keys').textContent = q.ox ? '키보드: 1=⭕ 2=❌ (O·X 키도 돼요) · Enter 다음' : `키보드: 1~${q.opts.length} 선택 · Enter 다음`;
    $('tNext').classList.add('hidden');
    $('tNext').textContent = T.idx === T.qs.length - 1 ? '결과 보기 →' : '다음 문제 →';
    if ($('tAuto').checked && T.type !== 'k2j') speak(w.reading);
  }
  $('tQ').onclick = e => { const q = T.qs[T.idx]; if (e.target.closest('[data-tsay]')) speak(q.w.reading); if (e.target.closest('[data-tclaim]')) speak(q.claim.x.reading); };
  $('tOpts').onclick = e => { const b = e.target.closest('[data-topt]'); if (b) tChoose(+b.dataset.topt); };

  const I_ROW = 'いきぎしじちぢにひびぴみり', E_ROW = 'えけげせぜてでねへべぺめれ';
  const TO_I = { う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り' };
  function masu(w) {
    const r = K.toHira(w.reading);
    if (w.category === '1단 동사') return r.slice(0, -1) + 'ます';
    if (w.category === '5단 동사') return r.slice(0, -1) + (TO_I[r.slice(-1)] || r.slice(-1)) + 'ます';
    if (r.endsWith('くる')) return r.slice(0, -2) + 'きます';
    if (r.endsWith('する')) return r.slice(0, -2) + 'します';
    return '';
  }
  function verbWhy(w) {
    const r = K.toHira(w.reading), last = r.slice(-1), prev = r.slice(-2, -1);
    const m = masu(w), ms = m ? ` · ます형: <span class="jp">${m}</span>` : '';
    if (w.category === '불규칙 동사') return `くる(오다)와 する(하다, ～する)는 규칙을 따르지 않는 불규칙 동사예요.${ms}`;
    if (w.category === '1단 동사') return `る 앞 글자 「${prev}」가 ${I_ROW.includes(prev) ? 'い단' : 'え단'}이라서 1단 동사예요.${ms}`;
    if (last !== 'る') return `끝 글자가 「${last}」(る가 아닌 う단)라서 5단 동사예요.${ms}`;
    if (I_ROW.includes(prev) || E_ROW.includes(prev)) return `る 앞이 「${prev}」(い·え단)지만 <b style="display:inline">예외 5단 동사</b>예요! 따로 외워 두세요.${ms}`;
    return `る 앞 글자 「${prev}」가 あ·う·お단이라서 5단 동사예요.${ms}`;
  }

  async function markWrong(w) {
    if (!w.id || markOf(w.id, 'wrong')) return;
    try { S.marks.push(await store.insert('word_marks', { word_id: w.id, nickname: S.me, kind: 'wrong' })); T.newWrong = (T.newWrong || 0) + 1; }
    catch (e) { console.error(e); }
  }
  function tChoose(i) {
    if (T.answered) return;
    const q = T.qs[T.idx]; if (!q.opts[i]) return;
    T.answered = true;
    const ok = q.opts[i].correct, ci = q.opts.findIndex(o => o.correct), w = q.w;
    const btns = [...$('tOpts').children];
    btns.forEach(b => b.disabled = true); btns[ci].classList.add('ok'); if (!ok) btns[i].classList.add('no');
    T.res[T.idx] = ok; q.chosen = i;
    if (!ok) markWrong(w);
    $('tPs').textContent = `${Object.values(T.res).filter(Boolean).length}점`;
    let body;
    if (q.ox && T.type !== 'verb' && q.claim.x !== w) {
      const c = q.claim.x;
      body = `<span class="jp">${K.rubyHTML(w.word, w.reading)}</span> (${esc(w._pron)}) = ${esc(w.meaning)}<br><span class="muted">제시된 것: <span class="jp">${K.rubyHTML(c.word, c.reading)}</span> = ${esc(c.meaning)}</span>`;
    } else if (T.type === 'verb') body = verbWhy(w);
    else {
      const wrongX = !ok && q.opts[i].x;
      body = `<span class="jp">${K.rubyHTML(w.word, w.reading)}</span> (${esc(w._pron)}) = ${esc(w.meaning)}` +
        (wrongX ? `<br><span class="muted">고른 것: <span class="jp">${K.rubyHTML(wrongX.word, wrongX.reading)}</span> = ${esc(wrongX.meaning)}</span>` : '');
    }
    $('tFb').className = 'fb ' + (ok ? 'ok' : 'no');
    const ansTxt = q.ox ? (q.opts[ci].ox === 'O' ? '⭕ 맞다' : '❌ 틀리다') : NUM[ci];
    $('tFb').innerHTML = `<b>${ok ? '정답이에요! 🎉' : '아쉬워요. 정답은 ' + ansTxt}</b>${body}`;
    $('tNext').classList.remove('hidden');
    if (T.type === 'k2j') speak(w.reading);
  }
  function tNext() { if (!T.answered) return; if (T.idx < T.qs.length - 1) { T.idx++; drawQ(); } else tFinish(); }
  $('tNext').onclick = tNext;
  document.addEventListener('keydown', e => {
    if (S.page !== 'test' || $('tQuiz').classList.contains('hidden') || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
    const q = T.qs[T.idx];
    if (/^[1-9]$/.test(e.key)) tChoose(+e.key - 1); else if (e.key === 'Enter') tNext();
    else if (q && q.ox && /^[oO]$/.test(e.key)) tChoose(0); else if (q && q.ox && /^[xX]$/.test(e.key)) tChoose(1);
  });
  const quit = () => { if (confirm('테스트를 그만할까요?')) { tShow('tSetup'); drawTestSetup(); } };
  $('tQuit').onclick = quit; $('tQuit2').onclick = quit;

  /* 비슷한 발음 짝 맞추기 */
  function buildRounds(words) {
    const others = [];
    S.words.concat(dict()).forEach(x => { if (!words.some(w => sameW(w, x)) && !others.some(o => sameW(o, x))) others.push(x); });
    const sim = (a, b) => { const ra = K.toHira(a.reading), rb = K.toHira(b.reading); return lev(ra, rb) - (ra[0] === rb[0] ? 0.5 : 0) + Math.abs(ra.length - rb.length) * 0.3; };
    const left = words.slice(), rounds = [];
    while (left.length) {
      const t = left.shift(), group = [t];
      const okM = x => !group.some(g => g.meaning === x.meaning || sameW(g, x));
      const near1 = left.map(x => [x, sim(t, x)]).filter(([x, s]) => s <= 2.2).sort((a, b) => a[1] - b[1]);
      for (const [x] of near1) { if (group.length >= 4) break; if (okM(x)) { group.push(x); left.splice(left.indexOf(x), 1); } }
      if (group.length < 4) {
        const near2 = others.map(x => [x, sim(t, x)]).sort((a, b) => a[1] - b[1]);
        for (const [x] of near2) { if (group.length >= 4) break; if (okM(x)) group.push(x); }
      }
      rounds.push({ words: shuffle(group), right: shuffle(group.slice()), done: new Set(), bad: new Set(), selL: null, selR: null });
    }
    return rounds;
  }
  function drawRound() {
    const r = T.rounds[T.idx];
    $('tMpt').textContent = `${T.idx + 1} / ${T.rounds.length} 묶음`;
    $('tMpb').style.width = (T.idx / T.rounds.length * 100) + '%';
    const total = T.rounds.reduce((s, x) => s + x.words.length, 0), got = T.rounds.reduce((s, x) => s + [...x.done].filter(i => !x.bad.has(i)).length, 0);
    $('tMps').textContent = `${got} / ${total}`;
    $('tMl').innerHTML = r.words.map((w, i) => `<button class="mb ${r.done.has(i) ? 'done' : ''} ${r.selL === i ? 'sel' : ''}" data-ml="${i}" ${r.done.has(i) ? 'disabled' : ''}>${jpBlock(w, '')}<span class="icon" data-msay="${i}">🔊</span></button>`).join('');
    $('tMr').innerHTML = r.right.map((w, j) => { const li = r.words.indexOf(w); return `<button class="mb ${r.done.has(li) ? 'done' : ''} ${r.selR === j ? 'sel' : ''}" data-mr="${j}" ${r.done.has(li) ? 'disabled' : ''}>${esc(w.meaning)}</button>`; }).join('');
    const fin = r.done.size === r.words.length;
    $('tMfb').className = 'fb' + (fin ? (r.bad.size ? ' no' : ' ok') : '');
    $('tMfb').innerHTML = fin ? `<b>${r.bad.size ? '다 맞췄어요! 헷갈린 단어를 다시 확인해요' : '한 번에 다 맞췄어요! 🎉'}</b>` + r.words.map(w => `<span class="jp">${K.rubyHTML(w.word, w.reading)}</span> ${esc(w._pron)} = ${esc(w.meaning)}`).join('<br>') : '';
    $('tMnext').classList.toggle('hidden', !fin);
    $('tMnext').textContent = T.idx === T.rounds.length - 1 ? '결과 보기 →' : '다음 묶음 →';
  }
  $('tMatch').onclick = e => {
    const r = T.rounds[T.idx]; if (!r) return;
    const s = e.target.closest('[data-msay]'); if (s) { e.stopPropagation(); speak(r.words[+s.dataset.msay].reading); return; }
    const l = e.target.closest('[data-ml]'), rr = e.target.closest('[data-mr]');
    if (l) { r.selL = +l.dataset.ml; speak(r.words[r.selL].reading); }
    if (rr) r.selR = +rr.dataset.mr;
    if (r.selL !== null && r.selR !== null) {
      const li = r.selL, w = r.words[li], pick = r.right[r.selR];
      if (pick === w) { r.done.add(li); }
      else {
        r.bad.add(li); const pi = r.words.indexOf(pick); r.bad.add(pi);
        if (T.inTest.has(w.id)) markWrong(w);
        drawRound();
        document.querySelectorAll(`[data-ml="${li}"],[data-mr="${r.selR}"]`).forEach(b => b.classList.add('bad'));
        r.selL = r.selR = null; return;
      }
      r.selL = r.selR = null;
    }
    drawRound();
  };
  $('tMnext').onclick = () => { if (T.idx < T.rounds.length - 1) { T.idx++; drawRound(); } else tFinish(); };

  /* 결과 */
  function tFinish() {
    let items;
    if (T.type === 'match') items = T.rounds.flatMap(r => r.words.map((w, i) => ({ w, ok: !r.bad.has(i) }))).filter(x => T.inTest.has(x.w.id)); // 채점은 고른 단어만
    else items = T.qs.map((q, i) => ({ w: q.w, ok: !!T.res[i], q }));
    const got = items.filter(x => x.ok).length, total = items.length;
    const fmtName = T.type === 'match' ? '' : T.format === 'ox' ? ' · OX' : T.type === 'verb' ? ' · 3지선다' : ` · ${T.format}지선다`;
    $('tRtype').textContent = `결과 · ${TT_NAME[T.type]}${fmtName}`;
    $('tScore').innerHTML = `${got}<small> / ${total}</small>`;
    const r = got / total;
    $('tGrade').textContent = got === total ? '완벽해요! 🎌' : r >= .8 ? '아주 잘했어요! 틀린 것만 한 번 더 볼까요?' : r >= .5 ? '좋아요. 틀린 단어를 다시 풀어 보세요.' : '괜찮아요. 단어장에서 한 번 더 보고 다시 도전해요!';
    $('tGrid').innerHTML = items.map((x, i) => `<div class="${x.ok ? 'o' : 'x'}">${i + 1}</div>`).join('');
    const wrong = items.filter(x => !x.ok);
    const wrongIds = [...new Set(wrong.map(x => x.w.id).filter(Boolean))];
    $('tRetryWrong').classList.toggle('hidden', !wrongIds.length);
    $('tRetryWrong').onclick = () => startTest(wrongIds);
    $('tMarked').classList.toggle('hidden', !wrongIds.length);
    $('tMarked').innerHTML = `❌ 틀린 단어 ${wrongIds.length}개는 <b>단어장 → ❌ 내가 틀린 단어</b>에 모여 있어요. 다 외우면 ✅를 눌러 빼세요.`;
    $('tWrongList').innerHTML = wrong.length ? '<div class="sec-title" style="font-size:13px;font-weight:700;color:var(--accent)">틀린 단어</div>' + wrong.map(x => `<div class="twrong">${jpBlock(x.w, '')}<span class="m">${esc(x.w.meaning)}<div class="muted">${esc(x.w._pron)} · ${esc(x.w.category)}${T.type === 'verb' ? ' · ' + verbWhy(x.w) : ''}</div></span><button class="icon" data-wsay="${esc(x.w.reading)}">🔊</button></div>`).join('') : '';
    tShow('tResult'); drawAll();
  }
  $('tWrongList').onclick = e => { const b = e.target.closest('[data-wsay]'); if (b) speak(b.dataset.wsay); };
  $('tRetryAll').onclick = () => startTest(T.lastIds);
  $('tBack').onclick = () => { tShow('tSetup'); drawTestSetup(); };

  /* =========================================================
     문형장
     ========================================================= */
  const APPLY_ORDER = ['1단 동사', '5단 동사', '불규칙 동사', '동사 공통', 'い형용사', 'な형용사', '명사', '조사', '기타'];
  const STYLE_ORDER = { '반말': 0, '존댓말': 1, '공통': 2 };
  const sayForm = f => String(f || '').replace(/\([^)]*\)/g, '').replace(/[～~]/g, '').replace(/[／/]/g, '、');
  const pronOf = jp => K.sentenceToHangul(String(jp || '').replace(/～/g, '~'));

  function matchPattern(p, q) {
    if (!q) return true;
    const hay = [p.form, p.pron_ko, p.meaning, p.how_to, p.example_jp, p.example_pron, p.example_ko, p.notes, p.applies_to].filter(Boolean).join(' ');
    if (hay.includes(q) || hay.includes(K.toHira(q))) return true;
    if (K.isHangul(q)) { const kq = K.hangulToKana(q); if (kq.length >= 2 && hay.includes(kq)) return true; }
    return false;
  }
  function visiblePatterns() {
    const f = S.pf;
    return S.patterns.filter(p => (f.style === 'all' || p.style === f.style) && (!f.apply || (p.applies_to || '기타') === f.apply) &&
      (!f.date || p.study_date === f.date) && (!f.lesson || p.lesson === f.lesson) && matchPattern(p, f.q));
  }
  function drawPatterns() {
    const f = S.pf, all = S.patterns;
    const cnt = st => st === 'all' ? all.length : all.filter(p => p.style === st).length;
    $('pTabs').innerHTML = [['all', '전체'], ['반말', '반말'], ['존댓말', '존댓말'], ['공통', '공통 (조사 등)']]
      .filter(([k]) => k !== '공통' || cnt('공통'))
      .map(([k, l]) => `<button class="${f.style === k ? 'on' : ''}" data-pstyle="${k}">${l}<span class="c">${cnt(k)}</span></button>`).join('');
    const applies = [...new Set(all.map(p => p.applies_to || '기타'))].sort((a, b) => (APPLY_ORDER.indexOf(a) + 1 || 99) - (APPLY_ORDER.indexOf(b) + 1 || 99));
    $('pApply').innerHTML = `<option value="">모든 품사</option>` + applies.map(a => `<option ${a === f.apply ? 'selected' : ''}>${esc(a)}</option>`).join('');
    const dates = [...new Set(all.map(p => p.study_date).filter(Boolean))].sort().reverse();
    $('pDate').innerHTML = `<option value="">모든 수업 날짜</option>` + dates.map(d => `<option value="${d}" ${d === f.date ? 'selected' : ''}>${fmtDate(d)}</option>`).join('');
    $('pDate').classList.toggle('hidden', !dates.length);
    const lessons = [...new Set(all.map(p => p.lesson).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    $('pLesson').innerHTML = lessonOpts(S.patterns, f.lesson);
    $('applyList').innerHTML = [...new Set(APPLY_ORDER.concat(applies))].map(a => `<option value="${esc(a)}">`).join('');

    const rows = visiblePatterns(); S.pvisible = rows;
    const seedBtn = `<button class="btn ghost" data-act="seedPatterns">📥 스터디 Word 파일 기본 문형 불러오기 (${(window.PATTERN_SEED || []).length}개)</button>`;
    if (!all.length) {
      $('pList').innerHTML = `<div class="card empty"><b>아직 문형이 없어요</b>＋ 문형 등록으로 직접 넣거나, 스터디 Word 파일의 동사 기본 문형을 한 번에 불러올 수 있어요.<div style="margin-top:14px">${seedBtn}</div></div>`;
      updPSel(); return;
    }
    if (!rows.length) { $('pList').innerHTML = `<div class="card empty"><b>텅 비었어요</b>조건에 맞는 문형이 없어요.</div>`; updPSel(); return; }
    const groups = {};
    rows.forEach(p => { (groups[p.applies_to || '기타'] = groups[p.applies_to || '기타'] || []).push(p); });
    const keys = Object.keys(groups).sort((a, b) => (APPLY_ORDER.indexOf(a) + 1 || 99) - (APPLY_ORDER.indexOf(b) + 1 || 99));
    const who = p => `${esc(p.created_by || '-')}${p.updated_by && p.updated_by !== p.created_by ? ' · 수정 ' + esc(p.updated_by) : ''}`;
    $('pList').innerHTML = keys.map(k => {
      const list = groups[k].sort((a, b) => STYLE_ORDER[a.style] - STYLE_ORDER[b.style] || a.id - b.id);
      return `<div class="pgroup">${esc(k)} <small>${list.length}</small></div><div class="pgrid">` + list.map(p => `
        <div class="pcard">
          <input type="checkbox" data-psel="${p.id}" ${S.psel.has(p.id) ? 'checked' : ''}>
          <div class="body">
            <div class="top"><span class="pf">${esc(p.form)}</span><button class="icon" data-psay="${p.id}" title="듣기">🔊</button>${styleBadge(p.style)}</div>
            ${p.pron_ko ? `<div class="pron">${esc(p.pron_ko)}</div>` : ''}
            <div class="mean">${esc(p.meaning)}</div>
            ${p.how_to ? `<div class="how">만드는 법 · ${esc(p.how_to)}</div>` : ''}
            ${p.example_jp ? `<div class="ex"><div class="j">${esc(p.example_jp)} <button class="icon" data-pexsay="${p.id}" title="예문 듣기">🔊</button></div>${p.example_pron ? `<div class="p">${esc(p.example_pron)}</div>` : ''}${p.example_ko ? `<div class="k">${esc(p.example_ko)}</div>` : ''}</div>` : ''}
            ${p.notes ? `<div class="notes">💡 ${esc(p.notes)}</div>` : ''}
            <div class="foot">${[p.lesson, fmtDate(p.study_date)].filter(Boolean).map(esc).join(' · ')}${p.lesson || p.study_date ? ' · ' : ''}${who(p)}</div>
          </div>
          <button class="icon" data-pedit="${p.id}" title="수정">✏️</button>
        </div>`).join('') + '</div>';
    }).join('') + `<div style="text-align:center;margin-top:24px">${seedBtn.replace('불러오기', '다시 불러오기 · 없는 것만 추가')}</div>`;
    updPSel();
  }
  function updPSel() {
    [...S.psel].forEach(id => { if (!S.patterns.some(p => p.id === id)) S.psel.delete(id); });
    $('pSelN').textContent = S.psel.size;
    const vis = S.pvisible || [];
    $('pAll').checked = vis.length > 0 && vis.every(p => S.psel.has(p.id));
  }
  $('pTabs').onclick = e => { const b = e.target.closest('[data-pstyle]'); if (b) { S.pf.style = b.dataset.pstyle; drawPatterns(); } };
  $('pApply').onchange = e => { S.pf.apply = e.target.value; drawPatterns(); };
  $('pDate').onchange = e => { S.pf.date = e.target.value; drawPatterns(); };
  $('pLesson').onchange = e => { S.pf.lesson = e.target.value; drawPatterns(); };
  let pqT; $('pQ').oninput = e => { clearTimeout(pqT); pqT = setTimeout(() => { S.pf.q = e.target.value.trim(); drawPatterns(); }, 150); };
  $('pRefresh').onclick = async () => { await loadAll(); toast('최신 내용으로 새로고침했어요'); };
  $('pAll').onchange = e => { (S.pvisible || []).forEach(p => e.target.checked ? S.psel.add(p.id) : S.psel.delete(p.id)); drawPatterns(); };
  $('pPrompt').onclick = () => {
    if (!S.psel.size) { toast('테스트할 문형을 먼저 체크해 주세요'); return; }
    PT.psel = new Set(S.psel); go('test'); setTMode('pat');
    toast(`문형 ${S.psel.size}개를 골라 왔어요. 문제에 쓸 단어를 고르세요`);
  };
  $('pList').onclick = e => {
    const t = e.target;
    const sel = t.closest('[data-psel]'); if (sel) { const id = +sel.dataset.psel; sel.checked ? S.psel.add(id) : S.psel.delete(id); updPSel(); return; }
    const sy = t.closest('[data-psay]'); if (sy) { const p = S.patterns.find(x => x.id === +sy.dataset.psay); if (p) speak(sayForm(p.form)); return; }
    const ex = t.closest('[data-pexsay]'); if (ex) { const p = S.patterns.find(x => x.id === +ex.dataset.pexsay); if (p) speak(p.example_jp); return; }
    const ed = t.closest('[data-pedit]'); if (ed) { const p = S.patterns.find(x => x.id === +ed.dataset.pedit); if (p) openPattern(p); }
  };

  async function seedPatterns() {
    const seed = window.PATTERN_SEED || [];
    const have = new Set(S.patterns.map(p => p.style + '|' + p.form));
    const rows = seed.filter(r => !have.has(r[0] + '|' + r[2])).map(([style, applies_to, form, pron_ko, meaning, how_to, example_jp, example_ko, notes]) =>
      ({ style, applies_to, form, pron_ko, meaning, how_to, example_jp, example_pron: K.sentenceToHangul(example_jp), example_ko, notes: notes || null, created_by: S.me, updated_by: S.me }));
    if (!rows.length) { toast('Word 파일 문형이 이미 모두 들어 있어요'); return; }
    if (!confirm(`스터디 Word 파일의 기본 문형 ${rows.length}개를 문형장에 추가할까요?\n(이미 있는 문형은 건너뛰어요)`)) return;
    const main = rows.filter(r => r.style !== '공통'), common = rows.filter(r => r.style === '공통');
    let added = 0;
    try { if (main.length) added += (await store.insertMany('patterns', main)).length; } catch (e) { fail(e, '불러오기'); }
    try { if (common.length) added += (await store.insertMany('patterns', common)).length; }
    catch (e) { console.error(e); alert('조사·전치사 문형(공통)은 추가하지 못했어요.\nSupabase SQL Editor에서 02_patterns_common.sql을 먼저 실행해 주세요.'); }
    await loadPatterns(); drawAll();
    if (added) toast(`문형 ${added}개를 추가했어요`);
  }

  /* 문형 등록/수정 창 */
  let pEditing = null, gPronTouched = false, gFormAuto = false, gExPronTouched = false, pStyle = '반말';
  function setStyle(st) { pStyle = st; document.querySelectorAll('#pmStyle button').forEach(b => b.classList.toggle('on', b.dataset.style === st)); }
  $('pmStyle').onclick = e => { const b = e.target.closest('[data-style]'); if (b) setStyle(b.dataset.style); };
  function openPattern(p) {
    pEditing = p || null;
    $('pmTitle').textContent = p ? '문형 수정' : '문형 등록';
    $('pmSub').textContent = p ? `등록: ${p.created_by || '-'}${p.updated_by ? ' · 마지막 수정: ' + p.updated_by : ''}` : '일본어 칸을 누르면 히라가나 자판이 열려요. 한글 발음을 먼저 쓰면 히라가나로 바꿔 드려요.';
    $('pmDel').classList.toggle('hidden', !p); $('pmSave').textContent = p ? '저장' : '등록'; $('pmErr').textContent = '';
    const v = p || { style: S.pf.style === 'all' ? '반말' : S.pf.style, lesson: localStorage.getItem('ganbare-lesson') || '', study_date: localStorage.getItem('ganbare-date') || today() };
    setStyle(v.style || '반말');
    $('gForm').value = v.form || ''; $('gPron').value = v.pron_ko || ''; $('gMeaning').value = v.meaning || '';
    $('gApply').value = v.applies_to || ''; $('gHow').value = v.how_to || '';
    $('gEx').value = v.example_jp || ''; $('gExPron').value = v.example_pron || ''; $('gExKo').value = v.example_ko || '';
    $('gNotes').value = v.notes || ''; $('gLesson').value = v.lesson || ''; $('gDate').value = v.study_date || '';
    gPronTouched = !!v.pron_ko; gFormAuto = false; gExPronTouched = !!v.example_pron;
    $('gPronNote').classList.add('hidden'); pPreview();
    $('pm').classList.add('on');
    setTimeout(() => $(p ? 'gMeaning' : 'gPron').focus(), 50);
  }
  function pPreview() {
    $('ppForm').innerHTML = $('gForm').value.trim() ? esc($('gForm').value.trim()) : '<span class="muted" style="font-size:14px">여기에 미리 보여요</span>';
    $('ppKo').textContent = $('gMeaning').value.trim();
  }
  function closePattern() { $('pm').classList.remove('on'); hideKbd(); pEditing = null; }
  $('pmCancel').onclick = closePattern;
  $('pm').onclick = e => { if (e.target.id === 'pm') closePattern(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('pm').classList.contains('on')) closePattern(); });
  $('ppSay').onclick = () => { const f = $('gForm').value.trim(); if (f) speak(sayForm(f)); };
  $('gForm').oninput = () => { gFormAuto = false; if (!gPronTouched) $('gPron').value = pronOf($('gForm').value.trim()); $('gPronNote').classList.add('hidden'); pPreview(); };
  $('gPron').oninput = () => {
    gPronTouched = !!$('gPron').value.trim();
    if (!$('gForm').value.trim() || gFormAuto) {
      const k = K.hangulToKana($('gPron').value.trim()).replace(/~/g, '～');
      $('gForm').value = k; gFormAuto = !!k; $('gPronNote').classList.toggle('hidden', !k);
    }
    pPreview();
  };
  $('gMeaning').oninput = pPreview;
  $('gEx').oninput = () => { if (!gExPronTouched) $('gExPron').value = K.sentenceToHangul($('gEx').value.trim()); };
  $('gExPron').oninput = () => { gExPronTouched = !!$('gExPron').value.trim(); };

  $('pmSave').onclick = async () => {
    const row = {
      style: pStyle, form: $('gForm').value.trim(), pron_ko: $('gPron').value.trim() || null, meaning: $('gMeaning').value.trim(),
      applies_to: $('gApply').value.trim() || null, how_to: $('gHow').value.trim() || null,
      example_jp: $('gEx').value.trim() || null, example_pron: $('gExPron').value.trim() || null, example_ko: $('gExKo').value.trim() || null,
      notes: $('gNotes').value.trim() || null, lesson: $('gLesson').value.trim() || null, study_date: $('gDate').value || null, updated_by: S.me
    };
    if (!row.form) { $('pmErr').textContent = '문형(일본어)을 입력해 주세요'; return; }
    if (!row.meaning) { $('pmErr').textContent = '뜻을 입력해 주세요'; return; }
    if (!pEditing && S.patterns.some(p => p.form === row.form && p.style === row.style) && !confirm('같은 문형이 이미 있어요. 그래도 등록할까요?')) return;
    $('pmSave').disabled = true;
    try {
      if (pEditing) { const r = await store.update('patterns', pEditing.id, row); S.patterns = S.patterns.map(x => x.id === r.id ? r : x); toast('수정했어요'); }
      else {
        const r = await store.insert('patterns', { ...row, created_by: S.me }); S.patterns.push(r); toast('문형을 등록했어요');
        if (row.study_date) localStorage.setItem('ganbare-date', row.study_date);
        localStorage.setItem('ganbare-lesson', row.lesson || '');
      }
      closePattern(); drawAll();
    } catch (e) {
      if (/check constraint|patterns_style_check/i.test(e.message || '') && row.style === '공통') $('pmErr').textContent = "'공통'을 쓰려면 Supabase에서 02_patterns_common.sql을 먼저 실행해 주세요";
      else fail(e, '저장');
    } finally { $('pmSave').disabled = false; }
  };
  $('pmDel').onclick = async () => {
    if (!pEditing || !confirm(`「${pEditing.form}」 문형을 삭제할까요?\n스터디원 모두의 문형장에서 사라져요.`)) return;
    try { await store.remove('patterns', pEditing.id); S.patterns = S.patterns.filter(x => x.id !== pEditing.id); toast('삭제했어요'); closePattern(); drawAll(); }
    catch (e) { fail(e, '삭제'); }
  };

  /* =========================================================
     공통: 복사
     ========================================================= */
  async function copyText(text, ta) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try { const t = ta || Object.assign(document.createElement('textarea'), { value: text }); if (!ta) document.body.appendChild(t); t.focus(); t.select(); const ok = document.execCommand('copy'); if (!ta) t.remove(); return ok; } catch (e) { return false; }
  }
  const showCopied = (el, ok) => { el.textContent = ok ? '복사됐어요! 붙여넣기 하세요' : '자동 복사가 막혀 있어요. 직접 선택해 복사해 주세요'; el.classList.remove('hidden'); };

  /* =========================================================
     테스트 탭: 단어 / 문형(AI) 전환
     ========================================================= */
  let tMode = 'word';
  function setTMode(m) {
    tMode = m;
    document.querySelectorAll('#tMode [data-tm]').forEach(b => b.classList.toggle('on', b.dataset.tm === m));
    $('ptSetup').classList.toggle('hidden', m !== 'pat');
    if (m === 'pat') { ['tSetup', 'tQuiz', 'tMatch', 'tResult'].forEach(v => $(v).classList.add('hidden')); drawPT(); }
    else { tShow('tSetup'); drawTestSetup(); }
  }
  $('tMode').onclick = e => { const b = e.target.closest('[data-tm]'); if (b) setTMode(b.dataset.tm); };

  /* =========================================================
     문형 테스트 프롬프트
     ========================================================= */
  const PT = { psel: new Set(), wsel: new Set(), pstyle: 'all', pdate: '', plesson: '', wcat: '', wdate: '', wlesson: '' };
  function drawPT() {
    [...PT.psel].forEach(id => { if (!S.patterns.some(p => p.id === id)) PT.psel.delete(id); });
    [...PT.wsel].forEach(id => { if (!S.words.some(w => w.id === id)) PT.wsel.delete(id); });
    const cnt = st => st === 'all' ? S.patterns.length : S.patterns.filter(p => p.style === st).length;
    $('ptPTabs').innerHTML = [['all', '전체'], ['반말', '반말'], ['존댓말', '존댓말'], ['공통', '공통']].filter(([k]) => k !== '공통' || cnt('공통'))
      .map(([k, l]) => `<button class="${PT.pstyle === k ? 'on' : ''}" data-ptst="${k}">${l}<span class="c">${cnt(k)}</span></button>`).join('');
    const pd = [...new Set(S.patterns.map(p => p.study_date).filter(Boolean))].sort().reverse();
    $('ptPDate').innerHTML = `<option value="">모든 수업 날짜</option>` + pd.map(d => `<option value="${d}" ${d === PT.pdate ? 'selected' : ''}>${fmtDate(d)}</option>`).join('');
    $('ptPLesson').innerHTML = lessonOpts(S.patterns, PT.plesson);
    $('ptWLesson').innerHTML = lessonOpts(S.words, PT.wlesson);
    const pv = ptPBase();
    $('ptPChips').innerHTML = pv.length ? pv.map(p => `<button class="tchip pt ${PT.psel.has(p.id) ? 'on' : ''}" data-ptp="${p.id}"><b>${esc(p.form)}</b>${esc(p.meaning.split('/')[0].trim())} ${styleBadge(p.style).replace('class="badge', 'class="badge st')}</button>`).join('')
      : `<div class="muted">문형이 없어요. 문형장에서 먼저 등록해 주세요.</div>`;
    $('ptPInfo').textContent = `· ${PT.psel.size}개 선택됨`;
    $('ptWCat').innerHTML = `<option value="">모든 품사</option>` + CATS.map(([c]) => `<option ${c === PT.wcat ? 'selected' : ''}>${c}</option>`).join('');
    const wd = [...new Set(S.words.map(w => w.study_date).filter(Boolean))].sort().reverse();
    $('ptWDate').innerHTML = `<option value="">모든 수업 날짜</option>` + wd.map(d => `<option value="${d}" ${d === PT.wdate ? 'selected' : ''}>${fmtDate(d)}</option>`).join('');
    const wv = ptWBase();
    $('ptWChips').innerHTML = wv.length ? wv.map(w => `<button class="tchip ${PT.wsel.has(w.id) ? 'on' : ''}" data-ptw="${w.id}"><b>${esc(w.reading)}</b>${esc(w.meaning)}</button>`).join('') : '<div class="muted">조건에 맞는 단어가 없어요.</div>';
    const nv = S.words.filter(w => PT.wsel.has(w.id) && VERBS.includes(w.category)).length;
    $('ptWInfo').textContent = `· ${PT.wsel.size}개 선택됨 (동사 ${nv}개) · 동사를 넉넉히 고르면 문제가 다양해져요`;
    if (!$('ptTitle').value) $('ptTitle').placeholder = ptDefaultTitle();
    $('ptErr').textContent = '';
  }
  const ptPBase = () => S.patterns.filter(p => (PT.pstyle === 'all' || p.style === PT.pstyle) && (!PT.pdate || p.study_date === PT.pdate) && (!PT.plesson || p.lesson === PT.plesson))
    .sort((a, b) => STYLE_ORDER[a.style] - STYLE_ORDER[b.style] || a.id - b.id);
  const ptWBase = () => S.words.filter(w => (!PT.wcat || w.category === PT.wcat) && (!PT.wdate || w.study_date === PT.wdate) && (!PT.wlesson || w.lesson === PT.wlesson));
  function ptDefaultTitle() {
    const ps = S.patterns.filter(p => PT.psel.has(p.id));
    return (ps.length ? ps.slice(0, 2).map(p => p.form).join(' · ') + (ps.length > 2 ? ` 외 ${ps.length - 2}개` : '') : '문형') + ' 복습 퀴즈';
  }
  $('ptPTabs').onclick = e => { const b = e.target.closest('[data-ptst]'); if (b) { PT.pstyle = b.dataset.ptst; drawPT(); } };
  $('ptPDate').onchange = e => { PT.pdate = e.target.value; drawPT(); };
  $('ptPLesson').onchange = e => { PT.plesson = e.target.value; if (!PT.wlesson && PT.plesson && lessonsOf(S.words).includes(PT.plesson)) PT.wlesson = PT.plesson; drawPT(); };
  $('ptWLesson').onchange = e => { PT.wlesson = e.target.value; drawPT(); };
  $('ptWCat').onchange = e => { PT.wcat = e.target.value; drawPT(); };
  $('ptWDate').onchange = e => { PT.wdate = e.target.value; drawPT(); };
  $('ptPAll').onclick = () => { ptPBase().forEach(p => PT.psel.add(p.id)); drawPT(); };
  $('ptPNone').onclick = () => { PT.psel.clear(); drawPT(); };
  $('ptWAll').onclick = () => { ptWBase().forEach(w => PT.wsel.add(w.id)); drawPT(); };
  $('ptWNone').onclick = () => { PT.wsel.clear(); drawPT(); };
  $('ptPChips').onclick = e => { const b = e.target.closest('[data-ptp]'); if (!b) return; const id = +b.dataset.ptp; PT.psel.has(id) ? PT.psel.delete(id) : PT.psel.add(id); drawPT(); };
  $('ptWChips').onclick = e => { const b = e.target.closest('[data-ptw]'); if (!b) return; const id = +b.dataset.ptw; PT.wsel.has(id) ? PT.wsel.delete(id) : PT.wsel.add(id); drawPT(); };

  function formatVars(f) {
    if (f === 'ox') return {
      FORMAT: 'ox', FORMAT_NAME: 'OX',
      FORMAT_RULES: [
        '- 모든 문제는 내용이 맞는지 **맞다(O) / 틀리다(X)**를 고르는 문제입니다. `opts`는 쓰지 말고 `answer: "O"` 또는 `answer: "X"`를 씁니다 (화면에 ⭕ 맞다 / ❌ 틀리다 버튼이 자동으로 나옵니다).',
        '- ask에 판단할 내용을 분명히 씁니다. 예: "빈칸에 「ねった」가 들어가면 맞을까요?", "다음 일본어가 「어젯밤 늦게 잤어」라는 뜻이 맞을까요?", "다음 문장은 문법적으로 맞을까요?"',
        '- O와 X가 비슷한 비율이 되게 합니다. X 문제는 입문자가 실제로 하기 쉬운 실수를 이용하세요: 1단/5단 활용 혼동(ねった), 어미 안 떼기(ねるた), 시제·부정 혼동(ねなかった↔ねた), 비슷한 발음의 다른 동사(かけた↔かいた), 반말↔존댓말 혼동 등.',
        '- 대화 빈칸 문제라면 `fill`에 빈칸의 정답(일본어)을 넣습니다. 답을 고른 뒤 빈칸에 표시됩니다.',
        '- 해설(exp)에는 X일 때 바른 형태를 꼭 알려 주세요.'].join('\n'),
      FORMAT_DATA: '- **OX 문제는 opts 대신 answer를 씁니다.** 예: `{ type: "대화 빈칸", pattern: "～た (반말 과거)", ask: "빈칸에 「ねった」가 들어가면 맞을까요?", lines: [ … ], answer: "X", fill: "ねた", exp: "1단 동사는 る를 떼고 た → ねた. ねった는 틀린 활용이에요." }`',
      FORMAT_CHECK: '각 문제의 answer(O/X)가 확실히 맞는가? O와 X가 한쪽으로 치우치지 않았는가? opts를 쓰지 않았는가?'
    };
    const n = +f || 5;
    return {
      FORMAT: String(n), FORMAT_NAME: `${n}지선다`,
      FORMAT_RULES: [
        `- 모든 문제의 \`opts\`는 **정확히 ${n}개**이고, **첫 번째가 정답**입니다 (화면에서 자동으로 섞입니다).`,
        `- 오답 ${n - 1}개는 입문자가 실제로 하기 쉬운 실수로 만드세요: 1단/5단 활용 혼동(ねった), 어미 안 떼기(ねるた), 다른 시제·부정 혼동(ねなかった↔ねた), 비슷한 발음의 다른 동사(かけた↔かいた), 반말↔존댓말 혼동 등.`,
        '- 정답이 두 개가 될 수 있는 보기는 만들지 마세요. 보기는 모두 서로 달라야 합니다.'].join('\n'),
      FORMAT_DATA: `- 모든 문제의 opts는 정확히 ${n}개입니다.`,
      FORMAT_CHECK: `보기가 정확히 ${n}개이고, 오답 ${n - 1}개가 모두 확실히 틀렸는가? (정답이 2개인 문제 없음)`
    };
  }
  function buildPrompt() {
    const ps = S.patterns.filter(p => PT.psel.has(p.id)).sort((a, b) => STYLE_ORDER[a.style] - STYLE_ORDER[b.style] || a.id - b.id);
    const ws = S.words.filter(w => PT.wsel.has(w.id));
    const d = today(), rnd = Math.random().toString(36).slice(2, 6);
    const v = {
      TITLE: $('ptTitle').value.trim() || ptDefaultTitle(), DATE: d, QUIZ_ID: d.replace(/-/g, '') + '-' + rnd, COUNT: String(countOf('ptCount', 'ptCountIn')),
      PATTERNS: ps.map(p => `- ${p.form} | ${p.style} | ${p.applies_to || ''} | ${p.meaning} | ${p.how_to || ''} | ${p.example_jp || ''}`).join('\n'),
      WORDS: ws.map(w => `- ${w.word === w.reading ? w.reading : `${w.word}(${w.reading})`} | ${w._pron} | ${w.meaning} | ${w.category}`).join('\n'),
      EXTRA: $('ptExtra').value.trim() || '(없음)',
      ...formatVars($('ptFormat').value)
    };
    let out = window.PROMPT_TEMPLATE || '';
    Object.keys(v).forEach(k => { out = out.split('{{' + k + '}}').join(v[k]); });
    return out.split('{{TEMPLATE}}').join(window.QUIZ_TEMPLATE || '');
  }
  $('ptMake').onclick = () => {
    if (countOf('ptCount', 'ptCountIn') < 1) { $('ptErr').textContent = '문제 수를 1~100 사이 숫자로 입력해 주세요.'; return; }
    if (!PT.psel.size) { $('ptErr').textContent = '문형을 하나 이상 골라 주세요.'; return; }
    if (PT.wsel.size < 3) { $('ptErr').textContent = '단어를 3개 이상 골라 주세요. (문제를 자연스럽게 만들려면 10개 이상 추천)'; return; }
    const text = buildPrompt();
    $('ptText').value = text; $('ptLen').textContent = `· 약 ${Math.round(text.length / 1000)}천 자`;
    $('ptOut').classList.remove('hidden'); $('ptCopied').classList.add('hidden');
    $('ptOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('ptCopy').onclick = async () => showCopied($('ptCopied'), await copyText($('ptText').value, $('ptText')));

  /* =========================================================
     오답노트
     ========================================================= */
  const N = { tab: 'mine', q: '', quiz: '', pat: '', hideDone: false, preview: null };
  async function loadNotes() { S.notes = await store.list('wrong_notes'); }
  const hasJa = s => /[぀-ヿ㐀-鿿]/.test(s || '');
  // 세로 막대로 나누되 {漢字|かな} 안의 막대는 그대로 둠
  function splitBar(str) {
    const out = []; let cur = '', depth = 0;
    for (const ch of String(str || '')) {
      if (ch === '{') depth++; else if (ch === '}') depth = Math.max(0, depth - 1);
      if ((ch === '|' || ch === '｜') && !depth) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim()); return out;
  }

  function parseLine(line) {
    const f = line.match(/^\s*빈칸(?:\s*정답)?\s*[:：]\s*(.+)$/); if (f) return { sp: '_fill', jp: f[1].trim() };
    const m = line.match(/^\s*(A|B|C|D|문|Q)\s*[:：]\s*(.*)$/); if (!m) return null;
    const sp = m[1] === '문' ? 'Q' : m[1], parts = splitBar(m[2]);
    if (!hasJa(parts[0])) return { sp, ko: parts.join(' | ') };
    return { sp, jp: parts[0] || '', pron: parts[1] || '', ko: parts[2] || '' };
  }
  function parseWrongText(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/^```.*$/, '').trimEnd());
    const quiz = { id: '', title: '', date: '', score: '' }, items = []; let cur = null;
    const kv = l => { const m = l.match(/^\s*([^:：|]{1,8})\s*[:：]\s*(.*)$/); return m ? [m[1].trim(), m[2].trim()] : null; };
    for (const raw of lines) {
      const l = raw.trim(); if (!l) continue;
      if (/^===\s*끝/.test(l)) break;
      const head = l.match(/^---\s*오답\s*\d*\s*(?:\(\s*Q?\s*(\d+)\s*\))?/);
      if (head) { cur = { q_no: head[1] ? +head[1] : items.length + 1, lines: [] }; items.push(cur); continue; }
      if (/^===/.test(l)) continue;
      if (!cur) {
        const p = kv(l); if (!p) continue;
        if (/퀴즈\s*ID/i.test(p[0])) quiz.id = p[1]; else if (p[0] === '제목') quiz.title = p[1]; else if (p[0] === '날짜') quiz.date = p[1]; else if (p[0] === '점수') quiz.score = p[1];
        continue;
      }
      const sp = parseLine(l); if (sp) { cur.lines.push(sp); continue; }
      const p = kv(l);
      if (p) {
        const k = p[0].replace(/\s/g, '');
        if (k === '문형') cur.pattern = p[1]; else if (k === '유형') cur.qtype = p[1]; else if (k === '문제') cur.question = p[1];
        else if (k === '내답') cur.my_answer = p[1]; else if (k === '정답') cur.correct_answer = p[1]; else if (k === '해설') cur.explanation = p[1];
        else if (cur.explanation) cur.explanation += ' ' + l;
      } else if (cur.explanation) cur.explanation += ' ' + l;
    }
    if (!quiz.id) quiz.id = 'q-' + (quiz.title + quiz.date).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quiz.date)) quiz.date = '';
    return { quiz, items: items.filter(it => it.question || it.correct_answer) };
  }

  const ansParts = a => { const p = splitBar(a); return hasJa(p[0]) ? { jp: p[0], pron: p[1] || '' } : { ko: p.join(' | ') }; };
  const BL = /（\s*）|\(\s*\)/g;
  function fillBlank(jp, ans) { return K.braceToRuby(jp).replace(BL, ans && ans.jp ? `<span class="blank filled">${K.braceToRuby(ans.jp)}</span>` : '<span class="blank">?</span>'); }
  const sayLine = (jp, ans) => K.toHira(String(jp).replace(BL, ans && ans.jp ? ans.jp : '、').replace(/\{([^|}]+)\|([^}]+)\}/g, '$2'));
  function noteHTML(n, preview) {
    let ans = ansParts(n.correct_answer); const my = ansParts(n.my_answer);
    const fillL = (n.lines || []).find(l => l.sp === '_fill');
    const blankAns = ans.jp ? ans : fillL ? { jp: fillL.jp } : null;
    const oxTxt = k => k === 'O' ? '⭕ 맞다 (O)' : k === 'X' ? '❌ 틀리다 (X)' : esc(k || '-');
    const ansBox = (a, cls, label) => `<div class="${cls}"><small>${label}</small><div class="v">${a.jp ? `<span class="jp">${K.braceToRuby(a.jp)}</span>` : oxTxt(a.ko)}</div>${a.pron ? `<div class="vp">${esc(a.pron)}</div>` : ''}</div>`;
    const lines = (n.lines || []).map((l, i) => {
      if (l.sp === '_fill') return '';
      const main = l.jp ? `<div class="j">${fillBlank(l.jp, blankAns)}${preview ? '' : ` <button class="icon" data-nsay="${n.id}:${i}" title="듣기">🔊</button>`}</div>` : `<div class="k">${esc(l.ko)}</div>`;
      return `<div class="ln ${l.sp}"><div class="av ${l.sp === 'Q' ? 'Q' : esc(l.sp)}">${l.sp === 'Q' ? '文' : esc(l.sp)}</div><div class="bub">${main}${l.jp && l.pron ? `<div class="p">${esc(l.pron)}</div>` : ''}${l.jp && l.ko ? `<div class="t">뜻: ${esc(l.ko)}</div>` : ''}</div></div>`;
    }).join('');
    return `<div class="ncard ${n.resolved ? 'done' : ''}" ${preview ? '' : `data-nid="${n.id}"`}>
      <div class="nh">${n.pattern ? `<span class="tag">${esc(n.pattern)}</span>` : ''}${n.qtype ? `<span>${esc(n.qtype)}</span>` : ''}${n.flagged ? '<span class="tag flag">🚩 문제 오류 의심</span>' : ''}<span class="sp"></span><span>Q${n.q_no || '-'}${preview ? '' : ' · ' + esc(n.created_by || '')}</span></div>
      <div class="ask">${esc(n.question || '')}</div>
      ${lines ? `<div class="dlg">${lines}</div>` : ''}
      <div class="ans">${ansBox(my, 'my', '❌ 내 답')}${ansBox(ans, 'ri', '⭕ 정답')}</div>
      ${n.explanation ? `<div class="exp">💡 ${K.braceToRuby(n.explanation)}</div>` : ''}
      ${preview ? '' : `<div class="nmemo"><textarea data-nmemo="${n.id}" rows="1" placeholder="내 메모 (헷갈린 이유, 외우는 팁 등)">${esc(n.memo || '')}</textarea></div>
      <div class="nact"><button class="${n.resolved ? 'on' : ''}" data-nres="${n.id}">✅ 다 이해함</button><button class="fl ${n.flagged ? 'on' : ''}" data-nflag="${n.id}">🚩 문제 오류</button><button data-nedit="${n.id}">✏️ 수정</button><button data-ndel="${n.id}">🗑 삭제</button></div>`}
    </div>`;
  }

  function visibleNotes() {
    const all = S.notes || [];
    return all.filter(n => (N.tab === 'all' || (N.tab === 'mine' ? n.created_by === S.me : n.flagged)) && (!N.quiz || n.quiz_id === N.quiz) &&
      (!N.pat || n.pattern === N.pat) && (!N.hideDone || !n.resolved) &&
      (!N.q || [n.pattern, n.question, n.explanation, n.memo, n.correct_answer, n.my_answer, JSON.stringify(n.lines || [])].join(' ').includes(N.q)));
  }
  function drawNotes() {
    const all = S.notes || [];
    const c = { mine: all.filter(n => n.created_by === S.me).length, all: all.length, flag: all.filter(n => n.flagged).length };
    $('nTabs').innerHTML = [['mine', '내 오답'], ['all', '모두의 오답'], ['flag', '🚩 오류 의심']].filter(([k]) => k !== 'flag' || c.flag)
      .map(([k, l]) => `<button class="${N.tab === k ? 'on' : ''}" data-ntab="${k}">${l}<span class="c">${c[k]}</span></button>`).join('');
    const quizzes = {}; all.forEach(n => { quizzes[n.quiz_id] = quizzes[n.quiz_id] || { title: n.quiz_title, date: n.quiz_date }; });
    $('nQuiz').innerHTML = `<option value="">모든 퀴즈</option>` + Object.entries(quizzes).sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''))
      .map(([id, q]) => `<option value="${esc(id)}" ${id === N.quiz ? 'selected' : ''}>${esc(q.title || '제목 없음')}${q.date ? ' · ' + fmtDate(q.date) : ''}</option>`).join('');
    const pats = [...new Set(all.map(n => n.pattern).filter(Boolean))].sort();
    $('nPat').innerHTML = `<option value="">모든 문형</option>` + pats.map(p => `<option ${p === N.pat ? 'selected' : ''}>${esc(p)}</option>`).join('');
    $('nPat').classList.toggle('hidden', !pats.length);
    const rows = visibleNotes();
    if (!rows.length) {
      $('nList').innerHTML = `<div class="card empty"><b>${all.length ? '조건에 맞는 오답이 없어요' : '아직 오답노트가 없어요'}</b>${all.length ? '' : '테스트 탭 → 🤖 문형 테스트에서 프롬프트를 만들어 퀴즈를 풀고,<br>결과 화면의 오답 텍스트를 📋 오답 붙여넣기에 넣어 보세요.'}</div>`;
      return;
    }
    const groups = {};
    rows.forEach(n => { (groups[n.quiz_id] = groups[n.quiz_id] || []).push(n); });
    $('nList').innerHTML = Object.values(groups).sort((a, b) => (b[0].quiz_date || '').localeCompare(a[0].quiz_date || '') || b[0].id - a[0].id).map(g =>
      `<div class="qhead">📝 ${esc(g[0].quiz_title || '제목 없는 퀴즈')} <small>${g[0].quiz_date ? fmtDay(g[0].quiz_date) + ' · ' : ''}오답 ${g.length}개</small></div>` +
      g.sort((a, b) => (a.q_no || 0) - (b.q_no || 0)).map(n => noteHTML(n)).join('')).join('');
  }
  $('nTabs').onclick = e => { const b = e.target.closest('[data-ntab]'); if (b) { N.tab = b.dataset.ntab; drawNotes(); } };
  $('nQuiz').onchange = e => { N.quiz = e.target.value; drawNotes(); };
  $('nPat').onchange = e => { N.pat = e.target.value; drawNotes(); };
  $('nHideDone').onchange = e => { N.hideDone = e.target.checked; drawNotes(); };
  let nqT; $('nQ').oninput = e => { clearTimeout(nqT); nqT = setTimeout(() => { N.q = e.target.value.trim(); drawNotes(); }, 150); };
  $('nRefresh').onclick = async () => { await loadAll(); toast('최신 내용으로 새로고침했어요'); };
  $('nPasteBtn').onclick = () => { $('nPaste').classList.toggle('hidden'); $('nErr').textContent = ''; if (!$('nPaste').classList.contains('hidden')) $('nText').focus(); };
  $('nCancel').onclick = () => { $('nPaste').classList.add('hidden'); $('nPreview').innerHTML = ''; N.preview = null; };
  $('nParse').onclick = () => {
    const r = parseWrongText($('nText').value);
    $('nErr').textContent = '';
    if (!r.items.length) { $('nErr').textContent = /오답 없음/.test($('nText').value) ? '오답이 없는 결과예요. 축하해요! 🎉' : '오답을 찾지 못했어요. "=== 간바레 오답노트 ===" 텍스트 전체를 붙여넣었는지 확인해 주세요.'; $('nPreview').innerHTML = ''; return; }
    const exist = new Set((S.notes || []).filter(n => n.created_by === S.me && n.quiz_id === r.quiz.id).map(n => n.q_no));
    N.preview = r;
    const fresh = r.items.filter(it => !exist.has(it.q_no));
    $('nPreview').innerHTML = `<div class="qhead">미리보기 · ${esc(r.quiz.title || '제목 없음')} <small>${r.quiz.date ? fmtDay(r.quiz.date) + ' · ' : ''}${r.quiz.score ? '점수 ' + esc(r.quiz.score) + ' · ' : ''}오답 ${r.items.length}개${exist.size ? ` (이미 저장된 ${r.items.length - fresh.length}개 제외)` : ''}</small></div>` +
      r.items.map(it => noteHTML(it, true)).join('') +
      `<button class="btn full" id="nSave" ${fresh.length ? '' : 'disabled'}>${fresh.length ? `오답 ${fresh.length}개 오답노트에 저장` : '이미 모두 저장된 오답이에요'}</button>`;
    $('nSave').onclick = saveParsed;
  };
  async function saveParsed() {
    const r = N.preview; if (!r) return;
    const exist = new Set((S.notes || []).filter(n => n.created_by === S.me && n.quiz_id === r.quiz.id).map(n => n.q_no));
    const rows = r.items.filter(it => !exist.has(it.q_no)).map(it => ({
      quiz_id: r.quiz.id, quiz_title: r.quiz.title || null, quiz_date: r.quiz.date || today(), q_no: it.q_no, pattern: it.pattern || null, qtype: it.qtype || null,
      question: it.question || null, lines: it.lines || [], my_answer: it.my_answer || null, correct_answer: it.correct_answer || null, explanation: it.explanation || null,
      created_by: S.me, updated_by: S.me }));
    $('nSave').disabled = true;
    try { await store.insertMany('wrong_notes', rows); await loadNotes(); toast(`오답 ${rows.length}개를 저장했어요`);
      $('nText').value = ''; $('nPreview').innerHTML = ''; $('nPaste').classList.add('hidden'); N.preview = null; N.tab = 'mine'; N.quiz = r.quiz.id; drawAll(); }
    catch (e) { fail(e, '저장'); $('nSave').disabled = false; }
  }
  const noteById = id => (S.notes || []).find(n => n.id === id);
  async function patchNote(id, patch, msg) {
    try { const r = await store.update('wrong_notes', id, { ...patch, updated_by: S.me }); S.notes = S.notes.map(n => n.id === id ? r : n); if (msg) toast(msg); drawNotes(); drawHome(); }
    catch (e) { fail(e, '저장'); }
  }
  $('nList').onclick = async e => {
    const t = e.target;
    const sy = t.closest('[data-nsay]'); if (sy) { const [id, i] = sy.dataset.nsay.split(':').map(Number); const n = noteById(id); if (n) { const fl = (n.lines || []).find(l => l.sp === '_fill'), a = ansParts(n.correct_answer); speak(sayLine(n.lines[i].jp, a.jp ? a : fl ? { jp: fl.jp } : null)); } return; }
    const rs = t.closest('[data-nres]'); if (rs) { const n = noteById(+rs.dataset.nres); patchNote(n.id, { resolved: !n.resolved }, n.resolved ? '다시 볼 오답으로 돌렸어요' : '다 이해했어요! 👍'); return; }
    const fl = t.closest('[data-nflag]'); if (fl) { const n = noteById(+fl.dataset.nflag); patchNote(n.id, { flagged: !n.flagged }, n.flagged ? '오류 표시를 풀었어요' : '🚩 문제 오류 의심으로 표시했어요. ✏️로 고칠 수 있어요'); return; }
    const ed = t.closest('[data-nedit]'); if (ed) { openNote(noteById(+ed.dataset.nedit)); return; }
    const dl = t.closest('[data-ndel]'); if (dl) { const n = noteById(+dl.dataset.ndel); if (n && confirm('이 오답을 삭제할까요?')) delNote(n); }
  };
  $('nList').addEventListener('focusout', e => {
    const m = e.target.closest('[data-nmemo]'); if (!m) return;
    const n = noteById(+m.dataset.nmemo); const v = m.value.trim();
    if (n && (n.memo || '') !== v) patchNote(n.id, { memo: v || null }, '메모를 저장했어요');
  });
  async function delNote(n) {
    try { await store.remove('wrong_notes', n.id); S.notes = S.notes.filter(x => x.id !== n.id); toast('삭제했어요'); drawNotes(); drawHome(); }
    catch (e) { fail(e, '삭제'); }
  }
  let nEditing = null;
  function openNote(n) {
    if (!n) return; nEditing = n;
    $('eNPat').value = n.pattern || ''; $('eNType').value = n.qtype || ''; $('eNAsk').value = n.question || '';
    $('eNLines').value = (n.lines || []).map(l => l.sp === '_fill' ? `빈칸: ${l.jp}` : `${l.sp === 'Q' ? '문' : l.sp}: ` + (l.jp ? [l.jp, l.pron, l.ko].filter((x, i) => x || i === 0).join(' | ') : l.ko)).join('\n');
    $('eNMy').value = n.my_answer || ''; $('eNAns').value = n.correct_answer || ''; $('eNExp').value = n.explanation || ''; $('eNMemo').value = n.memo || '';
    $('eNErr').textContent = ''; $('nm').classList.add('on');
  }
  const closeNote = () => { $('nm').classList.remove('on'); nEditing = null; };
  $('eNCancel').onclick = closeNote; $('nm').onclick = e => { if (e.target.id === 'nm') closeNote(); };
  $('eNSave').onclick = async () => {
    if (!nEditing) return;
    const lines = $('eNLines').value.split('\n').map(parseLine).filter(Boolean);
    await patchNote(nEditing.id, { pattern: $('eNPat').value.trim() || null, qtype: $('eNType').value.trim() || null, question: $('eNAsk').value.trim() || null, lines,
      my_answer: $('eNMy').value.trim() || null, correct_answer: $('eNAns').value.trim() || null, explanation: $('eNExp').value.trim() || null, memo: $('eNMemo').value.trim() || null }, '수정했어요');
    closeNote();
  };
  $('eNDel').onclick = async () => { if (nEditing && confirm('이 오답을 삭제할까요?')) { const n = nEditing; closeNote(); delNote(n); } };

  /* =========================================================
     가져오기 (단어 / 문형)
     ========================================================= */
  const IM = { kind: 'words', rows: [] };
  const WKEYS = { '표기': 'word', '읽기': 'reading', '발음': 'pron_ko', '뜻': 'meaning', '품사': 'category', '과': 'lesson', '메모': 'memo' };
  const PKEYS = { '구분': 'style', '품사': 'applies_to', '문형': 'form', '발음': 'pron_ko', '뜻': 'meaning', '만드는법': 'how_to', '예문': 'example_jp', '예문발음': 'example_pron', '예문뜻': 'example_ko', '메모': 'notes', '과': 'lesson' };
  const normCat = c => { const x = String(c || '').replace(/\s/g, ''); const hit = CATS.find(([n]) => n.replace(/\s/g, '') === x); return hit ? hit[0] : (/형용사/.test(x) && /な/.test(x) ? 'な형용사' : /형용사/.test(x) ? 'い형용사' : /1단/.test(x) ? '1단 동사' : /5단/.test(x) ? '5단 동사' : /불규칙/.test(x) ? '불규칙 동사' : '기타'); };
  const normStyle = s => /존댓/.test(s || '') ? '존댓말' : /공통/.test(s || '') ? '공통' : '반말';
  function parseImport(text, kind) {
    const map = kind === 'words' ? WKEYS : PKEYS, rows = [];
    String(text || '').replace(/\r/g, '').split('\n').forEach(line => {
      if (!/[|｜]/.test(line) || /^\s*(===|```)/.test(line)) return;
      const r = {};
      splitBar(line).forEach(seg => { const m = seg.match(/^\s*([^:：]{1,8})\s*[:：]\s*(.*)$/); if (!m) return; const k = map[m[1].replace(/\s/g, '')]; if (k) r[k] = m[2].trim(); });
      if (Object.keys(r).length >= 2) rows.push(r);
    });
    return rows;
  }
  function openImport(kind) {
    IM.kind = kind; IM.rows = [];
    $('imTitle').textContent = kind === 'words' ? '📥 단어 가져오기' : '📥 문형 가져오기';
    $('imHow').innerHTML = kind === 'words'
      ? '프롬프트를 복사해 Claude·ChatGPT에 붙여넣고, <b>교재 단어 목록 사진·파일·텍스트</b>를 함께 보내세요. AI가 사이트 형식으로 바꿔 줘요.'
      : '프롬프트를 복사해 Claude·ChatGPT에 붙여넣고, <b>문형을 정리한 Word 파일·텍스트·사진</b>을 함께 보내세요. 한글 발음으로 적힌 문형도 일본어로 바꿔 줘요.';
    $('imText').value = ''; $('imPrev').innerHTML = ''; $('imErr').textContent = ''; $('imSave').classList.add('hidden'); $('imCopied').classList.add('hidden');
    $('imText').placeholder = kind === 'words' ? '=== 간바레 단어 가져오기 ===\n표기: 覚える | 읽기: おぼえる | 발음: 오보에루 | 뜻: 외우다 | 품사: 1단 동사 | 과: 3과 | 메모:\n=== 끝 ===' : '=== 간바레 문형 가져오기 ===\n구분: 존댓말 | 품사: 1단 동사 | 문형: ～ませんか | 발음: ~마셍까 | 뜻: ... | 만드는 법: ... | 예문: ... | 예문 발음: ... | 예문 뜻: ... | 메모:\n=== 끝 ===';
    $('imLesson').value = localStorage.getItem('ganbare-lesson') || ''; $('imDate').value = localStorage.getItem('ganbare-date') || today();
    $('im').classList.add('on');
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-import]'); if (b) openImport(b.dataset.import); });
  const closeImport = () => $('im').classList.remove('on');
  $('imCancel').onclick = closeImport; $('im').onclick = e => { if (e.target.id === 'im') closeImport(); };
  $('imCopy').onclick = async () => showCopied($('imCopied'), await copyText(IM.kind === 'words' ? window.IMPORT_PROMPT_WORDS : window.IMPORT_PROMPT_PATTERNS));

  function checkRow(r) {
    if (IM.kind === 'words') {
      if (!r.reading || !r.meaning) return '읽기·뜻 필요';
      if (!K.isKana(r.reading)) return '읽기는 가나만';
      const w = r.word || r.reading;
      if (S.words.some(x => x.word === w && x.reading === r.reading)) return 'dup';
    } else {
      if (!r.form || !r.meaning) return '문형·뜻 필요';
      if (S.patterns.some(p => p.form === r.form && p.style === normStyle(r.style))) return 'dup';
    }
    return '';
  }
  $('imParse').onclick = () => {
    const rows = parseImport($('imText').value, IM.kind);
    $('imErr').textContent = '';
    if (!rows.length) { $('imErr').textContent = '읽을 수 있는 줄이 없어요. AI가 준 "=== 간바레 … 가져오기 ===" 텍스트를 그대로 붙여넣어 주세요.'; $('imPrev').innerHTML = ''; $('imSave').classList.add('hidden'); return; }
    IM.rows = rows.map(r => IM.kind === 'words' ? { ...r, category: normCat(r.category) } : { ...r, style: normStyle(r.style) });
    drawImport();
  };
  function drawImport() {
    const W = IM.kind === 'words';
    const cols = W ? [['word', '표기'], ['reading', '읽기 *'], ['pron_ko', '발음'], ['meaning', '뜻 *'], ['category', '품사'], ['lesson', '과'], ['memo', '메모']]
      : [['style', '구분'], ['applies_to', '품사'], ['form', '문형 *'], ['pron_ko', '발음'], ['meaning', '뜻 *'], ['how_to', '만드는 법'], ['example_jp', '예문'], ['example_pron', '예문 발음'], ['example_ko', '예문 뜻'], ['notes', '메모'], ['lesson', '과']];
    const cell = (r, i, [k]) => {
      if (W && k === 'category') return `<select data-ik="${i}:${k}">${CATS.map(([c]) => `<option ${c === r[k] ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
      if (!W && k === 'style') return `<select data-ik="${i}:${k}">${['반말', '존댓말', '공통'].map(c => `<option ${c === r[k] ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
      return `<input data-ik="${i}:${k}" value="${esc(r[k] || '')}" class="${/word|reading|form|example_jp/.test(k) ? 'jpi' : ''}">`;
    };
    IM.rows.forEach(r => { const c = checkRow(r); r._st = c; if (r._on === undefined) r._on = !c; });
    const n = IM.rows.filter(r => r._on).length, dup = IM.rows.filter(r => r._st === 'dup').length, bad = IM.rows.filter(r => r._st && r._st !== 'dup').length;
    $('imPrev').innerHTML = `<div class="muted" style="margin-top:12px">${IM.rows.length}개 읽음 · 등록 예정 ${n}개${dup ? ` · 이미 있는 것 ${dup}개(노란 줄)` : ''}${bad ? ` · 확인 필요 ${bad}개(빨간 줄)` : ''}. 칸을 눌러 바로 고칠 수 있어요.</div>
      <div class="ptable-wrap"><table class="ptable"><thead><tr><th><input type="checkbox" id="imAll" ${n === IM.rows.length ? 'checked' : ''}></th>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th>상태</th></tr></thead><tbody>` +
      IM.rows.map((r, i) => `<tr class="${r._st === 'dup' ? 'dup' : r._st ? 'bad' : ''}"><td><input type="checkbox" data-ion="${i}" ${r._on ? 'checked' : ''}></td>${cols.map(c => `<td>${cell(r, i, c)}</td>`).join('')}<td class="stt2">${r._st === 'dup' ? '이미 있음' : r._st ? '⚠ ' + esc(r._st) : '새로 추가'}</td></tr>`).join('') + '</tbody></table></div>';
    $('imSave').classList.toggle('hidden', !IM.rows.length); $('imSave').textContent = `선택한 ${n}개 등록`; $('imSave').disabled = !n;
  }
  $('imPrev').addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'imAll') { IM.rows.forEach(r => { r._on = t.checked && (!r._st || r._st === 'dup'); }); drawImport(); return; }
    if (t.dataset.ion) { IM.rows[+t.dataset.ion]._on = t.checked; drawImport(); return; }
    if (t.dataset.ik) { const [i, k] = t.dataset.ik.split(':'); IM.rows[+i][k] = t.value.trim(); const r = IM.rows[+i], was = r._st; r._st = checkRow(r); if (was && was !== 'dup' && !r._st) r._on = true; drawImport(); }
  });
  $('imSave').onclick = async () => {
    const lesson = $('imLesson').value.trim() || null, study_date = $('imDate').value || null;
    const pick = IM.rows.filter(r => r._on);
    const badRow = pick.find(r => r._st && r._st !== 'dup'); if (badRow) { $('imErr').textContent = '⚠ 표시된 줄을 고치거나 체크를 풀어 주세요.'; return; }
    const rows = pick.map(r => {
      const base = { lesson: r.lesson || lesson, study_date, created_by: S.me, updated_by: S.me };
      if (IM.kind === 'words') return { ...base, word: r.word || r.reading, reading: r.reading, pron_ko: r.pron_ko || K.kanaToHangul(r.reading), meaning: r.meaning, category: normCat(r.category), memo: r.memo || null };
      return { ...base, style: normStyle(r.style), applies_to: r.applies_to || null, form: r.form, pron_ko: r.pron_ko || null, meaning: r.meaning, how_to: r.how_to || null,
        example_jp: r.example_jp || null, example_pron: r.example_pron || (r.example_jp ? K.sentenceToHangul(r.example_jp) : null), example_ko: r.example_ko || null, notes: r.notes || null };
    });
    $('imSave').disabled = true;
    try {
      const table = IM.kind === 'words' ? 'words' : 'patterns';
      const main = rows.filter(r => r.style !== '공통'), com = rows.filter(r => r.style === '공통');
      if (main.length) await store.insertMany(table, main);
      if (com.length) { try { await store.insertMany(table, com); } catch (e) { alert("'공통' 문형은 추가하지 못했어요. Supabase에서 02_patterns_common.sql을 먼저 실행해 주세요."); } }
      if (study_date) localStorage.setItem('ganbare-date', study_date);
      if (lesson) localStorage.setItem('ganbare-lesson', lesson);
      await loadAll(); closeImport(); toast(`${rows.length}개를 등록했어요`);
    } catch (e) { fail(e, '등록'); } finally { $('imSave').disabled = false; }
  };

  /* =========================================================
     메모
     ========================================================= */
  const M = { tag: '질문', tab: 'all', q: '' };
  async function loadMemos() { S.memos = await store.list('memos'); }
  const TAGCLS = { '질문': 'q', '헷갈림': 'h', '공유': 's' };
  const TAGICON = { '질문': '❓', '헷갈림': '🤔', '공유': '💡' };
  function memoBody(t) {
    let h = K.braceToRuby(t);
    h = h.replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
    return h;
  }
  function drawMemos() {
    const all = S.memos || [];
    const cnt = k => k === 'all' ? all.length : k === 'mine' ? all.filter(m => m.created_by === S.me).length : all.filter(m => m.tag === k).length;
    $('mTabs').innerHTML = [['all', '전체'], ['질문', '❓ 질문'], ['헷갈림', '🤔 헷갈림'], ['공유', '💡 공유'], ['mine', '내 메모']]
      .map(([k, l]) => `<button class="${M.tab === k ? 'on' : ''}" data-mtab="${k}">${l}<span class="c">${cnt(k)}</span></button>`).join('');
    const rows = all.filter(m => (M.tab === 'all' || (M.tab === 'mine' ? m.created_by === S.me : m.tag === M.tab)) && (!M.q || (m.body || '').includes(M.q)))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.created_at || '').localeCompare(a.created_at || ''));
    $('mList').innerHTML = rows.length ? rows.map(m => `<div class="mitem ${m.pinned ? 'pin' : ''}" data-mid="${m.id}">
        <div class="mh"><span class="tagm ${TAGCLS[m.tag] || 's'}">${TAGICON[m.tag] || ''} ${esc(m.tag)}</span>${m.pinned ? '<span>📌 고정</span>' : ''}
          <span><b style="color:var(--ink)">${esc(m.created_by || '')}</b> · ${ago(m.created_at)}${m.updated_by && m.updated_by !== m.created_by ? ` · ${esc(m.updated_by)} 수정` : (m.updated_at && m.created_at && new Date(m.updated_at) - new Date(m.created_at) > 60000 ? ' · 수정됨' : '')}</span>
          <span class="sp"></span>
          <span class="mact"><button data-mpin="${m.id}" title="${m.pinned ? '고정 풀기' : '맨 위에 고정'}">📌</button><button data-medit="${m.id}" title="수정">✏️</button><button data-mdel="${m.id}" title="삭제">🗑</button></span></div>
        <div class="mb2">${memoBody(m.body || '')}</div>
        <div class="mfoot2"><button class="${openCmts.has(m.id) ? 'on' : ''}" data-ctog="${m.id}">💬 댓글 ${cmtsOf(m.id).length || ''}${openCmts.has(m.id) ? ' 접기' : ''}</button></div>
        ${cmtHTML(m)}</div>`).join('')
      : `<div class="card empty"><b>${all.length ? '조건에 맞는 메모가 없어요' : '아직 메모가 없어요'}</b>${all.length ? '' : '헷갈리는 점이나 공유하고 싶은 내용을 첫 메모로 남겨 보세요.'}</div>`;
  }
  $('mTag').onclick = e => { const b = e.target.closest('[data-mtag]'); if (!b) return; M.tag = b.dataset.mtag; document.querySelectorAll('#mTag button').forEach(x => x.classList.toggle('on', x === b)); };
  $('mTabs').onclick = e => { const b = e.target.closest('[data-mtab]'); if (b) { M.tab = b.dataset.mtab; drawMemos(); } };
  let mqT; $('mQ').oninput = e => { clearTimeout(mqT); mqT = setTimeout(() => { M.q = e.target.value.trim(); drawMemos(); }, 150); };
  $('mRefresh').onclick = async () => { await loadAll(); toast('최신 내용으로 새로고침했어요'); };
  $('mKbd').onclick = () => { $('mBody').focus(); showKbd($('mBody')); };
  $('mPost').onclick = async () => {
    const body = $('mBody').value.trim(); if (!body) { toast('내용을 입력해 주세요'); $('mBody').focus(); return; }
    $('mPost').disabled = true;
    try { const r = await store.insert('memos', { tag: M.tag, body, pinned: false, created_by: S.me, updated_by: S.me }); S.memos.push(r); $('mBody').value = ''; hideKbd(); toast('메모를 올렸어요'); drawMemos(); loadHomeExtras(); }
    catch (e) { fail(e, '저장'); } finally { $('mPost').disabled = false; }
  };
  const memoById = id => (S.memos || []).find(m => m.id === id);
  async function patchMemo(id, patch, msg) {
    try { const r = await store.update('memos', id, { ...patch, updated_by: S.me }); S.memos = S.memos.map(m => m.id === id ? r : m); if (msg) toast(msg); drawMemos(); loadHomeExtras(); }
    catch (e) { fail(e, '저장'); }
  }
  $('mList').onclick = async e => {
    const t = e.target;
    if (await memoCommentClick(e)) return;
    const pn = t.closest('[data-mpin]'); if (pn) { const m = memoById(+pn.dataset.mpin); patchMemo(m.id, { pinned: !m.pinned }, m.pinned ? '고정을 풀었어요' : '📌 맨 위에 고정했어요'); return; }
    const dl = t.closest('[data-mdel]'); if (dl) {
      const m = memoById(+dl.dataset.mdel); if (!m || !confirm('이 메모를 삭제할까요?\n모두의 메모에서 사라져요.')) return;
      try { await store.remove('memos', m.id); S.memos = S.memos.filter(x => x.id !== m.id); toast('삭제했어요'); drawMemos(); loadHomeExtras(); } catch (er) { fail(er, '삭제'); }
      return;
    }
    const ed = t.closest('[data-medit]'); if (ed) {
      const m = memoById(+ed.dataset.medit), box = t.closest('.mitem').querySelector('.mb2');
      box.innerHTML = `<div class="seg" style="max-width:380px;margin-bottom:8px">${['질문', '헷갈림', '공유'].map(g => `<button data-etag="${g}" class="${g === m.tag ? 'on' : ''}">${TAGICON[g]} ${g}</button>`).join('')}</div>
        <textarea rows="4">${esc(m.body)}</textarea><div class="row" style="margin-top:8px"><button class="btn sm" data-msave="${m.id}">저장</button><button class="btn sm ghost" data-mcancel>취소</button></div>`;
      box.style.whiteSpace = 'normal'; box.querySelector('textarea').focus(); return;
    }
    const et = t.closest('[data-etag]'); if (et) { et.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === et)); return; }
    if (t.closest('[data-mcancel]')) { drawMemos(); return; }
    const sv = t.closest('[data-msave]'); if (sv) {
      const box = t.closest('.mitem'), body = box.querySelector('textarea').value.trim(), tag = (box.querySelector('[data-etag].on') || {}).dataset?.etag;
      if (!body) { toast('내용을 입력해 주세요'); return; }
      patchMemo(+sv.dataset.msave, { body, tag: tag || '공유' }, '수정했어요');
    }
  };

  /* =========================================================
     사용 가이드
     ========================================================= */
  let guideDrawn = false, guideJump = 0;
  function drawGuide() {
    if (guideDrawn) return; guideDrawn = true;
    const secs = window.GUIDE_SECTIONS || [];
    $('p-guide').innerHTML = `<div class="hello" style="margin-bottom:16px"><div><h2>📘 사용 가이드</h2><p class="sub" style="margin:0">간바레간바레니혼고를 처음 쓰는 스터디원을 위한 안내예요. 궁금한 부분부터 골라 읽어도 돼요.</p></div></div>
      <div class="gwrap"><nav class="gtoc" id="gToc">${secs.map(([id, t]) => `<a data-gsec="${id}">${t}</a>`).join('')}</nav>
      <div>${secs.map(([id, t, body]) => `<section class="gsec" id="g-${id}"><h3>${t}</h3>${body}</section>`).join('')}</div></div>`;
  }
  function openGuide(sec) {
    go('guide');
    if (sec) setTimeout(() => { const el = $('g-' + sec); guideJump = Date.now(); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); markToc(sec); }, 60);
  }
  const markToc = id => document.querySelectorAll('#gToc a').forEach(a => a.classList.toggle('on', a.dataset.gsec === id));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-guide]'); if (g) { e.preventDefault(); openGuide(g.dataset.guide); return; }
    const t = e.target.closest('[data-gsec]'); if (t) { openGuide(t.dataset.gsec); return; }
    const m = e.target.closest('[data-p2]'); if (m) go(m.dataset.p2);
  });
  window.addEventListener('scroll', () => {
    if (S.page !== 'guide' || Date.now() - guideJump < 1200) return;
    const secs = [...document.querySelectorAll('.gsec')]; let cur = secs[0];
    secs.forEach(s => { if (s.getBoundingClientRect().top < 140) cur = s; });
    if (cur) markToc(cur.id.slice(2));
  }, { passive: true });

  /* =========================================================
     메모 댓글
     ========================================================= */
  const openCmts = new Set();
  async function loadComments() {
    try { S.comments = await store.list('memo_comments'); S.noComments = false; }
    catch (e) { console.warn('댓글 표 없음', e); S.comments = []; S.noComments = true; }
  }
  const cmtsOf = id => (S.comments || []).filter(c => c.memo_id === id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  function cmtHTML(m) {
    const list = cmtsOf(m.id);
    if (!openCmts.has(m.id)) return '';
    return `<div class="cmts">${list.map(c => `<div class="cmt" data-cid="${c.id}"><div class="cav">${esc((c.created_by || '?').slice(0, 1))}</div><div class="cb">
        <div class="ch"><b>${esc(c.created_by || '')}</b><span>${ago(c.created_at)}${c.updated_by && c.updated_by !== c.created_by ? ' · ' + esc(c.updated_by) + ' 수정' : ''}</span><span class="sp"></span><button data-cedit="${c.id}" title="수정">✏️</button><button data-cdel="${c.id}" title="삭제">🗑</button></div>
        <div class="ct">${memoBody(c.body)}</div></div></div>`).join('')}
      ${S.noComments ? `<div class="cnote">댓글을 쓰려면 Supabase에서 03_memo_comments.sql을 먼저 실행해 주세요.</div>` :
      `<div class="cnew"><textarea rows="1" data-cnew="${m.id}" placeholder="댓글 달기 (Ctrl+Enter로 올리기)"></textarea><button class="btn sm" data-cpost="${m.id}">올리기</button></div>`}</div>`;
  }
  async function postComment(mid) {
    const ta = document.querySelector(`[data-cnew="${mid}"]`); const body = ta && ta.value.trim();
    if (!body) { toast('댓글 내용을 입력해 주세요'); return; }
    try { const r = await store.insert('memo_comments', { memo_id: mid, body, created_by: S.me, updated_by: S.me }); S.comments.push(r); drawMemos(); toast('댓글을 달았어요');
      setTimeout(() => { const t = document.querySelector(`[data-cnew="${mid}"]`); if (t) t.focus(); }, 30); }
    catch (e) { fail(e, '댓글'); }
  }
  async function memoCommentClick(e) {
    const t = e.target;
    const tg = t.closest('[data-ctog]'); if (tg) { const id = +tg.dataset.ctog; openCmts.has(id) ? openCmts.delete(id) : openCmts.add(id); drawMemos(); if (openCmts.has(id)) setTimeout(() => { const ta = document.querySelector(`[data-cnew="${id}"]`); if (ta) ta.focus(); }, 30); return true; }
    const pc = t.closest('[data-cpost]'); if (pc) { postComment(+pc.dataset.cpost); return true; }
    const cd = t.closest('[data-cdel]'); if (cd) {
      if (!confirm('이 댓글을 삭제할까요?')) return true;
      try { await store.remove('memo_comments', +cd.dataset.cdel); S.comments = S.comments.filter(c => c.id !== +cd.dataset.cdel); drawMemos(); toast('삭제했어요'); } catch (er) { fail(er, '삭제'); }
      return true;
    }
    const ce = t.closest('[data-cedit]'); if (ce) {
      const c = S.comments.find(x => x.id === +ce.dataset.cedit), box = t.closest('.cb').querySelector('.ct');
      box.innerHTML = `<textarea rows="2" style="width:100%">${esc(c.body)}</textarea><div class="row" style="margin-top:6px"><button class="btn sm" data-csave="${c.id}">저장</button><button class="btn sm ghost" data-mcancel>취소</button></div>`;
      box.style.whiteSpace = 'normal'; box.querySelector('textarea').focus(); return true;
    }
    const cs = t.closest('[data-csave]'); if (cs) {
      const body = t.closest('.cb').querySelector('textarea').value.trim(); if (!body) { toast('내용을 입력해 주세요'); return true; }
      try { const r = await store.update('memo_comments', +cs.dataset.csave, { body, updated_by: S.me }); S.comments = S.comments.map(c => c.id === r.id ? r : c); drawMemos(); toast('수정했어요'); } catch (er) { fail(er, '저장'); }
      return true;
    }
    return false;
  }
  $('mList').addEventListener('keydown', e => { const ta = e.target.closest('[data-cnew]'); if (ta && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); postComment(+ta.dataset.cnew); } });

  /* =========================================================
     플래시카드 (학습용 · 단어장에서 열기)
     ========================================================= */
  const FC = { cards: [], all: [], idx: 0, known: {}, flipped: false };
  ['fFrontSel', 'fShuffle', 'fAuto', 'tUnstar'].forEach(id => {
    const v = localStorage.getItem('ganbare-' + id), el = $(id);
    if (v !== null) { if (el.type === 'checkbox') el.checked = v === '1'; else el.value = v; }
    el.addEventListener('change', () => { localStorage.setItem('ganbare-' + id, el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value); if (id === 'fFrontSel' && FC.cards.length && !$('fPlay').classList.contains('hidden')) drawFlash(); });
  });
  function openFlash(words) {
    if (!words.length) { toast('카드로 볼 단어가 없어요'); return; }
    FC.all = words.slice(); FC.cards = FC.all; go('flash'); startFlash(words);
  }
  function startFlash(words) {
    FC.cards = $('fShuffle').checked ? shuffle(words) : words.slice(); FC.idx = 0; FC.known = {};
    $('fPlay').classList.remove('hidden'); $('fDone').classList.add('hidden'); drawFlash();
  }
  function drawFlash() {
    const w = FC.cards[FC.idx], front = $('fFrontSel').value; FC.flipped = false;
    $('fPt').textContent = `${FC.idx + 1} / ${FC.cards.length}`;
    $('fPb').style.width = (FC.idx / FC.cards.length * 100) + '%';
    const k = Object.values(FC.known);
    $('fPs').textContent = `😊 ${k.filter(x => x).length} · 😵 ${k.filter(x => !x).length}`;
    const star = markOf(w.id, 'hard') ? '<span class="fmark">⭐ 안 외워지는 단어</span>' : '';
    const jp = `<span class="big">${K.rubyHTML(w.word, w.reading)}</span>`;
    $('fFront').innerHTML = star + (front === 'j' ? `<div class="lbl">일본어</div>${jp}` : `<div class="lbl">뜻</div><div class="bigk">${esc(w.meaning)}</div>`);
    $('fBack').innerHTML = star + (front === 'j'
      ? `${jp}<div class="p">${esc(w._pron)}</div><div class="m">${esc(w.meaning)}</div><div class="p">${esc(w.category)}</div>`
      : `<div class="m">${esc(w.meaning)}</div>${jp}<div class="p">${esc(w._pron)} · ${esc(w.category)}</div>`) + (w.memo ? `<div class="memo">${esc(w.memo)}</div>` : '');
    $('fFront').classList.remove('hidden'); $('fBack').classList.add('hidden'); $('fCard').classList.remove('flipped');
    $('fHint').textContent = '카드를 누르면 뒤집혀요';
    $('fPrev').disabled = FC.idx === 0;
    if ($('fAuto').checked && front === 'j') speak(w.reading);
  }
  function flip() {
    FC.flipped = !FC.flipped;
    $('fFront').classList.toggle('hidden', FC.flipped); $('fBack').classList.toggle('hidden', !FC.flipped); $('fCard').classList.toggle('flipped', FC.flipped);
    $('fHint').textContent = FC.flipped ? '알아요 / 몰라요를 골라 주세요' : '카드를 누르면 뒤집혀요';
    if (FC.flipped && $('fFrontSel').value === 'k' && $('fAuto').checked) speak(FC.cards[FC.idx].reading);
  }
  async function flashAnswer(ok) {
    const w = FC.cards[FC.idx]; FC.known[FC.idx] = ok;
    try {
      const m = markOf(w.id, 'hard');
      if (!ok && !m) S.marks.push(await store.insert('word_marks', { word_id: w.id, nickname: S.me, kind: 'hard' }));
      if (ok && m && $('tUnstar').checked) { await store.remove('word_marks', m.id); S.marks = S.marks.filter(x => x !== m); }
    } catch (e) { console.error(e); }
    if (FC.idx < FC.cards.length - 1) { FC.idx++; drawFlash(); } else flashDone();
  }
  function flashDone() {
    const no = FC.cards.filter((_, i) => FC.known[i] === false), yes = FC.cards.length - no.length;
    $('fKnown').textContent = yes; $('fUnknown').textContent = no.length;
    $('fDoneMsg').innerHTML = no.length ? `😵 몰라요 ${no.length}개는 <b>단어장 → ⭐ 내가 안 외워지는 단어</b>에 표시했어요. 한 번 더 보고 넘어가요!` : '모두 알아요! 🎉 테스트로 확인해 볼까요?';
    $('fAgainNo').classList.toggle('hidden', !no.length);
    $('fNoList').innerHTML = no.map(w => `<div class="twrong">${jpBlock(w, '')}<span class="m">${esc(w.meaning)}<div class="muted">${esc(w._pron)} · ${esc(w.category)}</div></span><button class="icon" data-wsay="${esc(w.reading)}">🔊</button></div>`).join('');
    FC.lastNo = no;
    $('fPlay').classList.add('hidden'); $('fDone').classList.remove('hidden'); drawAll();
  }
  $('fCard').onclick = flip;
  $('fYes').onclick = () => flashAnswer(true);
  $('fNo').onclick = () => flashAnswer(false);
  $('fPrev').onclick = () => { if (FC.idx > 0) { FC.idx--; drawFlash(); } };
  $('fSay').onclick = () => speak(FC.cards[FC.idx].reading);
  $('fBackTo').onclick = () => go('words');
  $('fAgainNo').onclick = () => startFlash(FC.lastNo || []);
  $('fAgainAll').onclick = () => startFlash(FC.all);
  $('fToTest').onclick = () => { T.sel = new Set(FC.all.map(w => w.id)); T.f = { list: 'all', cat: '', date: '', lesson: '' }; go('test'); setTMode('word'); };
  $('fNoList').onclick = e => { const b = e.target.closest('[data-wsay]'); if (b) speak(b.dataset.wsay); };
  $('wFlash').onclick = () => {
    const pick = S.sel.size ? S.words.filter(w => S.sel.has(w.id)) : (S.visible || []);
    if (!S.sel.size && pick.length) toast(`체크한 단어가 없어서 지금 보이는 단어 ${pick.length}개로 카드를 만들었어요`);
    openFlash(pick);
  };
  document.addEventListener('keydown', e => {
    if (S.page !== 'flash' || $('fPlay').classList.contains('hidden') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) return;
    if (e.key === ' ') { e.preventDefault(); flip(); } else if (e.key === '1') flashAnswer(false); else if (e.key === '2') flashAnswer(true);
    else if (e.key === 'ArrowLeft') $('fPrev').click(); else if (e.key === 'ArrowRight') flashAnswer(true);
  });

  /* =========================================================
     내보내기 · 백업 · 되살리기
     ========================================================= */
  const ymd = () => today().replace(/-/g, '');
  function download(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('엑셀 도구를 불러오지 못했어요 (인터넷 연결 확인)'));
      document.head.appendChild(s);
    });
  }
  const dt = iso => iso ? iso.slice(0, 16).replace('T', ' ') : '';
  const linesTxt = ls => (ls || []).filter(l => l.sp !== '_fill').map(l => `${l.sp === 'Q' ? '문' : l.sp}: ${l.jp ? [l.jp.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1($2)'), l.pron, l.ko].filter(Boolean).join(' / ') : l.ko}`).join('\n');
  async function exportExcel() {
    const pick = k => document.querySelector(`[data-xs="${k}"]`).checked;
    $('xErr').textContent = ''; $('xExcel').disabled = true; $('xExcel').textContent = '만드는 중…';
    try {
      const X = await loadXLSX(); await loadAll();
      const wb = X.utils.book_new();
      const add = (name, rows, widths) => { const ws = X.utils.json_to_sheet(rows.length ? rows : [{ '(비어 있음)': '' }]); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
      const byDate = (a, b) => (b.study_date || '').localeCompare(a.study_date || '') || a.id - b.id;
      if (pick('words')) add('단어장', S.words.slice().sort(byDate).map(w => ({ '표기': w.word, '히라가나 읽기': w.reading, '한글 발음': w._pron, '뜻': w.meaning, '품사': w.category, '교재 과': w.lesson || '', '수업 날짜': w.study_date || '', '메모': w.memo || '', '등록': w.created_by || '', '수정': w.updated_by || '', '등록일': dt(w.created_at) })), [14, 16, 14, 24, 12, 8, 12, 30, 8, 8, 16]);
      if (pick('patterns')) add('문형장', S.patterns.slice().sort((a, b) => STYLE_ORDER[a.style] - STYLE_ORDER[b.style] || a.id - b.id).map(p => ({ '구분': p.style, '적용 품사': p.applies_to || '', '문형': p.form, '한글 발음': p.pron_ko || '', '뜻': p.meaning, '만드는 법': p.how_to || '', '예문': p.example_jp || '', '예문 발음': p.example_pron || '', '예문 뜻': p.example_ko || '', '헷갈리는 점': p.notes || '', '교재 과': p.lesson || '', '수업 날짜': p.study_date || '', '등록': p.created_by || '' })), [8, 12, 22, 16, 28, 30, 30, 30, 28, 30, 8, 12, 8]);
      if (pick('notes')) add('오답노트', (S.notes || []).slice().sort((a, b) => (b.quiz_date || '').localeCompare(a.quiz_date || '') || (a.q_no || 0) - (b.q_no || 0)).map(n => ({ '퀴즈': n.quiz_title || '', '퀴즈 날짜': n.quiz_date || '', '번호': n.q_no, '문형': n.pattern || '', '유형': n.qtype || '', '문제': n.question || '', '대화·지문': linesTxt(n.lines), '내 답': n.my_answer || '', '정답': n.correct_answer || '', '해설': n.explanation || '', '메모': n.memo || '', '다 이해함': n.resolved ? 'O' : '', '문제 오류': n.flagged ? '🚩' : '', '작성': n.created_by || '' })), [20, 11, 5, 18, 10, 28, 50, 18, 18, 40, 24, 8, 8, 8]);
      if (pick('memos')) {
        add('메모', (S.memos || []).slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).map(m => ({ '태그': m.tag, '고정': m.pinned ? '📌' : '', '내용': m.body, '댓글 수': cmtsOf(m.id).length, '작성': m.created_by || '', '작성일': dt(m.created_at) })), [8, 5, 60, 8, 8, 16]);
        add('메모 댓글', (S.comments || []).map(c => { const m = (S.memos || []).find(x => x.id === c.memo_id); return { '메모': m ? m.body.slice(0, 40) : '', '댓글': c.body, '작성': c.created_by || '', '작성일': dt(c.created_at) }; }), [40, 50, 8, 16]);
      }
      if (pick('marks')) add(`${S.me}의 표시`, S.marks.map(m => { const w = S.words.find(x => x.id === m.word_id); return w ? { '표시': m.kind === 'hard' ? '⭐ 안 외워지는 단어' : '❌ 틀린 단어', '표기': w.word, '읽기': w.reading, '뜻': w.meaning, '품사': w.category } : null; }).filter(Boolean), [18, 14, 16, 24, 12]);
      if (!wb.SheetNames.length) { $('xErr').textContent = '내려받을 항목을 하나 이상 골라 주세요.'; return; }
      const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
      download(`ganbare-nihongo_${ymd()}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      toast('엑셀 파일을 내려받았어요');
    } catch (e) { $('xErr').textContent = e.message || '엑셀을 만들지 못했어요'; console.error(e); }
    finally { $('xExcel').disabled = false; $('xExcel').textContent = '엑셀 파일 내려받기'; }
  }
  const BK_TABLES = ['words', 'word_marks', 'patterns', 'wrong_notes', 'memos', 'memo_comments'];
  async function exportBackup() {
    $('xErr').textContent = ''; $('xBackup').disabled = true;
    try {
      const tables = {};
      for (const t of BK_TABLES) { try { tables[t] = await store.list(t); } catch (e) { tables[t] = []; } }
      const data = { app: 'ganbare-nihongo', version: 1, exported_at: new Date().toISOString(), exported_by: S.me, tables };
      download(`ganbare-nihongo_backup_${ymd()}.json`, new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      toast('백업 파일을 내려받았어요. 안전한 곳에 보관하세요');
    } catch (e) { $('xErr').textContent = '백업하지 못했어요: ' + (e.message || ''); }
    finally { $('xBackup').disabled = false; }
  }
  let RESTORE = null;
  async function planRestore(file) {
    $('xErr').textContent = ''; $('xPrev').innerHTML = '';
    let data; try { data = JSON.parse(await file.text()); } catch (e) { $('xErr').textContent = '백업 파일을 읽지 못했어요.'; return; }
    if (!data || data.app !== 'ganbare-nihongo' || !data.tables) { $('xErr').textContent = '간바레간바레니혼고 백업 파일이 아니에요.'; return; }
    await loadAll();
    const T0 = data.tables, cur = {};
    for (const t of BK_TABLES) { try { cur[t] = await store.list(t); } catch (e) { cur[t] = null; } }
    const wk = w => w.word + '|' + w.reading, pk = p => p.style + '|' + p.form, mk = m => (m.created_by || '') + '|' + (m.created_at || '') + '|' + m.body, nk = n => n.quiz_id + '|' + n.q_no + '|' + n.created_by;
    const has = (list, key) => new Set((list || []).map(key));
    const plan = {
      words: (T0.words || []).filter(w => !has(cur.words, wk).has(wk(w))),
      patterns: (T0.patterns || []).filter(p => !has(cur.patterns, pk).has(pk(p))),
      wrong_notes: (T0.wrong_notes || []).filter(n => !has(cur.wrong_notes, nk).has(nk(n))),
      memos: (T0.memos || []).filter(m => !has(cur.memos, mk).has(mk(m))),
      data: T0, cur, wk, mk
    };
    const oldW = new Map((T0.words || []).map(w => [w.id, w])), oldM = new Map((T0.memos || []).map(m => [m.id, m]));
    plan.marks = (T0.word_marks || []).filter(m => oldW.get(m.word_id));
    plan.comments = cur.memo_comments === null ? [] : (T0.memo_comments || []).filter(c => oldM.get(c.memo_id) && !(cur.memo_comments || []).some(x => x.body === c.body && x.created_by === c.created_by && x.created_at === c.created_at));
    plan.oldW = oldW; plan.oldM = oldM;
    RESTORE = plan;
    const n = plan.words.length + plan.patterns.length + plan.wrong_notes.length + plan.memos.length + plan.comments.length;
    $('xPrev').innerHTML = `<div class="xsum">📁 ${fmtDate((data.exported_at || '').slice(0, 10))} 백업 (${esc(data.exported_by || '')})<br>
      다시 넣을 것: 단어 <b>${plan.words.length}</b> · 문형 <b>${plan.patterns.length}</b> · 오답 <b>${plan.wrong_notes.length}</b> · 메모 <b>${plan.memos.length}</b> · 댓글 <b>${plan.comments.length}</b> · ⭐❌ 표시(없는 것만)</div>` +
      (n || plan.marks.length ? `<button class="btn sm" id="xDoRestore">되살리기</button>` : '<div class="muted">되살릴 게 없어요. 지금 사이트에 이미 모두 있어요.</div>');
    const b = $('xDoRestore'); if (b) b.onclick = doRestore;
  }
  async function doRestore() {
    const P = RESTORE; if (!P || !confirm('백업에서 없는 항목을 다시 넣을까요?')) return;
    const strip = (r, extra) => { const o = { ...r, ...extra }; delete o.id; return o; };
    $('xDoRestore').disabled = true;
    try {
      if (P.words.length) await store.insertMany('words', P.words.map(w => strip(w)));
      const main = P.patterns.filter(p => p.style !== '공통'), com = P.patterns.filter(p => p.style === '공통');
      if (main.length) await store.insertMany('patterns', main.map(p => strip(p)));
      if (com.length) { try { await store.insertMany('patterns', com.map(p => strip(p))); } catch (e) { toast("'공통' 문형은 02 SQL 실행 후 다시 되살려 주세요"); } }
      if (P.wrong_notes.length) await store.insertMany('wrong_notes', P.wrong_notes.map(n => strip(n)));
      if (P.memos.length) await store.insertMany('memos', P.memos.map(m => strip(m)));
      // 새 id 연결 (단어 → 표시, 메모 → 댓글)
      const nowW = await store.list('words'), nowM = await store.list('memos'), nowMarks = await store.list('word_marks');
      const wId = new Map(nowW.map(w => [P.wk(w), w.id])), mId = new Map(nowM.map(m => [P.mk(m), m.id]));
      const markKey = m => m.word_id + '|' + m.nickname + '|' + m.kind, haveMark = new Set(nowMarks.map(markKey));
      const marks = P.marks.map(m => ({ word_id: wId.get(P.wk(P.oldW.get(m.word_id))), nickname: m.nickname, kind: m.kind, created_at: m.created_at })).filter(m => m.word_id && !haveMark.has(markKey(m)));
      if (marks.length) await store.insertMany('word_marks', marks);
      const cmts = P.comments.map(c => strip(c, { memo_id: mId.get(P.mk(P.oldM.get(c.memo_id))) })).filter(c => c.memo_id);
      if (cmts.length) await store.insertMany('memo_comments', cmts);
      await loadAll(); $('xPrev').innerHTML = ''; RESTORE = null; toast('백업에서 되살렸어요');
    } catch (e) { fail(e, '되살리기'); const b = $('xDoRestore'); if (b) b.disabled = false; }
  }
  const openExport = () => { $('xErr').textContent = ''; $('xPrev').innerHTML = ''; $('xm').classList.add('on'); };
  $('xClose').onclick = () => $('xm').classList.remove('on');
  $('xm').onclick = e => { if (e.target.id === 'xm') $('xm').classList.remove('on'); };
  $('xExcel').onclick = exportExcel; $('xBackup').onclick = exportBackup;
  $('xPick').onclick = () => $('xFile').click();
  $('xFile').onchange = e => { const f = e.target.files[0]; if (f) planRestore(f); e.target.value = ''; };

  $('rmOk').onclick = () => { localStorage.setItem('ganbare-notice', 'v1'); $('rm').classList.remove('on'); };
  $('rmMore').addEventListener('click', () => { localStorage.setItem('ganbare-notice', 'v1'); $('rm').classList.remove('on'); });

  /* =========================================================
     히라가나 자판 (data-kana 칸에서 열림)
     ========================================================= */
  const KB_PAGES = [
    // 열(あかさたなはまやらわん) × 행(あいうえお)
    ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や　ゆ　よ', 'らりるれろ', 'わ　を　ん', 'ー、。？！'],
    ['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ', '　　ゔ　　', '　　　　　', '　　　　　', '　　　　　', '　　　　　', '　　　　　'],
    ['ぁぃぅぇぉ', 'ゃ　ゅ　ょ', 'っ　　　　', 'ゎ　　　　', '・～　　　', '　　　　　', '　　　　　', '　　　　　', '　　　　　', '　　　　　', '　　　　　']
  ];
  let kbTarget = null, kbSet = localStorage.getItem('ganbare-kbset') === 'kata' ? 'kata' : 'hira', kbPage = 0;
  const toKata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  // 가타카나 외래어 조합 (가타카나 모드 전용)
  const KB_COMBO = ['ティ', 'ディ', 'トゥ', 'ドゥ', 'ファ', 'フィ', 'フェ', 'フォ', 'ヴァ', 'ヴィ', 'ヴ', 'ヴェ', 'ヴォ', 'ウィ', 'ウェ', 'ウォ', 'シェ', 'ジェ', 'チェ', 'ツァ', 'デュ', 'テュ', 'フュ', 'ー'];
  function drawKbd() {
    $('kbCombo').classList.toggle('hidden', kbSet !== 'kata');
    if (kbPage === 3 && kbSet !== 'kata') kbPage = 0;
    if (kbPage === 3) {
      $('kKeys').innerHTML = KB_COMBO.map(k => `<button class="k" data-k="${k}">${k}<small>${k === 'ー' ? '장음' : K.kanaToHangul(k)}</small></button>`).join('');
      document.querySelectorAll('[data-kset]').forEach(b => b.classList.toggle('on', b.dataset.kset === kbSet));
      document.querySelectorAll('[data-kpage]').forEach(b => b.classList.toggle('on', +b.dataset.kpage === kbPage));
      return;
    }
    const cols = KB_PAGES[kbPage];
    let html = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < cols.length; c++) {
      const ch = cols[c][r];
      if (!ch || ch === '　') { html += '<span class="k blank"></span>'; continue; }
      const out = kbSet === 'kata' ? toKata(ch) : ch;
      const hint = ch === 'ん' ? 'ㄴ받침' : ch === 'っ' ? 'ㅅ받침' : /[ぁ-ゖ]/.test(ch) ? K.kanaToHangul(ch) : '';
      html += `<button class="k" data-k="${out}">${out}<small>${hint || '&nbsp;'}</small></button>`;
    }
    $('kKeys').innerHTML = html;
    document.querySelectorAll('[data-kset]').forEach(b => b.classList.toggle('on', b.dataset.kset === kbSet));
    document.querySelectorAll('[data-kpage]').forEach(b => b.classList.toggle('on', +b.dataset.kpage === kbPage));
  }
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  let nativeKbd = localStorage.getItem('ganbare-native') === '1';
  function applyNative() {
    document.querySelectorAll('[data-kana]').forEach(i => { if (coarse && !nativeKbd) i.setAttribute('inputmode', 'none'); else i.removeAttribute('inputmode'); });
    $('kNative').classList.toggle('on', nativeKbd); $('kNative').classList.toggle('hidden', !coarse);
  }
  applyNative();
  function showKbd(input) { kbTarget = input; $('kbd').classList.remove('hidden'); document.body.classList.add('kbd-open'); drawKbd(); }
  function hideKbd() { $('kbd').classList.add('hidden'); document.body.classList.remove('kbd-open'); kbTarget = null; }
  document.addEventListener('focusin', e => { if (e.target.matches('[data-kana]')) showKbd(e.target); });
  // "あ/ア 자판" 버튼: 해당 칸에 커서를 두고 자판 열기
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-kfor]'); if (!b) return;
    e.preventDefault(); const t = $(b.dataset.kfor); t.focus(); const n = t.value.length; try { t.setSelectionRange(n, n); } catch (er) {} showKbd(t);
  });
  $('kbd').addEventListener('mousedown', e => e.preventDefault()); // 입력칸 포커스 유지
  $('kbd').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.kset) { kbSet = b.dataset.kset; localStorage.setItem('ganbare-kbset', kbSet); drawKbd(); return; }
    if (b.dataset.kpage) { kbPage = +b.dataset.kpage; drawKbd(); return; }
    if (b.dataset.kcmd === 'close') { hideKbd(); return; }
    if (b.dataset.kcmd === 'native') {
      nativeKbd = !nativeKbd; localStorage.setItem('ganbare-native', nativeKbd ? '1' : '0'); applyNative();
      const t = kbTarget; if (t) { t.blur(); setTimeout(() => t.focus(), 30); }
      toast(nativeKbd ? '휴대폰 자판도 함께 써요' : '사이트 자판만 써요'); return;
    }
    if (!kbTarget) return;
    const t = kbTarget, s = t.selectionStart ?? t.value.length, en = t.selectionEnd ?? t.value.length;
    if (b.dataset.kcmd === 'bs') {
      if (s === en && s > 0) { t.value = t.value.slice(0, s - 1) + t.value.slice(en); t.setSelectionRange(s - 1, s - 1); }
      else { t.value = t.value.slice(0, s) + t.value.slice(en); t.setSelectionRange(s, s); }
    } else if (b.dataset.k) {
      t.value = t.value.slice(0, s) + b.dataset.k + t.value.slice(en);
      t.setSelectionRange(s + b.dataset.k.length, s + b.dataset.k.length);
    }
    t.dispatchEvent(new Event('input', { bubbles: true }));
  };

  boot();
})();
