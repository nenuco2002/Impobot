/* ImpoBot · Procesador de documentos — núcleo
 * Sin dependencias y sin IA externa: todo es parsing determinístico + validación.
 * Se usa en el navegador (window.IBCore) y en Node (module.exports) para tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IBCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────────────────── Números ─────────────────────────
  // Montos con decimales con coma (formato AR): 1.234,56 · 1234,56 · -$ 1.234,56 · 1.234,56-
  const AMT_SRC = '\\(?-?\\s?(?:\\$|U\\$S|USD)?\\s?(?<![\\d.,])(?:\\d{1,4}(?:\\.\\d{3})+|\\d+),\\d{2}(?!\\d)\\)?-?';

  function parseAR(s) {
    if (s == null) return NaN;
    if (typeof s === 'number') return s;
    let t = String(s).replace(/\u00a0/g, ' ').replace(/U\$S|USD|\$/gi, '').replace(/\s+/g, '');
    if (!t) return NaN;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
    if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
    const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
    if (lc > ld) t = t.replace(/\./g, '').replace(',', '.');
    else if (ld > lc) {
      const after = t.length - ld - 1;
      if (lc === -1 && after === 3) t = t.replace(/\./g, '');   // 1.234 → miles
      else t = t.replace(/,/g, '');
    }
    const n = parseFloat(t);
    return isNaN(n) ? NaN : (neg ? -n : n);
  }
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const nz = n => (typeof n === 'number' && isFinite(n) ? n : 0);

  function amountsIn(text, baseX) {
    const out = [], re = new RegExp(AMT_SRC, 'g');
    let m;
    while ((m = re.exec(text))) {
      const lead = m[0].length - m[0].trimStart().length;
      out.push({ raw: m[0].trim(), value: parseAR(m[0]), index: m.index + lead, end: m.index + m[0].length });
    }
    return out;
  }

  // ───────────────────────── Fechas ─────────────────────────
  const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
    jan: 1, apr: 4, aug: 8, dec: 12 };
  const DATE_SRC = '(\\d{1,2})[\\/\\-.\\s](\\d{1,2}|[A-Za-zÁÉÍÓÚáéíóú]{3})[A-Za-zÁÉÍÓÚáéíóú]*\\.?[\\/\\-.\\s](\\d{4}|\\d{2})(?!\\d)';
  const LEAD_DATE_RE = new RegExp('^\\s*' + DATE_SRC);

  function mkDate(d, m, y) {
    d = +d; y = +y; y = y < 100 ? 2000 + y : y;
    m = /^\d+$/.test(m) ? +m : MESES[String(m).slice(0, 3).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    if (!m || m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function leadingDate(text) {
    const m = LEAD_DATE_RE.exec(text);
    if (!m) return null;
    const iso = mkDate(m[1], m[2], m[3]);
    return iso ? { iso, len: m[0].length } : null;
  }
  function findDate(text) {
    const re = new RegExp(DATE_SRC, 'g'); let m;
    while ((m = re.exec(text))) { const iso = mkDate(m[1], m[2], m[3]); if (iso) return iso; }
    return null;
  }
  const isoToAR = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  const isoToCompact = iso => (iso ? iso.replace(/-/g, '') : '00000000');

  // ───────────────────────── CUIT ─────────────────────────
  function cuitValido(c) {
    c = String(c || '').replace(/\D/g, '');
    if (c.length !== 11) return false;
    const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let s = 0; for (let i = 0; i < 10; i++) s += +c[i] * w[i];
    let dv = 11 - (s % 11); if (dv === 11) dv = 0; if (dv === 10) return false;
    return dv === +c[10];
  }
  function cuitsIn(text) {
    const re = /\b(20|23|24|27|30|33|34)-?(\d{8})-?(\d)\b/g, out = []; let m;
    while ((m = re.exec(text))) { const c = m[1] + m[2] + m[3]; if (!out.includes(c)) out.push(c); }
    return out;
  }
  const fmtCuit = c => (c && c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c || '');

  // ───────────────────────── Líneas desde pdf.js ─────────────────────────
  // items: [{str, x, y, w}] (y crece hacia arriba, como pdf.js). Devuelve filas ordenadas arriba→abajo.
  function buildLines(items, tol) {
    tol = tol || 2.5;
    items.forEach(i => { if (i.str) i.str = i.str.replace(/[\u2212\u2012\u2013\u2010]/g, '-'); });
    const its = items.filter(i => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of its) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last.y - it.y) <= tol) last.items.push(it);
      else rows.push({ y: it.y, items: [it] });
    }
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      let t = '', prevEnd = null;
      for (const it of r.items) {
        it.start = t.length + (prevEnd === null ? 0 : 0);
        if (prevEnd !== null) { const gap = it.x - prevEnd; t += gap > 12 ? '   ' : gap > 1.2 ? ' ' : ''; }
        it.start = t.length;
        t += it.str;
        prevEnd = it.x + (it.w || it.str.length * 4.5);
      }
      r.text = t.replace(/\s+$/, '');
    }
    return rows;
  }
  // Líneas desde texto plano (tests / texto pegado)
  const linesFromText = txt => String(txt).replace(/[\u2212\u2012\u2013\u2010]/g, '-').split(/\r?\n/).map((t, i) => ({ y: -i, items: [], text: t })).filter(r => r.text.trim());

  // Montos de una fila con posición X (borde derecho, los importes suelen ir alineados a derecha)
  function rowAmounts(row) {
    const out = amountsIn(row.text);
    for (const a of out) {
      const it = row.items.find(i => a.index >= i.start && a.index < i.start + i.str.length);
      a.x = it ? it.x + (it.w || it.str.length * 4.5) : null;
    }
    return out;
  }
  function headerX(rows, patterns) {
    // Busca una fila con todos los patrones y devuelve el borde derecho de cada uno
    for (const r of rows) {
      if (!r.items.length) continue;
      if (!patterns.every(p => p.test(r.text) || r.items.some(i => p.test(i.str)))) continue;
      return patterns.map(p => { const it = r.items.find(i => p.test(i.str)); return it ? it.x + (it.w || it.str.length * 4.5) : null; });
    }
    return null;
  }
  const nearest = (x, xs) => { let best = -1, d = Infinity; xs.forEach((v, i) => { if (v != null && Math.abs(v - x) < d) { d = Math.abs(v - x); best = i; } }); return best; };

  // ───────────────────────── FACTURAS ─────────────────────────
  const COD_LETRA = { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 6: 'B', 7: 'B', 8: 'B', 9: 'B', 11: 'C', 12: 'C', 13: 'C', 15: 'C', 51: 'M', 52: 'M', 53: 'M',
    201: 'A', 202: 'A', 203: 'A', 206: 'B', 207: 'B', 208: 'B', 211: 'C', 212: 'C', 213: 'C' };
  const COD_NOMBRE = { 1: 'Factura A', 2: 'N. Débito A', 3: 'N. Crédito A', 6: 'Factura B', 7: 'N. Débito B', 8: 'N. Crédito B',
    11: 'Factura C', 12: 'N. Débito C', 13: 'N. Crédito C', 51: 'Factura M', 52: 'N. Débito M', 53: 'N. Crédito M',
    201: 'FCE A', 202: 'ND FCE A', 203: 'NC FCE A', 206: 'FCE B', 207: 'ND FCE B', 208: 'NC FCE B', 211: 'FCE C', 212: 'ND FCE C', 213: 'NC FCE C' };
  const ALICUOTAS = [ // clave, tasa, código ARCA
    ['27', 0.27, 6], ['21', 0.21, 5], ['105', 0.105, 4], ['5', 0.05, 8], ['25', 0.025, 9], ['0', 0, 3]];

  function nuevaFactura() {
    return { archivo: '', fecha: '', tipo: 0, letra: '', pv: 0, nro: 0, cuit: '', razon: '',
      neto27: 0, iva27: 0, neto21: 0, iva21: 0, neto105: 0, iva105: 0, neto5: 0, iva5: 0, neto25: 0, iva25: 0, neto0: 0,
      noGravado: 0, exento: 0, percIVA: 0, percIIBB: 0, percNac: 0, percMuni: 0, impInternos: 0, otrosTrib: 0,
      total: 0, moneda: 'PES', tc: 1, cae: '', origen: '', flags: [] };
  }

  function amountAfter(flat, labelRe, span) {
    const m = labelRe.exec(flat);
    if (!m) return null;
    const seg = flat.slice(m.index + m[0].length, m.index + m[0].length + (span || 70));
    const a = amountsIn(seg)[0];
    return a ? Math.abs(a.value) : null;
  }

  function parseInvoiceText(text, opts) {
    opts = opts || {};
    const f = nuevaFactura();
    const T = String(text || '').replace(/\u00a0/g, ' ');
    const flat = T.replace(/\s+/g, ' ');
    f.origen = flat.trim() ? 'texto' : '';

    // Tipo
    let m = /C[OÓ]D(?:IGO)?\.?\s*N?[°º]?\s*:?\s*0*(\d{1,3})\b/i.exec(flat);
    if (m && COD_LETRA[+m[1]]) f.tipo = +m[1];
    if (!f.tipo) {
      const lm = /\bFACTURA\s+([ABCM])\b/i.exec(flat) || /^\s*([ABCM])\s*$/m.exec(T);
      const letra = lm ? lm[1].toUpperCase() : '';
      const base = { A: 1, B: 6, C: 11, M: 51 }[letra];
      if (base) f.tipo = /NOTA\s+DE\s+CR[EÉ]DITO/i.test(flat) ? base + 2 : /NOTA\s+DE\s+D[EÉ]BITO/i.test(flat) ? base + 1 : base;
    }
    f.letra = COD_LETRA[f.tipo] || '';

    // Punto de venta y número
    m = /Punto\s+de\s+Venta\s*:?\s*(\d{1,5})\s*Comp\.?\s*N(?:ro|°|º)?\.?\s*:?\s*(\d{1,8})/i.exec(flat)
      || /\b(\d{4,5})\s*-\s*(\d{8})\b/.exec(flat);
    if (m) { f.pv = +m[1]; f.nro = +m[2]; }

    // Fecha
    m = /Fecha\s+de\s+Emisi[oó]n\s*:?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i.exec(flat);
    f.fecha = (m && findDate(m[1])) || findDate(flat) || '';

    // CUIT emisor = primer CUIT válido que no sea el del cliente (receptor)
    const own = String(opts.cuitPropio || '').replace(/\D/g, '');
    const cuits = cuitsIn(flat).filter(c => c !== own);
    f.cuit = cuits.find(cuitValido) || cuits[0] || '';

    // Razón social del emisor: primer "Razón Social:" que no sea el bloque del receptor
    for (const line of T.split(/\r?\n/)) {
      const rm = /Raz[oó]n\s+Social\s*:?\s*(.+)/i.exec(line);
      if (rm && !/Apellido|Nombre\s*\//i.test(line.slice(0, rm.index + 5))) {
        f.razon = rm[1].split(/\s{3,}|Fecha de Emisi|Domicilio|CUIT/i)[0].trim(); break;
      }
    }

    // Importes del pie (plantilla ARCA "Comprobantes en línea" y similares)
    const neto = amountAfter(flat, /(?:Importe\s+)?Neto\s+Gravado\s*:?/i);
    const iva = {
      27: amountAfter(flat, /IVA\s*27\s*%\s*:?/i), 21: amountAfter(flat, /IVA\s*21\s*%\s*:?/i),
      105: amountAfter(flat, /IVA\s*10[.,]5\s*%\s*:?/i), 5: amountAfter(flat, /IVA\s*5\s*%\s*:?/i),
      25: amountAfter(flat, /IVA\s*2[.,]5\s*%\s*:?/i), 0: amountAfter(flat, /IVA\s*0\s*%\s*:?/i) };
    f.iva27 = nz(iva[27]); f.iva21 = nz(iva[21]); f.iva105 = nz(iva[105]); f.iva5 = nz(iva[5]); f.iva25 = nz(iva[25]);
    f.exento = nz(amountAfter(flat, /Importe\s+Exento\s*:?/i));
    f.noGravado = nz(amountAfter(flat, /(?:Importe\s+)?No\s+Gravado\s*:?/i));
    f.otrosTrib = nz(amountAfter(flat, /Importe\s+Otros\s+Tributos\s*:?/i));
    f.total = nz(amountAfter(flat, /Importe\s+Total\s*:?/i) || amountAfter(flat, /\bTOTAL\s*:?\s*(?=\$|\d)/i, 30));
    const subtotal = amountAfter(flat, /Subtotal\s*:?/i);

    // Percepciones / otros tributos (tabla "Otros tributos")
    // En el PDF de ARCA la tabla de tributos comparte renglón con el pie de IVA: se corta cada
    // segmento en el próximo rótulo para no tomar el importe de otra columna.
    const NEXT_LABEL = /(?:Importe\s|Neto\s|Subtotal|IVA\s*\d+(?:[.,]\d)?\s*%|Percep|Retenc|Impuestos?\s+Internos|Otros\s+Tributos|CAE)/gi;
    for (const line of T.split(/\r?\n/)) {
      const lre = /(Percep\w*|Retenc\w*|Impuestos?\s+Internos)/gi; let lm;
      while ((lm = lre.exec(line))) {
        NEXT_LABEL.lastIndex = lm.index + lm[0].length;
        const nx = NEXT_LABEL.exec(line);
        const seg = line.slice(lm.index, nx ? nx.index : line.length);
        const am = amountsIn(seg); if (!am.length) continue;
        const v = Math.abs(am[am.length - 1].value);
        if (/Impuestos?\s+Internos/i.test(seg)) f.impInternos += v;
        else if (/\bIVA\b/i.test(seg)) f.percIVA += v;
        else if (/IIBB|Ingresos\s+Brutos|Ing\.?\s*Br/i.test(seg)) f.percIIBB += v;
        else if (/Municip/i.test(seg)) f.percMuni += v;
        else if (/Nacional|Ganancias/i.test(seg)) f.percNac += v;
      }
    }
    const identificados = f.percIVA + f.percIIBB + f.impInternos + f.percMuni + f.percNac;
    f.otrosTrib = r2(Math.max(0, f.otrosTrib - identificados));

    // Netos por alícuota
    if (f.letra === 'A' || f.letra === 'M') repartirNeto(f, nz(neto));
    else if (f.letra === 'C' || f.letra === 'B') f.noGravado = r2(f.total - f.exento - identificados - f.otrosTrib) || nz(subtotal);
    else if (neto) repartirNeto(f, neto);

    const cm = /C\.?A\.?E\.?\s*N?[°º]?\s*:?\s*(\d{14})/i.exec(flat); if (cm) f.cae = cm[1];
    if (/D[oó]lar|\bUSD\b|U\$S/i.test(flat) && /Moneda/i.test(flat)) f.moneda = 'DOL';
    return f;
  }

  function repartirNeto(f, netoTotal) {
    const con = ALICUOTAS.filter(([k, t]) => t > 0 && f['iva' + k] > 0);
    if (con.length === 1) f['neto' + con[0][0]] = netoTotal || r2(f['iva' + con[0][0]] / con[0][1]);
    else if (con.length > 1) {
      let acum = 0;
      con.forEach(([k, t]) => { f['neto' + k] = r2(f['iva' + k] / t); acum += f['neto' + k]; });
      const dif = r2(netoTotal - acum);
      if (netoTotal && Math.abs(dif) > 0.01) { // el resto a 0% si hay, si no al mayor
        if (Math.abs(dif) > 1) f.neto0 = r2(f.neto0 + dif); else f['neto' + con[0][0]] = r2(f['neto' + con[0][0]] + dif);
      }
    } else if (netoTotal) f.neto0 = netoTotal;
  }

  // QR ARCA: https://www.afip.gob.ar/fe/qr/?p=<base64(JSON)>
  function decodeAfipQR(url, b64decode) {
    try {
      const m = /[?&]p=([^&#]+)/.exec(url); if (!m) return null;
      let b = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      const json = (b64decode || (s => (typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'))))(b);
      return JSON.parse(json);
    } catch (e) { return null; }
  }
  function applyQR(f, q) {
    if (!q) return f;
    f.origen = f.origen ? 'texto+QR' : 'QR';
    if (q.fecha) f.fecha = q.fecha;
    if (q.cuit) f.cuit = String(q.cuit);
    if (q.ptoVta) f.pv = +q.ptoVta;
    if (q.nroCmp) f.nro = +q.nroCmp;
    if (q.tipoCmp) { f.tipo = +q.tipoCmp; f.letra = COD_LETRA[f.tipo] || f.letra; }
    if (q.importe) f.total = +q.importe;
    if (q.moneda) f.moneda = q.moneda === 'PES' ? 'PES' : q.moneda;
    if (q.ctz) f.tc = +q.ctz || 1;
    if (q.codAut) f.cae = String(q.codAut);
    if ((f.letra === 'B' || f.letra === 'C')) {
      const ident = f.percIVA + f.percIIBB + f.impInternos + f.percMuni + f.percNac + f.otrosTrib + f.exento;
      f.noGravado = r2(f.total - ident);
    }
    return f;
  }

  function sumaFactura(f) {
    return r2(ALICUOTAS.reduce((s, [k]) => s + nz(f['neto' + k]) + nz(f['iva' + k] || 0), 0)
      + nz(f.noGravado) + nz(f.exento) + nz(f.percIVA) + nz(f.percIIBB) + nz(f.percNac) + nz(f.percMuni) + nz(f.impInternos) + nz(f.otrosTrib));
  }

  function validarFacturas(list, opts) {
    opts = opts || {};
    const keys = {};
    for (const f of list) {
      const fl = [];
      if (!f.fecha) fl.push('Sin fecha');
      if (!f.tipo) fl.push('Tipo de comprobante no detectado');
      if (!f.pv || !f.nro) fl.push('Sin PV/número');
      if (!f.cuit) fl.push('Sin CUIT emisor'); else if (!cuitValido(f.cuit)) fl.push('CUIT con dígito verificador inválido');
      if (!f.total) fl.push('Sin importe total');
      else {
        const d = r2(sumaFactura(f) - f.total);
        if (Math.abs(d) > (opts.tolerancia || 0.05)) fl.push(`Descuadre ${d > 0 ? '+' : ''}${d.toFixed(2)} (componentes vs total)`);
      }
      ALICUOTAS.forEach(([k, t]) => {
        if (t > 0 && f['neto' + k] && Math.abs(r2(f['neto' + k] * t) - f['iva' + k]) > 0.05 * Math.max(1, f['neto' + k] / 1000))
          fl.push(`IVA ${k === '105' ? '10,5' : k === '25' ? '2,5' : k}% no coincide con neto × alícuota`);
      });
      if ((f.letra === 'B' || f.letra === 'C') && ALICUOTAS.some(([k]) => f['iva' + k] > 0)) fl.push(`Comprobante ${f.letra} con IVA discriminado`);
      if (f.origen === 'QR') fl.push('Solo QR (PDF sin texto): revisar desglose');
      const key = [f.cuit, f.tipo, f.pv, f.nro].join('|');
      if (f.cuit && f.nro) { if (keys[key]) fl.push('Duplicado'); keys[key] = true; }
      f.flags = fl;
    }
    return list;
  }

  // ───────────────────────── Libro IVA Digital — Compras ─────────────────────────
  const padR = (s, n) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ' ').slice(0, n).padEnd(n, ' ');
  const padN = (v, n) => String(Math.max(0, Math.floor(+v || 0))).slice(-n).padStart(n, '0');
  const imp = (v, n) => String(Math.round(Math.abs(+v || 0) * 100)).padStart(n || 15, '0');

  function alicuotasDe(f) {
    if (!(f.letra === 'A' || f.letra === 'M')) return [];
    return ALICUOTAS.filter(([k]) => nz(f['neto' + k]) > 0 || nz(f['iva' + k]) > 0)
      .map(([k, t, cod]) => ({ cod, neto: nz(f['neto' + k]), iva: nz(f['iva' + k]) }));
  }

  function lidComprasCbte(f) {
    const al = alicuotasDe(f);
    const credito = f.letra === 'A' || f.letra === 'M' ? al.reduce((s, a) => s + a.iva, 0) : 0;
    let codOp = '0';
    if (!al.length && f.exento && !f.noGravado) codOp = 'E';
    else if (!al.length && f.noGravado && (f.letra === 'A' || f.letra === 'M')) codOp = 'N';
    const line =
      isoToCompact(f.fecha) + padN(f.tipo, 3) + padN(f.pv, 5) + padN(f.nro, 20) + padR('', 16) +
      '80' + padN(f.cuit, 20) + padR(f.razon, 30) +
      imp(f.total) + imp(f.noGravado) + imp(f.exento) + imp(f.percIVA) + imp(f.percNac) + imp(f.percIIBB) + imp(f.percMuni) + imp(f.impInternos) +
      padR(f.moneda || 'PES', 3) + String(Math.round((+f.tc || 1) * 1e6)).padStart(10, '0') +
      String(al.length) + codOp + imp(credito) + imp(f.otrosTrib) +
      padN(0, 11) + padR('', 30) + imp(0);
    return line;
  }
  function lidComprasAlicuotas(f) {
    return alicuotasDe(f).map(a =>
      padN(f.tipo, 3) + padN(f.pv, 5) + padN(f.nro, 20) + '80' + padN(f.cuit, 20) + imp(a.neto) + padN(a.cod, 4) + imp(a.iva));
  }
  function exportLID(list) {
    const cbte = list.map(lidComprasCbte), ali = list.flatMap(lidComprasAlicuotas);
    return { cbte: cbte.join('\r\n') + (cbte.length ? '\r\n' : ''), alicuotas: ali.join('\r\n') + (ali.length ? '\r\n' : '') };
  }

  // ───────────────────────── Export delimitado (SOS-Contador u otros) ─────────────────────────
  const INT_KEYS = /^(tipo|pv|nro|asiento|cuota|cuotas|cantidad|restantes)$/;
  function toDelimited(records, columns, o) {
    o = Object.assign({ sep: ';', decimal: ',', header: true, fecha: 'DD/MM/AAAA' }, o || {});
    const fmt = (v, key) => {
      if (typeof v === 'number') {
        if (INT_KEYS.test(key)) return String(Math.round(v));
        const s = v.toFixed(2); return o.decimal === ',' ? s.replace('.', ',') : s;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return o.fecha === 'AAAAMMDD' ? v.replace(/-/g, '') : o.fecha === 'AAAA-MM-DD' ? v : isoToAR(v);
      const s = v == null ? '' : String(v);
      return s.includes(o.sep) || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [];
    if (o.header) lines.push(columns.map(c => c.header).join(o.sep));
    for (const r of records) lines.push(columns.map(c => fmt(typeof c.get === 'function' ? c.get(r) : r[c.key], c.key)).join(o.sep));
    return lines.join('\r\n') + '\r\n';
  }
  // Plantilla de columnas "clave:Encabezado, clave:Encabezado"
  function parseColumnTemplate(tpl, extra) {
    tpl = String(tpl || '');
    return tpl.split(tpl.includes('\n') ? /\r?\n/ : ',').map(s => s.trim()).filter(Boolean).map(s => {
      const i = s.indexOf(':'), key = (i < 0 ? s : s.slice(0, i)).trim(), header = i < 0 ? '' : s.slice(i + 1).trim();
      return { key, header: header || key, get: extra && extra[key] };
    });
  }
  const FACTURA_GETTERS = {
    tipoNombre: f => COD_NOMBRE[f.tipo] || f.tipo, cuitFmt: f => fmtCuit(f.cuit),
    ivaTotal: f => r2(ALICUOTAS.reduce((s, [k]) => s + nz(f['iva' + k]), 0)),
    netoTotal: f => r2(ALICUOTAS.reduce((s, [k]) => s + nz(f['neto' + k]), 0)),
    comprobante: f => `${String(f.pv).padStart(5, '0')}-${String(f.nro).padStart(8, '0')}`,
    observaciones: f => (f.flags || []).join(' | ')
  };

  // ───────────────────────── Clasificación por palabras clave ─────────────────────────
  function compileRules(list) { // [[categoria, 'PAL1|PAL2', extra]]
    return list.map(([cat, pat, extra]) => ({ cat, re: pat instanceof RegExp ? pat : new RegExp(pat, 'i'), extra }));
  }
  function parseUserRules(txt) { // "Rubro: palabra, palabra" por línea
    return String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && l.includes(':')).map(l => {
      const i = l.indexOf(':');
      const words = l.slice(i + 1).split(',').map(w => w.trim()).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return words.length ? [l.slice(0, i).trim(), '\\b(?:' + words.join('|') + ')'] : null;
    }).filter(Boolean);
  }
  const classify = (desc, rules, dflt) => { const r = rules.find(r => r.re.test(desc)); return r ? r : { cat: dflt || 'Otros' }; };

  const RUBROS_TARJETA = [
    ['Percepciones impositivas', '\\b(?:PERCEP|PERC\\.|IIBB\\s*PERCEP|RG\\s*5617|RG\\s*4815|RG\\s*2408|DB\\.?\\s*RG|CR\\.?\\s*RG)'],
    ['Impuestos y cargos', '\\b(?:IVA|PERCEP|PERC\\.|IMP\\.?\\s*SELLOS|SELLOS|IMPUESTO|INTERES|COMISI|COMI\\b|CARGO|MANTENIM|MANT\\b|RG\\s*\\d{4}|DB\\.?\\s*RG|SEGURO\\s+DE\\s+VIDA|PUNITORIO)'],
    ['Combustible', '\\b(?:YPF|SHELL|AXION|PUMA|GNC|ESTACION\\s+DE\\s+SERV|EST\\.?\\s*(?:DE\\s+)?SERV|SERVICENTRO|FAST\\s*OIL)'],
    ['Publicidad / marketing', '\\b(?:FACEBK|FACEBOOK|META\\s*ADS|GOOGLE\\s*\\*?ADS|GOOGLE\\s*ADWORDS|LINKEDIN|TIKTOK\\s*ADS|TWITTER\\s*ADS)'],
    ['Supermercados', '\\b(?:COTO|DIA\\b|CARREFOUR|JUMBO|DISCO|VEA\\b|CHANGOMAS|LA\\s*ANONIMA|SUPERMERC|SUPER\\b|MAXICONSUMO|YAGUAR|MAKRO|VITAL)'],
    ['Gastronomía y delivery', '\\b(?:REST|PARRILL|PIZZ|CAF[EÉé]|BAR\\b|MCDONALD|BURGER|MOSTAZA|RAPPI|PEDIDOSYA|DELIVERY|HELAD|GRIDO|STARBUCKS|HAVANNA)'],
    ['Servicios digitales', '\\b(?:NETFLIX|SPOTIFY|GOOGLE|APPLE|MICROSOFT|AMAZON|DISNEY|HBO|MAX\\b|YOUTUBE|OPENAI|CHATGPT|ANTHROPIC|CLAUDE|ADOBE|DROPBOX|PARAMOUNT|STEAM|PLAYSTATION|CANVA|ZOOM)'],
    ['Telefonía e internet', '\\b(?:PERSONAL|MOVISTAR|CLARO|TELECOM|FIBERTEL|TELECENTRO|IPLAN|DIRECTV|FLOW)'],
    ['Transporte y viajes', '\\b(?:UBER|CABIFY|DIDI|SUBE|PEAJE|AUTOPISTA|AUSOL|AEROLINEAS|FLYBONDI|JETSMART|DESPEGAR|LATAM|BOOKING|AIRBNB|HOTEL|ESTACIONAM)'],
    ['Salud', '\\b(?:FARMACIA|FARMACITY|OSDE|SWISS\\s*MEDICAL|GALENO|MEDIFE|OMINT|MEDIC|ODONT|LABORATORIO|OPTICA|CLINICA|SANATORIO)'],
    ['Hogar y construcción', '\\b(?:EASY|SODIMAC|BLAISTEN|FERRETER|PINTURER|MUEBLE|GARBARINO|FRAVEGA|MUSIMUNDO|ELECTRO)'],
    ['Indumentaria', '\\b(?:ZARA|ADIDAS|NIKE|DEXTER|GRIMOLDI|FALABELLA|INDUMENT|CALZADO|ROPA|SPORT)'],
    ['Educación', '\\b(?:COLEGIO|ESCUELA|UNIVERSIDAD|INSTITUTO|CURSO|UDEMY|COURSERA|LIBRER)'],
    ['Seguros', '\\b(?:SEGURO|SANCOR|LA\\s*CAJA|FEDERACION\\s*PAT|ZURICH|MAPFRE|ALLIANZ|RIVADAVIA)'],
    ['E-commerce / Mercado Pago', '\\b(?:MERCADOLIBRE|MERCADO\\s*LIBRE|MERPAGO|MERCADOPAGO|MERCADO\\s*PAGO|MELI|TIENDANUBE|DLO\\*)']
  ];

  // ───────────────────────── TARJETAS ─────────────────────────
  const CARD_SKIP = /SALDO\s+(ANTERIOR|ACTUAL|PENDIENTE)|PAGO\s+M[IÍ]NIMO|TOTAL\s+(CONSUMOS|TARJETA|DEL|A\s+PAGAR)|^\s*TOTAL\b|L[IÍ]MITE|PR[OÓ]XIMO\s+(CIERRE|VTO|VENCIMIENTO)|CIERRE\s+(ACTUAL|ANTERIOR)|VENCIMIENTO\s+(ACTUAL|ANTERIOR)|TASA\s+NOMINAL|\bT\.?N\.?A\b|\bT\.?E\.?M\b|DEBITAREMOS/i;
  const CARD_PAGO = /SU\s+PAGO|PAGO\s+(EN|RECIBIDO|POR|DE\s+TARJ|TC)|DEB\.?\s*AUTOM|BONIFIC|DEVOLUCI|REINTEGRO|ANULACI|CR[EÉ]DITO\s+POR/i;

  function detectCard(fullText) {
    const t = fullText.toUpperCase();
    const banco = /BBVA|FRANC[EÉ]S/.test(t) ? 'BBVA' : /NACI[OÓ]N|\bBNA\b/.test(t) ? 'BNA' : /GALICIA/.test(t) ? 'Galicia' : /SANTANDER/.test(t) ? 'Santander' : /MACRO/.test(t) ? 'Macro' : /PROVINCIA|BAPRO/.test(t) ? 'Provincia' : '';
    const marca = /MASTERCARD|MASTER\s*CARD/.test(t) ? 'Mastercard' : /\bVISA\b/.test(t) ? 'Visa' : /AMERICAN\s+EXPRESS|AMEX/.test(t) ? 'Amex' : /CABAL/.test(t) ? 'Cabal' : '';
    const nivel = (/\b(BLACK|SIGNATURE|PLATINUM|GOLD|INFINITE|INTERNACIONAL|CLASSIC)\b/.exec(t) || [])[1] || '';
    return [banco, marca, nivel.charAt(0) + nivel.slice(1).toLowerCase()].filter(Boolean).join(' ') || 'Tarjeta';
  }

  function parseCardStatement(rows, opts) {
    opts = opts || {};
    const rules = compileRules([...(opts.reglasUsuario || []), ...RUBROS_TARJETA]);
    const full = rows.map(r => r.text).join('\n');
    const tarjeta = opts.tarjeta || detectCard(full);
    const hx = headerX(rows, [/PESOS|^\s*\$\s*$/i, /D[OÓ]LARES|^\s*U\$S\s*$|^\s*USD\s*$/i]);
    const movs = [];
    let cierre = null;
    const cm = /CIERRE\s+ACTUAL[^\d]{0,20}|\bCIERRE\s+(?=\d{1,2}[\s\/\-.])/i.exec(full);
    if (cm) cierre = findDate(full.slice(cm.index, cm.index + 40));
    const ref = cierre || refDateOf(full);

    // Formato Santander/Visa: "26 Abril 23 ..." (año + mes + día) y luego sólo el día
    const MES_LARGO = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
    const RE_YM = /^\s*(\d{2})\s+(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre)\s+(\d{1,2})\s+/i;
    const RE_D = /^\s*(\d{1,2})\s+(?=\S)/;
    let ctxY = null, ctxM = null, enDetalle = false;
    const pend = []; const titulares = [];
    const COLTOL = 45;

    for (const row of rows) {
      const t = row.text;
      if (/SALDO\s+ANTERIOR/i.test(t)) enDetalle = true;
      // Totales por tarjeta adicional → asigna titular a los movimientos pendientes y controla
      const tt = /Tarjeta\s+(\d{4})\s+Total\s+Consumos\s+de\s+(.+?)(?:\s{2,}|\s+\d)/i.exec(t);
      if (tt) {
        const am = rowAmounts(row); const vals = am.map(a => ({ v: a.value, col: hx && a.x != null ? nearest(a.x, hx) : null }));
        const tot = { tarjeta4: tt[1], titular: tt[2].trim(), ARS: null, USD: null };
        vals.forEach((x, i) => { const c = x.col != null ? x.col : i; if (c === 0) tot.ARS = x.v; else tot.USD = x.v; });
        for (const m of pend) { m.titular = `${tot.titular} (${tot.tarjeta4})`; }
        const NOCONS = ['Pagos y créditos', 'Percepciones impositivas', 'Impuestos y cargos'];
        const sum = mon => r2(pend.filter(m => m.moneda === mon && !NOCONS.includes(m.rubro)).reduce((a, m) => a + m.importe, 0));
        tot.calcARS = sum('ARS'); tot.calcUSD = sum('USD');
        titulares.push(tot); pend.length = 0;
        continue;
      }
      let iso = null, len = 0;
      const ld = leadingDate(t);
      if (ld) { iso = ld.iso; len = ld.len; }
      else {
        const ym = RE_YM.exec(t);
        if (ym) { ctxY = 2000 + +ym[1]; ctxM = MES_LARGO[ym[2].toLowerCase()]; iso = mkDate(ym[3], ctxM, ctxY); len = ym[0].length; enDetalle = true; }
        else if (ctxM && enDetalle) { const d = RE_D.exec(t); if (d) { iso = mkDate(d[1], ctxM, ctxY); len = d[0].length; } }
      }
      if (!iso) continue;
      if (CARD_SKIP.test(t)) continue;
      let ams = rowAmounts(row).filter(a => a.index >= len);
      // Con columnas detectadas, sólo valen los importes alineados a $ o U$S (descarta bases de percepción, montos de referencia)
      if (hx && ams.some(a => a.x != null)) ams = ams.filter(a => a.x != null && Math.min(...hx.filter(v => v != null).map(v => Math.abs(v - a.x))) <= COLTOL && !/^\(/.test(a.raw));
      if (!ams.length) continue;
      // Una fila puede traer importe en $ y en U$S a la vez (ej. consumo USD con referencia): se toma cada columna
      const porCol = {};
      for (const a of ams) { const c = hx && a.x != null ? nearest(a.x, hx) : (/U\$S|USD|D[OÓ]LAR/i.test(t) ? 1 : 0); porCol[c] = a; }
      const firstAmt = rowAmounts(row).filter(a => a.index >= len)[0];
      let desc = t.slice(len, firstAmt ? firstAmt.index + Math.max(0, firstAmt.raw.search(/[\d(]/)) : undefined);
      let cuota = null, cuotas = null;
      const cq = /(?:\bC(?:UOTA|TA)?\.?\s*)?\b(\d{1,2})\s*\/\s*(\d{1,2})\b(?![\/\-.]\d)/i.exec(desc);
      if (cq && +cq[1] >= 1 && +cq[1] <= +cq[2] && +cq[2] <= 60 && +cq[2] > 1) { cuota = +cq[1]; cuotas = +cq[2]; desc = desc.slice(0, cq.index) + desc.slice(cq.index + cq[0].length); }
      let comprobante = '';
      const cp0 = /^\s*(\d{5,8})\s+(?:[*FEKM]\s+)?/.exec(desc);
      if (cp0) { comprobante = cp0[1]; desc = desc.slice(cp0[0].length); }
      else { const cp = /\s(\d{5,8})\s*[*K]?\s*$/.exec(desc); if (cp) { comprobante = cp[1]; desc = desc.slice(0, cp.index); } }
      desc = (CARD_PAGO.test(desc) ? desc : desc.replace(/\s+(?:USD|U\$S)\s*$/i, '')).replace(/\s+(?:\$|P\s+\$)\s*$/i, '').replace(/\s+/g, ' ').replace(/^[\s*|-]+|[\s*|-]+$/g, '').trim();
      // Si hay importe en ambas columnas en un consumo en dólares, es el mismo consumo: vale el de U$S
      const cols = Object.keys(porCol).map(Number);
      const usar = cols.length > 1 && /USD|U\$S/i.test(t) ? [1] : cols;
      for (const c of usar) {
        const a = porCol[c];
        let importe = a.value;
        const esPago = CARD_PAGO.test(desc);
        if (esPago && importe > 0) importe = -importe;
        const rub = esPago ? { cat: 'Pagos y créditos' } : classify(desc, rules, 'Otros');
        const mv = { tarjeta, titular: '', fecha: iso, descripcion: desc, comprobante, cuota, cuotas, moneda: c === 1 ? 'USD' : 'ARS', importe: r2(importe), rubro: rub.cat, flags: [] };
        movs.push(mv); pend.push(mv);
      }
    }
    if (titulares.length) for (const m of pend) m.titular = 'Cargos de la cuenta';
    if (!cierre && movs.length) cierre = movs.map(m => m.fecha).sort().pop();

    // Saldos declarados (se toma el renglón que efectivamente trae importes)
    const saldoDe = re => {
      for (const r of rows) {
        if (!re.test(r.text)) continue;
        const am = rowAmounts(r).filter(a => !/^\(/.test(a.raw)); if (!am.length) continue;
        const o = { ARS: null, USD: null };
        am.forEach((a, i) => { const c = hx && a.x != null ? nearest(a.x, hx) : i; if (c === 0 && o.ARS == null) o.ARS = a.value; else if (c === 1 && o.USD == null) o.USD = a.value; });
        return o;
      }
      return { ARS: null, USD: null };
    };
    const sAct = saldoDe(/SALDO\s+ACTUAL/i), sAnt = saldoDe(/SALDO\s+ANTERIOR/i);
    for (const tt of titulares) {
      tt.okARS = tt.ARS == null || Math.abs(tt.ARS - tt.calcARS) < 0.02;
      tt.okUSD = tt.USD == null || Math.abs(tt.USD - tt.calcUSD) < 0.02;
    }
    return { tarjeta, cierre, movimientos: movs, saldoARS: sAct.ARS, saldoUSD: sAct.USD, saldoAntARS: sAnt.ARS, saldoAntUSD: sAnt.USD, titulares };
  }

  function addMonths(iso, n) {
    const [y, m] = iso.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function summarizeCards(statements) {
    const movs = statements.flatMap(s => s.movimientos);
    const resumen = statements.map(s => {
      const by = (mon, pred) => r2(s.movimientos.filter(m => m.moneda === mon && pred(m)).reduce((a, m) => a + m.importe, 0));
      const consumos = m => m.rubro !== 'Pagos y créditos' && m.rubro !== 'Impuestos y cargos' && m.rubro !== 'Percepciones impositivas';
      const out = { tarjeta: s.tarjeta, cierre: s.cierre, movimientos: s.movimientos.length };
      for (const mon of ['ARS', 'USD']) {
        out['consumos' + mon] = by(mon, consumos);
        out['cargos' + mon] = by(mon, m => m.rubro === 'Impuestos y cargos');
        out['pagos' + mon] = by(mon, m => m.rubro === 'Pagos y créditos');
        out['percep' + mon] = by(mon, m => m.rubro === 'Percepciones impositivas');
      }
      out.saldoAntARS = s.saldoAntARS; out.saldoARS = s.saldoARS; out.saldoAntUSD = s.saldoAntUSD; out.saldoUSD = s.saldoUSD;
      out.controlARS = s.saldoARS != null && s.saldoAntARS != null ? r2(s.saldoAntARS + out.consumosARS + out.cargosARS + out.percepARS + out.pagosARS - s.saldoARS) : null;
      out.controlUSD = s.saldoUSD != null && s.saldoAntUSD != null ? r2(s.saldoAntUSD + out.consumosUSD + out.cargosUSD + out.percepUSD + out.pagosUSD - s.saldoUSD) : null;
      return out;
    });
    const rubros = {};
    for (const m of movs) {
      if (m.rubro === 'Pagos y créditos') continue;
      const k = m.rubro; rubros[k] = rubros[k] || { rubro: k, ARS: 0, USD: 0, cantidad: 0 };
      rubros[k][m.moneda] = r2(rubros[k][m.moneda] + m.importe); rubros[k].cantidad++;
    }
    const cuotas = [], proy = {};
    for (const s of statements) for (const m of s.movimientos) {
      if (!m.cuota || m.cuota >= m.cuotas) continue;
      const rest = m.cuotas - m.cuota;
      cuotas.push({ tarjeta: m.tarjeta, fecha: m.fecha, descripcion: m.descripcion, cuota: m.cuota, cuotas: m.cuotas, moneda: m.moneda,
        montoCuota: m.importe, restantes: rest, pendiente: r2(m.importe * rest), ultimaCuota: addMonths(s.cierre || m.fecha, rest) });
      for (let i = 1; i <= rest; i++) {
        const k = addMonths(s.cierre || m.fecha, i) + '|' + m.moneda;
        proy[k] = r2((proy[k] || 0) + m.importe);
      }
    }
    const proyeccion = Object.keys(proy).sort().map(k => { const [mes, moneda] = k.split('|'); return { mes, moneda, total: proy[k] }; });
    return { resumen, rubros: Object.values(rubros).sort((a, b) => b.ARS - a.ARS), movimientos: movs, cuotas, proyeccion };
  }

  // ───────────────────────── BANCOS ─────────────────────────
  const CATEGORIAS_BANCO = [ // [categoría, regex, cuenta si débito, cuenta si crédito]
    ['Imp. débitos y créditos', '25\\.?413|IMP\\.?\\s*(?:S\\/|SOBRE\\s+)?(?:DEB|CRED)|\\bIDCB?\\b|LEY\\s*25|IMPTO\\.?\\s*(?:DEB|CRED)|ITF', 'Impuesto s/ débitos y créditos bancarios', 'Impuesto s/ débitos y créditos bancarios'],
    ['Percepción / retención IVA', 'PERC(?:EP)?(?:CI[OÓ]N)?\\.?\\s*(?:DE\\s+)?I\\.?V\\.?A|RET(?:EN)?(?:CI[OÓ]N)?\\.?\\s*(?:DE\\s+)?I\\.?V\\.?A|RG\\.?\\s*2408|R\\.?G\\.?\\s*3337', 'Retenciones y percepciones de IVA sufridas', 'Retenciones y percepciones de IVA sufridas'],
    ['IIBB (SIRCREB / percepciones)', 'SIRCREB|\\bIIBB\\b|ING(?:R(?:ESOS)?)?\\.?\\s*BR(?:UTOS)?|\\bI\\.?\\s*BRUTOS|ARCIBA|REC\\.?\\s*BANC|\\bARBA\\b|\\bAGIP\\b', 'Retenciones y percepciones IIBB sufridas', 'Retenciones y percepciones IIBB sufridas'],
    ['IVA s/ gastos bancarios', '\\bI\\.?V\\.?A\\.?(?=\\s|$|-|\\b)', 'IVA crédito fiscal', 'IVA crédito fiscal'],
    ['Pagos ARCA/AFIP', '\\bAFIP\\b|\\bARCA\\b|\\bVEP\\b|\\bDGI\\b|\\bF\\.?\\s*799|SEG(?:URIDAD)?\\.?\\s*SOC', 'Deudas fiscales / sociales', 'Deudas fiscales / sociales'],
    ['Intereses', 'INTERES', 'Intereses pagados', 'Intereses ganados'],
    ['Gastos y comisiones', 'COMISI|\\bCOMIS?\\b|\\bCOMI\\b|\\bCOM\\b|\\bCOM\\.|MANTENIM|\\bMANT\\b|CARGO|PAQUETE|SERV\\.?\\s*CTA|CHEQUERA|SELLAD|SELLOS|SEGURO', 'Gastos bancarios', 'Gastos bancarios'],
    ['Sueldos', 'SUELDO|HABERES|ACRED\\.?\\s*HAB|REMUNERAC', 'Sueldos a pagar', 'Sueldos a pagar'],
    ['Plazo fijo / inversiones', 'PLAZO\\s*FIJO|\\bP\\.?F\\.?\\b|FCI|FONDO\\s+COM|RESCATE|SUSCRIP(?!CION\\s+AL\\s+PERI)', 'Inversiones temporarias', 'Inversiones temporarias'],
    ['Cheques / eCheq', 'ECHEQ|E-CHEQ|CHEQUE|48\\s*HS|\\bCH\\.?\\s*\\d|CLEARING|CAMARA', 'Proveedores', 'Deudores por ventas'],
    ['Cobros con tarjeta / QR', '\\bNAVE\\b|PAGOS\\s*NACI|ADEL\\+|LIQ\\.?\\s*TARJ|LIQ\\+PAGOS|PRISMA|FIRST\\s*DATA|FISERV|PAYWAY|GETNET|CABAL|VISA|MASTER|AMEX', 'Tarjetas de crédito a pagar', 'Tarjetas a cobrar'],
    ['Débitos automáticos', 'DEB\\.?\\s*AUT|D[EÉ]BITO\\s+(?:AUTOM|DIRECTO)|\\bDEBIN\\b', 'Gastos a clasificar', 'Deudores por ventas'],
    ['Transferencias', 'TRANSF|\\bTRANS\\.|\\bTRAN\\b|\\bBE\\b|\\bTRF\\b|\\bTR\\.|TRANSFERENCIA|\\bCVU\\b|\\bCBU\\b|\\bCREDIN\\b|MERCADO\\s*PAGO', 'Proveedores', 'Deudores por ventas'],
    ['Depósitos', 'DEP[OÓ]SITO|DEP\\.?\\s*EFECT|\\bDEP\\b', 'Caja', 'Deudores por ventas']
  ];
  const CRED_HINT = /ACRED|DEP[OÓ]SITO|RECIB|CR[EÉ]DITO|COBRO|HABER|RESCATE|DEVOLUC|REINTEGRO|INTERESES?\s+(?:GANADOS|PAGADOS\s+A\s+SU)/i;
  const BANCOS = [['BBVA', /\bBBVA\b|FRANC[EÉ]S/gi], ['Credicoop', /CREDICOOP/gi], ['Galicia', /GALICIA/gi], ['Santander', /SANTANDER/gi], ['Macro', /\bMACRO\b/gi],
    ['Provincia', /BANCO\s*PROVINCIA|PROVINCIA\s+DE\s+BUENOS\s+AIRES|BAPRO|ARBA/gi], ['Nación', /NACI[OÓ]N\s+ARGENTINA|\bBNA\b/gi], ['ICBC', /\bICBC\b/gi],
    ['Supervielle', /SUPERVIELLE/gi], ['Patagonia', /PATAGONIA/gi], ['HSBC', /\bHSBC\b/gi], ['Ciudad', /BANCO\s+CIUDAD|BANCO\s+DE\s+LA\s+CIUDAD/gi],
    ['Comafi', /COMAFI/gi], ['Hipotecario', /HIPOTECARIO/gi], ['Brubank', /BRUBANK/gi], ['Mercado Pago', /MERCADO\s*PAGO/gi], ['Itaú', /ITA[UÚ]/gi]];
  function detectBank(full) {
    let best = '', n = 0;
    for (const [name, re] of BANCOS) { const c = (full.match(re) || []).length; if (c > n) { n = c; best = name; } }
    return best;
  }

  // Formato numérico del documento: AR (1.234,56) o US/sin miles (1234.56 · 1,234.56)
  function detectNumFormat(full) {
    const ar = (full.match(/\d,\d{2}(?![\d,.])/g) || []).length;
    const us = (full.match(/(?:^|[\s$-])\d+\.\d{2}(?![\d.,])/g) || []).length;
    return us > ar * 2 && us >= 3 ? 'us' : 'ar';
  }
  const AMT_US_SRC = '\\(?-?\\s?(?:\\$|U\\$S|USD)?\\s?-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}(?![\\d.])\\)?-?';
  function amountsFmt(text, fmt) {
    if (fmt !== 'us') return amountsIn(text);
    const out = [], re = new RegExp(AMT_US_SRC, 'g'); let m;
    while ((m = re.exec(text))) {
      const lead = m[0].length - m[0].trimStart().length;
      out.push({ raw: m[0].trim(), value: parseAR(m[0].replace(/,/g, '')), index: m.index + lead, end: m.index + m[0].length });
    }
    return out;
  }
  function rowAmountsFmt(row, fmt) {
    const out = amountsFmt(row.text, fmt);
    for (const a of out) {
      const it = row.items.find(i => a.index >= i.start && a.index < i.start + i.str.length);
      a.x = it ? it.x + (it.w || it.str.length * 4.5) : null;
    }
    return out;
  }

  // Fecha de referencia del documento (la más tardía con año) → año para fechas dd/mm
  function refDateOf(full) {
    const re = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/g; let m, best = null;
    while ((m = re.exec(full))) { const iso = mkDate(m[1], m[2], m[3]); if (iso && (!best || iso > best)) best = iso; }
    return best;
  }
  const NUM_DATE = /(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{4}|\d{2}))?(?![\d\/\-.])/;
  const ALPHA_DATE = /(\d{1,2})[\s\/\-.]([A-Za-zÁÉÍÓÚáéíóú]{3})[A-Za-zÁÉÍÓÚáéíóú]*\.?(?:[\s\/\-.](\d{4}|\d{2}))?(?!\d)/;
  // Fecha al inicio de la línea, tolerando basura previa (____ , glifos de código de barras)
  function leadingDateEx(text, ref) {
    const m = /^(\s*(?:[_\s|*·.=─-]+|[^\s\d]{1,10}(?=\d))?)/.exec(text);
    for (const pre of [0, m ? m[1].length : 0]) {
      const rest = text.slice(pre);
      for (const re of [NUM_DATE, ALPHA_DATE]) {
        const d = new RegExp('^\\s*' + re.source).exec(rest);
        if (!d) continue;
        if (!/^\s|^$/.test(rest.slice(d[0].length))) continue; // la fecha debe terminar en espacio
        let y = d[3];
        if (!y) {
          if (!ref) continue;
          y = +ref.slice(0, 4);
          const iso0 = mkDate(d[1], d[2], y);
          if (iso0 && iso0 > addDays(ref, 20)) y -= 1;
        }
        const iso = mkDate(d[1], d[2], y);
        if (iso) return { iso, len: pre + d[0].length };
      }
      if (!pre && !(m && m[1].length)) break;
    }
    return null;
  }
  function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  const RE_INI = /SALDO\s+(ANTERIOR|INICIAL)|SALDO\s+AL\s+INICIO/i;
  const RE_FIN = /SALDO\s+(FINAL|ACTUAL|AL\b|AL\s+CIERRE)|^\s*TOTAL\s+(?=.*\d,\d{2}|.*\d\.\d{2})(?!RETENC|IMPUESTO|COBRADO|MENSUAL|MOVIMIENTOS)/i;
  const RE_NO_CONT = /P[AÁ]GINA|HOJA:|SALDO|^\s*FECHA|CUIT\s|IVA\s+RESPONSABLE|www\.|http|TRANSPORTE|CONTINUA|VIENE\s+DE|SIGUIENTE|Resumen de Cuenta/i;
  const RE_CUENTA = /\b(?:CC|CA|CTA\.?\s*CTE|CAJA\s+DE\s+AHORROS?|CUENTA\s+CORRIENTE|Cuenta\s+Corriente|Cta\.)\b.*?(?:\$|U\$S|PESOS|D[OÓ]LARES|\d{3,})/i;

  // Número de cuenta cerca del inicio de la sección
  function nroCuentaCerca(rows, idx) {
    const from = Math.max(0, idx - 14), to = Math.min(rows.length, idx === 0 ? 45 : idx + 2);
    const pats = [/\b(?:CC|CA)\s*(?:\$|U\$S|USD)\s*(\d[\d\-\/]{5,}\d)/i, /\bCta\.\s*(\d[\d.\-\/]{6,}\d)/i, /N[°º]\s*(\d[\d\- ]{5,}\d)/, /(\d{5,8}\/\d)(?=\1|\s|$)/];
    for (let j = idx === 0 ? from : to - 1; idx === 0 ? j < to : j >= from; idx === 0 ? j++ : j--) {
      const t = rows[j].text;
      for (const p of pats) { const m = p.exec(t); if (m) return m[1].trim(); }
      if (/NRO\.?\s*(?:DE\s+)?CUENTA/i.test(t) && rows[j + 1]) { const m = /^\s*(\d{6,})/.exec(rows[j + 1].text); if (m) return m[1]; }
    }
    return '';
  }

  function parseBankStatement(rows, opts) {
    opts = opts || {};
    const reglas = [...(opts.reglasUsuario || []).map(([c, p]) => [c, p, c, c]), ...CATEGORIAS_BANCO]
      .map(([cat, pat, cd, cc]) => ({ cat, re: new RegExp(pat, 'i'), cd, cc }));
    const full = rows.map(r => r.text).join('\n');
    const fmt = detectNumFormat(full), ref = refDateOf(full);
    const hx = headerX(rows, [/D[ÉE]BITOS?|DEBE|EGRESOS/i, /CR[ÉE]DITOS?|HABER|INGRESOS/i, /SALDO/i]);
    const hasIni = rows.some(r => RE_INI.test(r.text));
    // ¿El extracto marca los débitos con signo en la columna de importe? (Galicia, BBVA, Provincia)
    let nImp = 0, nNeg = 0;
    for (const r of rows) {
      const ld = leadingDateEx(r.text, ref); if (!ld) continue;
      const am = amountsFmt(r.text, fmt).filter(a => a.index >= ld.len); if (!am.length) continue;
      const imp = am.length >= 2 ? am[am.length - 2] : am[0]; nImp++; if (imp.value < 0) nNeg++;
    }
    const docSigned = nImp > 0 && nNeg / nImp >= 0.1;
    const cuentas = [];
    let cur = null, lastIdx = -10;
    const open = (idx, saldoIni) => {
      let label = '';
      for (let j = idx; j >= Math.max(0, idx - 10); j--) { const t = rows[j].text; if (RE_CUENTA.test(t) && !/SALDO|FECHA/i.test(t)) { label = t.replace(/\s{2,}/g, ' ').trim().slice(0, 70); break; } }
      cur = { cuenta: label, nro: nroCuentaCerca(rows, idx), saldoIni, saldoFinDecl: null, movimientos: [], prevSaldo: saldoIni };
      cuentas.push(cur);
    };
    if (!hasIni) open(0, null);

    rows.forEach((row, idx) => {
      const t = row.text;
      if (RE_INI.test(t)) { const am = amountsFmt(t, fmt); open(idx, am.length ? am[am.length - 1].value : null); return; }
      if (!cur) return;
      if (RE_FIN.test(t) && !(leadingDateEx(t, ref) && !/SALDO/i.test(t))) {
        const am = amountsFmt(t, fmt);
        if (am.length) { cur.saldoFinDecl = am[am.length - 1].value; if (hasIni) cur = null; }
        return;
      }
      const ld = leadingDateEx(t, ref);
      const ams = rowAmountsFmt(row, fmt).filter(a => !ld || a.index >= ld.len);
      if (!ld) { // continuación de descripción
        const tt = t.replace(/[_─=]+/g, ' ').trim();
        if (tt && !ams.length && cur.movimientos.length && idx === lastIdx + 1 && tt.length < 70 && !RE_NO_CONT.test(tt)) {
          cur.movimientos[cur.movimientos.length - 1].descripcion += ' ' + tt; lastIdx = idx;
        }
        return;
      }
      if (!ams.length) return;
      let importe = null, saldo = null; const flags = [];
      if (hx && ams.every(a => a.x != null)) {
        for (const a of ams) {
          const col = nearest(a.x, hx);
          if (col === 0) importe = -Math.abs(a.value); else if (col === 1) importe = (/-/.test(a.raw) && fmt === 'ar' ? a.value : Math.abs(a.value)); else saldo = a.value;
        }
        // columnas con signo propio (ej. Galicia: débitos ya vienen negativos)
      }
      if (importe == null) {
        const rawImp = ams.length >= 2 ? ams[ams.length - 2] : ams[0];
        if (ams.length >= 2) saldo = ams[ams.length - 1].value;
        const v = Math.abs(rawImp.value), signed = rawImp.value < 0;
        if (signed) importe = rawImp.value;
        else if (saldo != null && cur.prevSaldo != null) {
          const delta = r2(saldo - cur.prevSaldo);
          if (Math.abs(Math.abs(delta) - v) < 0.02) importe = delta >= 0 ? v : -v;
        }
        if (importe == null) {
          // montos sin signo en extracto que sí usa signo para débitos → crédito
          importe = docSigned ? v : (CRED_HINT.test(t) ? v : -v);
          if (!docSigned) flags.push('Signo inferido por texto');
        }
        if (signed) flags._signed = true;
      }
      if (saldo != null && cur.prevSaldo != null && Math.abs(r2(cur.prevSaldo + importe - saldo)) > 0.02) flags.push('Saldo no encadena');
      if (saldo != null) cur.prevSaldo = saldo; else if (cur.prevSaldo != null) cur.prevSaldo = r2(cur.prevSaldo + importe);
      const desc = t.slice(ld.len, ams[0].index).replace(/[_─=]{2,}/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[A-Z]\s+(?=\S)/, '');
      const mv = { fecha: ld.iso, descripcion: desc, importe: r2(importe), saldo, categoria: '', cuenta: '', flags: flags.slice() };
      if (flags._signed) mv._signed = true;
      cur.movimientos.push(mv);
      lastIdx = idx;
    });

    const banco = detectBank(full);
    const out = cuentas.filter(c => c.movimientos.length || c.saldoIni != null).map(c => {
      // Sin "saldo anterior": se deduce del primer movimiento con saldo impreso
      if (c.saldoIni == null) {
        let acc = 0;
        for (const m of c.movimientos) { acc += m.importe; if (m.saldo != null) { c.saldoIni = r2(m.saldo - acc); break; } }
        // re-validar encadenamiento desde el saldo deducido
        let p = c.saldoIni;
        for (const m of c.movimientos) {
          m.flags = m.flags.filter(f => f !== 'Saldo no encadena');
          if (p != null && m.saldo != null && Math.abs(r2(p + m.importe - m.saldo)) > 0.02) m.flags.push('Saldo no encadena');
          p = m.saldo != null ? m.saldo : (p != null ? r2(p + m.importe) : null);
        }
      }
      let saldoFinDecl = c.saldoFinDecl, finOrigen = 'declarado';
      if (saldoFinDecl == null) { const ls = [...c.movimientos].reverse().find(m => m.saldo != null); if (ls) { saldoFinDecl = ls.saldo; finOrigen = 'último saldo impreso'; } }
      for (const m of c.movimientos) {
        delete m._signed;
        const r = reglas.find(r => r.re.test(m.descripcion));
        m.categoria = r ? r.cat : 'A clasificar';
        m.cuenta = r ? (m.importe < 0 ? r.cd : r.cc) : 'A clasificar';
        if (!r) m.flags.push('Sin categoría');
      }
      const saldoCalc = c.saldoIni != null ? r2(c.saldoIni + c.movimientos.reduce((s, m) => s + m.importe, 0)) : null;
      return { banco, cuenta: c.cuenta, nro: c.nro, saldoIni: c.saldoIni, saldoFinDecl, finOrigen, saldoCalc, movimientos: c.movimientos, formato: fmt };
    });
    // Compatibilidad: primera cuenta en el nivel raíz
    const first = out[0] || { banco, cuenta: '', saldoIni: null, saldoFinDecl: null, saldoCalc: null, movimientos: [] };
    return Object.assign({}, first, { cuentas: out });
  }

  function bankEntries(st, cuentaBanco, leyenda) {
    cuentaBanco = cuentaBanco || 'Banco c/c';
    const fechaFin = st.movimientos.map(m => m.fecha).sort().pop() || '';
    const grupos = {};
    for (const m of st.movimientos) {
      const k = (m.importe < 0 ? 'D' : 'C') + '|' + m.cuenta;
      grupos[k] = grupos[k] || { sentido: m.importe < 0 ? 'D' : 'C', cuenta: m.cuenta, total: 0, n: 0 };
      grupos[k].total = r2(grupos[k].total + Math.abs(m.importe)); grupos[k].n++;
    }
    const rows = []; let nro = 1;
    // Un asiento para egresos y otro para ingresos (más fácil de revisar y cargar)
    const egr = Object.values(grupos).filter(g => g.sentido === 'D'), ing = Object.values(grupos).filter(g => g.sentido === 'C');
    if (egr.length) {
      const tot = r2(egr.reduce((s, g) => s + g.total, 0));
      egr.forEach(g => rows.push({ asiento: nro, fecha: fechaFin, cuenta: g.cuenta, debe: g.total, haber: 0, leyenda: `${leyenda || 'Egresos bancarios'} (${g.n} mov.)` }));
      rows.push({ asiento: nro, fecha: fechaFin, cuenta: cuentaBanco, debe: 0, haber: tot, leyenda: leyenda || 'Egresos bancarios' }); nro++;
    }
    if (ing.length) {
      const tot = r2(ing.reduce((s, g) => s + g.total, 0));
      rows.push({ asiento: nro, fecha: fechaFin, cuenta: cuentaBanco, debe: tot, haber: 0, leyenda: leyenda || 'Ingresos bancarios' });
      ing.forEach(g => rows.push({ asiento: nro, fecha: fechaFin, cuenta: g.cuenta, debe: 0, haber: g.total, leyenda: `${leyenda || 'Ingresos bancarios'} (${g.n} mov.)` }));
    }
    return rows;
  }

  return {
    parseAR, r2, amountsIn, leadingDate, findDate, isoToAR, cuitValido, cuitsIn, fmtCuit,
    buildLines, linesFromText, rowAmounts,
    COD_NOMBRE, COD_LETRA, ALICUOTAS, nuevaFactura, parseInvoiceText, decodeAfipQR, applyQR, validarFacturas, sumaFactura,
    lidComprasCbte, lidComprasAlicuotas, exportLID, toDelimited, parseColumnTemplate, FACTURA_GETTERS,
    parseUserRules, RUBROS_TARJETA, detectCard, parseCardStatement, summarizeCards, addMonths,
    CATEGORIAS_BANCO, parseBankStatement, bankEntries, detectBank, detectNumFormat, leadingDateEx
  };
});
