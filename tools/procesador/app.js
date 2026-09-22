/* ImpoBot · Procesador de documentos — interfaz */
(function () {
  'use strict';
  const C = window.IBCore;
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => (typeof n === 'number' && isFinite(n) ? n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  const num = v => { const n = C.parseAR(v); return isNaN(n) ? 0 : C.r2(n); };
  // Fecha como número de serie de Excel (evita corrimientos por zona horaria)
  const xd = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  const today = () => new Date().toISOString().slice(0, 10);

  // ───────────── Configuración ─────────────
  const DEF = {
    cuit: '', banco: '', sep: ';', dec: ',', fecha: 'DD/MM/AAAA', head: '1', reglasTar: '', reglasBan: '',
    sosFac: ['fecha:Fecha', 'tipo:Tipo Comprobante', 'pv:Punto de Venta', 'nro:Número', 'cuit:CUIT', 'razon:Razón Social',
      'neto21:Neto 21%', 'iva21:IVA 21%', 'neto105:Neto 10,5%', 'iva105:IVA 10,5%', 'neto27:Neto 27%', 'iva27:IVA 27%',
      'noGravado:No Gravado', 'exento:Exento', 'percIVA:Percepción IVA', 'percIIBB:Percepción IIBB', 'percNac:Percepción Nacional',
      'percMuni:Percepción Municipal', 'impInternos:Impuestos Internos', 'otrosTrib:Otros Tributos', 'total:Total', 'cae:CAE'].join('\n'),
    sosAsi: ['asiento:Asiento', 'fecha:Fecha', 'cuenta:Cuenta', 'debe:Debe', 'haber:Haber', 'leyenda:Leyenda'].join('\n')
  };
  let cfg = Object.assign({}, DEF);
  try { Object.assign(cfg, JSON.parse(localStorage.getItem('ib-procesador-cfg') || '{}')); } catch (e) { }
  const CFG_FIELDS = { cfgCuit: 'cuit', cfgBanco: 'banco', cfgSep: 'sep', cfgDec: 'dec', cfgFecha: 'fecha', cfgHead: 'head',
    cfgSosFac: 'sosFac', cfgSosAsi: 'sosAsi', cfgReglasTar: 'reglasTar', cfgReglasBan: 'reglasBan' };
  function loadCfgUI() { for (const [id, k] of Object.entries(CFG_FIELDS)) { const el = $('#' + id); el.value = k === 'sep' && cfg[k] === '\t' ? '\\t' : cfg[k]; } }
  function saveCfg() {
    for (const [id, k] of Object.entries(CFG_FIELDS)) { let v = $('#' + id).value; if (k === 'sep' && v === '\\t') v = '\t'; cfg[k] = v; }
    try { localStorage.setItem('ib-procesador-cfg', JSON.stringify(cfg)); } catch (e) { }
  }
  loadCfgUI();
  document.querySelectorAll('#tab-cfg input,#tab-cfg select,#tab-cfg textarea').forEach(el => el.addEventListener('change', () => { saveCfg(); renderFac(); }));
  $('#cfgReset').onclick = () => { cfg = Object.assign({}, DEF); loadCfgUI(); saveCfg(); };
  const csvOpts = () => ({ sep: cfg.sep, decimal: cfg.dec, fecha: cfg.fecha, header: cfg.head === '1' });

  // Tema
  if ($('#themeBtn')) $('#themeBtn').onclick = () => {
    const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('ib-theme', r.dataset.theme); } catch (e) { }
  };
  try { const t = localStorage.getItem('ib-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { }

  // Pestañas
  document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('nav.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    document.querySelectorAll('main > section').forEach(s => s.hidden = s.id !== 'tab-' + b.dataset.tab);
  });

  // ───────────── Lectura de PDF ─────────────
  async function readPdf(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str != null).map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
      const rows = C.buildLines(items);
      pages.push({ page, rows, text: rows.map(r => r.text).join('\n') });
    }
    const hasText = pages.some(p => p.text.replace(/\s/g, '').length > 30);
    return { doc, pages, hasText, rows: pages.flatMap(p => p.rows), text: pages.map(p => p.text).join('\n') };
  }
  async function scanQR(page) {
    if (!window.jsQR) return null;
    for (const scale of [2.5, 4]) {
      const vp = page.getViewport({ scale });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const img = ctx.getImageData(0, 0, cv.width, cv.height);
      const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (r && /afip\.gob\.ar|arca\.gob\.ar/i.test(r.data)) return C.decodeAfipQR(r.data);
      // segundo intento: mitad inferior (donde suele estar el QR)
      const h2 = Math.floor(cv.height / 2), img2 = ctx.getImageData(0, h2, cv.width, cv.height - h2);
      const r2 = jsQR(img2.data, img2.width, img2.height, { inversionAttempts: 'attemptBoth' });
      if (r2 && /afip\.gob\.ar|arca\.gob\.ar/i.test(r2.data)) return C.decodeAfipQR(r2.data);
    }
    return null;
  }

  // ───────────── Carga de archivos ─────────────
  let currentKind = 'fac';
  const fileIn = $('#fileIn');
  document.querySelectorAll('.drop').forEach(d => {
    d.onclick = () => { currentKind = d.dataset.kind; fileIn.value = ''; fileIn.click(); };
    d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); handle(d.dataset.kind, [...e.dataTransfer.files]); };
  });
  fileIn.onchange = () => handle(currentKind, [...fileIn.files]);

  async function handle(kind, files) {
    files = files.filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!files.length) return;
    if (!window.pdfjsLib) { alertLog(kind, 'No se pudo cargar el lector de PDF (revisá la conexión).'); return; }
    const status = $('#' + kind + 'Status'); let i = 0;
    for (const f of files) {
      status.textContent = `Procesando ${++i}/${files.length}: ${f.name}…`;
      try {
        if (kind === 'fac') await procFactura(f);
        else if (kind === 'tar') await procTarjeta(f);
        else await procBanco(f);
      } catch (e) { alertLog(kind, `✗ ${f.name}: ${e.message || e}`); }
    }
    status.textContent = `${files.length} archivo(s) procesado(s)`;
    ({ fac: renderFac, tar: renderTar, ban: renderBan })[kind]();
  }
  function alertLog(kind, msg) { const l = $('#' + kind + 'Log'); l.textContent = (l.textContent ? l.textContent + '\n' : '') + msg; }

  // ═════════════ FACTURAS ═════════════
  let facturas = [];
  async function procFactura(file) {
    const pdf = await readPdf(file);
    // Muchas facturas repiten ORIGINAL/DUPLICADO/TRIPLICADO: se usa la primera página con total
    const pg = pdf.pages.find(p => /Importe\s+Total|\bTOTAL\b/i.test(p.text)) || pdf.pages[0];
    let f = pdf.hasText ? C.parseInvoiceText(pg.text, { cuitPropio: cfg.cuit }) : C.nuevaFactura();
    let q = null;
    try { q = await scanQR(pg.page); } catch (e) { }
    if (q) C.applyQR(f, q);
    f.archivo = file.name;
    if (!pdf.hasText && !q) { f.flags = ['PDF escaneado sin QR legible: cargar a mano']; alertLog('fac', `⚠ ${file.name}: sin texto ni QR legible.`); }
    facturas.push(f);
  }
  const FAC_COLS = [ // clave, título, tipo, clase, siempre visible
    ['archivo', 'Archivo', 'txt', 'w-m', 1], ['fecha', 'Fecha', 'date', '', 1], ['tipo', 'Tipo', 'int', 'w-s', 1], ['pv', 'PV', 'int', 'w-s', 1], ['nro', 'Número', 'int', 'w-m', 1],
    ['cuit', 'CUIT emisor', 'txt', 'w-m', 1], ['razon', 'Razón social', 'txt', 'w-l', 1],
    ['neto21', 'Neto 21%', 'n', '', 1], ['iva21', 'IVA 21%', 'n', '', 1], ['neto105', 'Neto 10,5%', 'n', '', 1], ['iva105', 'IVA 10,5%', 'n', '', 1],
    ['neto27', 'Neto 27%', 'n', '', 0], ['iva27', 'IVA 27%', 'n', '', 0], ['neto5', 'Neto 5%', 'n', '', 0], ['iva5', 'IVA 5%', 'n', '', 0],
    ['neto25', 'Neto 2,5%', 'n', '', 0], ['iva25', 'IVA 2,5%', 'n', '', 0], ['neto0', 'Neto 0%', 'n', '', 0],
    ['noGravado', 'No gravado', 'n', '', 1], ['exento', 'Exento', 'n', '', 1], ['percIVA', 'Perc. IVA', 'n', '', 1], ['percIIBB', 'Perc. IIBB', 'n', '', 1],
    ['percNac', 'Perc. nac.', 'n', '', 0], ['percMuni', 'Perc. mun.', 'n', '', 0], ['impInternos', 'Imp. internos', 'n', '', 0], ['otrosTrib', 'Otros trib.', 'n', '', 1],
    ['total', 'Total', 'n', '', 1]];
  function visibleFacCols() { return FAC_COLS.filter(c => c[4] || facturas.some(f => f[c[0]])); }
  function cell(val, key, type, cls, i) {
    if (type === 'n') return `<td class="num"><input data-i="${i}" data-k="${key}" data-t="n" value="${val ? fmt(val) : ''}"></td>`;
    if (type === 'date') return `<td><input type="date" data-i="${i}" data-k="${key}" data-t="d" value="${esc(val)}"></td>`;
    return `<td><input class="${cls}" data-i="${i}" data-k="${key}" data-t="${type}" value="${esc(val || '')}"></td>`;
  }
  function flagCell(fl) { return fl && fl.length ? `<span class="fl">${fl.map(esc).join(' · ')}</span>` : '<span class="okt">✓ OK</span>'; }
  function renderFac() {
    C.validarFacturas(facturas);
    const cols = visibleFacCols();
    $('#nFac').textContent = facturas.length;
    ['#facXlsx', '#facLid', '#facSos'].forEach(s => $(s).disabled = !facturas.length);
    let h = '<thead><tr><th></th>' + cols.map(c => `<th class="${c[2] === 'n' ? 'num' : ''}">${c[1]}</th>`).join('') + '<th>Control</th></tr></thead><tbody>';
    facturas.forEach((f, i) => {
      h += `<tr class="${f.flags.length ? 'flag' : 'okr'}" data-r="${i}"><td><button class="x" data-del="${i}" title="Quitar">×</button></td>` +
        cols.map(c => cell(f[c[0]], c[0], c[2], c[3], i)).join('') + `<td class="ctl">${flagCell(f.flags)}</td></tr>`;
    });
    $('#facTable').innerHTML = h + '</tbody>';
    renderFacCards();
  }
  function renderFacCards() {
    const n = facturas.length, ok = facturas.filter(f => !f.flags.length).length;
    const iva = facturas.reduce((s, f) => s + (f.letra === 'A' || f.letra === 'M' ? C.FACTURA_GETTERS.ivaTotal(f) : 0) * sgn(f), 0);
    const tot = facturas.reduce((s, f) => s + f.total * sgn(f), 0);
    const perc = facturas.reduce((s, f) => s + (f.percIVA + f.percIIBB) * sgn(f), 0);
    $('#facCards').innerHTML = n ? [
      ['Comprobantes', n], ['Sin observaciones', `${ok} / ${n}`, ok === n ? 'ok' : 'bad'], ['Crédito fiscal IVA', '$ ' + fmt(C.r2(iva))],
      ['Percepciones IVA + IIBB', '$ ' + fmt(C.r2(perc))], ['Total comprobantes', '$ ' + fmt(C.r2(tot))]
    ].map(([k, v, c]) => `<div class="card ${c || ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('') : '';
  }
  const sgn = f => ([3, 8, 13, 53, 203, 208, 213].includes(+f.tipo) ? -1 : 1); // notas de crédito restan
  $('#facTable').addEventListener('change', e => {
    const el = e.target; if (!el.dataset.k) return;
    const f = facturas[+el.dataset.i], k = el.dataset.k, t = el.dataset.t;
    f[k] = t === 'n' ? num(el.value) : t === 'int' ? parseInt(el.value.replace(/\D/g, '')) || 0 : el.value.trim();
    if (k === 'tipo') f.letra = C.COD_LETRA[f.tipo] || '';
    if (k === 'cuit') f.cuit = f.cuit.replace(/\D/g, '');
    if (t === 'n') el.value = f[k] ? fmt(f[k]) : '';
    C.validarFacturas(facturas);
    document.querySelectorAll('#facTable tr[data-r]').forEach(tr => {
      const ff = facturas[+tr.dataset.r]; tr.className = ff.flags.length ? 'flag' : 'okr'; tr.querySelector('.ctl').innerHTML = flagCell(ff.flags);
    });
    renderFacCards();
  });
  $('#facTable').addEventListener('click', e => { const d = e.target.dataset.del; if (d != null) { facturas.splice(+d, 1); renderFac(); } });
  $('#facAdd').onclick = () => { const f = C.nuevaFactura(); f.archivo = '(manual)'; f.origen = 'manual'; facturas.push(f); renderFac(); };
  $('#facClear').onclick = () => { facturas = []; $('#facLog').textContent = ''; $('#facStatus').textContent = ''; renderFac(); };

  const facRow = f => {
    const o = { Archivo: f.archivo, Fecha: f.fecha ? xd(f.fecha) : '', 'Cód.': f.tipo, Comprobante: C.COD_NOMBRE[f.tipo] || '', PV: f.pv, 'Número': f.nro,
      CUIT: C.fmtCuit(f.cuit), 'Razón social': f.razon };
    for (const c of FAC_COLS) if (c[2] === 'n') o[c[1]] = f[c[0]] || 0;
    o['Neto total'] = C.FACTURA_GETTERS.netoTotal(f); o['IVA total'] = C.FACTURA_GETTERS.ivaTotal(f);
    o.Moneda = f.moneda; o['T. cambio'] = f.tc; o.CAE = f.cae; o.Origen = f.origen; o.Observaciones = f.flags.join(' | ');
    return o;
  };
  $('#facXlsx').onclick = () => {
    const wb = XLSX.utils.book_new();
    const rows = facturas.map(facRow);
    const ws = XLSX.utils.json_to_sheet(rows); ws._dates = ['Fecha'];
    addTotals(ws, rows, 'Archivo');
    styleSheet(ws, rows, ['Fecha']);
    XLSX.utils.book_append_sheet(wb, ws, 'Comprobantes');
    const ali = [];
    for (const f of facturas) for (const [k, t, cod] of C.ALICUOTAS) if (f['neto' + k] || f['iva' + k])
      ali.push({ Comprobante: `${C.COD_NOMBRE[f.tipo] || f.tipo} ${String(f.pv).padStart(5, '0')}-${String(f.nro).padStart(8, '0')}`, CUIT: C.fmtCuit(f.cuit), 'Razón social': f.razon,
        'Alícuota': (t * 100).toLocaleString('es-AR') + '%', 'Cód. ARCA': cod, Neto: f['neto' + k] || 0, IVA: f['iva' + k] || 0 });
    if (ali.length) { const w2 = XLSX.utils.json_to_sheet(ali); addTotals(w2, ali, 'Comprobante'); styleSheet(w2, ali); XLSX.utils.book_append_sheet(wb, w2, 'Alícuotas'); }
    const obs = facturas.filter(f => f.flags.length).map(f => ({ Archivo: f.archivo, Comprobante: `${f.pv}-${f.nro}`, CUIT: C.fmtCuit(f.cuit), Observaciones: f.flags.join(' | ') }));
    if (obs.length) { const w3 = XLSX.utils.json_to_sheet(obs); styleSheet(w3, obs); XLSX.utils.book_append_sheet(wb, w3, 'Observaciones'); }
    XLSX.writeFile(wb, `Comprobantes_${today()}.xlsx`);
  };
  $('#facLid').onclick = () => {
    const pend = facturas.filter(f => f.flags.some(x => !/Solo QR/.test(x)));
    if (pend.length && !confirm(`${pend.length} comprobante(s) tienen observaciones. ¿Generar igual los TXT?`)) return;
    const out = C.exportLID(facturas);
    download(`LIBRO_IVA_DIGITAL_COMPRAS_CBTE_${today()}.txt`, out.cbte, 'text/plain');
    setTimeout(() => download(`LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS_${today()}.txt`, out.alicuotas, 'text/plain'), 400);
  };
  $('#facSos').onclick = () => {
    const cols = C.parseColumnTemplate(cfg.sosFac, C.FACTURA_GETTERS);
    download(`SOS_comprobantes_${today()}.csv`, C.toDelimited(facturas, cols, csvOpts()), 'text/csv');
  };

  // ═════════════ TARJETAS ═════════════
  let resumenes = [];
  async function procTarjeta(file) {
    const pdf = await readPdf(file);
    if (!pdf.hasText) { alertLog('tar', `⚠ ${file.name}: PDF sin texto (escaneado). No se puede leer sin OCR.`); return; }
    const st = C.parseCardStatement(pdf.rows, { reglasUsuario: C.parseUserRules(cfg.reglasTar) });
    st.archivo = file.name;
    if (!st.movimientos.length) alertLog('tar', `⚠ ${file.name}: no se encontraron movimientos con fecha al inicio de línea.`);
    resumenes.push(st);
  }
  function rubrosDisponibles() {
    return [...new Set([...C.parseUserRules(cfg.reglasTar).map(r => r[0]), ...C.RUBROS_TARJETA.map(r => r[0]), 'Otros', 'Pagos y créditos'])];
  }
  function renderTar() {
    const movs = resumenes.flatMap((s, si) => s.movimientos.map((m, mi) => ({ m, si, mi })));
    $('#nTar').textContent = resumenes.length;
    ['#tarXlsx', '#tarCsv'].forEach(s => $(s).disabled = !movs.length);
    const sum = C.summarizeCards(resumenes);
    $('#tarCards').innerHTML = sum.resumen.map(r => {
      const ctl = [r.controlARS, r.controlUSD].filter(v => v != null);
      const ok = ctl.length && ctl.every(v => Math.abs(v) < 0.02);
      const est = !ctl.length ? '<span class="pill">sin saldo para controlar</span>' : ok ? '✓ cuadra con saldo actual' : `Δ $ ${fmt(r.controlARS)} / U$S ${fmt(r.controlUSD)}`;
      return `<div class="card ${ctl.length ? (ok ? 'ok' : 'bad') : ''}"><div class="k">${esc(r.tarjeta)} · cierre ${C.isoToAR(r.cierre)}</div>
        <div class="v">$ ${fmt(C.r2(r.consumosARS + r.cargosARS + r.percepARS))}</div><div class="small muted">U$S ${fmt(C.r2(r.consumosUSD + r.cargosUSD + r.percepUSD))} · ${r.movimientos} mov.</div><div class="small">${est}</div></div>`;
    }).join('') + resumenes.flatMap(st => (st.titulares || []).map(t => {
      const ok = t.okARS && t.okUSD;
      return `<div class="card ${ok ? 'ok' : 'bad'}"><div class="k">${esc(t.titular)} · tarjeta ${esc(t.tarjeta4)}</div><div class="v">$ ${fmt(t.calcARS)}</div><div class="small muted">U$S ${fmt(t.calcUSD)}</div><div class="small">${ok ? '✓ cuadra con el total de la tarjeta' : `Δ $ ${fmt(C.r2(t.calcARS - (t.ARS || 0)))} / U$S ${fmt(C.r2(t.calcUSD - (t.USD || 0)))}`}</div></div>`;
    })).join('') + (sum.cuotas.length ? `<div class="card"><div class="k">Cuotas pendientes</div><div class="v">$ ${fmt(C.r2(sum.cuotas.filter(c => c.moneda === 'ARS').reduce((s, c) => s + c.pendiente, 0)))}</div><div class="small muted">${sum.cuotas.length} compras en cuotas</div></div>` : '');
    const opts = rubrosDisponibles();
    const conTit = movs.some(x => x.m.titular);
    let h = '<thead><tr><th>Tarjeta</th>' + (conTit ? '<th>Titular</th>' : '') + '<th>Fecha</th><th>Descripción</th><th>Cuota</th><th>Mon.</th><th class="num">Importe</th><th>Rubro</th></tr></thead><tbody>';
    for (const { m, si, mi } of movs) {
      h += `<tr><td class="small">${esc(m.tarjeta)}</td>${conTit ? `<td class="small">${esc(m.titular || '')}</td>` : ''}<td>${C.isoToAR(m.fecha)}</td>
        <td><input class="w-l" data-s="${si}" data-m="${mi}" data-k="descripcion" value="${esc(m.descripcion)}"></td>
        <td>${m.cuota ? m.cuota + '/' + m.cuotas : ''}</td><td>${m.moneda}</td>
        <td class="num"><input data-s="${si}" data-m="${mi}" data-k="importe" value="${fmt(m.importe)}"></td>
        <td><select data-s="${si}" data-m="${mi}" data-k="rubro">${opts.map(o => `<option${o === m.rubro ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></td></tr>`;
    }
    $('#tarTable').innerHTML = h + '</tbody>';
  }
  $('#tarTable').addEventListener('change', e => {
    const el = e.target; if (!el.dataset.k) return;
    const m = resumenes[+el.dataset.s].movimientos[+el.dataset.m];
    m[el.dataset.k] = el.dataset.k === 'importe' ? num(el.value) : el.value;
    renderTar();
  });
  $('#tarClear').onclick = () => { resumenes = []; $('#tarLog').textContent = ''; $('#tarStatus').textContent = ''; renderTar(); };
  $('#tarXlsx').onclick = () => {
    const s = C.summarizeCards(resumenes), wb = XLSX.utils.book_new();
    const r1 = s.resumen.map(r => ({ Tarjeta: r.tarjeta, Cierre: C.isoToAR(r.cierre), Movimientos: r.movimientos,
      'Saldo anterior $': r.saldoAntARS, 'Consumos $': r.consumosARS, 'Impuestos y cargos $': r.cargosARS, 'Percepciones $': r.percepARS, 'Pagos y créditos $': r.pagosARS, 'Saldo actual $': r.saldoARS, 'Control $': r.controlARS,
      'Saldo anterior U$S': r.saldoAntUSD, 'Consumos U$S': r.consumosUSD, 'Impuestos y cargos U$S': r.cargosUSD, 'Percepciones U$S': r.percepUSD, 'Pagos y créditos U$S': r.pagosUSD, 'Saldo actual U$S': r.saldoUSD, 'Control U$S': r.controlUSD }));
    const r2 = s.rubros.map(r => ({ Rubro: r.rubro, 'Pesos': r.ARS, 'Dólares': r.USD, Cantidad: r.cantidad }));
    const r3 = s.movimientos.map(m => ({ Tarjeta: m.tarjeta, Titular: m.titular || '', Fecha: xd(m.fecha), 'Descripción': m.descripcion, Comprobante: m.comprobante,
      Cuota: m.cuota ? `${m.cuota}/${m.cuotas}` : '', Moneda: m.moneda, Pesos: m.moneda === 'ARS' ? m.importe : null, 'Dólares': m.moneda === 'USD' ? m.importe : null, Rubro: m.rubro }));
    const r4 = s.cuotas.map(c => ({ Tarjeta: c.tarjeta, 'Fecha compra': C.isoToAR(c.fecha), 'Descripción': c.descripcion, 'Cuota actual': `${c.cuota}/${c.cuotas}`,
      Moneda: c.moneda, 'Monto cuota': c.montoCuota, 'Cuotas restantes': c.restantes, 'Saldo pendiente': c.pendiente, 'Última cuota': c.ultimaCuota }));
    const add = (rows, name, tot, dates) => { const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '(sin datos)': '' }]); ws._dates = dates; if (tot && rows.length) addTotals(ws, rows, tot); styleSheet(ws, rows, dates); XLSX.utils.book_append_sheet(wb, ws, name); return ws; };
    const tits = resumenes.flatMap(st => (st.titulares || []).map(t => ({ Tarjeta: st.tarjeta, Titular: t.titular, 'Tarjeta Nº': t.tarjeta4,
      'Consumos $ (calculado)': t.calcARS, 'Total $ (resumen)': t.ARS, 'Consumos U$S (calculado)': t.calcUSD, 'Total U$S (resumen)': t.USD, Control: t.okARS && t.okUSD ? 'OK' : 'Diferencia' })));
    add(r1, 'Resumen General', r1.length > 1 ? 'Tarjeta' : null);
    if (tits.length) add(tits, 'Por Titular', 'Tarjeta');
    add(r2, 'Gastos por Rubro', 'Rubro');
    add(r3, 'Detalle Movimientos', 'Tarjeta', ['Fecha']);
    const ws4 = add(r4, 'Cuotas a Vencer', 'Tarjeta');
    if (s.proyeccion.length) XLSX.utils.sheet_add_json(ws4, s.proyeccion.map(p => ({ Mes: p.mes, Moneda: p.moneda, 'Total a vencer': p.total })), { origin: { r: r4.length + 3, c: 0 } });
    XLSX.writeFile(wb, `Tarjetas_${today()}.xlsx`);
  };
  $('#tarCsv').onclick = () => {
    const movs = resumenes.flatMap(s => s.movimientos).map(m => Object.assign({}, m, { cuotaTxt: m.cuota ? `${m.cuota}/${m.cuotas}` : '' }));
    const cols = C.parseColumnTemplate('tarjeta:Tarjeta,titular:Titular,fecha:Fecha,descripcion:Descripción,comprobante:Comprobante,cuotaTxt:Cuota,moneda:Moneda,importe:Importe,rubro:Rubro');
    download(`Tarjetas_movimientos_${today()}.csv`, C.toDelimited(movs, cols, csvOpts()), 'text/csv');
  };

  // ═════════════ BANCOS ═════════════
  // Cada elemento de "extractos" es UNA cuenta bancaria (un PDF puede traer varias, ej. BBVA)
  let extractos = [];
  function reglasBanco() { return C.parseUserRules(cfg.reglasBan); }
  function cuentaPara(cat, importe) {
    const u = reglasBanco().find(r => r[0] === cat); if (u) return cat;
    const r = C.CATEGORIAS_BANCO.find(r => r[0] === cat); return r ? (importe < 0 ? r[2] : r[3]) : 'A clasificar';
  }
  const nroCuenta = s => s.nro || '';
  const etiqueta = s => [s.banco || 'Banco', nroCuenta(s)].filter(Boolean).join(' ');
  async function procBanco(file) {
    const pdf = await readPdf(file);
    if (!pdf.hasText) { alertLog('ban', `⚠ ${file.name}: PDF sin texto (escaneado). No se puede leer sin OCR.`); return; }
    const res = C.parseBankStatement(pdf.rows, { reglasUsuario: reglasBanco() });
    if (!res.cuentas.length || !res.cuentas.some(c => c.movimientos.length)) { alertLog('ban', `⚠ ${file.name}: no se encontraron movimientos.`); return; }
    for (const c of res.cuentas) {
      c.archivo = file.name;
      const def = cfg.banco && cfg.banco !== 'Banco c/c' ? cfg.banco : `Banco ${etiqueta(c)}`;
      c.cuentaContable = def;
      extractos.push(c);
    }
    if (res.cuentas.length > 1) alertLog('ban', `ℹ ${file.name}: ${res.cuentas.length} cuentas detectadas en el mismo resumen.`);
  }
  function calcSaldos(s) { s.saldoCalc = s.saldoIni != null ? C.r2(s.saldoIni + s.movimientos.reduce((a, m) => a + m.importe, 0)) : null; }
  function renderBan() {
    $('#nBan').textContent = extractos.length;
    ['#banXlsx', '#banMovCsv', '#banAsiCsv'].forEach(s => $(s).disabled = !extractos.some(x => x.movimientos.length));
    $('#banCards').innerHTML = extractos.map((s, si) => {
      calcSaldos(s);
      const d = s.saldoCalc != null && s.saldoFinDecl != null ? C.r2(s.saldoCalc - s.saldoFinDecl) : null;
      const deb = s.movimientos.filter(m => m.importe < 0).reduce((a, m) => a - m.importe, 0), cre = s.movimientos.filter(m => m.importe > 0).reduce((a, m) => a + m.importe, 0);
      const est = d == null ? '<span class="pill">sin saldo final para controlar</span>'
        : Math.abs(d) < 0.02 ? `✓ cuadra con ${s.finOrigen === 'declarado' ? 'saldo final del extracto' : 'último saldo impreso'}` : 'Δ vs saldo final: $ ' + fmt(d);
      return `<div class="card ${d == null ? '' : Math.abs(d) < 0.02 ? 'ok' : 'bad'}"><div class="k" title="${esc(s.cuenta)}">${esc(etiqueta(s))} · ${s.movimientos.length} mov.</div>
        <div class="v">$ ${fmt(s.saldoCalc != null ? s.saldoCalc : C.r2(cre - deb))}</div>
        <div class="small muted">Inicial ${fmt(s.saldoIni)} · Déb. ${fmt(C.r2(deb))} · Créd. ${fmt(C.r2(cre))}</div>
        <div class="small">${est}</div>
        <label class="small muted" style="display:block;margin-top:6px">Cuenta contable<input data-ec="${si}" value="${esc(s.cuentaContable)}" style="width:100%;font:inherit;font-size:12px;padding:4px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)"></label></div>`;
    }).join('');
    const cats = [...new Set([...reglasBanco().map(r => r[0]), ...C.CATEGORIAS_BANCO.map(r => r[0]), 'A clasificar'])];
    let h = '<thead><tr><th>Fecha</th><th>Descripción</th><th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th><th>Categoría</th><th>Cuenta contable</th><th>Control</th></tr></thead><tbody>';
    extractos.forEach((s, si) => {
      if (extractos.length > 1) h += `<tr><td colspan="8" style="background:var(--line2);font-weight:600;padding:6px 8px">${esc(etiqueta(s))} <span class="small muted">· ${esc(s.archivo)}</span></td></tr>`;
      s.movimientos.forEach((m, mi) => {
        const a = `data-s="${si}" data-m="${mi}"`;
        h += `<tr class="${m.flags.length ? 'flag' : 'okr'}"><td>${C.isoToAR(m.fecha)}</td>
          <td><input class="w-l" ${a} data-k="descripcion" value="${esc(m.descripcion)}"></td>
          <td class="num"><input ${a} data-k="deb" value="${m.importe < 0 ? fmt(-m.importe) : ''}"></td>
          <td class="num"><input ${a} data-k="cre" value="${m.importe > 0 ? fmt(m.importe) : ''}"></td>
          <td class="num small muted">${m.saldo != null ? fmt(m.saldo) : ''}</td>
          <td><select ${a} data-k="categoria">${cats.map(c => `<option${c === m.categoria ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
          <td><input class="w-l" ${a} data-k="cuenta" value="${esc(m.cuenta)}"></td>
          <td>${flagCell(m.flags)}</td></tr>`;
      });
    });
    $('#banTable').innerHTML = h + '</tbody>';
  }
  $('#banCards').addEventListener('change', e => { const i = e.target.dataset.ec; if (i != null) extractos[+i].cuentaContable = e.target.value.trim(); });
  $('#banTable').addEventListener('change', e => {
    const el = e.target, k = el.dataset.k; if (!k) return;
    const m = extractos[+el.dataset.s].movimientos[+el.dataset.m];
    if (k === 'deb') m.importe = -Math.abs(num(el.value));
    else if (k === 'cre') m.importe = Math.abs(num(el.value));
    else if (k === 'categoria') { m.categoria = el.value; m.cuenta = cuentaPara(el.value, m.importe); m.flags = m.flags.filter(f => f !== 'Sin categoría'); }
    else m[k] = el.value;
    if (k === 'deb' || k === 'cre') m.flags = m.flags.filter(f => f !== 'Signo inferido por texto');
    renderBan();
  });
  $('#banClear').onclick = () => { extractos = []; $('#banLog').textContent = ''; $('#banStatus').textContent = ''; renderBan(); };
  const asientos = () => { let base = 0; return extractos.flatMap(s => { const rs = C.bankEntries(s, s.cuentaContable, etiqueta(s)).map(r => Object.assign(r, { asiento: r.asiento + base })); base = rs.reduce((mx, r) => Math.max(mx, r.asiento), base); return rs; }); };
  $('#banXlsx').onclick = () => {
    const wb = XLSX.utils.book_new();
    const r1 = extractos.flatMap(s => s.movimientos.map(m => ({ 'Cuenta bancaria': etiqueta(s), Fecha: xd(m.fecha), 'Descripción': m.descripcion,
      'Débito': m.importe < 0 ? -m.importe : null, 'Crédito': m.importe > 0 ? m.importe : null, Saldo: m.saldo, 'Categoría': m.categoria, Cuenta: m.cuenta, Control: m.flags.join(' | '), Archivo: s.archivo })));
    const w1 = XLSX.utils.json_to_sheet(r1); w1._dates = ['Fecha']; addTotals(w1, r1, 'Cuenta bancaria'); styleSheet(w1, r1, ['Fecha']); XLSX.utils.book_append_sheet(wb, w1, 'Movimientos');
    const g = {};
    extractos.forEach(s => s.movimientos.forEach(m => { const k = etiqueta(s) + '|' + m.cuenta; g[k] = g[k] || { 'Cuenta bancaria': etiqueta(s), Cuenta: m.cuenta, 'Débitos': 0, 'Créditos': 0, Cantidad: 0 }; if (m.importe < 0) g[k]['Débitos'] = C.r2(g[k]['Débitos'] - m.importe); else g[k]['Créditos'] = C.r2(g[k]['Créditos'] + m.importe); g[k].Cantidad++; }));
    const r2 = Object.values(g); const w2 = XLSX.utils.json_to_sheet(r2); addTotals(w2, r2, 'Cuenta bancaria'); styleSheet(w2, r2); XLSX.utils.book_append_sheet(wb, w2, 'Por cuenta');
    const r3 = asientos().map(a => ({ Asiento: a.asiento, Fecha: C.isoToAR(a.fecha), Cuenta: a.cuenta, Debe: a.debe || null, Haber: a.haber || null, Leyenda: a.leyenda }));
    const w3 = XLSX.utils.json_to_sheet(r3); addTotals(w3, r3, 'Cuenta'); styleSheet(w3, r3); XLSX.utils.book_append_sheet(wb, w3, 'Asientos');
    const r4 = extractos.map(s => { calcSaldos(s); const deb = s.movimientos.filter(m => m.importe < 0).reduce((a, m) => a - m.importe, 0), cre = s.movimientos.filter(m => m.importe > 0).reduce((a, m) => a + m.importe, 0);
      return { 'Cuenta bancaria': etiqueta(s), Detalle: s.cuenta, Archivo: s.archivo, 'Saldo inicial': s.saldoIni, 'Total débitos': C.r2(deb), 'Total créditos': C.r2(cre),
        'Saldo final calculado': s.saldoCalc, 'Saldo final extracto': s.saldoFinDecl, 'Origen saldo final': s.finOrigen,
        'Diferencia': s.saldoCalc != null && s.saldoFinDecl != null ? C.r2(s.saldoCalc - s.saldoFinDecl) : null }; });
    const w4 = XLSX.utils.json_to_sheet(r4); styleSheet(w4, r4); XLSX.utils.book_append_sheet(wb, w4, 'Control de saldos');
    XLSX.writeFile(wb, `Bancos_${today()}.xlsx`);
  };
  $('#banMovCsv').onclick = () => {
    const rows = extractos.flatMap(s => s.movimientos.map(m => Object.assign({ cuentaBancaria: etiqueta(s), archivo: s.archivo, debito: m.importe < 0 ? -m.importe : 0, credito: m.importe > 0 ? m.importe : 0 }, m)));
    const cols = C.parseColumnTemplate('cuentaBancaria:Cuenta bancaria,fecha:Fecha,descripcion:Descripción,debito:Débito,credito:Crédito,categoria:Categoría,cuenta:Cuenta,archivo:Archivo');
    download(`Bancos_movimientos_${today()}.csv`, C.toDelimited(rows, cols, csvOpts()), 'text/csv');
  };
  $('#banAsiCsv').onclick = () => download(`Asientos_bancos_${today()}.csv`, C.toDelimited(asientos(), C.parseColumnTemplate(cfg.sosAsi), csvOpts()), 'text/csv');

  // ───────────── Utilidades Excel / descarga ─────────────
  const dateColsOf = ws => ws._dates;
  function addTotals(ws, rows, labelCol) {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const numCols = keys.filter(k => rows.some(r => typeof r[k] === 'number') && !/^(Cód|PV|Número|Cantidad|Movimientos|Asiento|T\. cambio|Cód\. ARCA|Cuotas restantes)/.test(k) && !/^Saldo (anterior|actual|inicial|final)|^Saldo$/.test(k) && !(dateColsOf(ws) || []).includes(k));
    const tot = {}; keys.forEach(k => tot[k] = null); tot[labelCol] = 'TOTAL';
    numCols.forEach(k => tot[k] = C.r2(rows.reduce((s, r) => s + (typeof r[k] === 'number' ? r[k] : 0), 0)));
    XLSX.utils.sheet_add_json(ws, [tot], { origin: -1, skipHeader: true });
  }
  function styleSheet(ws, rows, dateCols) {
    if (!ws['!ref']) return;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const keys = rows.length ? Object.keys(rows[0]) : [];
    ws['!cols'] = keys.map(k => ({ wch: Math.min(48, Math.max(k.length + 2, ...rows.slice(0, 200).map(r => String(r[k] == null ? '' : (dateCols || []).includes(k) ? '00/00/0000' : typeof r[k] === 'number' ? fmt(r[k]) : r[k]).length + 1))) }));
    for (let R = 1; R <= range.e.r; R++) for (let Cc = 0; Cc <= range.e.c; Cc++) {
      const c = ws[XLSX.utils.encode_cell({ r: R, c: Cc })]; if (!c) continue;
      if ((dateCols || []).includes(keys[Cc])) { if (c.t === 'n') c.z = 'dd/mm/yyyy'; continue; }
      if (c.t === 'n' && !/^(Cód|PV|Número|Cantidad|Movimientos|Asiento|Cuotas restantes)/.test(keys[Cc] || '')) c.z = '#,##0.00';
      if (c.t === 'd' || (dateCols || []).includes(keys[Cc])) c.z = 'dd/mm/yyyy';
    }
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, range.e.r - 1), c: range.e.c } }) };
  }
  function download(name, content, type) {
    const blob = new Blob([type === 'text/csv' ? '﻿' + content : content], { type: type + ';charset=' + (type === 'text/plain' ? 'windows-1252' : 'utf-8') });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  renderFac(); renderTar(); renderBan();
})();
