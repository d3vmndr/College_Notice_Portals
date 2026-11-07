/* Student portal: symbol number + date of birth unlock the student's own encrypted gradesheet. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
  var pub = null, rec = null, fails = 0, lockUntil = 0;

  function say(text, kind) { $('lk-msg').innerHTML = text ? '<div class="msg ' + (kind || 'err') + '">' + esc(text) + '</div>' : ''; }
  function fmt(n, d) { return Number(n).toFixed(d == null ? 2 : d); }

  /* The published file lives next to the pages (data/results.json). On the same browser the admin's latest local copy is used when it is newer. */
  function loadPublished() {
    var local = null;
    try { local = RMS.jget(RMS.KEYS.published); } catch (e) {}
    return fetch('data/results.json', {cache: 'no-store'}).then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); })
      .catch(function () { return null; })
      .then(function (remote) {
        var best = remote;
        if (local && (!remote || String(local.generatedAt) > String(remote.generatedAt))) best = local;
        return best && best.records ? best : null;
      });
  }

  function applyMeta() {
    if (!pub) { $('updated').textContent = ''; return; }
    var m = pub.meta || {};
    if (m.college) { $('college').textContent = m.college; document.title = 'Result Portal · ' + m.college; }
    var cal = m.dobCal === 'AD' ? 'AD' : 'BS';
    $('dob-label').textContent = 'Date of birth (' + cal + ')';
    $('dob-y').placeholder = cal === 'BS' ? 'Year e.g. 2062' : 'Year e.g. 2005';
    if (pub.generatedAt) {
      var d = new Date(pub.generatedAt);
      if (!isNaN(d)) $('updated').textContent = 'Results updated ' + d.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'}) + '.';
    }
  }

  function termLabel(p, k) { return (p.k === 'Year' ? 'Year ' : 'Semester ') + k; }
  function sheetHTML(t) {
    var p = pub.catalog.programs[rec.p], subs = (pub.catalog.subjects[rec.p] || {})[t.k] || [], m = pub.meta || {};
    var rows = subs.map(function (s, i) {
      var v = t.m[i], state = v === 'AB' ? 'ab' : (v === null || v === undefined) ? 'missing' : v < s[3] ? 'fail' : 'pass';
      var bad = state === 'ab' || state === 'fail';
      return '<tr><td>' + esc(s[0]) + '</td><td>' + esc(s[1]) + '</td><td class="n">' + s[2] + '</td><td class="n">' + s[3] + '</td><td class="n' + (bad ? ' f' : '') + '">' + (v === null || v === undefined ? '-' : v) +
        '</td><td class="' + (bad ? 'f' : '') + '">' + {pass: 'Passed', fail: 'Failed', ab: 'Absent', missing: 'Not entered'}[state] + '</td></tr>';
    }).join('');
    var passed = t.rs === 'Pass';
    return '<article class="rc"><div class="stamp ' + (passed ? 'pass' : 'fail') + '">' + (passed ? 'PASS' : 'FAIL') + '</div>' +
      '<h1>' + esc(m.college || 'College') + '</h1><div class="sub">' + esc(p.f) + '</div>' +
      '<div class="ttl">Gradesheet · ' + esc(m.exam || '') + ' ' + esc(m.session || '') + '</div>' +
      '<div class="info"><div><span>Student</span>' + esc(rec.n) + '</div><div><span>Symbol no.</span>' + esc(rec.y) + '</div><div><span>Roll no.</span>' + esc(rec.r) + '</div>' +
      '<div><span>Registration no.</span>' + esc(rec.g || '-') + '</div><div><span>Program</span>' + esc(p.n) + '</div><div><span>' + (p.k === 'Year' ? 'Year' : 'Semester') + '</span>' + esc(termLabel(p, t.k)) + '</div>' +
      '<div><span>Admission year</span>' + esc(rec.a) + '</div></div>' +
      '<div class="tw"><table><thead><tr><th>Code</th><th>Subject</th><th class="n">Full</th><th class="n">Pass</th><th class="n">Obtained</th><th>Remark</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><td colspan="2">Total</td><td class="n">' + t.f + '</td><td></td><td class="n">' + t.o + '</td><td></td></tr></tfoot></table></div>' +
      '<div class="sum"><div><span>Percentage</span><b>' + fmt(t.c) + '%</b></div><div><span>Grade</span><b>' + esc(t.gr) + '</b></div>' +
      (p.gpa && t.gp != null ? '<div><span>GPA</span><b>' + fmt(t.gp, 1) + '</b></div>' : '') +
      '<div><span>Class rank</span><b>' + (t.rk || '-') + '</b></div><div><span>Result</span><b>' + esc(t.rs) + '</b></div></div>' +
      '<p class="note">This gradesheet is generated from the college records for information. The college office issues the official transcript.</p>' +
      '<div class="sig"><div>Examination controller</div><div>Principal / Dean</div></div></article>';
  }

  function showSheet() {
    var p = pub.catalog.programs[rec.p];
    var terms = rec.t.slice().sort(function (a, b) { return b.k - a.k; });
    $('term').innerHTML = terms.map(function (t) { return '<option value="' + t.k + '">' + esc(termLabel(p, t.k)) + '</option>'; }).join('');
    $('lookup').hidden = true; $('sheet').hidden = false;
    draw();
    window.scrollTo(0, 0);
  }
  function draw() {
    var k = Number($('term').value), t = rec.t.find(function (x) { return x.k === k; });
    $('rc').innerHTML = t ? sheetHTML(t) : '';
  }
  function reset() {
    rec = null; $('rc').innerHTML = ''; $('sheet').hidden = true; $('lookup').hidden = false;
    $('symbol').value = ''; $('dob-y').value = ''; $('dob-m').value = ''; $('dob-d').value = ''; say('');
    $('symbol').focus();
  }

  function submit(e) {
    e.preventDefault();
    if (!RMS.hasCrypto) return say('This page needs a secure connection (https). Ask the college to open it over https.');
    var wait = Math.ceil((lockUntil - Date.now()) / 1000);
    if (wait > 0) return say('Too many attempts. Try again in ' + wait + ' seconds.');
    var sym = RMS.normSymbol($('symbol').value), dob = RMS.normDob($('dob-y').value, $('dob-m').value, $('dob-d').value);
    if (!sym) return say('Enter your symbol number.');
    if (!dob) return say('Enter your date of birth as year, month and day.');
    if (!pub) return say('Results are not available yet. Please check again later.', 'info');
    var btn = $('go'); btn.disabled = true; btn.textContent = 'Checking...'; say('');
    RMS.openRecord(pub, sym, dob).then(function (r) {
      if (!r) {
        fails++;
        if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; return say('Too many attempts. Try again in 30 seconds.'); }
        return say('We could not find a result for that symbol number and date of birth. Check both and try again.');
      }
      fails = 0; rec = r; showSheet();
    }).catch(function () { say('Something went wrong while opening the result. Please try again.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'View result'; });
  }

  /* inside an embedded preview the browser blocks printing, so only offer it on a real page */
  try { if (window.self !== window.top) $('print').hidden = true; } catch (e) { $('print').hidden = true; }

  $('lookup-form').addEventListener('submit', submit);
  $('term').addEventListener('change', draw);
  $('again').addEventListener('click', reset);
  $('print').addEventListener('click', function () { window.print(); });
  [['dob-y', 4, 'dob-m'], ['dob-m', 2, 'dob-d']].forEach(function (a) {
    $(a[0]).addEventListener('input', function (e) { e.target.value = e.target.value.replace(/\D/g, ''); if (e.target.value.length >= a[1]) $(a[2]).focus(); });
  });
  $('dob-d').addEventListener('input', function (e) { e.target.value = e.target.value.replace(/\D/g, ''); });

  loadPublished().then(function (p) {
    pub = p; applyMeta();
    if (!pub) say('Results have not been published yet.', 'info');
  });
})();
