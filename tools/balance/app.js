/* ImpoBot · Balance de Presentación RT 54 — interfaz */
(function () {
  'use strict';
  const E = window.BalEngine, R = window.BalRender;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => (typeof n === 'number' ? n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  const st = { libros: {}, ss: null, ssc: null, md: null, anexos: {}, cuentas: [], mapeo: {}, conf: {}, bal: null, archivos: {} };

  // ───────── Lectura de archivos ─────────
  async function leerLibro(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const cab = new TextDecoder('latin1').decode(u8.slice(0, 4096));
    let wb;
    // Exportaciones "xls" que en realidad son HTML/CSV (SOS y otros): se leen como texto, respetando la codificación
    // y sin conversión automática de números (formato argentino 1.234,56 lo interpreta el motor).
    if (/^\s*(<|﻿?\s*<)/.test(cab) || /\.csv$/i.test(file.name)) {
      const cs = (/charset=["']?([\w-]+)/i.exec(cab) || [])[1] || '';
      let txt;
      if (/8859|1252|latin/i.test(cs)) txt = new TextDecoder('windows-1252').decode(u8);
      else { try { txt = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { txt = new TextDecoder('windows-1252').decode(u8); } }
      wb = XLSX.read(txt, { type: 'string', raw: true });
    } else {
      wb = XLSX.read(buf, { type: 'array', cellDates: true });
    }
    const o = {};
    for (const n of wb.SheetNames) o[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
    return o;
  }
  const primeraHojaConDatos = libro => { for (const k of Object.keys(libro)) if (libro[k].some(f => f && f.some(v => v != null && v !== ''))) return libro[k]; return []; };

  function estado(f, ok, txt) { const c = $(`.fcard[data-f="${f}"]`); c.classList.toggle('ok', ok === true); c.classList.toggle('err', ok === false); const s = c.querySelector('.st'); s.className = 'st ' + (ok === true ? 'ok' : ok === false ? 'err' : ''); s.textContent = txt || ''; }

  async function cargar(f, file) {
    st.archivos[f] = file.name;
    try {
      const libro = await leerLibro(file);
      st.libros[f] = libro;
      if (f === 'ss' || f === 'ssc') {
        const r = E.leerSumasYSaldos(primeraHojaConDatos(libro), f === 'ss' ? 'Ejercicio' : 'Comparativo');
        if (!r.ok || !r.cuentas.length) { st[f] = null; estado(f, false, r.avisos[0] || 'No se encontraron cuentas.'); }
        else { st[f] = r; estado(f, true, `✓ ${r.cuentas.length} cuentas` + (r.avisos.length ? ` · ${r.avisos.map(a => a.replace(/^(Ejercicio|Comparativo): /, '')).join(' · ')}` : '')); }
      } else if (f === 'md') {
        st.md = E.leerMetadata(libro);
        const k = Object.keys(st.md.general).find(x => /ndice de actualizaci/i.test(x));
        if (k) { const v = E.num(st.md.general[k]); if (v) $('#coef').value = String(v).replace('.', ','); }
        estado(f, true, `✓ ${st.md.general['Razón Social'] || 'metadata leída'}`);
      } else if (f === 'bu') { st.anexos.bu = E.leerAnexoBU(libro); estado(f, !!st.anexos.bu, st.anexos.bu ? `✓ ${st.anexos.bu.length} categorías` : 'No se encontró la fila técnica (categoria, valor_bruto_inicio…)'); }
      else if (f === 'cmv') { st.anexos.cmv = E.leerAnexoCMV(libro); estado(f, !!st.anexos.cmv, st.anexos.cmv ? '✓ leído' : 'Sin importes cargados'); }
      else if (f === 'gas') { st.anexos.gastos = E.leerAnexoGastos(libro); estado(f, !!st.anexos.gastos, st.anexos.gastos ? `✓ ${st.anexos.gastos.length} conceptos` : 'Sin importes cargados'); }
      else if (f === 'bio') { st.anexos.bio = E.leerBiologicos(libro); estado(f, !!(st.anexos.bio.bio || st.anexos.bio.costos), st.anexos.bio.bio ? `✓ ${st.anexos.bio.bio.length} categorías` : 'Sin datos'); }
    } catch (e) { estado(f, false, 'No se pudo leer: ' + (e.message || e)); }
    recalcularCuentas();
  }
  $$('.fcard').forEach(c => {
    const f = c.dataset.f, inp = c.querySelector('input[type=file]');
    inp.onchange = () => { if (inp.files[0]) cargar(f, inp.files[0]); };
    c.ondragover = e => { e.preventDefault(); c.classList.add('over'); };
    c.ondragleave = () => c.classList.remove('over');
    c.ondrop = e => { e.preventDefault(); c.classList.remove('over'); if (e.dataTransfer.files[0]) cargar(f, e.dataTransfer.files[0]); };
  });

  const modelo = () => $('input[name=modelo]:checked').value;
  const coef = () => { const v = E.num($('#coef').value); return v && v > 0 ? v : 1; };
  $$('input[name=modelo]').forEach(r => r.onchange = () => { $('.fcard[data-f="bio"]').classList.toggle('hidden', modelo() !== 'agro'); renderMapa(); recalcular(); });
  $('#coef').onchange = () => recalcularCuentas();
  $('#eqEfvo').onchange = () => recalcular();

  // ───────── Mapeo ─────────
  const claveMapeo = () => { const c = String((st.md && st.md.general['CUIT']) || '').replace(/\D/g, ''); return 'ib-bal-map:' + (c || 'general'); };
  function guardadoMapeo() { try { return JSON.parse(localStorage.getItem(claveMapeo()) || '{}'); } catch (e) { return {}; } }
  function guardarMapeo() { try { localStorage.setItem(claveMapeo(), JSON.stringify(st.mapeo)); } catch (e) { } }

  function recalcularCuentas() {
    if (!st.ss) { $('#paso2').classList.add('hidden'); $('#paso3').classList.add('hidden'); return; }
    st.cuentas = E.unirCuentas(st.ss.cuentas, st.ssc ? st.ssc.cuentas : [], coef());
    const prev = Object.assign({}, guardadoMapeo(), st.mapeo);
    for (const c of st.cuentas) {
      const k = E.claveCta(c);
      if (prev[k] && E.RUB[prev[k]]) { st.mapeo[k] = prev[k]; if (!st.conf[k]) st.conf[k] = 'guardado'; continue; }
      const s = E.sugerirRubro({ codigo: c.codigo, nombre: c.nombre, saldo: c.act || c.comp }, modelo());
      st.mapeo[k] = s.rubro; st.conf[k] = s.confianza;
    }
    $('#paso2').classList.remove('hidden'); $('#paso3').classList.remove('hidden');
    renderMapa(); recalcular();
  }

  function opcionesRubro(sel) {
    const grupos = [['AC', 'Activo corriente'], ['ANC', 'Activo no corriente'], ['PC', 'Pasivo corriente'], ['PNC', 'Pasivo no corriente'], ['PN', 'Patrimonio neto'], ['ER', 'Resultados'], ['X', 'Otros']];
    const rs = E.rubrosPara(modelo());
    return grupos.map(([g, l]) => `<optgroup label="${l}">${rs.filter(r => r.grupo === g).map(r => `<option value="${r.id}"${r.id === sel ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</optgroup>`).join('');
  }
  function renderMapa() {
    if (!st.cuentas.length) return;
    const solo = $('#soloRev').checked, hayC = st.cuentas.some(c => c.compOrig);
    let h = `<thead><tr><th>Código</th><th>Cuenta</th><th class="num">Saldo actual</th>${hayC ? '<th class="num">Saldo comparativo reexpr.</th>' : ''}<th>Rubro RT 54</th><th>Confianza</th></tr></thead><tbody>`;
    let nBaja = 0;
    st.cuentas.forEach((c, i) => {
      const k = E.claveCta(c), conf = st.conf[k] || 'baja';
      if (conf === 'baja') nBaja++;
      if (solo && conf !== 'baja') return;
      h += `<tr class="${conf === 'baja' ? 'low' : ''}"><td>${esc(c.codigo)}</td><td>${esc(c.nombre)}</td><td class="num">${fmt(c.act)}</td>${hayC ? `<td class="num">${fmt(c.comp)}</td>` : ''}
        <td><select data-i="${i}">${opcionesRubro(st.mapeo[k])}</select></td>
        <td><span class="pill ${conf === 'baja' ? 'b' : 'a'}">${conf}</span></td></tr>`;
    });
    $('#mapTbl').innerHTML = h + '</tbody>';
    $('#mapRes').textContent = `${st.cuentas.length} cuentas · ${nBaja} a revisar`;
  }
  $('#mapTbl').addEventListener('change', e => {
    const i = e.target.dataset.i; if (i == null) return;
    const k = E.claveCta(st.cuentas[+i]); st.mapeo[k] = e.target.value; st.conf[k] = 'manual';
    guardarMapeo(); renderMapa(); recalcular();
  });
  $('#soloRev').onchange = renderMapa;
  $('#mapReset').onclick = () => { st.mapeo = {}; st.conf = {}; try { localStorage.removeItem(claveMapeo()); } catch (e) { } for (const c of st.cuentas) { const s = E.sugerirRubro({ codigo: c.codigo, nombre: c.nombre, saldo: c.act || c.comp }, modelo()); st.mapeo[E.claveCta(c)] = s.rubro; st.conf[E.claveCta(c)] = s.confianza; } renderMapa(); recalcular(); };
  $('#mapExp').onclick = () => bajar(new Blob([JSON.stringify({ tipo: 'impobot-mapeo-rt54', mapeo: st.mapeo }, null, 1)], { type: 'application/json' }), 'mapeo_rt54.json');
  $('#mapImp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); Object.assign(st.mapeo, j.mapeo || j); for (const k of Object.keys(j.mapeo || j)) st.conf[k] = 'guardado'; guardarMapeo(); renderMapa(); recalcular(); } catch (x) { alert('Archivo de mapeo inválido.'); }
  };

  // ───────── Controles ─────────
  function recalcular() {
    if (!st.cuentas.length) return;
    st.bal = E.construir({ cuentas: st.cuentas, mapeo: st.mapeo, modelo: modelo(), coef: coef(), metadata: st.md, anexos: st.anexos, opciones: { inversionesSonEfectivo: $('#eqEfvo').checked } });
    const b = st.bal, T = b.ESP.tot.act, rep = b.reporte;
    const card = (k, v, ok) => `<div class="card ${ok === true ? 'ok' : ok === false ? 'bad' : ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const cuadra = Math.abs(T.A - T.PyPN) < 1;
    $('#cards').innerHTML = card('Activo', fmt(T.A)) + card('Pasivo', fmt(T.P)) + card('Patrimonio neto', fmt(T.PN), T.PN >= 0 ? null : false) + card('Resultado del ejercicio', fmt(b.ER.resNeto.act)) + card('Activo − (Pasivo + PN)', fmt(T.A - T.PyPN), cuadra);
    $('#chk').innerHTML = rep.controles.map(c => `<li><span class="i">${c.ok ? '✅' : '❌'}</span>${esc(c.control)}<span class="dif">${c.ok ? '' : 'Δ ' + fmt(c.diferencia)}</span></li>`).join('');
    const lista = (t, arr, cls) => arr.length ? `<h4 class="${cls}">${t} (${arr.length})</h4><ul>${arr.map(x => `<li class="${cls}">${esc(x)}</li>`).join('')}</ul>` : '';
    $('#msgs').innerHTML = lista('Errores', rep.errores, 'e') + lista('Advertencias', rep.advertencias, 'w') + lista('Datos faltantes', rep.faltantes, '') + lista('Información', rep.info, '');
    $('#genSt').textContent = rep.errores.length ? 'Hay errores: podés generar igual, pero el balance saldrá con esas inconsistencias.' : '';
  }

  // ───────── Generación ─────────
  function bajar(blob, nombre) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  $('#gen').onclick = async () => {
    if (!st.bal) return;
    const btn = $('#gen'); btn.disabled = true; $('#genSt').textContent = 'Generando Excel y PDF…';
    try {
      const filas = st.cuentas.map(c => ({ codigo: c.codigo, nombre: c.nombre, act: c.act, comp: c.comp, rubro: (E.RUB[st.mapeo[E.claveCta(c)]] || {}).label || '(sin mapear)' }));
      const out = await R.zip(st.bal, filas, { ExcelJS: window.ExcelJS, jsPDF: window.jspdf.jsPDF, JSZip: window.JSZip, Engine: E }, { archivos: st.archivos, coeficiente: coef() });
      const nom = (st.bal.datos.razonSocial || 'Balance').replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '_');
      bajar(out.zip, `RT54_${nom}_${(st.bal.datos.cierre || '').replace(/\//g, '-')}.zip`);
      $('#genSt').textContent = '✓ ZIP generado.';
    } catch (e) { console.error(e); $('#genSt').textContent = '✗ Error al generar: ' + (e.message || e); }
    btn.disabled = false;
  };
})();
