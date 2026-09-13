(function () {
  'use strict';

  var DB = 'anticoag', STORE = 'kv', CLAVE = 'datos', CLAVE_COPIA = 'ultimaCopia';
  var MIN = 2.0, MAX = 3.0;
  var DIAS_AVISO = 14;

  var INTERACTUA = [
    'ketorolac','keterolac','ibuprofeno','diclofenac','naproxeno','aspirina','aas','ketoprofeno',
    'meloxicam','piroxicam','celecoxib','indometacina','aine',
    'ciprofloxacina','ciprofloxacino','levofloxacina','metronidazol','cotrimoxazol','trimetoprima',
    'azitromicina','claritromicina','eritromicina','amoxicilina','fluconazol','itraconazol',
    'amiodarona','omeprazol','fluoxetina','sertralina','tramadol','paracetamol','corticoide',
    'meprednisona','dexametasona','rifampicina','carbamazepina','levotiroxina',
    'simvastatina','atorvastatina','alcohol','arandano','ginkgo','ginseng','vitamina k'
  ];

  var FRECUENTES = {
    med: [
      { n: 'Sintrom', v: 2, u: 'mg' },
      { n: 'Heparina', v: null, u: 'UI' },
      { n: 'Ketorolac', v: null, u: 'mg' },
      { n: 'Paracetamol', v: 1000, u: 'mg' },
      { n: 'Omeprazol', v: 20, u: 'mg' }
    ],
    signo: [
      { n: 'Temperatura', v: null, u: '°C' },
      { n: 'Presión arterial', v: null, u: '—' },
      { n: 'Frecuencia cardíaca', v: null, u: '—' },
      { n: 'Saturación', v: null, u: '—' },
      { n: 'Peso', v: null, u: '—' },
      { n: 'Dolor (0-10)', v: null, u: '—' }
    ]
  };

  var SEMILLA = [
    { id: 'a1', ts: '2026-09-08T18:00', tipo: 'med', nombre: 'Heparina', valor: null, unidad: 'UI', notas: 'Inicio, inyectable cada 12 h' },
    { id: 'a2', ts: '2026-09-09T06:00', tipo: 'med', nombre: 'Heparina', valor: null, unidad: 'UI', notas: '' },
    { id: 'a3', ts: '2026-09-09T17:00', tipo: 'med', nombre: 'Ketorolac', valor: null, unidad: 'mg', notas: 'Sublingual' },
    { id: 'a4', ts: '2026-09-09T18:00', tipo: 'med', nombre: 'Heparina', valor: null, unidad: 'UI', notas: '' },
    { id: 'a5', ts: '2026-09-09T18:00', tipo: 'med', nombre: 'Sintrom', valor: 2, unidad: 'mg', notas: 'Primera toma' },
    { id: 'a6', ts: '2026-09-10T00:00', tipo: 'med', nombre: 'Ketorolac', valor: null, unidad: 'mg', notas: 'Sublingual. Revisar si fue 00 h del 9 o del 10.' },
    { id: 'a7', ts: '2026-09-10T06:00', tipo: 'med', nombre: 'Heparina', valor: null, unidad: 'UI', notas: '' },
    { id: 'a8', ts: '2026-09-10T08:00', tipo: 'med', nombre: 'Ketorolac', valor: null, unidad: 'mg', notas: 'Sublingual' }
  ];

  var datos = [], tipoActual = 'med', copiaMeta = null, persistente = false;

  /* ================= almacenamiento ================= */
  // IndexedDB como fuente principal, localStorage como espejo de emergencia.

  function abrirDB() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('sin indexedDB')); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function idbGet(k) {
    return abrirDB().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
        t.onsuccess = function () { res(t.result); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  function idbSet(k, v) {
    return abrirDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, k);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  function espejo(k, v) {
    try { localStorage.setItem('anticoag-' + k, JSON.stringify(v)); } catch (e) {}
  }
  function leerEspejo(k) {
    try { var r = localStorage.getItem('anticoag-' + k); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }

  function cargar() {
    return idbGet(CLAVE)
      .then(function (v) {
        if (Array.isArray(v) && v.length) return v;
        var e = leerEspejo(CLAVE);
        return (Array.isArray(e) && e.length) ? e : null;
      })
      .catch(function () {
        var e = leerEspejo(CLAVE);
        return (Array.isArray(e) && e.length) ? e : null;
      });
  }

  function persistir() {
    espejo(CLAVE, datos);
    return idbSet(CLAVE, datos).catch(function () {
      aviso('No se pudo guardar en la base. Bajá una copia por las dudas.');
    });
  }

  function pedirPersistencia() {
    if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
    return navigator.storage.persisted()
      .then(function (ya) { return ya ? true : navigator.storage.persist(); })
      .catch(function () { return false; });
  }

  /* ================= utilidades ================= */
  function $(id) { return document.getElementById(id); }
  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function ahoraHora() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function dia(ts) { return ts.slice(0, 10); }
  function hora(ts) { return ts.slice(11, 16); }
  function estado(v) { return v < MIN ? 'bajo' : (v > MAX ? 'alto' : 'ok'); }
  function etiqueta(v) { var e = estado(v); return e === 'ok' ? 'en rango' : (e === 'bajo' ? 'por debajo' : 'por encima'); }
  function inr1(v) { return v.toFixed(1).replace('.', ','); }
  function num(v) { return (Math.round(v * 100) / 100).toString().replace('.', ','); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  function fechaLarga(iso) { var p = iso.split('-'); return parseInt(p[2], 10) + ' ' + MESES[parseInt(p[1], 10) - 1] + ' ' + p[0]; }
  function fechaCorta(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }
  function dias(a, b) { return Math.round((new Date(b + 'T00:00') - new Date(a + 'T00:00')) / 86400000); }

  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function esPresion(n) { return norm(n).indexOf('presion') > -1 || norm(n).indexOf('tension') > -1; }
  function esSintrom(n) { var x = norm(n); return x.indexOf('sintrom') > -1 || x.indexOf('acenocumarol') > -1; }
  function esHeparina(n) { var x = norm(n); return x.indexOf('heparina') > -1 || x.indexOf('enoxaparina') > -1 || x.indexOf('clexane') > -1; }
  function interactua(n) {
    if (esSintrom(n) || esHeparina(n)) return false;
    var x = norm(n);
    for (var i = 0; i < INTERACTUA.length; i++) if (x.indexOf(norm(INTERACTUA[i])) > -1) return true;
    return false;
  }

  var timer;
  function aviso(t) {
    var el = $('toast');
    el.textContent = t;
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { el.classList.remove('show'); }, 3400);
  }

  function inrs() { return datos.filter(function (d) { return d.tipo === 'inr' && d.valor != null; }); }
  function sintroms() { return datos.filter(function (d) { return d.tipo === 'med' && esSintrom(d.nombre) && d.valor != null; }); }

  /* ================= cálculos ================= */
  function calcularTTR() {
    var c = inrs();
    if (c.length < 2) return null;
    var total = 0, dentro = 0;
    for (var i = 0; i < c.length - 1; i++) {
      var d = dias(dia(c[i].ts), dia(c[i + 1].ts));
      if (d <= 0 || d > 120) continue;
      for (var k = 0; k < d; k++) {
        var v = c[i].valor + (c[i + 1].valor - c[i].valor) * (k / d);
        total++;
        if (v >= MIN && v <= MAX) dentro++;
      }
    }
    return total ? Math.round((dentro / total) * 100) : null;
  }

  function puente() {
    var hep = datos.filter(function (d) { return d.tipo === 'med' && esHeparina(d.nombre); });
    if (!hep.length) return null;
    var sin = sintroms(), dh = {}, ds = {};
    hep.forEach(function (d) { dh[dia(d.ts)] = true; });
    sin.forEach(function (d) { ds[dia(d.ts)] = true; });
    var solapa = Object.keys(dh).filter(function (k) { return ds[k]; }).length;
    var c = inrs(), seguidos = 0;
    for (var i = c.length - 1; i >= 0; i--) { if (c[i].valor >= MIN) seguidos++; else break; }
    return {
      inicioHep: dia(hep[0].ts),
      ultimaHep: dia(hep[hep.length - 1].ts),
      inicioSin: sin.length ? dia(sin[0].ts) : null,
      solapa: solapa, seguidos: seguidos
    };
  }

  /* ================= gráfico ================= */
  function dibujar() {
    if (datos.length < 2) { $('chartCard').hidden = true; return; }
    $('chartCard').hidden = false;

    var c = inrs(), sin = sintroms();
    var W = 620, H = 300, L = 34, R = 12, T = 14;
    var barH = 56, gap = 26, ejeH = 28;
    var ph = H - T - barH - gap - ejeH, pw = W - L - R;

    var d0 = dia(datos[0].ts), d1 = dia(datos[datos.length - 1].ts);
    var t0 = new Date(d0 + 'T00:00').getTime(), t1 = new Date(d1 + 'T00:00').getTime();
    var span = Math.max(t1 - t0, 86400000);
    var bw = Math.max(4, Math.min(24, (pw / (span / 86400000 + 1)) * 0.7));

    var maxInr = c.length ? Math.max.apply(null, c.map(function (d) { return d.valor; })) : 3;
    var yMax = Math.max(4.5, Math.ceil(maxInr + 0.5)), yMin = 0.5;

    var porDia = {};
    sin.forEach(function (d) { porDia[dia(d.ts)] = (porDia[dia(d.ts)] || 0) + d.valor; });
    var vals = Object.keys(porDia).map(function (k) { return porDia[k]; });
    var maxD = vals.length ? Math.max.apply(null, vals) : 1;

    function X(f) { return L + ((new Date(f + 'T00:00').getTime() - t0) / span) * pw; }
    function Y(v) { return T + ph - ((v - yMin) / (yMax - yMin)) * ph; }
    var base = T + ph + gap + barH;

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="INR, dosis y eventos">';
    s += '<rect x="' + L + '" y="' + Y(MAX) + '" width="' + pw + '" height="' + (Y(MIN) - Y(MAX)) + '" fill="var(--in-range-bg)"/>';
    s += '<line x1="' + L + '" y1="' + Y(MIN) + '" x2="' + (W - R) + '" y2="' + Y(MIN) + '" stroke="var(--in-range)" stroke-width="1" stroke-dasharray="3 3"/>';
    s += '<line x1="' + L + '" y1="' + Y(MAX) + '" x2="' + (W - R) + '" y2="' + Y(MAX) + '" stroke="var(--in-range)" stroke-width="1" stroke-dasharray="3 3"/>';

    for (var v = 1; v <= yMax; v++) {
      s += '<text x="' + (L - 7) + '" y="' + (Y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--ink-soft)" font-family="Georgia, serif">' + v + '</text>';
    }

    Object.keys(porDia).forEach(function (f) {
      var h = (porDia[f] / maxD) * barH;
      s += '<rect x="' + (X(f) - bw / 2) + '" y="' + (base - h) + '" width="' + bw + '" height="' + h +
           '" fill="var(--steel-soft)" rx="2"><title>' + fechaLarga(f) + ' · ' + num(porDia[f]) + ' mg</title></rect>';
    });
    s += '<line x1="' + L + '" y1="' + base + '" x2="' + (W - R) + '" y2="' + base + '" stroke="var(--line)" stroke-width="1"/>';

    var hepD = {}, intD = {};
    datos.forEach(function (d) {
      if (d.tipo !== 'med') return;
      if (esHeparina(d.nombre)) hepD[dia(d.ts)] = true;
      else if (interactua(d.nombre)) intD[dia(d.ts)] = true;
    });
    Object.keys(hepD).forEach(function (f) {
      s += '<rect x="' + (X(f) - bw / 2) + '" y="' + (base + 5) + '" width="' + bw + '" height="3" fill="var(--hep)" rx="1.5"><title>' + fechaLarga(f) + ' · heparina</title></rect>';
    });
    Object.keys(intD).forEach(function (f) {
      s += '<rect x="' + (X(f) - bw / 2) + '" y="' + (base + 11) + '" width="' + bw + '" height="3" fill="var(--warn)" rx="1.5"><title>' + fechaLarga(f) + ' · puede alterar el INR</title></rect>';
    });

    if (c.length > 1) {
      s += '<polyline points="' + c.map(function (d) { return X(dia(d.ts)) + ',' + Y(d.valor); }).join(' ') +
           '" fill="none" stroke="var(--steel)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    c.forEach(function (d) {
      var e = estado(d.valor);
      var col = e === 'ok' ? 'var(--in-range)' : (e === 'bajo' ? 'var(--low)' : 'var(--high)');
      s += '<circle cx="' + X(dia(d.ts)) + '" cy="' + Y(d.valor) + '" r="4.5" fill="' + col +
           '" stroke="#fff" stroke-width="1.5"><title>' + fechaLarga(dia(d.ts)) + ' · INR ' + inr1(d.valor) + '</title></circle>';
    });
    if (!c.length) {
      s += '<text x="' + (L + pw / 2) + '" y="' + (T + ph / 2) + '" text-anchor="middle" font-size="12" fill="var(--ink-soft)">Todavía sin controles de INR</text>';
    }

    s += '<text x="' + L + '" y="' + (H - 4) + '" font-size="11" fill="var(--ink-soft)">' + fechaCorta(d0) + '</text>';
    s += '<text x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end" font-size="11" fill="var(--ink-soft)">' + fechaCorta(d1) + '</text>';
    s += '</svg>';
    $('chart').innerHTML = s;
  }

  /* ================= render ================= */
  function render() {
    datos.sort(function (a, b) { return a.ts < b.ts ? -1 : (a.ts > b.ts ? 1 : 0); });

    $('topEmpty').hidden = !!datos.length;
    $('topBody').hidden = !datos.length;

    if (datos.length) {
      var c = inrs();
      if (c.length) {
        var ui = c[c.length - 1], e = estado(ui.valor);
        $('topInr').textContent = inr1(ui.valor);
        $('topInr').style.color = e === 'ok' ? 'var(--in-range)' : (e === 'bajo' ? 'var(--low)' : 'var(--high)');
        $('topBadge').hidden = false;
        $('topBadge').textContent = 'INR ' + etiqueta(ui.valor);
        $('topBadge').className = 'badge ' + e;
        $('topMeta').textContent = 'Medido el ' + fechaLarga(dia(ui.ts)) + ' a las ' + hora(ui.ts);
      } else {
        $('topInr').textContent = '—';
        $('topInr').style.color = '';
        $('topBadge').hidden = true;
        $('topMeta').textContent = 'Todavía sin control de INR cargado.';
      }

      var sin = sintroms();
      $('dosisHoy').textContent = sin.length ? num(sin[sin.length - 1].valor) + ' mg' : '—';

      var desde = new Date(new Date(hoyISO() + 'T00:00').getTime() - 6 * 86400000).toISOString().slice(0, 10);
      var sem = sin.filter(function (d) { return dia(d.ts) >= desde; });
      $('semanaNum').textContent = sem.length
        ? num(sem.reduce(function (a, d) { return a + d.valor; }, 0)) + ' mg' : '—';

      var ttr = calcularTTR();
      $('ttrNum').textContent = ttr === null ? '—' : ttr + '%';
    }

    var p = puente();
    if (p) {
      $('puenteCard').hidden = false;
      var h = '<p>Heparina desde el <strong>' + fechaLarga(p.inicioHep) + '</strong>. Última dosis cargada: ' + fechaLarga(p.ultimaHep) + '.</p>';
      if (p.inicioSin) h += '<p>Sintrom desde el <strong>' + fechaLarga(p.inicioSin) + '</strong>.</p>';
      h += '<p>Días con ambos: <strong>' + p.solapa + '</strong> · Controles seguidos con INR ≥ 2: <strong>' + p.seguidos + '</strong></p>';
      h += '<p class="crit">El criterio habitual para suspender la heparina es al menos 5 días de solapamiento y el INR en rango en dos controles separados por unas 24 h. Lo decide tu equipo tratante, no este registro.</p>';
      $('puenteBody').innerHTML = h;
    } else { $('puenteCard').hidden = true; }

    dibujar();
    timeline();
    estadoRespaldo();
  }

  function timeline() {
    if (!datos.length) {
      $('timeline').innerHTML = '<div class="empty">Los eventos que cargues aparecen acá, agrupados por día.</div>';
      return;
    }
    var grupos = {}, orden = [];
    datos.slice().reverse().forEach(function (d) {
      var f = dia(d.ts);
      if (!grupos[f]) { grupos[f] = []; orden.push(f); }
      grupos[f].push(d);
    });

    var out = '';
    orden.forEach(function (f) {
      out += '<div class="dia"><div class="dia-h">' + fechaLarga(f) + '</div>';
      grupos[f].forEach(function (d) {
        var cuerpo;
        if (d.tipo === 'inr') {
          cuerpo = '<strong>INR ' + inr1(d.valor) + '</strong><span class="pill inr-' + estado(d.valor) + '">' + etiqueta(d.valor) + '</span>';
        } else if (d.tipo === 'med') {
          cuerpo = '<strong>' + esc(d.nombre) + '</strong>';
          if (d.valor != null) cuerpo += ' ' + num(d.valor) + (d.unidad && d.unidad !== '—' ? ' ' + d.unidad : '');
          if (interactua(d.nombre)) cuerpo += '<span class="pill int">puede alterar el INR</span>';
        } else if (d.tipo === 'signo') {
          if (d.valor2 != null) {
            cuerpo = esc(d.nombre) + ' <strong>' + num(d.valor) + ' / ' + num(d.valor2) + '</strong>';
          } else {
            cuerpo = esc(d.nombre) + ' <strong>' + (d.valor != null ? num(d.valor) : '') +
                     (d.unidad && d.unidad !== '—' ? ' ' + d.unidad : '') + '</strong>';
          }
        } else {
          cuerpo = '<span class="ev-n">' + esc(d.notas || 'Nota') + '</span>';
        }
        if (d.notas && d.tipo !== 'nota') cuerpo += '<div class="ev-n">' + esc(d.notas) + '</div>';

        out += '<div class="ev"><span class="ev-h">' + hora(d.ts) + '</span><span class="ev-b">' + cuerpo +
               '</span><button class="del" data-id="' + d.id + '" aria-label="Borrar">×</button></div>';
      });
      out += '</div>';
    });
    $('timeline').innerHTML = out;
  }

  function estadoRespaldo() {
    $('estadoGuardado').textContent = persistente
      ? 'Almacenamiento persistente activo: iOS no borra estos datos por falta de uso.'
      : 'Almacenamiento persistente no confirmado. Hacé copias con más frecuencia.';

    if (!copiaMeta) {
      $('estadoCopia').textContent = 'Todavía no hiciste ninguna copia.';
    } else {
      var d = dias(String(copiaMeta.fecha).slice(0, 10), hoyISO());
      $('estadoCopia').textContent = 'Última copia: ' +
        (d === 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días') +
        ' \u00b7 ' + copiaMeta.eventos + ' eventos.';
    }

    var diasSin = copiaMeta ? dias(String(copiaMeta.fecha).slice(0, 10), hoyISO()) : 999;
    var nuevos = copiaMeta ? datos.length - copiaMeta.eventos : datos.length;
    var mostrar = datos.length > 3 &&
                  (diasSin >= DIAS_AVISO || nuevos >= 15) &&
                  !sessionStorage.getItem('avisoOculto');

    $('backupAviso').hidden = !mostrar;
    if (mostrar) {
      $('backupTxt').textContent = !copiaMeta
        ? 'Nunca hiciste una copia. Guardala en iCloud Drive: es lo único que te asegura no perder nada si cambiás de teléfono.'
        : 'Hace ' + diasSin + ' días que no guardás copia, y hay ' + nuevos + ' eventos nuevos.';
    }
  }

  function guardarYRender() { persistir().then(render); }

  /* ================= formulario ================= */
  function pintarQuick() {
    var lista = FRECUENTES[tipoActual];
    if (!lista) { $('quickWrap').hidden = true; return; }
    $('quickWrap').hidden = false;
    $('quickLabel').textContent = tipoActual === 'med' ? 'Frecuentes' : 'Qué medís';
    $('quick').innerHTML = lista.map(function (o, i) {
      return '<button type="button" class="qbtn' + (esHeparina(o.n) ? ' hepq' : '') + '" data-i="' + i + '">' + o.n + '</button>';
    }).join('');
  }

  function aplicarTipo(t) {
    tipoActual = t;
    Array.prototype.forEach.call(document.querySelectorAll('.tipo'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.t === t ? 'true' : 'false');
    });

    var esInr = t === 'inr', esNota = t === 'nota';
    $('nombreRow').hidden = esNota;
    $('nombreField').hidden = esInr;
    $('unidadField').hidden = esInr;

    if (esInr) {
      $('valorLabel').textContent = 'Valor de INR';
      $('valor').placeholder = '2,4';
    } else {
      $('valorLabel').textContent = t === 'signo' ? 'Valor' : 'Cantidad';
      $('valor').placeholder = t === 'signo' ? '37,8' : '2';
      $('nombreLabel').textContent = t === 'signo' ? 'Qué medís' : 'Qué';
      $('nombre').placeholder = t === 'signo' ? 'Temperatura, presión…' : 'Sintrom, heparina, ibuprofeno…';
    }
    pintarQuick();
    chequearAlerta();
  }

  function soloDecimal(el) {
    if (!el) return;
    el.addEventListener('input', function () {
      var v = el.value.replace(/[^0-9.,]/g, '');
      var i = v.search(/[.,]/);
      if (i > -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/[.,]/g, '');
      if (v !== el.value) el.value = v;
    });
  }

  function modoPresion() {
    var on = tipoActual === 'signo' && esPresion($('nombre').value);
    $('presionRow').hidden = !on;
    $('valor').parentNode.hidden = on;
    $('unidadField').hidden = on || tipoActual === 'inr';
    return on;
  }

  function chequearAlerta() {
    modoPresion();
    var n = $('nombre').value.trim();
    var mostrar = tipoActual === 'med' && n && interactua(n);
    $('alerta').hidden = !mostrar;
    if (mostrar) $('alerta').textContent = 'Este fármaco puede alterar el INR con acenocumarol. Anotalo igual, y consultalo con tu médico.';
  }

  /* ================= exportar ================= */
  function bajar(nombre, texto, tipo) {
    var b = new Blob([texto], { type: tipo });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function textoResumen() {
    if (!datos.length) return 'Sin datos cargados.';
    var ttr = calcularTTR();
    var t = 'Registro de anticoagulación — acenocumarol, rango 2,0–3,0\n';
    t += 'Eventos: ' + datos.length;
    if (ttr !== null) t += ' · Tiempo en rango: ' + ttr + '%';
    t += '\n';
    var actual = '';
    datos.slice().reverse().forEach(function (d) {
      var f = dia(d.ts);
      if (f !== actual) { t += '\n' + fechaLarga(f) + '\n'; actual = f; }
      t += '  ' + hora(d.ts) + '  ';
      if (d.tipo === 'inr') t += 'INR ' + inr1(d.valor) + ' (' + etiqueta(d.valor) + ')';
      else if (d.tipo === 'nota') t += d.notas;
      else {
        t += d.nombre;
        if (d.valor2 != null) t += ' ' + num(d.valor) + ' / ' + num(d.valor2);
        else if (d.valor != null) t += ' ' + num(d.valor) + (d.unidad && d.unidad !== '—' ? ' ' + d.unidad : '');
      }
      if (d.notas && d.tipo !== 'nota') t += ' — ' + d.notas;
      t += '\n';
    });
    return t;
  }

  function guardarCopia() {
    if (!datos.length) { aviso('Todavía no hay nada para guardar.'); return; }
    bajar('registro-anticoagulacion-' + hoyISO() + '.json', JSON.stringify(datos, null, 2), 'application/json');
    var payload = { fecha: new Date().toISOString(), eventos: datos.length };
    copiaMeta = payload;
    espejo(CLAVE_COPIA, payload);
    idbSet(CLAVE_COPIA, payload).catch(function () {});
    sessionStorage.setItem('avisoOculto', '1');
    render();
    aviso('Elegí "Guardar en Archivos" → iCloud Drive');
  }

  /* ================= eventos de UI ================= */
  function conectar() {
    $('tipos').addEventListener('click', function (ev) {
      var b = ev.target.closest('.tipo');
      if (b) aplicarTipo(b.dataset.t);
    });

    $('quick').addEventListener('click', function (ev) {
      var b = ev.target.closest('.qbtn');
      if (!b) return;
      var o = FRECUENTES[tipoActual][b.dataset.i];
      $('nombre').value = o.n;
      if (o.v != null) $('valor').value = o.v;
      var sel = $('unidad');
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text === o.u) { sel.selectedIndex = i; break; }
      }
      Array.prototype.forEach.call(document.querySelectorAll('.qbtn'), function (x) { x.classList.remove('sel'); });
      b.classList.add('sel');
      chequearAlerta();
    });

    $('nombre').addEventListener('input', chequearAlerta);
    soloDecimal($('valor'));
    soloDecimal($('pAlta'));
    soloDecimal($('pBaja'));

    $('guardar').addEventListener('click', function () {
      var f = $('fecha').value, h = $('hora').value || '00:00';
      if (!f) { aviso('Falta la fecha.'); return; }

      var vRaw = $('valor').value.trim().replace(/,/g, '.');
      var val = vRaw === '' ? null : parseFloat(vRaw);
      var val2 = null;
      var nom = $('nombre').value.trim();
      var nts = $('notas').value.trim();

      if (tipoActual === 'inr') {
        if (val == null || isNaN(val) || val <= 0) { aviso('Poné un valor de INR válido.'); return; }
        if (val > 10) {
          if (!confirm('¿Seguro que el INR es ' + inr1(val) + '?\n\nSi quisiste poner ' + inr1(val / 10) + ', cancelá y corregí el valor.')) return;
        }
        nom = 'INR';
      } else if (tipoActual === 'nota') {
        if (!nts) { aviso('Escribí la observación.'); return; }
        nom = 'Nota'; val = null;
      } else if (tipoActual === 'signo' && esPresion(nom)) {
        var alta = parseFloat($('pAlta').value.trim().replace(/,/g, '.'));
        var baja = parseFloat($('pBaja').value.trim().replace(/,/g, '.'));
        if (isNaN(alta) || isNaN(baja) || alta <= 0 || baja <= 0) { aviso('Poné los dos valores: alta y baja.'); return; }
        if (alta <= baja) { aviso('La alta tiene que ser mayor que la baja. Revisá el orden.'); return; }
        val = alta; val2 = baja;
      } else {
        if (!nom) { aviso('Falta indicar qué querés registrar.'); return; }
        if (val != null && isNaN(val)) { aviso('El valor no es un número válido.'); return; }
      }

      datos.push({
        id: 'e' + Date.now() + Math.floor(Math.random() * 1000),
        ts: f + 'T' + h,
        tipo: tipoActual,
        nombre: nom,
        valor: val,
        valor2: val2,
        unidad: val2 != null ? '—' : $('unidad').value,
        notas: nts
      });

      guardarYRender();

      $('valor').value = ''; $('nombre').value = ''; $('notas').value = '';
      $('pAlta').value = ''; $('pBaja').value = '';
      $('hora').value = ahoraHora();
      Array.prototype.forEach.call(document.querySelectorAll('.qbtn'), function (x) { x.classList.remove('sel'); });
      chequearAlerta();

      if (tipoActual === 'inr' && estado(val) !== 'ok') aviso('Guardado · INR ' + etiqueta(val));
      else if (tipoActual === 'med' && interactua(nom)) aviso('Guardado · este fármaco puede mover el INR');
      else aviso('Evento guardado');
    });

    $('timeline').addEventListener('click', function (ev) {
      var b = ev.target.closest('.del');
      if (!b) return;
      if (!confirm('¿Borrar este evento?')) return;
      datos = datos.filter(function (d) { return d.id !== b.dataset.id; });
      guardarYRender();
      aviso('Evento borrado');
    });

    $('json').addEventListener('click', guardarCopia);
    $('avisoCopia').addEventListener('click', guardarCopia);
    $('avisoLuego').addEventListener('click', function () {
      sessionStorage.setItem('avisoOculto', '1');
      $('backupAviso').hidden = true;
    });

    $('copiar').addEventListener('click', function () {
      var t = textoResumen();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(
          function () { aviso('Copiado. Pegalo en una nota de iCloud.'); },
          function () { prompt('Copiá el texto:', t); }
        );
      } else { prompt('Copiá el texto:', t); }
    });

    $('csv').addEventListener('click', function () {
      if (!datos.length) { aviso('Todavía no hay nada para exportar.'); return; }
      var c = 'fecha,hora,tipo,nombre,valor,valor2,unidad,observaciones\n';
      datos.forEach(function (d) {
        c += [dia(d.ts), hora(d.ts), d.tipo, '"' + d.nombre + '"',
              d.valor == null ? '' : d.valor, d.valor2 == null ? '' : d.valor2, d.unidad || '',
              '"' + (d.notas || '').replace(/"/g, '""') + '"'].join(',') + '\n';
      });
      bajar('registro-anticoagulacion.csv', c, 'text/csv');
      aviso('CSV descargado');
    });

    $('importar').addEventListener('click', function () { $('fileInput').click(); });

    $('pegar').addEventListener('click', function () {
      var t = prompt('Pegá acá el contenido del archivo de respaldo:');
      if (t == null || !t.trim()) return;
      restaurarTexto(t);
    });

    function restaurarTexto(texto) {
        try {
          var arr = JSON.parse(texto);
          if (!Array.isArray(arr)) throw new Error('formato');

          if (datos.length) {
            var reemplazar = confirm('Aceptar: reemplazar TODO lo que tenés por el archivo (' + arr.length + ' eventos).\n\nCancelar: sumar solo los eventos que falten.');
            if (reemplazar) {
              datos = arr.filter(function (d) { return d && d.ts; });
              guardarYRender();
              aviso(datos.length + ' eventos restaurados (reemplazo)');
              return;
            }
          }

          var vistos = {};
          datos.forEach(function (d) { vistos[d.ts + '|' + d.nombre + '|' + d.valor] = true; });
          var nuevos = arr.filter(function (d) {
            return d.ts && !vistos[d.ts + '|' + d.nombre + '|' + d.valor];
          });
          datos = datos.concat(nuevos);
          guardarYRender();
          aviso(nuevos.length + ' eventos restaurados');
        } catch (e) { aviso('El contenido no tiene el formato esperado.'); }
    }

    $('fileInput').addEventListener('change', function (ev) {
      var file = ev.target.files[0];
      if (!file) { aviso('No se pudo leer el archivo. Probá con "Pegar copia".'); return; }
      var r = new FileReader();
      r.onerror = function () { aviso('iOS no pudo abrir el archivo (¿está solo en iCloud?). Probá con "Pegar copia".'); };
      r.onload = function () {
        restaurarTexto(String(r.result || ''));
        ev.target.value = '';
      };
      try { r.readAsText(file); }
      catch (e) { aviso('No se pudo leer el archivo. Probá con "Pegar copia".'); }
    });
  }

  /* ================= arranque ================= */
  function iniciar() {
    $('fecha').value = hoyISO();
    $('hora').value = ahoraHora();
    aplicarTipo('med');
    conectar();

    pedirPersistencia().then(function (ok) { persistente = !!ok; estadoRespaldo(); });

    idbGet(CLAVE_COPIA)
      .catch(function () { return null; })
      .then(function (m) {
        copiaMeta = m || leerEspejo(CLAVE_COPIA);
        return cargar();
      })
      .then(function (d) {
        if (Array.isArray(d) && d.length) { datos = d; render(); }
        else { datos = SEMILLA.slice(); guardarYRender(); }
      });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
