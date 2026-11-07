/* Admin console: sign in, data entry and updates, publishing the encrypted results file. */
(function () {
  'use strict';
  var K = RMS.KEYS, IDLE_MS = 30 * 60 * 1000, LOCK_MS = 5 * 60 * 1000, MAX_FAILS = 5;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
  var uid = function (p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var num = function (v) { var n = Number(v); return Number.isFinite(n) ? n : NaN; };
  var fmt = function (n, d) { return Number(n).toFixed(d == null ? 2 : d); };
  var clone = RMS.clone;

  var S, tab = 'dashboard', F = {prog: '', term: 1, adm: 0}, ED = {}, showGrad = false, lastAct = Date.now(), idleTimer = null;
  var TABS = [
    ['dashboard', 'Dashboard'],
    ['notices', '📢 Notice Portal'],
    ['programs', 'Programs'],
    ['students', 'Students'],
    ['subjects', 'Subjects'],
    ['marks', 'Marks entry'],
    ['results', 'Results'],
    ['publish', 'Publish'],
    ['student_lookup', '🎓 Student Gradesheet'],
    ['settings', 'Settings']
  ];
  var FILTERED = {students: 1, subjects: 1, marks: 1, results: 1};
  var NOTICE_KEY = 'hetauda_rms_notices_v2_impact';
  var sampleNotices = [
    {
      id: 1,
      title: 'Examination Form Submission Notice',
      category: 'Examination',
      description: 'All students are informed to complete their examination form submission within the deadline prescribed by the Examination Section.',
      department: 'Examination Section',
      date: '2026-11-06',
      important: true,
      attachment: ''
    },
    {
      id: 2,
      title: 'Class Routine and Academic Calendar',
      category: 'Academic',
      description: 'The updated academic calendar and class schedule for all academic programs are available for students.',
      department: 'Academic Administration',
      date: '2026-11-04',
      important: false,
      attachment: ''
    },
    {
      id: 3,
      title: 'Student Admission Information',
      category: 'Admission',
      description: 'Admission-related information and application procedures are available from the college administration.',
      department: 'Admission Section',
      date: '2026-11-02',
      important: false,
      attachment: ''
    },
    {
      id: 4,
      title: 'Internal Examination Preparation',
      category: 'Examination',
      description: 'Students are requested to check their respective program and semester examination schedules.',
      department: 'Examination Section',
      date: '2026-10-30',
      important: true,
      attachment: ''
    },
    {
      id: 5,
      title: 'College Academic Activities',
      category: 'Events',
      description: 'Information regarding upcoming academic activities and student participation.',
      department: 'Administration',
      date: '2026-10-27',
      important: false,
      attachment: ''
    }
  ];
  var noticeCat = 'All', noticeSearch = '', noticeSort = 'newest', edNoticeId = null;
  var lookupStudentId = null, lookupTerm = 1;

  function loadNotices() {
    try {
      var saved = localStorage.getItem(NOTICE_KEY);
      if (saved === null) return sampleNotices.slice();
      var parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : sampleNotices.slice();
    } catch (e) {
      return sampleNotices.slice();
    }
  }
  function saveNotices(list) {
    try {
      localStorage.setItem(NOTICE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }
  var PRESETS = {
    letter: {fail: 'F', lines: [[90, 'A+', ''], [80, 'A', ''], [70, 'B+', ''], [60, 'B', ''], [50, 'C+', ''], [40, 'C', ''], [0, 'D', '']]},
    gpa: {fail: 'F', lines: [[90, 'A', 4.0], [80, 'A-', 3.7], [70, 'B+', 3.3], [60, 'B', 3.0], [50, 'C+', 2.3], [40, 'C', 2.0], [0, 'D', 1.0]]},
    division: {fail: 'Fail', lines: [[80, 'Distinction', ''], [60, 'First Division', ''], [50, 'Second Division', ''], [0, 'Third Division', '']]}
  };

  /* ---------- small UI helpers ---------- */
  function toast(msg) { var d = document.createElement('div'); d.className = 't'; d.textContent = msg; $('#toast').appendChild(d); setTimeout(function () { d.remove(); }, 3800); }
  function ask(title, msg, ok, needText) {
    ok = ok || 'Delete';
    return new Promise(function (res) {
      var r = $('#modalroot');
      r.innerHTML = '<div class="overlay"><div class="modal" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p>' +
        (needText ? '<div class="fld" style="margin:-6px 0 14px"><label for="m_confirm">Type ' + esc(needText) + ' to confirm</label><input id="m_confirm" autocomplete="off"></div>' : '') +
        '<div class="row" style="justify-content:flex-end"><button class="btn" id="mno" type="button">Cancel</button><button class="btn ' + (ok === 'Delete' || needText ? 'danger' : 'pri') + '" id="myes" type="button">' + esc(ok) + '</button></div></div></div>';
      function done(v) { r.innerHTML = ''; res(v); }
      $('#mno').onclick = function () { done(false); };
      $('#myes').onclick = function () { if (needText && $('#m_confirm').value.trim() !== needText) return; done(true); };
      (needText ? $('#m_confirm') : $('#mno')).focus();
    });
  }
  function saveFile(name, data, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], {type: mime || 'text/plain'});
    var viaClaude = window.claude && window.claude.use ? window.claude.use('downloads').catch(function () { return null; }) : Promise.resolve(null);
    return viaClaude.then(function (d) {
      if (d) return d.save({filename: name, data: blob}).then(function () { toast('Saved ' + name); }, function (e) { toast(e && e.code === 'declined' ? 'Download cancelled' : 'Could not save the file'); });
      try { var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); toast('Downloaded ' + name); }
      catch (e) { toast('Downloads are not available here'); }
    });
  }
  function csvEscape(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function saveCSV(name, rows) { return saveFile(name, '﻿' + rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\r\n'), 'text/csv'); }
  function parseCSV(text) {
    var rows = [], row = [], cur = '', q = false, i = 0;
    text = text.replace(/^﻿/, '');
    for (; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }
  function rowsToObjects(rows) {
    if (!rows.length) return [];
    var heads = rows[0].map(function (h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ''); });
    return rows.slice(1).map(function (r) { var o = {}; heads.forEach(function (h, i) { if (h) o[h] = r[i] === undefined ? '' : r[i]; }); return o; });
  }
  function readTable(file) {
    var isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
    if (isCsv) return file.text().then(function (t) { return rowsToObjects(parseCSV(t)); });
    if (!window.XLSX) return Promise.reject(new Error('Excel support did not load. Save the sheet as CSV and try again.'));
    return file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, {type: 'array', cellDates: true}), ws = wb.Sheets[wb.SheetNames[0]];
      return rowsToObjects(XLSX.utils.sheet_to_json(ws, {header: 1, defval: '', raw: true}));
    });
  }
  function pick(r) { for (var i = 1; i < arguments.length; i++) { var v = r[arguments[i]]; if (v !== undefined && v !== null && String(v).trim() !== '') return v instanceof Date ? v : String(v).trim(); } return ''; }
  function persist() { if (!RMS.saveState(S)) toast('Browser storage is full or blocked. Save a data file from Settings.'); }

  /* ---------- domain shortcuts ---------- */
  var P = function (id) { return RMS.P(S, id); };
  var FAC = function (id) { return S.faculties.find(function (f) { return f.id === id; }); };
  var termName = function (p, t) { return (p && p.kind === 'Year' ? 'Year ' : 'Semester ') + t; };
  var subsOf = function (pid, t) { return RMS.subsOf(S, pid, t); };
  var result = function (st, t) { return RMS.result(S, st, t); };
  var cal = function () { return (S.settings && S.settings.dobCal) || 'BS'; };
  function nextSymbol() {
    var mx = 0; S.students.forEach(function (s) { var n = parseInt(s.symbol, 10); if (/^\d+$/.test(String(s.symbol)) && n > mx) mx = n; });
    return String(mx ? mx + 1 : 20820001);
  }
  var pillFor = function (r) { return r.status === 'Pass' ? '<span class="pill ok">Pass</span>' : r.status === 'Fail' ? '<span class="pill no">Fail</span>' : '<span class="pill wait">Incomplete</span>'; };

  /* ---------- sign in ---------- */
  function getLock() { return RMS.jget(K.lock) || {fails: 0, until: 0}; }
  function startSession(user) { RMS.ssSet(K.session, JSON.stringify({u: user, t: Date.now()})); }
  function currentSession() {
    try { var s = JSON.parse(RMS.ssGet(K.session) || 'null'); if (s && Date.now() - s.t < IDLE_MS) return s; } catch (e) {}
    return null;
  }
  function gateMsg(t, kind) { $('#gate-msg').innerHTML = t ? '<div class="msg ' + (kind || 'err') + '">' + esc(t) + '</div>' : ''; }

  function showGate(mode, note) {
    $('#page').className = 'gate-page'; $('#app').hidden = true; $('#gate').hidden = false;
    var card = $('#gate-card');
    if (!RMS.hasCrypto) {
      card.innerHTML = '<h2>Secure connection needed</h2><p>Sign in uses your browser\'s encryption tools, which only work on https pages or on localhost. Open this page over https.</p>'; return;
    }
    if (mode === 'setup') {
      card.innerHTML = '<h2>Create the administrator account</h2><p>This is the first visit in this browser. Choose the sign-in you will use from now on.</p>' +
        '<form id="gate-form" class="fld" style="gap:14px" novalidate>' +
        '<div class="fld"><label for="g_user">Username</label><input id="g_user" autocomplete="username" value="admin" required></div>' +
        '<div class="fld"><label for="g_pw">Password (at least 8 characters)</label><input id="g_pw" type="password" autocomplete="new-password" required></div>' +
        '<div class="fld"><label for="g_pw2">Repeat password</label><input id="g_pw2" type="password" autocomplete="new-password" required></div>' +
        '<button class="btn pri block" type="submit">Create account</button></form><div id="gate-msg"></div>' +
        '<p class="hint">Records and the sign-in are stored in this browser only. Use the same browser each time and keep a data file backup (Settings).</p>';
    } else {
      card.innerHTML = '<h2>Sign in</h2><p>Administrator access for data entry and updates.</p>' +
        '<form id="gate-form" class="fld" style="gap:14px" novalidate>' +
        '<div class="fld"><label for="g_user">Username</label><input id="g_user" autocomplete="username" required></div>' +
        '<div class="fld"><label for="g_pw">Password</label><input id="g_pw" type="password" autocomplete="current-password" required></div>' +
        '<button class="btn pri block" type="submit">Sign in</button></form><div id="gate-msg"></div>' +
        '<p class="hint"><button class="btn sm" id="forgot" type="button">Forgot password</button></p>';
      $('#forgot').onclick = forgot;
    }
    if (note) gateMsg(note, 'info');
    $('#gate-form').addEventListener('submit', mode === 'setup' ? doSetup : doLogin);
    $('#g_user').focus();
  }
  function doSetup(e) {
    e.preventDefault();
    var user = $('#g_user').value.trim(), pw = $('#g_pw').value, pw2 = $('#g_pw2').value;
    if (!user) return gateMsg('Enter a username.');
    if (pw.length < 8) return gateMsg('The password needs at least 8 characters.');
    if (pw !== pw2) return gateMsg('The two passwords do not match.');
    var salt = RMS.toB64(RMS.randomBytes(16));
    RMS.hashPassword(pw, salt, RMS.ITER).then(function (hash) {
      RMS.lsSet(K.auth, JSON.stringify({user: user, salt: salt, iter: RMS.ITER, hash: hash, created: new Date().toISOString()}));
      startSession(user); enterApp(user);
    });
  }
  function doLogin(e) {
    e.preventDefault();
    var lock = getLock(), wait = Math.ceil((lock.until - Date.now()) / 1000);
    if (wait > 0) return gateMsg('Too many attempts. Try again in ' + Math.ceil(wait / 60) + ' minute(s).');
    var auth = RMS.jget(K.auth), user = $('#g_user').value.trim(), pw = $('#g_pw').value;
    RMS.hashPassword(pw, auth.salt, auth.iter).then(function (hash) {
      if (hash === auth.hash && user.toLowerCase() === String(auth.user).toLowerCase()) {
        RMS.lsDel(K.lock); startSession(auth.user); enterApp(auth.user);
      } else {
        lock.fails++;
        if (lock.fails >= MAX_FAILS) { lock = {fails: 0, until: Date.now() + LOCK_MS}; RMS.lsSet(K.lock, JSON.stringify(lock)); gateMsg('Too many attempts. Sign in is locked for 5 minutes.'); }
        else { RMS.lsSet(K.lock, JSON.stringify(lock)); gateMsg('Username or password is not correct.'); }
        $('#g_pw').value = '';
      }
    });
  }
  function forgot() {
    ask('Reset this browser?', 'The administrator account and all records stored in this browser will be erased, and the page returns to its first-run state. If you have a data file backup you can open it afterwards. This cannot be undone.', 'Erase and reset', 'RESET').then(function (ok) {
      if (!ok) return;
      [K.state, K.published, K.auth, K.lock].forEach(RMS.lsDel); RMS.ssDel(K.session); S = null;
      showGate('setup', 'Browser reset. Create a new administrator account.');
    });
  }
  function signOut(msg) {
    RMS.ssDel(K.session); clearInterval(idleTimer); S = null; ED = {};
    showGate('login', msg || '');
  }
  function enterApp(user) {
    S = RMS.loadState(window.RMS_SEED); if (!RMS.jget(K.state)) persist();
    $('#gate').hidden = true; $('#app').hidden = false; $('#page').className = '';
    $('#whoami').textContent = user; tab = 'dashboard'; render();
    clearInterval(idleTimer); lastAct = Date.now();
    idleTimer = setInterval(function () { if (Date.now() - lastAct > IDLE_MS) signOut('You were signed out after 30 minutes of inactivity.'); }, 30000);
  }
  var lastWrite = 0;
  ['click', 'keydown', 'input'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (!S) return;
      lastAct = Date.now();
      if (lastAct - lastWrite > 10000) { lastWrite = lastAct; var s = currentSession(); if (s) startSession(s.u); }
    }, true);
  });

  /* ---------- filters ---------- */
  function fixFilters() {
    if (!S.programs.length) { F.prog = ''; return; }
    if (!P(F.prog)) F.prog = S.programs[0].id;
    var p = P(F.prog), allowAll = tab === 'students' || tab === 'subjects';
    if (F.term === 0 && !allowAll) F.term = 1;
    if (F.term > p.terms) F.term = 1;
  }
  function years() { var set = {2082: 1, 2083: 1, 2084: 1, 2085: 1}; S.students.forEach(function (s) { set[s.adm] = 1; }); if (F.adm) set[F.adm] = 1; return Object.keys(set).map(Number).sort(function (a, b) { return a - b; }); }
  function filterBar() {
    var p = P(F.prog); if (!p) return '';
    var allowAll = tab === 'students' || tab === 'subjects';
    var progs = S.programs.map(function (x) { return '<option value="' + x.id + '"' + (x.id === F.prog ? ' selected' : '') + '>' + esc(x.code) + ' · ' + esc(x.name) + '</option>'; }).join('');
    var terms = allowAll ? '<option value="0"' + (F.term === 0 ? ' selected' : '') + '>All</option>' : '';
    for (var t = 1; t <= p.terms; t++) terms += '<option value="' + t + '"' + (t === F.term ? ' selected' : '') + '>' + p.kind + ' ' + t + '</option>';
    var adm = '<option value="0"' + (F.adm === 0 ? ' selected' : '') + '>All batches</option>' + years().map(function (y) { return '<option value="' + y + '"' + (y === F.adm ? ' selected' : '') + '>' + y + ' BS</option>'; }).join('');
    return '<section class="card filters"><div class="fld" style="flex:2 1 260px"><label for="fprog">Program</label><select id="fprog" data-filter="prog">' + progs + '</select></div>' +
      '<div class="fld"><label for="fterm">' + (p.kind === 'Year' ? 'Year' : 'Semester') + '</label><select id="fterm" data-filter="term">' + terms + '</select></div>' +
      '<div class="fld"><label for="fadm">Admission year</label><select id="fadm" data-filter="adm">' + adm + '</select></div></section>';
  }
  var inp = function (id, label, val, extra) { return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" value="' + esc(val) + '" ' + (extra || '') + '></div>'; };

  function buildGradesheetHTML(st, term) {
    var p = P(st.programId); if (!p) return '<div class="empty">Program not found</div>';
    var subs = subsOf(p.id, term); if (!subs.length) return '<div class="card empty">No subjects configured for ' + esc(termName(p, term)) + '.</div>';
    var r = result(st, term); if (!r) return '<div class="card empty">No result available.</div>';
    var m = S.marks[st.id] || {}, meta = S.meta || {}, fac = FAC(p.facultyId);
    var co = RMS.cohort(S, p.id, term, st.adm), rkMap = RMS.rankMap(S, co, term), rank = rkMap[st.id] || '-';
    var rows = subs.map(function (s) {
      var v = m[s.id], state = v === 'AB' ? 'ab' : (v === null || v === undefined || v === '') ? 'missing' : v < s.pass ? 'fail' : 'pass';
      var bad = state === 'ab' || state === 'fail';
      return '<tr><td>' + esc(s.code) + '</td><td>' + esc(s.name) + '</td><td class="n">' + s.full + '</td><td class="n">' + s.pass + '</td><td class="n' + (bad ? ' f' : '') + '">' + (v === undefined || v === null || v === '' ? '-' : v) + '</td><td class="' + (bad ? 'f' : '') + '">' + {pass: 'Passed', fail: 'Failed', ab: 'Absent', missing: 'Not entered'}[state] + '</td></tr>';
    }).join('');
    var passed = r.status === 'Pass';
    var gpaOn = p.grading && p.grading.lines && p.grading.lines.some(function (l) { return l[2] !== '' && l[2] != null; });
    return '<article class="rc"><div class="stamp ' + (passed ? 'pass' : 'fail') + '">' + (passed ? 'PASS' : 'FAIL') + '</div>' +
      '<h1>' + esc(meta.college || 'Bagmati University') + '</h1><div class="sub">' + esc(fac ? fac.name : '') + '</div>' +
      '<div class="ttl">Official Gradesheet · ' + esc(meta.exam || 'Semester Examination') + ' ' + esc(meta.session || '') + '</div>' +
      '<div class="info"><div><span>Student</span>' + esc(st.name) + '</div><div><span>Symbol no.</span>' + esc(st.symbol) + '</div><div><span>Roll no.</span>' + esc(st.roll) + '</div>' +
      '<div><span>Registration no.</span>' + esc(st.reg || '-') + '</div><div><span>Program</span>' + esc(p.name + ' (' + p.code + ')') + '</div><div><span>' + (p.kind === 'Year' ? 'Year' : 'Semester') + '</span>' + esc(termName(p, term)) + '</div>' +
      '<div><span>Admission year</span>' + esc(st.adm) + ' BS</div><div><span>Date of birth</span>' + esc(st.dob || '-') + ' (' + cal() + ')</div></div>' +
      '<div class="tw"><table><thead><tr><th>Code</th><th>Subject</th><th class="n">Full</th><th class="n">Pass</th><th class="n">Obtained</th><th>Remark</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">' + r.full + '</td><td></td><td class="n">' + r.ob + '</td><td></td></tr></tfoot></table></div>' +
      '<div class="sum"><div><span>Percentage</span><b>' + fmt(r.pct, 1) + '%</b></div><div><span>Grade</span><b>' + esc(r.grade || '-') + '</b></div>' +
      (gpaOn && r.gpa ? '<div><span>GPA</span><b>' + fmt(r.gpa, 2) + '</b></div>' : '') +
      '<div><span>Class rank</span><b>' + rank + '</b></div><div><span>Status</span><b>' + esc(r.status) + '</b></div></div>' +
      '<p class="note">This gradesheet is generated from college examination records. The controller of examinations issues the official university transcript.</p>' +
      '<div class="sig"><div>Examination Controller</div><div>Dean / Principal</div></div></article>';
  }

  /* ---------- views ---------- */
  var V = {};

  V.dashboard = function () {
    var noDob = S.students.filter(function (s) { return !s.dob; }).length, noSym = S.students.filter(function (s) { return !RMS.normSymbol(s.symbol); }).length;
    var pubN = Object.keys(S.published).filter(function (k) { return S.published[k] && P(k.split('|')[0]); }).length;
    var last = RMS.jget(K.published), marksN = 0; Object.keys(S.marks).forEach(function (k) { marksN += Object.keys(S.marks[k]).length; });
    var nList = loadNotices(), nImp = nList.filter(function (n) { return n.important; }).length;

    var rowsHtml = S.programs.map(function (p) {
      var sts = S.students.filter(function (s) { return s.programId === p.id; }), tot = 0, done = 0, pubT = 0;
      sts.forEach(function (s) { for (var t = 1; t <= p.terms && t <= s.term; t++) { var r = result(s, t); if (r) { tot++; if (r.complete) done++; } } });
      for (var t = 1; t <= p.terms; t++) if (S.published[p.id + '|' + t]) pubT++;
      var pc = tot ? Math.round(done / tot * 100) : 0;
      return '<tr><td><b>' + esc(p.code) + '</b><br><span class="muted">' + esc(p.name) + '</span></td><td class="n">' + sts.length + '</td><td class="n">' + S.subjects.filter(function (s) { return s.programId === p.id; }).length + '</td>' +
        '<td style="min-width:150px"><div class="bar"><i style="width:' + pc + '%"></i></div><span class="muted">' + done + ' of ' + tot + ' term results complete</span></td><td class="n">' + pubT + '/' + p.terms + '</td></tr>';
    }).join('');
    var warn = [];
    if (noSym) warn.push(noSym + ' student(s) have no symbol number. They cannot sign in to the student page.');
    if (noDob) warn.push(noDob + ' student(s) have no date of birth. They cannot sign in to the student page.');
    if (!pubN) warn.push('No semester is marked for publishing yet. Open Publish to choose.');

    return '<div class="hub-grid">' +
      '<div class="hub-card hub-notice">' +
        '<div class="hub-header">' +
          '<div class="hub-icon">📢</div>' +
          '<span class="hub-badge">Notice Desk</span>' +
        '</div>' +
        '<h2 class="hub-title">Campus Notice Portal</h2>' +
        '<p class="hub-desc">Broadcast campus notices, publish urgent examination alerts, and manage official circulars.</p>' +
        '<div class="hub-stats">' +
          '<div><strong>' + nList.length + '</strong> Notices</div>' +
          '<div><strong>' + nImp + '</strong> High Priority</div>' +
        '</div>' +
        '<div class="hub-actions">' +
          '<button class="btn pri sm" type="button" data-tab="notices">Open Notice Portal</button>' +
          '<button class="btn sm" type="button" data-act="quick-post-notice">+ Post Notice</button>' +
          '<a class="btn sm" href="notice_page.html" target="_blank" rel="noopener">Live Board ↗</a>' +
        '</div>' +
      '</div>' +

      '<div class="hub-card hub-exam">' +
        '<div class="hub-header">' +
          '<div class="hub-icon">📊</div>' +
          '<span class="hub-badge">Examination Core</span>' +
        '</div>' +
        '<h2 class="hub-title">Examination Portal</h2>' +
        '<p class="hub-desc">Manage academic programs, subjects, enrollments, marks entry, and publish encrypted results.</p>' +
        '<div class="hub-stats">' +
          '<div><strong>' + S.programs.length + '</strong> Programs</div>' +
          '<div><strong>' + S.students.length + '</strong> Students</div>' +
          '<div><strong>' + marksN.toLocaleString() + '</strong> Marks</div>' +
        '</div>' +
        '<div class="hub-actions">' +
          '<button class="btn pri sm" type="button" data-tab="marks">Enter Marks</button>' +
          '<button class="btn sm" type="button" data-tab="results">Results</button>' +
          '<button class="btn sm" type="button" data-tab="publish">Publish</button>' +
        '</div>' +
      '</div>' +

      '<div class="hub-card hub-student">' +
        '<div class="hub-header">' +
          '<div class="hub-icon">🎓</div>' +
          '<span class="hub-badge">Student Desk</span>' +
        '</div>' +
        '<h2 class="hub-title">Student Result Portal</h2>' +
        '<p class="hub-desc">Look up student gradesheets, test admit-card credential lookup, and print official results.</p>' +
        '<div class="hub-stats">' +
          '<div><strong>' + pubN + '</strong> Terms Published</div>' +
          '<div><strong>AES-256</strong> Encrypted</div>' +
        '</div>' +
        '<div class="hub-actions">' +
          '<button class="btn pri sm" type="button" data-tab="student_lookup">Check Student Result</button>' +
          '<a class="btn sm" href="index.html" target="_blank" rel="noopener">Student Page ↗</a>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="stats">' +
      '<div class="stat" style="--c:0"><b>' + S.programs.length + '</b><span>Programs</span></div>' +
      '<div class="stat" style="--c:1"><b>' + S.subjects.length + '</b><span>Subjects</span></div>' +
      '<div class="stat" style="--c:2"><b>' + S.students.length + '</b><span>Students</span></div>' +
      '<div class="stat" style="--c:3"><b>' + marksN.toLocaleString() + '</b><span>Marks entered</span></div>' +
      '<div class="stat" style="--c:4"><b>' + pubN + '</b><span>Terms marked to publish</span></div>' +
    '</div>' +
    '<section class="card" style="--c:2"><h2>Status</h2>' + (warn.length ? warn.map(function (w) { return '<div class="msg err" style="margin:0 0 8px">' + esc(w) + '</div>'; }).join('') : '<div class="msg ok" style="margin:0">Every student has a symbol number and a date of birth.</div>') +
    '<div class="msg info">' + (last ? 'Last published here: ' + esc(new Date(last.generatedAt).toLocaleString()) + ' · ' + last.count + ' student records.' : 'Nothing has been published from this browser yet.') + ' The student page reads <b>data/results.json</b> on your website.</div></section>' +
    '<section class="card" style="--c:3"><h2>Programs at a glance</h2>' + (S.programs.length ? '<div class="tw"><table><thead><tr><th>Program</th><th class="n">Students</th><th class="n">Subjects</th><th>Marks entry</th><th class="n">Published</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' : '<div class="empty">No programs yet. Add one under Programs.</div>') + '</section>';
  };

  V.notices = function () {
    var nList = loadNotices();
    var en = edNoticeId ? nList.find(function (x) { return String(x.id) === String(edNoticeId); }) : null;
    var cats = ['All', 'Examination', 'Academic', 'Administration', 'Admission', 'Events'];
    var todayStr = new Date().toISOString().slice(0, 10);

    var filtered = nList.filter(function (n) {
      var matchesCat = noticeCat === 'All' || n.category === noticeCat;
      var q = noticeSearch.toLowerCase().trim();
      var matchesSearch = !q || (n.title + ' ' + n.description + ' ' + n.department + ' ' + n.category).toLowerCase().indexOf(q) >= 0;
      return matchesCat && matchesSearch;
    });

    filtered.sort(function (a, b) {
      var c = String(a.date).localeCompare(String(b.date));
      return noticeSort === 'newest' ? -c : c;
    });

    var recentCount = nList.filter(function (n) {
      var d = new Date(n.date + 'T00:00:00');
      return !isNaN(d) && (Date.now() - d.getTime()) <= 7 * 86400000;
    }).length;
    var impCount = nList.filter(function (n) { return n.important; }).length;
    var catCount = new Set(nList.map(function (n) { return n.category; })).size;

    var catChips = cats.map(function (c) {
      return '<button type="button" class="chip ' + (noticeCat === c ? 'active' : '') + '" data-notice-cat="' + c + '">' + esc(c) + '</button>';
    }).join('');

    var noticeItemsHtml = filtered.map(function (n) {
      return '<article class="notice-card-item ' + (n.important ? 'is-important' : '') + '">' +
        '<div class="notice-top">' +
          '<div class="row">' +
            '<span class="badge">' + esc(n.category) + '</span>' +
            (n.important ? '<span class="badge important">★ High Priority</span>' : '') +
          '</div>' +
          '<span class="date-stamp">' + esc(n.date) + '</span>' +
        '</div>' +
        '<h3 class="notice-title">' + esc(n.title) + '</h3>' +
        '<p class="notice-desc">' + esc(n.description) + '</p>' +
        '<div class="notice-foot">' +
          '<span class="notice-dept">Published by: ' + esc(n.department || 'Examination Section') + '</span>' +
          (n.attachment ? '<a class="btn sm" href="' + esc(n.attachment) + '" target="_blank" rel="noopener">↓ Attachment</a>' : '') +
          '<div class="notice-acts">' +
            '<button class="btn sm" type="button" data-act="toggle-notice-imp" data-id="' + n.id + '">' + (n.important ? 'Remove priority' : 'Mark priority') + '</button>' +
            '<button class="btn sm" type="button" data-act="edit-notice" data-id="' + n.id + '">Edit</button>' +
            '<button class="btn sm danger" type="button" data-act="del-notice" data-id="' + n.id + '">Delete</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');

    return '<div class="stats">' +
      '<div class="stat" style="--c:0"><b>' + nList.length + '</b><span>Total notices</span></div>' +
      '<div class="stat" style="--c:1"><b>' + impCount + '</b><span>High priority</span></div>' +
      '<div class="stat" style="--c:2"><b>' + recentCount + '</b><span>Recent (7 days)</span></div>' +
      '<div class="stat" style="--c:3"><b>' + catCount + '</b><span>Categories</span></div>' +
    '</div>' +
    '<section class="card" style="--c:1"><h2>' + (en ? 'Edit notice' : 'Post new notice') + '</h2>' +
      '<form data-form="notice">' +
        '<div class="grid">' +
          inp('n_title', 'Notice title', en ? en.title : '', 'required placeholder="e.g. Examination Form Submission Deadline"') +
          '<div class="fld"><label for="n_category">Category</label><select id="n_category">' +
            ['Examination', 'Academic', 'Administration', 'Admission', 'Events'].map(function (cat) {
              return '<option value="' + cat + '"' + (en && en.category === cat ? ' selected' : '') + '>' + cat + '</option>';
            }).join('') +
          '</select></div>' +
          inp('n_dept', 'Department / Section', en ? en.department : 'Examination Section', 'placeholder="e.g. Examination Section"') +
          inp('n_date', 'Date', en ? en.date : todayStr, 'type="date" required') +
          inp('n_attachment', 'Attachment link / PDF URL (optional)', en ? en.attachment : '', 'placeholder="e.g. notices/exam-routine.pdf"') +
          '<div class="fld" style="justify-content:center"><label class="row" style="margin-top:22px; cursor:pointer"><input type="checkbox" id="n_important"' + (en && en.important ? ' checked' : '') + '> <b>High Priority / Urgent Alert</b></label></div>' +
        '</div>' +
        '<div class="fld" style="margin-top:12px"><label for="n_desc">Notice content & details</label><textarea id="n_desc" rows="4" required placeholder="Type full notice text here...">' + esc(en ? en.description : '') + '</textarea></div>' +
        '<div class="row" style="margin-top:14px">' +
          '<button class="btn pri" type="submit">' + (en ? 'Update notice' : 'Publish notice') + '</button>' +
          (en ? '<button type="button" class="btn" data-act="cancel-notice-edit">Cancel</button>' : '') +
        '</div>' +
      '</form>' +
    '</section>' +
    '<section class="card" style="--c:2">' +
      '<div class="notice-header-bar">' +
        '<h2>Campus Notice Stream <small>' + filtered.length + ' of ' + nList.length + ' notices</small></h2>' +
        '<div class="row">' +
          '<a class="btn sm" href="notice_page.html" target="_blank" rel="noopener">Fullscreen Live Notice Board ↗</a>' +
        '</div>' +
      '</div>' +
      '<div class="row" style="margin-bottom:14px">' +
        '<input type="search" id="n_search" value="' + esc(noticeSearch) + '" placeholder="Search notices by title, department, or keyword..." style="flex:2 1 240px">' +
        '<select id="n_sort" style="flex:1 1 140px"><option value="newest"' + (noticeSort === 'newest' ? ' selected' : '') + '>Newest first</option><option value="oldest"' + (noticeSort === 'oldest' ? ' selected' : '') + '>Oldest first</option></select>' +
      '</div>' +
      '<div class="chips" style="margin-bottom:16px">' + catChips + '</div>' +
      '<div class="notice-list">' + (noticeItemsHtml || '<div class="empty">No notices match your filter or search.</div>') + '</div>' +
    '</section>';
  };

  V.student_lookup = function () {
    var st = lookupStudentId ? S.students.find(function (s) { return s.id === lookupStudentId; }) : null;
    var p = st ? P(st.programId) : null;
    var studentOpts = S.students.map(function (s) {
      var prog = P(s.programId);
      return '<option value="' + s.id + '"' + (lookupStudentId === s.id ? ' selected' : '') + '>' + esc(s.symbol) + ' · ' + esc(s.name) + ' (' + (prog ? prog.code : '') + ' - Term ' + s.term + ')</option>';
    }).join('');

    var termSelect = '';
    if (st && p) {
      termSelect = '<div class="fld"><label for="lk_term">Select ' + (p.kind === 'Year' ? 'Year' : 'Semester') + '</label><select id="lk_term">';
      for (var t = 1; t <= p.terms && t <= st.term; t++) {
        termSelect += '<option value="' + t + '"' + (lookupTerm === t ? ' selected' : '') + '>' + termName(p, t) + '</option>';
      }
      termSelect += '</select></div>';
    }

    return '<section class="card lookup-box" style="--c:0">' +
      '<h2>Check & Verify Student Gradesheet</h2>' +
      '<p class="muted" style="margin:0 0 14px">Look up any student result directly from the official college database, or test student credential lookup.</p>' +
      '<div class="grid">' +
        '<div class="fld" style="grid-column: span 2">' +
          '<label for="sel_student">Quick Pick from Registered Students</label>' +
          '<div class="row">' +
            '<select id="sel_student" style="flex:1 1 280px"><option value="">-- Choose a student --</option>' + studentOpts + '</select>' +
            '<button class="btn pri" type="button" data-act="load-selected-student">Load gradesheet</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin:16px 0 10px; border-top:1px dashed var(--line); padding-top:14px">' +
        '<p class="lbl" style="margin-bottom:8px">Or verify by Symbol number & Date of birth:</p>' +
        '<form data-form="stu_lookup" class="grid">' +
          inp('lk_sym', 'Symbol no.', '', 'placeholder="e.g. 20820101" required') +
          '<div class="fld"><label>Date of birth (' + cal() + ')</label><div class="dob"><input id="lk_dy" inputmode="numeric" maxlength="4" placeholder="YYYY"><input id="lk_dm" inputmode="numeric" maxlength="2" placeholder="MM"><input id="lk_dd" inputmode="numeric" maxlength="2" placeholder="DD"></div></div>' +
          '<div class="row" style="align-self:end">' +
            '<button class="btn pri" type="submit">Verify & Open</button>' +
            '<button class="btn" type="button" data-act="quick-sample-stu">Fill sample 20820101</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</section>' +
    (st ? '<section class="sheetwrap" style="margin:0 auto; animation:rise .4s both;">' +
      '<div class="sheetbar">' +
        termSelect +
        '<button class="btn pri" type="button" data-act="print-sheet">Print gradesheet</button>' +
        '<button class="btn" type="button" data-act="clear-lookup">Check another student</button>' +
      '</div>' +
      buildGradesheetHTML(st, lookupTerm) +
    '</section>' : '<div class="empty card" style="--c:1">Select a student above or enter symbol number & date of birth to display the gradesheet.</div>');
  };

  V.programs = function () {
    var ef = ED.fac ? FAC(ED.fac) : null, ep = ED.prog ? P(ED.prog) : null;
    var g = ep ? ep.grading : {preset: 'letter', fail: 'F', lines: PRESETS.letter.lines};
    var gtxt = g.lines.map(function (l) { return l.join(', ').replace(/, $/, ''); }).join('\n');
    var facOpts = function (sel) { return S.faculties.map(function (f) { return '<option value="' + f.id + '"' + (f.id === sel ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join(''); };
    return '<section class="card"><h2>' + (ef ? 'Edit faculty' : 'Add faculty') + '</h2><form data-form="faculty" class="row">' + inp('fa_name', 'Faculty name', ef ? ef.name : '', 'required style="min-width:260px"') +
      '<div class="row" style="align-self:end"><button class="btn pri">' + (ef ? 'Update' : 'Add faculty') + '</button>' + (ef ? '<button type="button" class="btn" data-act="cancel">Cancel</button>' : '') + '</div></form>' +
      '<div class="tw" style="margin-top:12px"><table><thead><tr><th>Faculty</th><th class="n">Programs</th><th></th></tr></thead><tbody>' + (S.faculties.map(function (f) {
        return '<tr><td>' + esc(f.name) + '</td><td class="n">' + S.programs.filter(function (p) { return p.facultyId === f.id; }).length + '</td><td class="acts"><button class="btn sm" data-act="edit-fac" data-id="' + f.id + '">Edit</button><button class="btn sm" data-act="dup-fac" data-id="' + f.id + '">Duplicate</button><button class="btn sm danger" data-act="del-fac" data-id="' + f.id + '">Delete</button></td></tr>';
      }).join('') || '<tr><td colspan="3" class="empty">No faculties yet.</td></tr>') + '</tbody></table></div></section>' +
      '<section class="card"><h2>' + (ep ? 'Edit program' : 'Add program') + '</h2><form data-form="program"><div class="grid">' +
      inp('pg_name', 'Program name', ep ? ep.name : '', 'required') + inp('pg_code', 'Short code', ep ? ep.code : '', 'required') +
      '<div class="fld"><label for="pg_fac">Faculty</label><select id="pg_fac" required>' + facOpts(ep ? ep.facultyId : '') + '</select></div>' +
      '<div class="fld"><label for="pg_kind">Runs by</label><select id="pg_kind"><option' + (ep && ep.kind === 'Year' ? '' : ' selected') + '>Semester</option><option' + (ep && ep.kind === 'Year' ? ' selected' : '') + '>Year</option></select></div>' +
      inp('pg_terms', 'Number of terms', ep ? ep.terms : 8, 'type="number" min="1" max="12" required') +
      '<div class="fld"><label for="pg_preset">Grade preset</label><select id="pg_preset" data-preset><option value="letter">Letter grades</option><option value="gpa">GPA 4.0 scale</option><option value="division">Division system</option><option value="custom"' + (g.preset === 'custom' ? ' selected' : '') + '>Custom</option></select></div>' +
      inp('pg_fail', 'Fail label', g.fail || 'F') + '</div>' +
      '<div class="fld" style="margin-top:12px"><label for="pg_grades">Grading scale. One line each: minimum %, grade, GPA (optional). The last line starts at 0.</label><textarea id="pg_grades">' + esc(gtxt) + '</textarea></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn pri">' + (ep ? 'Update program' : 'Add program') + '</button>' + (ep ? '<button type="button" class="btn" data-act="cancel">Cancel</button>' : '') + '</div></form>' +
      '<div class="tw" style="margin-top:14px"><table><thead><tr><th>Program</th><th>Faculty</th><th class="n">Terms</th><th>Grading</th><th></th></tr></thead><tbody>' + (S.programs.map(function (p) {
        return '<tr><td><b>' + esc(p.code) + '</b><br><span class="muted">' + esc(p.name) + '</span></td><td>' + esc((FAC(p.facultyId) || {}).name || '') + '</td><td class="n">' + p.terms + ' ' + (p.kind === 'Year' ? 'yr' : 'sem') + '</td><td class="muted">' + esc(p.grading.lines.map(function (l) { return l[1]; }).join(' · ')) + '<br>fail: ' + esc(p.grading.fail) + '</td><td class="acts"><button class="btn sm" data-act="edit-prog" data-id="' + p.id + '">Edit</button><button class="btn sm" data-act="dup-prog" data-id="' + p.id + '">Duplicate</button><button class="btn sm danger" data-act="del-prog" data-id="' + p.id + '">Delete</button></td></tr>';
      }).join('') || '<tr><td colspan="5" class="empty">No programs yet.</td></tr>') + '</tbody></table></div></section>';
  };

  V.students = function () {
    var p = P(F.prog); if (!p) return '<div class="card empty">Add a program first.</div>';
    var es = ED.stu ? S.students.find(function (s) { return s.id === ED.stu; }) : null, sp = es ? P(es.programId) : p;
    var dob = es && es.dob ? es.dob.split('-') : ['', '', ''];
    var list = S.students.filter(function (s) { return s.programId === F.prog && (!F.term || s.term === F.term) && (!F.adm || s.adm === F.adm) && (showGrad || s.status !== 'graduated'); })
      .sort(function (a, b) { return a.adm - b.adm || a.term - b.term || a.roll - b.roll; });
    var nextRoll = Math.max.apply(null, [0].concat(S.students.filter(function (s) { return s.programId === F.prog && s.term === (F.term || 1) && s.adm === (F.adm || 2082); }).map(function (s) { return s.roll; }))) + 1;
    var termOpts = ''; for (var t = 1; t <= sp.terms; t++) termOpts += '<option value="' + t + '"' + ((es ? es.term : (F.term || 1)) === t ? ' selected' : '') + '>' + sp.kind + ' ' + t + '</option>';
    var movable = F.term ? list.filter(function (s) { return s.term === F.term && s.status !== 'graduated'; }) : [];
    return '<section class="card" style="--c:1"><h2>' + (es ? 'Edit student' : 'Add student') + '</h2><form data-form="student"><div class="grid">' +
      inp('st_symbol', 'Symbol no.', es ? es.symbol : nextSymbol(), 'required') + inp('st_roll', 'Roll no.', es ? es.roll : nextRoll, 'type="number" min="1" required') +
      inp('st_name', 'Full name', es ? es.name : '', 'required') + inp('st_reg', 'Registration no.', es ? es.reg : '') +
      '<div class="fld"><label for="st_dy">Date of birth (' + cal() + ')</label><div class="dob"><input id="st_dy" inputmode="numeric" maxlength="4" placeholder="Year" value="' + esc(dob[0]) + '"><input id="st_dm" inputmode="numeric" maxlength="2" placeholder="Month" value="' + esc(dob[1]) + '" aria-label="Month"><input id="st_dd" inputmode="numeric" maxlength="2" placeholder="Day" value="' + esc(dob[2]) + '" aria-label="Day"></div></div>' +
      '<div class="fld"><label for="st_prog">Program</label><select id="st_prog" data-stprog>' + S.programs.map(function (x) { return '<option value="' + x.id + '"' + (x.id === sp.id ? ' selected' : '') + '>' + esc(x.code) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fld"><label for="st_term">' + (sp.kind === 'Year' ? 'Year' : 'Semester') + '</label><select id="st_term">' + termOpts + '</select></div>' +
      inp('st_adm', 'Admission year (BS, 2082 or later)', es ? es.adm : (F.adm || 2082), 'type="number" min="2082" max="2100" required') +
      '<div class="fld"><label for="st_status">Status</label><select id="st_status"><option value="active"' + (es && es.status === 'graduated' ? '' : ' selected') + '>Active</option><option value="graduated"' + (es && es.status === 'graduated' ? ' selected' : '') + '>Graduated</option></select></div>' +
      '<div class="row"><button class="btn pri">' + (es ? 'Update' : 'Add student') + '</button>' + (es ? '<button type="button" class="btn" data-act="cancel">Cancel</button>' : '') + '</div></div></form></section>' +
      '<section class="card" style="--c:2"><h2>Students <small>' + list.length + ' shown</small></h2>' +
      '<div class="row" style="margin-bottom:12px"><input id="q" placeholder="Search name, symbol or roll" style="flex:1 1 220px" aria-label="Search students"><label class="row muted"><input type="checkbox" id="showgrad"' + (showGrad ? ' checked' : '') + '> Show graduated</label>' +
      '<button class="btn" data-act="exp-students">Export CSV</button><button class="btn" data-act="tpl-students">Import template</button><label class="btn" style="cursor:pointer">Import Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" data-import="students" hidden></label></div>' +
      '<div class="tw"><table><thead><tr><th>Symbol no.</th><th class="n">Roll</th><th>Name</th><th>Date of birth</th><th>' + (p.kind === 'Year' ? 'Year' : 'Semester') + '</th><th class="n">Admission</th><th>Status</th><th></th></tr></thead><tbody>' + (list.map(function (s) {
        return '<tr data-q="' + esc((s.name + ' ' + s.symbol + ' ' + s.roll).toLowerCase()) + '"><td class="mono">' + esc(s.symbol) + '</td><td class="n">' + s.roll + '</td><td>' + esc(s.name) + '</td><td class="mono">' + (s.dob ? esc(s.dob) : '<span class="pill no">missing</span>') + '</td><td>' + P(s.programId).kind[0] + s.term + '</td><td class="n">' + s.adm + '</td><td>' + (s.status === 'graduated' ? '<span class="pill wait">Graduated</span>' : '<span class="pill ok">Active</span>') + '</td>' +
          '<td class="acts"><button class="btn sm" data-act="view-stu-sheet" data-id="' + s.id + '">Gradesheet</button><button class="btn sm" data-act="edit-stu" data-id="' + s.id + '">Edit</button><button class="btn sm" data-act="dup-stu" data-id="' + s.id + '">Duplicate</button><button class="btn sm danger" data-act="del-stu" data-id="' + s.id + '">Delete</button></td></tr>';
      }).join('') || '<tr><td colspan="8" class="empty">No students match these filters.</td></tr>') + '</tbody></table></div>' +
      '<p class="hint">Import columns: Symbol, Roll, Name, Reg, DOB, Program, Semester/Year, Admission Year, Faculty (optional). Write DOB as year-month-day, for example 2062-07-14, and format that column as Text in Excel.</p></section>' +
      '<section class="card" style="--c:3"><h2>Promote to next ' + (p.kind === 'Year' ? 'year' : 'semester') + '</h2><p class="muted" style="margin:0 0 10px">' +
      (F.term ? 'Works on the ' + movable.length + ' active student(s) of ' + esc(p.code) + ' in ' + p.kind + ' ' + F.term + (F.adm ? ', batch ' + F.adm : '') + '. In the last ' + p.kind.toLowerCase() + ' students are marked Graduated. Marks already entered stay on record.' : 'Choose a single ' + p.kind.toLowerCase() + ' in the filter above to promote.') +
      '</p><div class="row"><button class="btn pri" data-act="promote-pass"' + (F.term && movable.length ? '' : ' disabled') + '>Promote students who passed</button><button class="btn" data-act="promote-all"' + (F.term && movable.length ? '' : ' disabled') + '>Promote everyone shown</button></div></section>';
  };

  V.subjects = function () {
    var p = P(F.prog); if (!p) return '<div class="card empty">Add a program first.</div>';
    var es = ED.sub ? S.subjects.find(function (s) { return s.id === ED.sub; }) : null;
    var list = S.subjects.filter(function (s) { return s.programId === F.prog && (!F.term || s.term === F.term); });
    var to = ''; for (var t = 1; t <= p.terms; t++) to += '<option value="' + t + '"' + ((es ? es.term : (F.term || 1)) === t ? ' selected' : '') + '>' + p.kind + ' ' + t + '</option>';
    return '<section class="card" style="--c:1"><h2>' + (es ? 'Edit subject' : 'Add subject') + ' <small>' + esc(p.code) + '</small></h2><form data-form="subject"><div class="grid">' +
      '<div class="fld"><label for="sb_term">' + (p.kind === 'Year' ? 'Year' : 'Semester') + '</label><select id="sb_term">' + to + '</select></div>' +
      inp('sb_code', 'Code', es ? es.code : '', 'required') + inp('sb_name', 'Subject name', es ? es.name : '', 'required') +
      inp('sb_full', 'Full marks', es ? es.full : 100, 'type="number" min="1" required') + inp('sb_pass', 'Pass marks', es ? es.pass : 40, 'type="number" min="0" required') +
      '<div class="row"><button class="btn pri">' + (es ? 'Update' : 'Add subject') + '</button>' + (es ? '<button type="button" class="btn" data-act="cancel">Cancel</button>' : '') + '</div></div></form></section>' +
      '<section class="card" style="--c:2"><h2>Subject list <small>' + list.length + ' subjects</small></h2>' +
      '<div class="row" style="margin-bottom:12px"><button class="btn" data-act="exp-subjects">Export CSV</button><button class="btn" data-act="tpl-subjects">Download sheet for ' + esc(p.code) + '</button><label class="btn" style="cursor:pointer">Import into ' + esc(p.code) + '<input type="file" accept=".xlsx,.xls,.csv" data-import="subjects" hidden></label></div>' +
      '<div class="tw"><table><thead><tr><th>' + p.kind + '</th><th>Code</th><th>Subject</th><th class="n">Full</th><th class="n">Pass</th><th></th></tr></thead><tbody>' + (list.map(function (s) {
        return '<tr><td>' + p.kind[0] + s.term + '</td><td class="mono">' + esc(s.code) + '</td><td>' + esc(s.name) + '</td><td class="n">' + s.full + '</td><td class="n">' + s.pass + '</td><td class="acts"><button class="btn sm" data-act="edit-sub" data-id="' + s.id + '">Edit</button><button class="btn sm" data-act="dup-sub" data-id="' + s.id + '">Duplicate</button><button class="btn sm danger" data-act="del-sub" data-id="' + s.id + '">Delete</button></td></tr>';
      }).join('') || '<tr><td colspan="6" class="empty">No subjects for this selection.</td></tr>') + '</tbody></table></div>' +
      '<p class="hint">Import columns: Term, Code, Subject, Full, Pass. A code that already exists in the same term is updated.</p></section>';
  };

  function markRow(st, subs) {
    var m = S.marks[st.id] || {}, r = result(st, F.term);
    return '<tr data-stu="' + st.id + '"><td class="mono">' + esc(st.symbol) + '</td><td>' + esc(st.name) + '</td>' + subs.map(function (s) {
      var v = m[s.id], bad = v === 'AB' || (typeof v === 'number' && v < s.pass);
      return '<td class="n"><input class="mk' + (bad ? ' bad' : '') + '" data-mark="' + st.id + '|' + s.id + '" value="' + (v === undefined ? '' : v) + '" inputmode="numeric" aria-label="' + esc(st.name + ' ' + s.code) + '"></td>';
    }).join('') + '<td class="n" data-t="ob">' + r.ob + '/' + r.full + '</td><td class="n" data-t="pct">' + fmt(r.pct, 1) + '</td><td data-t="res">' + pillFor(r) + '</td></tr>';
  }
  V.marks = function () {
    var p = P(F.prog); if (!p) return '<div class="card empty">Add a program first.</div>';
    var subs = subsOf(p.id, F.term), co = RMS.cohort(S, p.id, F.term, F.adm);
    if (!subs.length) return '<section class="card empty">No subjects in ' + esc(p.code) + ' ' + termName(p, F.term) + '. Add them on the Subjects tab.</section>';
    return '<section class="card" style="--c:1"><h2>Enter marks <small>' + esc(p.code) + ' · ' + termName(p, F.term) + ' · ' + co.length + ' students</small></h2>' +
      '<div class="row" style="margin-bottom:12px"><button class="btn" data-act="tpl-marks">Download marks sheet</button><label class="btn" style="cursor:pointer">Upload marks sheet<input type="file" accept=".xlsx,.xls,.csv" data-import="marks" hidden></label></div>' +
      '<p class="hint" style="margin:0 0 10px">Type a mark and press Enter to move down. Type AB for absent. Each change saves as you go. The marks sheet has one column per subject code.</p>' +
      '<div class="tw"><table><thead><tr><th>Symbol</th><th>Name</th>' + subs.map(function (s) { return '<th class="n" title="' + esc(s.name) + '">' + esc(s.code) + '<small>' + s.full + '/' + s.pass + '</small></th>'; }).join('') + '<th class="n">Total</th><th class="n">%</th><th>Result</th></tr></thead><tbody>' +
      (co.map(function (st) { return markRow(st, subs); }).join('') || '<tr><td colspan="' + (subs.length + 5) + '" class="empty">No students for this selection.</td></tr>') + '</tbody></table></div></section>';
  };

  V.results = function () {
    var p = P(F.prog); if (!p) return '<div class="card empty">Add a program first.</div>';
    var co = RMS.cohort(S, p.id, F.term, F.adm), rk = RMS.rankMap(S, co, F.term);
    var rows = co.map(function (st) { return {st: st, r: result(st, F.term)}; }).filter(function (x) { return x.r; });
    if (!rows.length) return '<section class="card empty">No subjects in ' + esc(p.code) + ' ' + termName(p, F.term) + '.</section>';
    rows.sort(function (a, b) { return (rk[a.st.id] || 999) - (rk[b.st.id] || 999) || a.st.roll - b.st.roll; });
    var gpaOn = p.grading.lines.some(function (l) { return l[2] !== '' && l[2] != null; });
    var done = rows.filter(function (x) { return x.r.complete; }), passN = done.filter(function (x) { return x.r.pass; }).length;
    return '<section class="card" style="--c:1"><h2>Results <small>' + esc(p.code) + ' · ' + termName(p, F.term) + (F.adm ? ' · batch ' + F.adm : '') + '</small></h2>' +
      '<div class="row" style="margin-bottom:12px"><span class="pill ok">' + passN + ' passed</span><span class="pill no">' + (done.length - passN) + ' failed</span><span class="pill wait">' + (rows.length - done.length) + ' incomplete</span><button class="btn" style="margin-left:auto" data-act="exp-results">Export CSV</button></div>' +
      '<div class="tw"><table><thead><tr><th class="n">Rank</th><th>Symbol</th><th>Name</th><th class="n">Total</th><th class="n">%</th><th>Grade</th>' + (gpaOn ? '<th class="n">GPA</th>' : '') + '<th>Result</th><th></th></tr></thead><tbody>' +
      rows.map(function (x) { var r = x.r; return '<tr><td class="n">' + (rk[x.st.id] || '-') + '</td><td class="mono">' + esc(x.st.symbol) + '</td><td>' + esc(x.st.name) + '</td><td class="n">' + r.ob + '/' + r.full + '</td><td class="n">' + fmt(r.pct) + '</td><td>' + (r.grade === p.grading.fail ? '<span class="f">' + esc(r.grade) + '</span>' : esc(r.grade)) + '</td>' + (gpaOn ? '<td class="n">' + (r.gpa === '' ? '' : fmt(r.gpa, 1)) + '</td>' : '') + '<td>' + pillFor(r) + '</td><td class="acts"><button class="btn sm" data-act="view-stu-sheet" data-id="' + x.st.id + '">Gradesheet</button></td></tr>'; }).join('') +
      '</tbody></table></div><p class="hint">Only students who pass every subject are ranked. Equal totals share a rank. An absent mark counts as a fail.</p></section>';
  };

  V.publish = function () {
    var last = RMS.jget(K.published);
    var progs = S.programs.map(function (p) {
      var chips = '';
      for (var t = 1; t <= p.terms; t++) {
        var tot = 0, done = 0; S.students.forEach(function (s) { if (s.programId === p.id && s.term >= t) { var r = result(s, t); if (r) { tot++; if (r.complete) done++; } } });
        var on = !!S.published[p.id + '|' + t], complete = tot > 0 && done === tot;
        chips += '<label class="chip' + (on ? ' on' : '') + (tot && !complete ? ' warn' : '') + '" title="' + done + ' of ' + tot + ' students have complete marks"><input type="checkbox" data-pub="' + p.id + '|' + t + '"' + (on ? ' checked' : '') + '>' + p.kind[0] + t + ' <span class="muted">' + done + '/' + tot + '</span></label>';
      }
      return '<div style="margin-bottom:14px"><div class="row" style="margin-bottom:6px"><b>' + esc(p.code) + '</b><span class="muted">' + esc(p.name) + '</span><span style="margin-left:auto" class="row"><button class="btn sm" data-act="pub-prog-on" data-id="' + p.id + '">All on</button><button class="btn sm" data-act="pub-prog-off" data-id="' + p.id + '">All off</button></span></div><div class="chips">' + chips + '</div></div>';
    }).join('');
    return '<section class="card" style="--c:1"><h2>Choose what students can see</h2><p class="muted" style="margin:0 0 12px">Tick the semesters or years to publish. A dashed chip means some students still have incomplete marks. Their term is left out of their gradesheet until every mark is entered.</p>' +
      (progs || '<div class="empty">No programs yet.</div>') + '</section>' +
      '<section class="card" style="--c:2"><h2>Publish</h2><p class="muted" style="margin:0 0 12px">Publishing creates one encrypted record per student. Only the right symbol number and date of birth can open a record. The file is <b>results.json</b>: upload it into the <b>data</b> folder of your website to replace the old one.</p>' +
      '<div class="row"><button class="btn pri" data-act="publish-now" id="pubbtn">Publish results</button><a class="btn" href="index.html" target="_blank" rel="noopener">Open student page</a></div>' +
      '<div class="progress" id="pubprog" hidden><i></i></div><div id="pubmsg"></div>' +
      '<div class="msg info">' + (last ? 'Last published: ' + esc(new Date(last.generatedAt).toLocaleString()) + ' · ' + last.count + ' student records' + (last.skipped ? ' · left out: ' + last.skipped.noDob + ' without date of birth, ' + last.skipped.noSymbol + ' without symbol number, ' + last.skipped.noTerms + ' with no complete published term' : '') + '.' : 'Nothing has been published from this browser yet.') + '</div>' +
      '<p class="hint">On this browser the student page shows your latest publish straight away. For everyone else, upload the downloaded file.</p></section>';
  };

  V.settings = function () {
    var m = S.meta, auth = RMS.jget(K.auth) || {};
    var nList = loadNotices();
    var en = edNoticeId ? nList.find(function (x) { return String(x.id) === String(edNoticeId); }) : null;
    var cats = ['All', 'Examination', 'Academic', 'Administration', 'Admission', 'Events'];
    var todayStr = new Date().toISOString().slice(0, 10);

    var filtered = nList.filter(function (n) {
      var matchesCat = noticeCat === 'All' || n.category === noticeCat;
      var q = noticeSearch.toLowerCase().trim();
      var matchesSearch = !q || (n.title + ' ' + n.description + ' ' + n.department + ' ' + n.category).toLowerCase().indexOf(q) >= 0;
      return matchesCat && matchesSearch;
    });

    filtered.sort(function (a, b) {
      if (noticeSort === 'priority') {
        if (a.important !== b.important) return a.important ? -1 : 1;
        return String(b.date).localeCompare(String(a.date));
      }
      var c = String(a.date).localeCompare(String(b.date));
      return noticeSort === 'newest' ? -c : c;
    });

    var recentCount = nList.filter(function (n) {
      var d = new Date(n.date + 'T00:00:00');
      return !isNaN(d) && (Date.now() - d.getTime()) <= 7 * 86400000;
    }).length;
    var impCount = nList.filter(function (n) { return n.important; }).length;
    var catCount = new Set(nList.map(function (n) { return n.category; })).size;

    var catChips = cats.map(function (c) {
      return '<button type="button" class="chip ' + (noticeCat === c ? 'active' : '') + '" data-notice-cat="' + c + '">' + esc(c) + '</button>';
    }).join('');

    var noticeRows = filtered.map(function (n) {
      return '<tr data-nid="' + n.id + '">' +
        '<td>' + (n.important ? '<span class="pill no">★ High Priority</span>' : '<span class="pill wait">Standard</span>') + '</td>' +
        '<td><b>' + esc(n.title) + '</b>' +
          (n.attachment ? ' <a href="' + esc(n.attachment) + '" target="_blank" rel="noopener" style="font-size:11.5px; margin-left:6px">📎 PDF/Link</a>' : '') +
          '<div class="muted" style="font-size:12px; margin-top:3px; max-width:420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(n.description) + '</div></td>' +
        '<td><span class="pill ok">' + esc(n.category) + '</span></td>' +
        '<td>' + esc(n.department || 'Examination Section') + '</td>' +
        '<td class="mono">' + esc(n.date) + '</td>' +
        '<td class="acts">' +
          '<button class="btn sm" type="button" data-act="toggle-notice-imp" data-id="' + n.id + '" title="Toggle priority">' + (n.important ? '☆ Demote' : '★ Priority') + '</button>' +
          '<button class="btn sm" type="button" data-act="edit-notice" data-id="' + n.id + '">Edit</button>' +
          '<button class="btn sm danger" type="button" data-act="del-notice" data-id="' + n.id + '">Delete</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<section class="card" style="--c:0">' +
      '<div class="row" style="justify-content:space-between; margin-bottom:8px">' +
        '<div>' +
          '<h2>📢 Notice System Management (CRUD) <small>Target: notice_page.html</small></h2>' +
          '<p class="muted" style="margin:2px 0 0">Create, Read, Update, and Delete campus notices broadcasted to <b>notice_page.html</b> in real time.</p>' +
        '</div>' +
        '<div class="row">' +
          '<a class="btn pri sm" href="notice_page.html" target="_blank" rel="noopener">Open notice_page.html ↗</a>' +
        '</div>' +
      '</div>' +

      '<div class="stats" style="margin:14px 0">' +
        '<div class="stat" style="--c:0"><b>' + nList.length + '</b><span>Total notices</span></div>' +
        '<div class="stat" style="--c:1"><b>' + impCount + '</b><span>High priority</span></div>' +
        '<div class="stat" style="--c:2"><b>' + recentCount + '</b><span>Recent (7 days)</span></div>' +
        '<div class="stat" style="--c:3"><b>' + catCount + '</b><span>Categories</span></div>' +
      '</div>' +

      '<div style="background:var(--soft); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:18px">' +
        '<h3 style="margin:0 0 12px; font-size:15px; font-weight:700;">' + (en ? '✏️ Edit Notice #' + en.id : '➕ Create New Notice') + '</h3>' +
        '<form data-form="notice">' +
          '<div class="grid">' +
            inp('n_title', 'Notice Title', en ? en.title : '', 'required placeholder="e.g. End Semester Exam Schedule Released"') +
            '<div class="fld"><label for="n_category">Category</label><select id="n_category">' +
              ['Examination', 'Academic', 'Administration', 'Admission', 'Events'].map(function (c) {
                return '<option value="' + c + '"' + (en && en.category === c ? ' selected' : '') + '>' + c + '</option>';
              }).join('') +
            '</select></div>' +
            inp('n_dept', 'Publishing Department / Section', en ? en.department : 'Examination Section', 'placeholder="e.g. Examination Section"') +
            inp('n_date', 'Publication Date', en ? en.date : todayStr, 'type="date" required') +
            inp('n_attachment', 'Attachment / PDF Document URL (optional)', en ? en.attachment : '', 'placeholder="e.g. notices/exam-routine.pdf"') +
            '<div class="fld" style="justify-content:center"><label class="row" style="margin-top:20px; cursor:pointer"><input type="checkbox" id="n_important"' + (en && en.important ? ' checked' : '') + '> <b>★ Mark as High Priority / Urgent</b></label></div>' +
          '</div>' +
          '<div class="fld" style="margin-top:12px">' +
            '<label for="n_desc">Notice Body & Details (Markdown / Plain Text)</label>' +
            '<textarea id="n_desc" rows="3" required placeholder="Type the full announcement details here...">' + esc(en ? en.description : '') + '</textarea>' +
          '</div>' +
          '<div class="row" style="margin-top:14px">' +
            '<button class="btn pri" type="submit">' + (en ? '💾 Update Notice in notice_page.html' : '➕ Publish Notice to notice_page.html') + '</button>' +
            (en ? '<button type="button" class="btn" data-act="cancel-notice-edit">Cancel Edit</button>' : '') +
          '</div>' +
        '</form>' +
      '</div>' +

      '<div>' +
        '<div class="row" style="justify-content:space-between; margin-bottom:10px">' +
          '<h3 style="margin:0; font-size:15px; font-weight:700;">📋 Current Notices Stream <small style="font-weight:400; color:var(--muted)">(' + filtered.length + ' of ' + nList.length + ')</small></h3>' +
          '<div class="row">' +
            '<button class="btn sm" type="button" data-act="exp-notices-json">Export JSON</button>' +
            '<label class="btn sm" style="cursor:pointer">Import JSON<input type="file" accept=".json,application/json" data-import="notices_json" hidden></label>' +
            '<button class="btn sm" type="button" data-act="load-sample-notices">Reset Samples</button>' +
            '<button class="btn sm danger" type="button" data-act="clear-all-notices">Clear All</button>' +
          '</div>' +
        '</div>' +

        '<div class="row" style="margin-bottom:12px">' +
          '<input type="search" id="n_search" value="' + esc(noticeSearch) + '" placeholder="🔍 Search notices by keyword, title, department..." style="flex:2 1 240px">' +
          '<select id="n_sort" style="flex:1 1 160px">' +
            '<option value="newest"' + (noticeSort === 'newest' ? ' selected' : '') + '>Newest Date First</option>' +
            '<option value="oldest"' + (noticeSort === 'oldest' ? ' selected' : '') + '>Oldest Date First</option>' +
            '<option value="priority"' + (noticeSort === 'priority' ? ' selected' : '') + '>★ High Priority First</option>' +
          '</select>' +
        '</div>' +

        '<div class="chips" style="margin-bottom:14px">' + catChips + '</div>' +

        '<div class="tw"><table><thead><tr>' +
          '<th>Priority</th>' +
          '<th>Title & Description</th>' +
          '<th>Category</th>' +
          '<th>Department</th>' +
          '<th>Date</th>' +
          '<th>Actions (CRUD)</th>' +
        '</tr></thead><tbody>' +
          (noticeRows || '<tr><td colspan="6" class="empty">No notices match your filter. Add one above or reset samples.</td></tr>') +
        '</tbody></table></div>' +
      '</div>' +
    '</section>' +

    '<section class="card" style="--c:1"><h2>College and examination</h2><form data-form="meta" class="grid">' + inp('m_college', 'College / university', m.college) + inp('m_exam', 'Examination', m.exam) + inp('m_session', 'Session', m.session) +
      '<div class="fld"><label for="m_cal">Calendar for dates of birth</label><select id="m_cal"><option value="BS"' + (cal() === 'BS' ? ' selected' : '') + '>BS (Bikram Sambat)</option><option value="AD"' + (cal() === 'AD' ? ' selected' : '') + '>AD</option></select></div>' +
      '<div class="row"><button class="btn pri">Save</button></div></form><p class="hint">Dates of birth are stored as typed. If you switch the calendar, re-enter the dates in the new one.</p></section>' +
    '<section class="card" style="--c:2"><h2>Change password <small>' + esc(auth.user || '') + '</small></h2><form data-form="password" class="grid">' +
      inp('pw_old', 'Current password', '', 'type="password" autocomplete="current-password" required') + inp('pw_new', 'New password (8+ characters)', '', 'type="password" autocomplete="new-password" required') + inp('pw_new2', 'Repeat new password', '', 'type="password" autocomplete="new-password" required') +
      '<div class="row"><button class="btn pri">Change password</button></div></form></section>' +
    '<section class="card" style="--c:3"><h2>Backup and restore</h2><p class="muted" style="margin:0 0 12px">All records live in this browser. Save a data file after real entries. It is your master copy and can be opened in any browser.</p>' +
      '<div class="row"><button class="btn pri" data-act="exp-json">Save data file (.json)</button><label class="btn" style="cursor:pointer">Open data file<input type="file" accept=".json,application/json" data-import="json" hidden></label></div></section>' +
    '<section class="card" style="--c:4"><h2>Start over</h2><div class="row"><button class="btn" data-act="load-seed">Load Bagmati University sample</button><button class="btn danger" data-act="erase">Erase all records</button></div>' +
      '<p class="hint">Erase removes programs, subjects, students and marks from this browser but keeps your sign-in. Publish afterwards to replace the sample results.json.</p></section>';
  };

  /* ---------- render ---------- */
  function render() {
    fixFilters();
    $('#hname').textContent = S.meta.college || 'Result desk';
    $('#hsub').textContent = (S.meta.exam || '') + (S.meta.session ? ' · ' + S.meta.session : '');
    $('#tabs').innerHTML = TABS.map(function (t) { return '<button type="button" data-tab="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
    $('#view').innerHTML = (FILTERED[tab] ? filterBar() : '') + V[tab]();
    document.querySelectorAll('#view .card').forEach(function (c, i) { c.style.setProperty('--c', i); });
    document.querySelectorAll('#view tbody tr').forEach(function (tr, i) { tr.style.setProperty('--i', Math.min(i, 18)); });
  }
  function go(t) { tab = t; ED = {}; render(); window.scrollTo(0, 0); }

  /* ---------- forms ---------- */
  function parseGrades(txt, fail) {
    var lines = txt.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) { var a = l.split(',').map(function (x) { return x.trim(); }); return [num(a[0]), a[1], a[2] === undefined || a[2] === '' ? '' : num(a[2])]; });
    if (!lines.length || lines.some(function (l) { return isNaN(l[0]) || !l[1] || (l[2] !== '' && isNaN(l[2])); })) return null;
    lines.sort(function (a, b) { return b[0] - a[0]; });
    if (lines[lines.length - 1][0] !== 0) return null;
    return {preset: 'custom', fail: fail || 'F', lines: lines};
  }
  function dobOk(dob) {
    var y = Number(dob.slice(0, 4));
    if (cal() === 'BS' && (y < 1950 || y > 2090)) return 'A BS year should be between 1950 and 2090. Check the year or the calendar in Settings.';
    if (cal() === 'AD' && (y < 1900 || y > 2035)) return 'An AD year should be between 1900 and 2035. Check the year or the calendar in Settings.';
    return '';
  }
  var forms = {
    meta: function () { S.meta = {college: $('#m_college').value.trim() || 'College', exam: $('#m_exam').value.trim(), session: $('#m_session').value.trim()}; S.settings.dobCal = $('#m_cal').value; toast('Details saved'); },
    password: function () {
      var auth = RMS.jget(K.auth), o = $('#pw_old').value, n = $('#pw_new').value, n2 = $('#pw_new2').value;
      if (n.length < 8) return toast('The new password needs at least 8 characters'), false;
      if (n !== n2) return toast('The new passwords do not match'), false;
      RMS.hashPassword(o, auth.salt, auth.iter).then(function (h) {
        if (h !== auth.hash) return toast('Current password is not correct');
        var salt = RMS.toB64(RMS.randomBytes(16));
        return RMS.hashPassword(n, salt, RMS.ITER).then(function (nh) { auth.salt = salt; auth.iter = RMS.ITER; auth.hash = nh; RMS.lsSet(K.auth, JSON.stringify(auth)); toast('Password changed'); render(); });
      });
      return false;
    },
    faculty: function () {
      var n = $('#fa_name').value.trim(); if (!n) return false;
      if (ED.fac) { FAC(ED.fac).name = n; ED = {}; toast('Faculty updated'); } else { S.faculties.push({id: uid('f'), name: n}); toast('Faculty added'); }
    },
    program: function () {
      var kind = $('#pg_kind').value, terms = Math.round(num($('#pg_terms').value));
      if (!(terms >= 1 && terms <= 12)) return toast('Terms must be between 1 and 12'), false;
      var g = parseGrades($('#pg_grades').value, $('#pg_fail').value.trim()); if (!g) return toast('Check the grading scale: numbers first, and the last line must start at 0'), false;
      var preset = $('#pg_preset').value; if (preset !== 'custom') g.preset = preset;
      var d = {name: $('#pg_name').value.trim(), code: $('#pg_code').value.trim(), facultyId: $('#pg_fac').value, kind: kind, terms: terms, grading: g};
      if (!d.facultyId) return toast('Add a faculty first'), false;
      if (ED.prog) {
        var p = P(ED.prog), hi = Math.max.apply(null, [0].concat(S.subjects.filter(function (s) { return s.programId === p.id; }).map(function (s) { return s.term; }), S.students.filter(function (s) { return s.programId === p.id; }).map(function (s) { return s.term; })));
        if (terms < hi) return toast('This program already has subjects or students in term ' + hi), false;
        Object.assign(p, d); ED = {}; toast('Program updated');
      } else { S.programs.push(Object.assign({id: uid('p')}, d)); F.prog = S.programs[S.programs.length - 1].id; toast('Program added'); }
    },
    student: function () {
      var d = {symbol: RMS.normSymbol($('#st_symbol').value), roll: Math.round(num($('#st_roll').value)), name: $('#st_name').value.trim(), reg: $('#st_reg').value.trim(), programId: $('#st_prog').value, term: Math.round(num($('#st_term').value)), adm: Math.round(num($('#st_adm').value)), status: $('#st_status').value};
      var dob = RMS.normDob($('#st_dy').value, $('#st_dm').value, $('#st_dd').value);
      if (!d.symbol) return toast('Enter a symbol number'), false;
      if (!(d.roll >= 1) || !d.name) return toast('Roll number and name are required'), false;
      if (!dob) return toast('Enter the date of birth as year, month and day'), false;
      var why = dobOk(dob); if (why) return toast(why), false;
      if (!(d.adm >= 2082 && d.adm <= 2100)) return toast('Admission year must be 2082 or later (BS)'), false;
      if (S.students.some(function (s) { return s.id !== ED.stu && RMS.normSymbol(s.symbol) === d.symbol; })) return toast('That symbol number is already used by another student'), false;
      if (S.students.some(function (s) { return s.id !== ED.stu && s.programId === d.programId && s.term === d.term && s.adm === d.adm && s.roll === d.roll; })) return toast('That roll number is already used in this program, term and batch'), false;
      d.dob = dob;
      if (ED.stu) { Object.assign(S.students.find(function (s) { return s.id === ED.stu; }), d); ED = {}; toast('Student updated'); } else { S.students.push(Object.assign({id: uid('st')}, d)); toast('Student added'); }
      F.prog = d.programId;
    },
    subject: function () {
      var d = {programId: F.prog, term: Math.round(num($('#sb_term').value)), code: $('#sb_code').value.trim(), name: $('#sb_name').value.trim(), full: num($('#sb_full').value), pass: num($('#sb_pass').value)};
      if (!d.code || !d.name || !(d.full > 0) || !(d.pass >= 0) || d.pass > d.full) return toast('Check code, name, full marks and pass marks'), false;
      if (S.subjects.some(function (s) { return s.id !== ED.sub && s.programId === d.programId && s.term === d.term && s.code.toLowerCase() === d.code.toLowerCase(); })) return toast('That code already exists in this term'), false;
      if (ED.sub) { Object.assign(S.subjects.find(function (s) { return s.id === ED.sub; }), d); ED = {}; toast('Subject updated'); } else { S.subjects.push(Object.assign({id: uid('s')}, d)); toast('Subject added'); }
    },
    notice: function () {
      var title = $('#n_title').value.trim();
      var category = $('#n_category').value;
      var dept = $('#n_dept').value.trim();
      var date = $('#n_date').value.trim();
      var important = $('#n_important').checked;
      var attachment = $('#n_attachment').value.trim();
      var description = $('#n_desc').value.trim();
      if (!title || !description) return toast('Notice title and description are required'), false;
      var list = loadNotices();
      if (edNoticeId) {
        var n = list.find(function (x) { return String(x.id) === String(edNoticeId); });
        if (n) {
          Object.assign(n, {title: title, category: category, department: dept, date: date, important: important, attachment: attachment, description: description});
          toast('Notice updated');
        }
        edNoticeId = null;
      } else {
        var maxId = 0; list.forEach(function (x) { var numId = Number(x.id); if (numId > maxId) maxId = numId; });
        list.unshift({id: maxId + 1, title: title, category: category, department: dept || 'Examination Section', date: date || new Date().toISOString().slice(0, 10), important: important, attachment: attachment, description: description});
        toast('Notice published');
      }
      saveNotices(list);
      return false;
    },
    stu_lookup: function () {
      var sym = RMS.normSymbol($('#lk_sym').value);
      var dy = $('#lk_dy').value.trim(), dm = $('#lk_dm').value.trim(), dd = $('#lk_dd').value.trim();
      var dob = RMS.normDob(dy, dm, dd);
      if (!sym) return toast('Enter symbol number'), false;
      if (!dob) return toast('Enter valid date of birth'), false;
      var match = S.students.find(function (s) { return RMS.normSymbol(s.symbol) === sym && s.dob === dob; });
      if (!match) return toast('No student found matching symbol ' + sym + ' and DOB ' + dob), false;
      lookupStudentId = match.id;
      lookupTerm = match.term || 1;
      return false;
    }
  };

  /* ---------- actions ---------- */
  function dropMarks(ids) { ids.forEach(function (id) { delete S.marks[id]; }); }
  function unpub(pids) { Object.keys(S.published).forEach(function (k) { if (pids.indexOf(k.split('|')[0]) >= 0) delete S.published[k]; }); }
  var A = {
    cancel: function () { ED = {}; },
    'quick-post-notice': function () { edNoticeId = null; go('notices'); setTimeout(function () { var el = $('#n_title'); if (el) el.focus(); }, 100); return false; },
    'edit-notice': function (id) { edNoticeId = id; render(); var f = $('#view form[data-form=notice]'); if (f) f.scrollIntoView({behavior: 'smooth'}); return false; },
    'del-notice': function (id) {
      return ask('Delete notice?', 'This notice will be removed from the portal.').then(function (ok) {
        if (!ok) return false;
        var list = loadNotices().filter(function (n) { return String(n.id) !== String(id); });
        saveNotices(list); toast('Notice deleted'); render();
      });
    },
    'toggle-notice-imp': function (id) {
      var list = loadNotices(), n = list.find(function (x) { return String(x.id) === String(id); });
      if (n) { n.important = !n.important; saveNotices(list); toast(n.important ? 'Marked as High Priority' : 'Removed from High Priority'); render(); }
      return false;
    },
    'cancel-notice-edit': function () { edNoticeId = null; render(); return false; },
    'load-sample-notices': function () {
      return ask('Restore sample notices?', 'This replaces all current notices with the campus default samples on notice_page.html.', 'Restore').then(function (ok) {
        if (!ok) return false;
        saveNotices(sampleNotices.slice());
        toast('Sample notices restored');
        render();
      });
    },
    'clear-all-notices': function () {
      return ask('Delete all notices?', 'All notices will be erased from notice_page.html. This cannot be undone.', 'Delete all', 'DELETE').then(function (ok) {
        if (!ok) return false;
        saveNotices([]);
        toast('All notices cleared');
        render();
      });
    },
    'exp-notices-json': function () {
      saveFile('campus-notices.json', JSON.stringify(loadNotices(), null, 2), 'application/json');
      return false;
    },
    'view-stu-sheet': function (id) {
      lookupStudentId = id;
      var st = S.students.find(function (s) { return s.id === id; });
      lookupTerm = st ? (st.term || 1) : 1;
      go('student_lookup');
      return false;
    },
    'load-selected-student': function () {
      var sel = $('#sel_student');
      if (sel && sel.value) {
        lookupStudentId = sel.value;
        var st = S.students.find(function (s) { return s.id === sel.value; });
        lookupTerm = st ? (st.term || 1) : 1;
        render();
      } else {
        toast('Please choose a student from the list');
      }
      return false;
    },
    'quick-sample-stu': function () {
      if ($('#lk_sym')) $('#lk_sym').value = '20820101';
      if ($('#lk_dy')) $('#lk_dy').value = '2060';
      if ($('#lk_dm')) $('#lk_dm').value = '08';
      if ($('#lk_dd')) $('#lk_dd').value = '17';
      return false;
    },
    'print-sheet': function () { window.print(); return false; },
    'clear-lookup': function () { lookupStudentId = null; render(); return false; },
    'edit-fac': function (id) { ED = {fac: id}; }, 'edit-prog': function (id) { ED = {prog: id}; }, 'edit-stu': function (id) { ED = {stu: id}; }, 'edit-sub': function (id) { ED = {sub: id}; },
    'dup-fac': function (id) { S.faculties.push({id: uid('f'), name: FAC(id).name + ' (copy)'}); toast('Faculty duplicated'); },
    'dup-prog': function (id) {
      var p = P(id), np = clone(p); np.id = uid('p'); np.name += ' (copy)'; np.code += '-2'; S.programs.push(np);
      S.subjects.filter(function (s) { return s.programId === id; }).forEach(function (s) { S.subjects.push(Object.assign({}, s, {id: uid('s'), programId: np.id})); });
      toast('Program duplicated with its subjects');
    },
    'dup-stu': function (id) {
      var s = S.students.find(function (x) { return x.id === id; });
      var mx = Math.max.apply(null, S.students.filter(function (x) { return x.programId === s.programId && x.term === s.term && x.adm === s.adm; }).map(function (x) { return x.roll; }));
      var n = Object.assign({}, s, {id: uid('st'), roll: mx + 1, reg: '', symbol: nextSymbol(), dob: '', name: s.name + ' (copy)'}); S.students.push(n); ED = {stu: n.id}; toast('Copy added. Fill in the symbol number and date of birth.');
    },
    'dup-sub': function (id) {
      var s = S.subjects.find(function (x) { return x.id === id; }), c = s.code + '-C';
      while (S.subjects.some(function (x) { return x.programId === s.programId && x.term === s.term && x.code === c; })) c += 'C';
      var n = Object.assign({}, s, {id: uid('s'), code: c, name: s.name + ' (copy)'}); S.subjects.push(n); ED = {sub: n.id}; toast('Copy added. Edit the details below.');
    },
    'del-fac': function (id) {
      var ps = S.programs.filter(function (p) { return p.facultyId === id; }), pids = ps.map(function (p) { return p.id; });
      var subs = S.subjects.filter(function (s) { return pids.indexOf(s.programId) >= 0; }).length, sts = S.students.filter(function (s) { return pids.indexOf(s.programId) >= 0; });
      return ask('Delete faculty?', 'This also deletes ' + ps.length + ' program(s), ' + subs + ' subject(s), ' + sts.length + ' student(s) and all their marks. This cannot be undone.').then(function (ok) {
        if (!ok) return false;
        dropMarks(sts.map(function (s) { return s.id; })); unpub(pids);
        S.students = S.students.filter(function (s) { return pids.indexOf(s.programId) < 0; }); S.subjects = S.subjects.filter(function (s) { return pids.indexOf(s.programId) < 0; });
        S.programs = S.programs.filter(function (p) { return p.facultyId !== id; }); S.faculties = S.faculties.filter(function (f) { return f.id !== id; }); toast('Faculty deleted');
      });
    },
    'del-prog': function (id) {
      var subs = S.subjects.filter(function (s) { return s.programId === id; }).length, sts = S.students.filter(function (s) { return s.programId === id; });
      return ask('Delete program?', 'This also deletes ' + subs + ' subject(s), ' + sts.length + ' student(s) and all their marks. This cannot be undone.').then(function (ok) {
        if (!ok) return false;
        dropMarks(sts.map(function (s) { return s.id; })); unpub([id]);
        S.students = S.students.filter(function (s) { return s.programId !== id; }); S.subjects = S.subjects.filter(function (s) { return s.programId !== id; }); S.programs = S.programs.filter(function (p) { return p.id !== id; }); toast('Program deleted');
      });
    },
    'del-stu': function (id) {
      var s = S.students.find(function (x) { return x.id === id; });
      return ask('Delete student?', s.name + ' and their marks will be removed.').then(function (ok) { if (!ok) return false; dropMarks([id]); S.students = S.students.filter(function (x) { return x.id !== id; }); toast('Student deleted'); });
    },
    'del-sub': function (id) {
      var s = S.subjects.find(function (x) { return x.id === id; });
      return ask('Delete subject?', s.code + ' ' + s.name + ' and the marks entered for it will be removed.').then(function (ok) {
        if (!ok) return false; Object.keys(S.marks).forEach(function (k) { delete S.marks[k][id]; }); S.subjects = S.subjects.filter(function (x) { return x.id !== id; }); toast('Subject deleted');
      });
    },
    'promote-pass': function () { return promote(true); }, 'promote-all': function () { return promote(false); },
    'pub-prog-on': function (id) { var p = P(id); for (var t = 1; t <= p.terms; t++) S.published[id + '|' + t] = true; },
    'pub-prog-off': function (id) { var p = P(id); for (var t = 1; t <= p.terms; t++) delete S.published[id + '|' + t]; },
    'publish-now': function () { return publishNow().then(function () { return false; }); },
    erase: function () {
      return ask('Erase all records?', 'Programs, subjects, students, marks and publishing choices will be removed from this browser. Your sign-in stays. Save a data file first if you need one.', 'Erase', 'ERASE').then(function (ok) {
        if (!ok) return false; S = RMS.defaultState(null); S.meta = {college: 'Your College', exam: 'Semester End Examination', session: ''}; F = {prog: '', term: 1, adm: 0}; toast('All records erased');
      });
    },
    'load-seed': function () {
      return ask('Load the Bagmati sample?', 'This replaces everything now in this browser with the sample data (13 programs, 260 students).', 'Load sample').then(function (ok) {
        if (!ok) return false; S = RMS.defaultState(window.RMS_SEED); F = {prog: '', term: 1, adm: 0}; toast('Sample loaded');
      });
    },
    'exp-json': function () { saveFile('result-desk-data.json', JSON.stringify(S), 'application/json'); return false; },
    'exp-students': function () {
      var p = P(F.prog), rows = [['Symbol', 'Roll', 'Name', 'Reg', 'DOB', 'Program', 'Semester/Year', 'Admission Year']];
      S.students.filter(function (s) { return s.programId === F.prog && (!F.term || s.term === F.term) && (!F.adm || s.adm === F.adm); }).forEach(function (s) { rows.push([s.symbol, s.roll, s.name, s.reg, s.dob, p.code, s.term, s.adm]); });
      saveCSV('students-' + p.code + '.csv', rows); return false;
    },
    'tpl-students': function () { saveCSV('students-template.csv', [['Symbol', 'Roll', 'Name', 'Reg', 'DOB', 'Program', 'Semester/Year', 'Admission Year', 'Faculty'], [nextSymbol(), 1, 'Sample Student', 'REG-001', '2062-07-14', (P(F.prog) || {code: 'BBA'}).code, 1, 2082, '']]); return false; },
    'exp-subjects': function () { var p = P(F.prog); saveCSV('subjects-' + p.code + '.csv', subjectRows(p, F.term)); return false; },
    'tpl-subjects': function () { var p = P(F.prog); saveCSV('subjects-' + p.code + '.csv', subjectRows(p, 0)); return false; },
    'exp-results': function () {
      var p = P(F.prog), co = RMS.cohort(S, p.id, F.term, F.adm), rk = RMS.rankMap(S, co, F.term), rows = [['Rank', 'Symbol', 'Roll', 'Name', 'Total', 'Full', 'Percentage', 'Grade', 'GPA', 'Result']];
      co.forEach(function (st) { var r = result(st, F.term); if (r) rows.push([rk[st.id] || '', st.symbol, st.roll, st.name, r.ob, r.full, fmt(r.pct), r.grade, r.gpa, r.status]); });
      saveCSV('results-' + p.code + '-' + p.kind[0] + F.term + '.csv', rows); return false;
    },
    'tpl-marks': function () {
      var p = P(F.prog), subs = subsOf(p.id, F.term), co = RMS.cohort(S, p.id, F.term, F.adm);
      var rows = [['Symbol', 'Name'].concat(subs.map(function (s) { return s.code; }))].concat(co.map(function (st) { return [st.symbol, st.name].concat(subs.map(function (s) { var v = (S.marks[st.id] || {})[s.id]; return v === undefined ? '' : v; })); }));
      saveCSV('marks-' + p.code + '-' + p.kind[0] + F.term + '.csv', rows); return false;
    }
  };
  function subjectRows(p, term) {
    var rows = [['Term', 'Code', 'Subject', 'Full', 'Pass']], list = S.subjects.filter(function (s) { return s.programId === p.id && (!term || s.term === term); });
    if (list.length) list.forEach(function (s) { rows.push([s.term, s.code, s.name, s.full, s.pass]); }); else rows.push([1, 'SUB101', 'Sample subject', 100, 40]);
    return rows;
  }
  function promote(onlyPass) {
    var p = P(F.prog); if (!p || !F.term) return Promise.resolve(false);
    var list = S.students.filter(function (s) { return s.programId === p.id && s.term === F.term && s.status !== 'graduated' && (!F.adm || s.adm === F.adm); });
    var go = list.filter(function (s) { if (!onlyPass) return true; var r = result(s, F.term); return r && r.status === 'Pass'; });
    if (!go.length) { toast('No students to promote'); return Promise.resolve(false); }
    var last = F.term === p.terms;
    return ask(last ? 'Graduate students?' : 'Promote students?', go.length + ' of ' + list.length + ' student(s) will ' + (last ? 'be marked Graduated' : 'move to ' + p.kind + ' ' + (F.term + 1)) + '. Their marks stay on record. Save a data file first if unsure.', last ? 'Graduate' : 'Promote').then(function (ok) {
      if (!ok) return false; go.forEach(function (s) { if (last) s.status = 'graduated'; else s.term++; }); toast(go.length + (last ? ' graduated' : ' promoted'));
    });
  }
  function publishNow() {
    var btn = $('#pubbtn'), bar = $('#pubprog'), msg = $('#pubmsg');
    if (!RMS.hasCrypto) { toast('Publishing needs https or localhost'); return Promise.resolve(); }
    if (!Object.keys(S.published).some(function (k) { return S.published[k]; })) { toast('Tick at least one semester or year to publish'); return Promise.resolve(); }
    btn.disabled = true; bar.hidden = false; msg.innerHTML = '';
    return RMS.buildPublished(S, function (i, n) { bar.firstElementChild.style.width = Math.round(i / n * 100) + '%'; }).then(function (pub) {
      var json = JSON.stringify(pub), stored = RMS.lsSet(K.published, json);
      return saveFile('results.json', json, 'application/json').then(function () {
        msg.innerHTML = '<div class="msg ok">Published ' + pub.count + ' student record(s). Upload <b>results.json</b> to the <b>data</b> folder of your website.' + (stored ? '' : ' This browser could not keep a local copy, so use the downloaded file.') + '</div>' +
          (pub.skipped.noDob || pub.skipped.noSymbol ? '<div class="msg err">Left out: ' + pub.skipped.noSymbol + ' without a symbol number, ' + pub.skipped.noDob + ' without a date of birth.</div>' : '');
        persist(); bar.hidden = true; btn.disabled = false;
      });
    }).catch(function (e) { msg.innerHTML = '<div class="msg err">Publishing failed: ' + esc(e && e.message || e) + '</div>'; bar.hidden = true; btn.disabled = false; });
  }

  /* ---------- imports ---------- */
  var importers = {
    students: function (rows) {
      var add = 0, skip = 0, why = '';
      rows.forEach(function (r, i) {
        var prog = pick(r, 'program', 'programcode'), name = pick(r, 'name', 'studentname', 'fullname'), roll = Math.round(num(pick(r, 'roll', 'rollno', 'rollnumber')));
        var term = Math.round(num(pick(r, 'semesteryear', 'semester', 'term', 'year', 'sem') || 1)), adm = Math.round(num(pick(r, 'admissionyear', 'admission', 'enrollyear', 'batch')));
        var symbol = RMS.normSymbol(pick(r, 'symbol', 'symbolno', 'symbolnumber')) || nextSymbol(), dob = RMS.parseDob(pick(r, 'dob', 'dateofbirth', 'birthdate'));
        var p = prog ? findProg(prog) : P(F.prog);
        var bad = !name ? 'name missing' : !(roll >= 1) ? 'roll invalid' : !p ? 'program not found' : !dob ? 'date of birth must be year-month-day' : !(adm >= 2082 && adm <= 2100) ? 'admission year must be 2082 or later' : !(term >= 1 && term <= p.terms) ? 'semester/year invalid' : '';
        if (bad) { skip++; if (!why) why = 'row ' + (i + 2) + ': ' + bad; return; }
        if (S.students.some(function (s) { return RMS.normSymbol(s.symbol) === symbol; })) { skip++; if (!why) why = 'row ' + (i + 2) + ': symbol number already exists'; return; }
        if (S.students.some(function (s) { return s.programId === p.id && s.term === term && s.adm === adm && s.roll === roll; })) { skip++; if (!why) why = 'row ' + (i + 2) + ': roll already exists'; return; }
        S.students.push({id: uid('st'), symbol: symbol, roll: roll, name: name, reg: String(pick(r, 'reg', 'regno', 'registrationno', 'registration')), programId: p.id, term: term, adm: adm, dob: dob, status: 'active'}); add++;
      });
      return 'Students: ' + add + ' added, ' + skip + ' skipped' + (why ? ' (first: ' + why + ')' : '');
    },
    subjects: function (rows) {
      var add = 0, upd = 0, skip = 0, why = '', p = P(F.prog);
      rows.forEach(function (r, i) {
        var term = Math.round(num(pick(r, 'term', 'semester', 'semesteryear', 'year') || (F.term || 1))), code = pick(r, 'code', 'subjectcode'), name = pick(r, 'subject', 'subjectname', 'name', 'title'), full = num(pick(r, 'full', 'fullmarks')), pass = num(pick(r, 'pass', 'passmarks'));
        var bad = !code || !name ? 'code or subject missing' : !(full > 0) ? 'full marks invalid' : !(pass >= 0 && pass <= full) ? 'pass marks invalid' : !(term >= 1 && term <= p.terms) ? 'term outside this program' : '';
        if (bad) { skip++; if (!why) why = 'row ' + (i + 2) + ': ' + bad; return; }
        var ex = S.subjects.find(function (s) { return s.programId === p.id && s.term === term && s.code.toLowerCase() === String(code).toLowerCase(); });
        if (ex) { Object.assign(ex, {name: name, full: full, pass: pass}); upd++; } else { S.subjects.push({id: uid('s'), programId: p.id, term: term, code: code, name: name, full: full, pass: pass}); add++; }
      });
      return 'Subjects: ' + add + ' added, ' + upd + ' updated, ' + skip + ' skipped' + (why ? ' (first: ' + why + ')' : '');
    },
    marks: function (rows) {
      var p = P(F.prog), subs = subsOf(p.id, F.term), co = RMS.cohort(S, p.id, F.term, F.adm), set = 0, skip = 0;
      rows.forEach(function (r) {
        var sym = RMS.normSymbol(pick(r, 'symbol', 'symbolno')), st = co.find(function (s) { return RMS.normSymbol(s.symbol) === sym; });
        if (!st) { skip++; return; }
        subs.forEach(function (s) {
          var raw = pick(r, s.code.toLowerCase().replace(/[^a-z0-9]/g, '')); if (raw === '') return;
          var v = String(raw).toUpperCase() === 'AB' ? 'AB' : num(raw);
          if (v !== 'AB' && !(v >= 0 && v <= s.full)) { skip++; return; }
          (S.marks[st.id] = S.marks[st.id] || {})[s.id] = v; set++;
        });
      });
      return 'Marks: ' + set + ' entered, ' + skip + ' skipped';
    }
  };
  function findProg(key) { var k = String(key).trim().toLowerCase(); return S.programs.find(function (p) { return p.code.toLowerCase() === k || p.name.toLowerCase() === k; }); }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    if (!S) return;
    var tb = e.target.closest('[data-tab]'); if (tb) return go(tb.dataset.tab);
    var nc = e.target.closest('[data-notice-cat]'); if (nc) { noticeCat = nc.dataset.noticeCat; return render(); }
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var fn = A[b.dataset.act]; if (!fn) return;
    var y = window.scrollY;
    Promise.resolve(fn(b.dataset.id)).then(function (out) {
      if (out === false) return;
      persist(); render();
      if (/^(edit|dup)-/.test(b.dataset.act)) { var f = $('#view form'); if (f) f.scrollIntoView({behavior: 'smooth', block: 'center'}); } else window.scrollTo(0, y);
    });
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]'); if (!f || !S) return; e.preventDefault();
    var r = forms[f.dataset.form](f); if (r === false) return; persist(); render();
  });
  document.addEventListener('change', function (e) {
    var t = e.target; if (!S) return;
    if (t.matches('[data-filter]')) { var k = t.dataset.filter; F[k] = k === 'prog' ? t.value : Number(t.value); if (k === 'prog') F.term = Math.min(F.term, P(F.prog).terms) || (tab === 'students' || tab === 'subjects' ? 0 : 1); return render(); }
    if (t.id === 'showgrad') { showGrad = t.checked; return render(); }
    if (t.id === 'sel_student' && t.value) { lookupStudentId = t.value; var selSt = S.students.find(function (s) { return s.id === t.value; }); lookupTerm = selSt ? (selSt.term || 1) : 1; return render(); }
    if (t.id === 'lk_term') { lookupTerm = Number(t.value); return render(); }
    if (t.id === 'n_sort') { noticeSort = t.value; return render(); }
    if (t.matches('[data-pub]')) { if (t.checked) S.published[t.dataset.pub] = true; else delete S.published[t.dataset.pub]; persist(); t.closest('.chip').classList.toggle('on', t.checked); return; }
    if (t.matches('[data-stprog]')) { var p = P(t.value), o = ''; for (var i = 1; i <= p.terms; i++) o += '<option value="' + i + '">' + p.kind + ' ' + i + '</option>'; $('#st_term').innerHTML = o; return; }
    if (t.matches('[data-preset]')) { var pr = PRESETS[t.value]; if (pr) { $('#pg_grades').value = pr.lines.map(function (l) { return l.join(', ').replace(/, $/, ''); }).join('\n'); $('#pg_fail').value = pr.fail; } return; }
    if (t.matches('[data-mark]')) {
      var ids = t.dataset.mark.split('|'), sub = S.subjects.find(function (s) { return s.id === ids[1]; }), raw = t.value.trim(), m = S.marks[ids[0]] = S.marks[ids[0]] || {};
      if (raw === '') delete m[ids[1]];
      else { var v = raw.toUpperCase() === 'AB' ? 'AB' : num(raw); if (v !== 'AB' && !(v >= 0 && v <= sub.full)) { toast('Enter 0 to ' + sub.full + ', or AB'); t.value = m[ids[1]] === undefined ? '' : m[ids[1]]; return; } m[ids[1]] = v; }
      t.classList.toggle('bad', m[ids[1]] === 'AB' || (typeof m[ids[1]] === 'number' && m[ids[1]] < sub.pass));
      var st = S.students.find(function (s) { return s.id === ids[0]; }), r = result(st, F.term), tr = t.closest('tr');
      tr.querySelector('[data-t=ob]').textContent = r.ob + '/' + r.full; tr.querySelector('[data-t=pct]').textContent = fmt(r.pct, 1); tr.querySelector('[data-t=res]').innerHTML = pillFor(r); persist(); return;
    }
    if (t.matches('[data-import="notices_json"]')) {
      var nfile = t.files[0]; if (!nfile) return; t.value = '';
      nfile.text().then(function (txt) {
        var arr = JSON.parse(txt);
        if (!Array.isArray(arr)) throw new Error('Not a valid notices JSON list');
        saveNotices(arr);
        toast('Imported ' + arr.length + ' notices to notice_page.html');
        render();
      }).catch(function (e) { toast('Import failed: ' + (e.message || e)); });
      return;
    }
    if (t.matches('[data-import]')) {
      var file = t.files[0]; if (!file) return; var kind = t.dataset.import; t.value = '';
      var job = kind === 'json' ? file.text().then(function (txt) {
        var o = JSON.parse(txt); if (!o || !Array.isArray(o.programs) || !Array.isArray(o.students)) throw new Error('That file is not a result desk data file');
        return ask('Open data file?', 'This replaces everything now in this browser with the file contents.', 'Open file').then(function (ok) {
          if (!ok) return null; S = Object.assign(RMS.defaultState(null), o); S.settings = S.settings || {dobCal: 'BS'}; S.published = S.published || {}; return 'Data file opened';
        });
      }) : readTable(file).then(importers[kind]);
      job.then(function (msg) { if (msg) { persist(); render(); toast(msg); } }).catch(function (err) { toast('Import failed: ' + (err.message || err)); });
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'q') { var q = e.target.value.toLowerCase().trim(); document.querySelectorAll('#view tbody tr[data-q]').forEach(function (tr) { tr.hidden = !!q && tr.dataset.q.indexOf(q) < 0; }); }
    if (e.target.id === 'n_search') {
      noticeSearch = e.target.value;
      var nq = noticeSearch.toLowerCase().trim();
      document.querySelectorAll('.notice-card-item').forEach(function (card) {
        var txt = card.textContent.toLowerCase();
        card.style.display = (!nq || txt.indexOf(nq) >= 0) ? '' : 'none';
      });
      document.querySelectorAll('tr[data-nid]').forEach(function (tr) {
        var txt = tr.textContent.toLowerCase();
        tr.style.display = (!nq || txt.indexOf(nq) >= 0) ? '' : 'none';
      });
    }
    if (/^st_d[ymd]$/.test(e.target.id) || /^lk_d[ymd]$/.test(e.target.id)) e.target.value = e.target.value.replace(/\D/g, '');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('.mk')) {
      e.preventDefault(); e.target.blur();
      var td = e.target.closest('td'), i = Array.prototype.indexOf.call(td.parentNode.children, td), nx = td.parentNode.nextElementSibling;
      if (nx && nx.children[i]) { var n = nx.children[i].querySelector('input'); if (n) { n.focus(); n.select(); } }
    }
  });
  $('#signout').addEventListener('click', function () { signOut('You have signed out.'); });

  /* ---------- boot ---------- */
  (function boot() {
    var auth = RMS.jget(K.auth), s = currentSession();
    if (auth && s) return enterApp(s.u);
    showGate(auth ? 'login' : 'setup');
  })();
})();
