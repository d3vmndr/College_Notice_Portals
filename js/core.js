/* Result Portal shared core: storage, passwords, encrypted result files and result calculation.
   Used by admin.js and student.js in the browser, and by build tools in Node. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RMS = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';

  var ITER = 100000;
  var cr = root.crypto;
  if ((!cr || !cr.subtle) && typeof require === 'function') { try { cr = require('crypto').webcrypto; } catch (e) {} }
  var hasCrypto = !!(cr && cr.subtle);
  var enc = new TextEncoder(), dec = new TextDecoder();

  /* ---------- small helpers ---------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n, w) { return String(n).padStart(w, '0'); }
  function toB64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function fromB64(b) { var s = atob(b), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return pad(b.toString(16), 2); }).join(''); }
  function sha256Hex(str) { return cr.subtle.digest('SHA-256', enc.encode(str)).then(hex); }
  function randomBytes(n) { return cr.getRandomValues(new Uint8Array(n)); }

  /* ---------- identity normalising ---------- */
  function normSymbol(s) { return String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, ''); }
  function normDob(y, m, d) {
    y = Number(y); m = Number(m); d = Number(d);
    if (!(Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d))) return null;
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 32) return null;
    return pad(y, 4) + '-' + pad(m, 2) + '-' + pad(d, 2);
  }
  function parseDob(v) {
    if (v instanceof Date && !isNaN(v)) { var x = new Date(v.getTime() + 12 * 3600 * 1000); return normDob(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); }
    var m = String(v == null ? '' : v).trim().match(/^(\d{4})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{1,2})$/);
    return m ? normDob(m[1], m[2], m[3]) : null;
  }

  /* ---------- storage (falls back to memory when the browser blocks it) ---------- */
  var KEYS = {state: 'rms-portal-v1', published: 'rms-portal-published-v1', auth: 'rms-portal-auth-v1', lock: 'rms-portal-lock-v1', session: 'rms-portal-session-v1'};
  var mem = {};
  function lsGet(k) { try { var v = root.localStorage.getItem(k); return v === null ? (mem[k] === undefined ? null : mem[k]) : v; } catch (e) { return mem[k] === undefined ? null : mem[k]; } }
  function lsSet(k, v) { mem[k] = v; try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { delete mem[k]; try { root.localStorage.removeItem(k); } catch (e) {} }
  function ssGet(k) { try { return root.sessionStorage.getItem(k); } catch (e) { return mem['s:' + k] === undefined ? null : mem['s:' + k]; } }
  function ssSet(k, v) { mem['s:' + k] = v; try { root.sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { delete mem['s:' + k]; try { root.sessionStorage.removeItem(k); } catch (e) {} }
  function jget(k) { var v = lsGet(k); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }

  /* ---------- crypto ---------- */
  function deriveKey(secret, saltBytes, iter) {
    return cr.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return cr.subtle.deriveKey({name: 'PBKDF2', salt: saltBytes, iterations: iter, hash: 'SHA-256'}, base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    });
  }
  function hashPassword(pw, saltB64, iter) {
    return cr.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (base) {
      return cr.subtle.deriveBits({name: 'PBKDF2', salt: fromB64(saltB64), iterations: iter, hash: 'SHA-256'}, base, 256);
    }).then(hex);
  }

  /* ---------- results logic ---------- */
  function P(S, id) { return S.programs.find(function (p) { return p.id === id; }); }
  function subsOf(S, pid, t) { return S.subjects.filter(function (s) { return s.programId === pid && s.term === t; }); }
  function gradeFor(p, pct, failed) {
    var g = p.grading || {fail: 'F', lines: [[0, 'D', '']]};
    if (failed) return {grade: g.fail || 'F', gpa: ''};
    var ls = g.lines.slice().sort(function (a, b) { return b[0] - a[0]; });
    for (var i = 0; i < ls.length; i++) if (pct >= ls[i][0]) return {grade: ls[i][1], gpa: ls[i][2]};
    return {grade: ls[ls.length - 1][1], gpa: ls[ls.length - 1][2]};
  }
  function result(S, st, term) {
    var p = P(S, st.programId); if (!p) return null;
    var subs = subsOf(S, p.id, term); if (!subs.length) return null;
    var m = S.marks[st.id] || {}, ob = 0, full = 0, fails = 0, missing = 0;
    var rows = subs.map(function (s) {
      var v = m[s.id], state;
      if (v === undefined || v === null || v === '') { missing++; state = 'missing'; }
      else if (v === 'AB') { fails++; state = 'ab'; }
      else if (v < s.pass) { fails++; ob += v; state = 'fail'; }
      else { ob += v; state = 'pass'; }
      full += s.full; return {s: s, v: v, state: state};
    });
    var pct = full ? ob / full * 100 : 0, complete = missing === 0, pass = complete && fails === 0, g = gradeFor(p, pct, fails > 0);
    return {rows: rows, ob: ob, full: full, pct: pct, pass: pass, complete: complete, fails: fails, missing: missing,
      grade: complete ? g.grade : '', gpa: complete ? g.gpa : '', status: !complete ? 'Incomplete' : pass ? 'Pass' : 'Fail'};
  }
  function cohort(S, pid, term, adm) {
    return S.students.filter(function (s) { return s.programId === pid && (!adm || s.adm === adm) && s.term >= term; })
      .sort(function (a, b) { return a.roll - b.roll || a.name.localeCompare(b.name); });
  }
  function rankMap(S, list, term) {
    var rs = list.map(function (st) { return {st: st, r: result(S, st, term)}; }).filter(function (x) { return x.r && x.r.status === 'Pass'; })
      .sort(function (a, b) { return b.r.ob - a.r.ob; });
    var map = {}, last = null, rk = 0;
    rs.forEach(function (x, i) { if (last === null || x.r.ob !== last) { rk = i + 1; last = x.r.ob; } map[x.st.id] = rk; });
    return map;
  }

  /* ---------- default state ---------- */
  function defaultState(seed) {
    var S = seed ? clone(seed) : {meta: {college: 'Your College', exam: 'Semester End Examination', session: '2082/83'}, faculties: [], programs: [], subjects: [], students: [], marks: {}};
    S.settings = S.settings || {dobCal: 'BS'};
    S.published = S.published || {};
    if (seed && !Object.keys(S.published).length) S.programs.forEach(function (p) { for (var t = 1; t <= p.terms; t++) S.published[p.id + '|' + t] = true; });
    return S;
  }
  function loadState(seed) {
    var S = jget(KEYS.state);
    if (S && S.programs && S.students) { S.settings = S.settings || {dobCal: 'BS'}; S.published = S.published || {}; S.marks = S.marks || {}; return S; }
    return defaultState(seed);
  }
  function saveState(S) { return lsSet(KEYS.state, JSON.stringify(S)); }

  /* ---------- publishing: one encrypted record per student ---------- */
  function buildPublished(S, onProgress) {
    var salt = randomBytes(16), saltB64 = toB64(salt);
    var catalog = {programs: {}, subjects: {}}, records = {}, skipped = {noDob: 0, noSymbol: 0, noTerms: 0}, rankCache = {};
    var fac = function (id) { var f = S.faculties.find(function (x) { return x.id === id; }); return f ? f.name : ''; };
    var list = S.students, count = 0, idx = 0;

    function rankFor(pid, t, adm) {
      var k = pid + '|' + t + '|' + adm;
      if (!rankCache[k]) rankCache[k] = rankMap(S, cohort(S, pid, t, adm), t);
      return rankCache[k];
    }
    function step() {
      if (idx >= list.length) {
        return Promise.resolve({v: 1, generatedAt: new Date().toISOString(), meta: {college: S.meta.college, exam: S.meta.exam, session: S.meta.session, dobCal: S.settings.dobCal || 'BS'},
          iter: ITER, salt: saltB64, catalog: catalog, records: records, count: count, skipped: skipped});
      }
      var st = list[idx++];
      if (onProgress) onProgress(idx, list.length);
      var p = P(S, st.programId), sym = normSymbol(st.symbol);
      if (!p) return step();
      if (!sym) { skipped.noSymbol++; return step(); }
      if (!st.dob) { skipped.noDob++; return step(); }
      var terms = [];
      for (var t = 1; t <= p.terms && t <= st.term; t++) {
        if (!S.published[p.id + '|' + t]) continue;
        var r = result(S, st, t); if (!r || !r.complete) continue;
        terms.push({k: t, m: r.rows.map(function (x) { return x.v === undefined ? null : x.v; }), o: r.ob, f: r.full, c: Math.round(r.pct * 100) / 100,
          gr: r.grade, gp: r.gpa === '' || r.gpa == null ? null : r.gpa, rs: r.status, rk: rankFor(p.id, t, st.adm)[st.id] || null});
        catalog.subjects[p.id] = catalog.subjects[p.id] || {};
        catalog.subjects[p.id][t] = subsOf(S, p.id, t).map(function (s) { return [s.code, s.name, s.full, s.pass]; });
        catalog.programs[p.id] = {n: p.name, c: p.code, k: p.kind, f: fac(p.facultyId), fail: (p.grading && p.grading.fail) || 'F',
          gpa: !!(p.grading && p.grading.lines.some(function (l) { return l[2] !== '' && l[2] != null; }))};
      }
      if (!terms.length) { skipped.noTerms++; return step(); }
      var rec = {n: st.name, y: sym, r: st.roll, g: st.reg || '', p: p.id, a: st.adm, s: st.status || 'active', t: terms};
      var iv = randomBytes(12);
      return Promise.all([sha256Hex(saltB64 + '|' + sym), deriveKey(sym + '|' + st.dob, salt, ITER)]).then(function (a) {
        return cr.subtle.encrypt({name: 'AES-GCM', iv: iv}, a[1], enc.encode(JSON.stringify(rec))).then(function (ct) {
          records[a[0]] = [toB64(iv), toB64(new Uint8Array(ct))]; count++;
        });
      }).then(function () { return (idx % 20 === 0) ? new Promise(function (r) { setTimeout(r, 0); }).then(step) : step(); });
    }
    return step();
  }
  /* Returns the student's record, or null when the symbol number or date of birth is wrong. */
  function openRecord(pub, symbolRaw, dob) {
    var sym = normSymbol(symbolRaw);
    if (!pub || !pub.records || !sym || !dob) return Promise.resolve(null);
    var salt = fromB64(pub.salt);
    return Promise.all([sha256Hex(pub.salt + '|' + sym), deriveKey(sym + '|' + dob, salt, pub.iter || ITER)]).then(function (a) {
      var rec = pub.records[a[0]]; if (!rec) return null;
      return cr.subtle.decrypt({name: 'AES-GCM', iv: fromB64(rec[0])}, a[1], fromB64(rec[1])).then(function (pt) { return JSON.parse(dec.decode(pt)); }, function () { return null; });
    });
  }

  return {
    ITER: ITER, KEYS: KEYS, hasCrypto: hasCrypto, clone: clone, pad: pad, toB64: toB64, fromB64: fromB64, sha256Hex: sha256Hex, randomBytes: randomBytes,
    normSymbol: normSymbol, normDob: normDob, parseDob: parseDob,
    lsGet: lsGet, lsSet: lsSet, lsDel: lsDel, ssGet: ssGet, ssSet: ssSet, ssDel: ssDel, jget: jget,
    hashPassword: hashPassword, defaultState: defaultState, loadState: loadState, saveState: saveState,
    P: P, subsOf: subsOf, gradeFor: gradeFor, result: result, cohort: cohort, rankMap: rankMap,
    buildPublished: buildPublished, openRecord: openRecord
  };
});
