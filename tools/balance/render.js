/* ImpoBot · Balance de Presentación RT 54 — salidas (modelo de documento → Excel / PDF / ZIP)
 * Navegador: usa window.ExcelJS, window.jspdf, window.JSZip · Node: se pasan las libs en `libs`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BalRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => Math.round(((+n || 0) + Number.EPSILON) * 100) / 100;
  const nz = n => (typeof n === 'number' && isFinite(n) ? n : 0);
  const fmt = n => {
    if (n == null || n === '') return '';
    if (typeof n !== 'number') return String(n);
    if (Math.abs(n) < 0.005) return '-';
    const s = Math.abs(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return n < 0 ? `(${s})` : s;
  };
  const GP = (v, pos, neg) => (v >= 0 ? pos : neg);

  // ════════════ Modelo de documento ════════════
  // Página: { hoja, titulo, sub, orient, cols:[{t,w,num}], rows:[{v:[], s, i}] , pie }
  // s: 'sec' (título de sección), 'n' (normal), 'sub' (subtotal), 'tot' (total), 'txt' (párrafo), 'h' (encabezado de tabla interna), 'blank'
  function documento(bal) {
    const D = bal.datos, M = bal.modelo, A = bal.anexos;
    const hayC = D.hayComp;
    const cierre = D.cierre || '[cierre]', cierreC = D.cierreComp || 'Ej. anterior';
    const encab = n => `${D.razonSocial || '[RAZÓN SOCIAL]'}`;
    const sub = (txt) => `${txt}${hayC ? ' comparativo con el ejercicio anterior' : ''}`;
    const monedaTxt = 'Cifras expresadas en moneda homogénea' + (D.moneda ? ` — ${D.moneda}` : ' — pesos');
    const pie = 'Las notas y anexos que se acompañan forman parte integrante de este estado.';
    const colsN = (w0) => [{ t: '', w: w0 || 62 }, { t: 'Nota/Anexo', w: 10 }, { t: cierre, w: 14, num: true }, ...(hayC ? [{ t: cierreC, w: 14, num: true }] : [])];
    const row = (label, act, comp, s, i, ref) => ({ v: [label, ref || '', act, ...(hayC ? [comp] : [])], s: s || 'n', i: i || 0 });
    const pages = [];

    // ── Carátula
    const car = [
      ['Denominación', D.razonSocial], ['CUIT', D.cuit], ['Domicilio legal', D.domicilio], ['Actividad principal', D.actividad],
      ['Inscripción del estatuto', D.inscripcion], ['Última modificación del estatuto', D.modificacion], ['Registro', D.registro], ['Duración', D.duracion],
      ['Ejercicio económico N°', D.nroEjercicio], ['Iniciado el', D.inicio], ['Cerrado el', D.cierre], ...(hayC ? [['Ejercicio comparativo', `${D.inicioComp || ''} al ${D.cierreComp || ''}`]] : []),
      ['Marco normativo', `RT 54 (NUA) — Modelo ${M.nombre}`]
    ];
    const capRows = (bal.metadata.capital || []).map(c => ({ v: [c.clase, c.cantidad, c.vn, c.suscripto, c.integrado], s: 'n' }));
    pages.push({ hoja: 'Carátula', titulo: 'ESTADOS CONTABLES', sub: `Ejercicio económico N° ${D.nroEjercicio || '[N°]'} iniciado el ${D.inicio || '[inicio]'} y finalizado el ${cierre}`, orient: 'p',
      cols: [{ t: '', w: 34 }, { t: '', w: 16, num: true }, { t: '', w: 16, num: true }, { t: '', w: 17, num: true }, { t: '', w: 17, num: true }],
      rows: [...car.map(([k, v]) => ({ v: [k, v || '[COMPLETAR]', '', '', ''], s: 'kv', falta: !v })),
        ...(capRows.length ? [{ v: ['', '', '', '', ''], s: 'blank' }, { v: ['COMPOSICIÓN DEL CAPITAL', '', '', '', ''], s: 'sec' },
          { v: ['Clase de acciones / cuotas', 'Cantidad', 'Valor nominal', 'Suscripto', 'Integrado'], s: 'h' }, ...capRows] : [])],
      capital: !!capRows.length });

    // ── ESP
    const E = bal.ESP, T = E.tot;
    const refBU = A.BU ? M.anexos.bu : '';
    const refDe = id => ({ anc_bu: refBU, ac_bcambio: A.CMV ? M.anexos.cmv : '', anc_bio: A.BIO && A.BIO.bio ? M.anexos.bio : '' }[id] || (bal.rubros[id] && bal.rubros[id].cuentas.length > 1 ? 'Nota 2' : ''));
    const esp = [];
    esp.push({ v: ['ACTIVO', '', '', ...(hayC ? [''] : [])], s: 'sec' });
    esp.push({ v: ['Activo corriente', '', '', ...(hayC ? [''] : [])], s: 'sub2' });
    E.AC.forEach(l => esp.push(row(l.label, l.act, l.comp, 'n', 1, refDe(l.id))));
    esp.push(row('Total del activo corriente', T.act.AC, T.comp.AC, 'sub'));
    esp.push({ v: ['Activo no corriente', '', '', ...(hayC ? [''] : [])], s: 'sub2' });
    E.ANC.forEach(l => esp.push(row(l.label, l.act, l.comp, 'n', 1, refDe(l.id))));
    esp.push(row('Total del activo no corriente', T.act.ANC, T.comp.ANC, 'sub'));
    esp.push(row('TOTAL DEL ACTIVO', T.act.A, T.comp.A, 'tot'));
    esp.push({ v: ['', '', '', ...(hayC ? [''] : [])], s: 'blank' });
    esp.push({ v: ['PASIVO', '', '', ...(hayC ? [''] : [])], s: 'sec' });
    esp.push({ v: ['Pasivo corriente', '', '', ...(hayC ? [''] : [])], s: 'sub2' });
    E.PC.forEach(l => esp.push(row(l.label, l.act, l.comp, 'n', 1, refDe(l.id))));
    esp.push(row('Total del pasivo corriente', T.act.PC, T.comp.PC, 'sub'));
    if (E.PNC.length) {
      esp.push({ v: ['Pasivo no corriente', '', '', ...(hayC ? [''] : [])], s: 'sub2' });
      E.PNC.forEach(l => esp.push(row(l.label, l.act, l.comp, 'n', 1, refDe(l.id))));
      esp.push(row('Total del pasivo no corriente', T.act.PNC, T.comp.PNC, 'sub'));
    }
    esp.push(row('TOTAL DEL PASIVO', T.act.P, T.comp.P, 'tot'));
    esp.push({ v: ['', '', '', ...(hayC ? [''] : [])], s: 'blank' });
    esp.push(row('PATRIMONIO NETO (según estado respectivo)', T.act.PN, T.comp.PN, 'tot'));
    esp.push(row('TOTAL DEL PASIVO Y PATRIMONIO NETO', T.act.PyPN, T.comp.PyPN, 'tot'));
    pages.push({ hoja: 'ESP', titulo: 'ESTADO DE SITUACIÓN PATRIMONIAL', sub: sub(`al ${cierre}`), orient: 'p', cols: colsN(), rows: esp, pie, moneda: monedaTxt, entidad: encab() });

    // ── ER
    const R = bal.ER, Lr = id => R.lineas.find(x => x.id === id);
    const er = [];
    const addL = id => { const l = Lr(id); if (l && (l.act || l.comp)) er.push(row(l.label, l.act, l.comp, 'n', 0, id === 'er_cmv' && A.CMV ? M.anexos.cmv : (id === 'er_gcom' || id === 'er_gadm') && A.GASTOS ? M.anexos.gastos : '')); };
    addL('er_ventas'); addL('er_cmv');
    er.push(row(GP(R.bruto.act, 'Ganancia bruta', 'Pérdida bruta'), R.bruto.act, R.bruto.comp, 'sub'));
    if (R.agro) { addL('er_agro_prod'); addL('er_agro_ten'); }
    addL('er_gcom'); addL('er_gadm'); addL('er_gotros'); addL('er_rinv'); addL('er_rfin'); addL('er_otros');
    er.push(row(GP(R.antesIG.act, 'Ganancia antes del impuesto a las ganancias', 'Pérdida antes del impuesto a las ganancias'), R.antesIG.act, R.antesIG.comp, 'sub'));
    addL('er_ig');
    er.push(row(GP(R.resNeto.act, 'GANANCIA DEL EJERCICIO', 'PÉRDIDA DEL EJERCICIO'), R.resNeto.act, R.resNeto.comp, 'tot'));
    pages.push({ hoja: 'ER', titulo: 'ESTADO DE RESULTADOS', sub: sub(`por el ejercicio finalizado el ${cierre}`), orient: 'p', cols: colsN(), rows: er, pie, moneda: monedaTxt, entidad: encab() });

    // ── EEPN
    const P = bal.EEPN;
    const usadas = P.columnas.filter(c => ['pn_capital', 'pn_ajuste', 'pn_rlegal', 'pn_rna'].includes(c.id) || P.filas.some(f => nz(f.v[c.id])));
    const aport = usadas.filter(c => ['pn_capital', 'pn_ajuste', 'pn_aportes', 'pn_primas'].includes(c.id));
    const acum = usadas.filter(c => ['pn_rlegal', 'pn_otras_res', 'pn_rna'].includes(c.id));
    const eCols = [{ t: 'Concepto', w: 30 }, ...aport.map(c => ({ t: c.label, w: 14, num: true })), { t: 'Total aportes', w: 14, num: true },
      ...acum.map(c => ({ t: c.label, w: 14, num: true })), { t: 'Total resultados acumulados', w: 14, num: true }, { t: `Total al ${cierre}`, w: 14, num: true }, ...(hayC ? [{ t: `Total al ${cierreC}`, w: 14, num: true }] : [])];
    const pnRows = [];
    const compV = { 'Saldos al inicio del ejercicio': P.comparativo.inicio, 'Resultado del ejercicio': P.comparativo.resultado, 'Saldos al cierre del ejercicio': P.comparativo.cierre };
    for (const f of P.filas) {
      if (f.opcional && Math.abs(f.total) < 0.01 && !usadas.some(c => Math.abs(nz(f.v[c.id])) > 0.01)) continue;
      const ta = r2(aport.reduce((s, c) => s + nz(f.v[c.id]), 0)), tr = r2(acum.reduce((s, c) => s + nz(f.v[c.id]), 0));
      pnRows.push({ v: [f.label + (f.revisar && !D.modoFinal ? ' [REVISAR]' : ''), ...aport.map(c => nz(f.v[c.id])), ta, ...acum.map(c => nz(f.v[c.id])), tr, r2(ta + tr), ...(hayC ? [compV[f.label] != null ? compV[f.label] : null] : [])], s: f.total_ ? 'tot' : 'n', revisar: f.revisar });
    }
    pages.push({ hoja: 'EEPN', titulo: 'ESTADO DE EVOLUCIÓN DEL PATRIMONIO NETO', sub: sub(`por el ejercicio finalizado el ${cierre}`), orient: 'l', cols: eCols, rows: pnRows, pie, moneda: monedaTxt, entidad: encab() });

    // ── EFE
    const F = bal.EFE;
    const efe = [];
    const ant = F.anterior || {};
    const a = k => (hayC ? [ant[k] != null ? ant[k] : null] : []);
    if (F.manual) {
      for (const [k, v] of Object.entries(F.datos)) { if (/\|ant$/.test(k)) continue; const cab = /^ACTIVIDADES|^Actividades/.test(k); efe.push({ v: [k, '', cab ? '' : v, ...(hayC ? [F.datos[k + ' |ant'] != null ? F.datos[k + ' |ant'] : (ant[k] != null ? ant[k] : null)] : [])], s: cab ? 'sec' : 'n', i: cab ? 0 : 1 }); }
    } else {
      efe.push({ v: ['VARIACIONES DEL EFECTIVO', '', '', ...(hayC ? [''] : [])], s: 'sec' });
      efe.push(row('Efectivo al inicio del ejercicio', F.inicio, ant['Efectivo al inicio del ejercicio anterior'] != null ? ant['Efectivo al inicio del ejercicio anterior'] : null, 'n', 1));
      efe.push(row('Efectivo al cierre del ejercicio', F.cierre, ant['Efectivo al cierre del ejercicio anterior'] != null ? ant['Efectivo al cierre del ejercicio anterior'] : null, 'n', 1));
      const va = ant['Efectivo al cierre del ejercicio anterior'] != null && ant['Efectivo al inicio del ejercicio anterior'] != null ? r2(ant['Efectivo al cierre del ejercicio anterior'] - ant['Efectivo al inicio del ejercicio anterior']) : null;
      efe.push(row(GP(F.variacion, 'Aumento neto del efectivo', 'Disminución neta del efectivo'), F.variacion, va, 'sub'));
      efe.push({ v: ['', '', '', ...(hayC ? [''] : [])], s: 'blank' });
      efe.push({ v: ['CAUSAS DE LAS VARIACIONES DEL EFECTIVO', '', '', ...(hayC ? [''] : [])], s: 'sec' });
      const mapAnt = { 'Resultado neto del ejercicio': 'Resultado neto del ejercicio anterior', 'Depreciaciones y amortizaciones': 'Depreciaciones y amortizaciones',
        '(Aumento) / disminución de créditos por ventas': 'Cambio en cuentas por cobrar', '(Aumento) / disminución de bienes de cambio': 'Cambio en bienes de cambio',
        'Aumento / (disminución) de cargas fiscales': 'Cambio en deudas comerciales y fiscales', '(Aumento) / disminución de otros créditos': 'Cambio en otros activos corrientes',
        'Aumento / (disminución) de anticipos de clientes y otras deudas': 'Cambio en otros pasivos corrientes', 'Adquisiciones netas de bienes de uso': 'Cambio en activos no corrientes',
        'Aumento / (disminución) de préstamos': 'Cambio en pasivos no corrientes', 'Aportes de capital, dividendos pagados y otros movimientos del PN': 'Cambio en patrimonio neto (excluido el resultado)' };
      const bloque = (titulo, arr, tot, tituloTot) => {
        efe.push({ v: [titulo, '', '', ...(hayC ? [''] : [])], s: 'sub2' });
        arr.forEach(([k, v]) => { if (Math.abs(v) < 0.005 && k !== 'Resultado neto del ejercicio') return; const cv = k === 'Resultado neto del ejercicio' ? (ant[mapAnt[k]] != null ? ant[mapAnt[k]] : bal.ER.resNeto.comp) : (ant[mapAnt[k]] != null ? ant[mapAnt[k]] : null); efe.push(row(k, v, cv, 'n', 1)); });
        efe.push(row(tituloTot, tot, null, 'sub'));
      };
      bloque('Actividades operativas', F.operativas, F.tOp, GP(F.tOp, 'Flujo neto de efectivo generado por las actividades operativas', 'Flujo neto de efectivo utilizado en las actividades operativas'));
      bloque('Actividades de inversión', F.inversion, F.tInv, GP(F.tInv, 'Flujo neto de efectivo generado por las actividades de inversión', 'Flujo neto de efectivo utilizado en las actividades de inversión'));
      bloque('Actividades de financiación', F.financiacion, F.tFin, GP(F.tFin, 'Flujo neto de efectivo generado por las actividades de financiación', 'Flujo neto de efectivo utilizado en las actividades de financiación'));
      efe.push(row(GP(F.varCausas, 'AUMENTO NETO DEL EFECTIVO', 'DISMINUCIÓN NETA DEL EFECTIVO'), F.varCausas, va, 'tot'));
    }
    const efePie = F.manual ? pie : `${pie} Método ${F.metodo}. Se considera efectivo a Caja y bancos${F.eqEfvo ? ' e inversiones de corto plazo (equivalentes de efectivo)' : ''}.`;
    pages.push({ hoja: 'EFE', titulo: 'ESTADO DE FLUJO DE EFECTIVO', sub: sub(`por el ejercicio finalizado el ${cierre}`), orient: 'p', cols: colsN(), rows: efe, pie: efePie, moneda: monedaTxt, entidad: encab() });

    // ── Notas
    const nt = [];
    bal.NOTAS.forEach((n, ix) => {
      nt.push({ v: [`NOTA ${ix + 1} — ${n.titulo.toUpperCase()}`, '', '', ...(hayC ? [''] : [])], s: 'sec' });
      if (n.texto != null) for (const p of String(n.texto).split('\n')) nt.push({ v: [p, '', '', ...(hayC ? [''] : [])], s: 'txt', falta: /\[COMPLETAR\]/.test(p) });
      if (n.tabla) for (const t of n.tabla) {
        nt.push({ v: [t.rubro, '', '', ...(hayC ? [''] : [])], s: 'sub2' });
        t.cuentas.forEach(c => nt.push(row(c.nombre, c.act, c.comp, 'n', 1)));
        nt.push(row('Total', t.act, t.comp, 'sub'));
      }
      if (n.capital) n.capital.forEach(c => nt.push({ v: [`${c.clase}: ${fmt(c.cantidad).replace(',00', '')} de V/N $ ${fmt(c.vn)}`, '', c.suscripto, ...(hayC ? [null] : [])], s: 'n', i: 1 }));
      if (n.distribucion) {
        nt.push({ v: ['El órgano de administración propone la siguiente distribución del resultado del ejercicio:', '', '', ...(hayC ? [''] : [])], s: 'txt' });
        nt.push(row('Resultado del ejercicio', n.resultado, null, 'n', 1));
        let resto = n.resultado;
        n.distribucion.forEach(d => { nt.push(row(`A ${d.concepto.replace(/^A\s+/i, '')}`, -d.monto, null, 'n', 1)); resto -= d.monto; });
        nt.push(row('A Resultados no asignados', r2(resto), null, 'sub'));
      }
      nt.push({ v: ['', '', '', ...(hayC ? [''] : [])], s: 'blank' });
    });
    pages.push({ hoja: 'Notas', titulo: 'NOTAS A LOS ESTADOS CONTABLES', sub: sub(`correspondientes al ejercicio finalizado el ${cierre}`), orient: 'p', cols: colsN(), rows: nt, moneda: monedaTxt, entidad: encab() });

    // ── Anexo Bienes de uso
    if (A.BU) {
      const red = !!A.BU._reducido;
      const cols = red ? [{ t: 'Rubro', w: 40 }, { t: 'Valor de origen al cierre', w: 16, num: true }, { t: 'Depreciación acumulada al cierre', w: 16, num: true }, { t: `Neto al ${cierre}`, w: 16, num: true }, ...(hayC ? [{ t: `Neto al ${cierreC}`, w: 16, num: true }] : [])]
        : [{ t: 'Rubro', w: 26 }, { t: 'Valor al inicio', w: 11, num: true }, { t: 'Altas', w: 10, num: true }, { t: 'Bajas', w: 10, num: true }, { t: 'Transf.', w: 9, num: true }, { t: 'Revalúo', w: 9, num: true }, { t: 'Valor al cierre', w: 11, num: true },
          { t: 'Dep. acum. al inicio', w: 11, num: true }, { t: 'Bajas', w: 9, num: true }, { t: 'Transf.', w: 9, num: true }, { t: 'Del ejercicio', w: 10, num: true }, { t: 'Revalúo', w: 9, num: true }, { t: 'Dep. acum. al cierre', w: 11, num: true },
          { t: 'Desvalorización', w: 10, num: true }, { t: `Neto al ${cierre}`, w: 11, num: true }, ...(hayC ? [{ t: `Neto al ${cierreC}`, w: 11, num: true }] : [])];
      const k = red ? ['valor_bruto_cierre', 'dep_acum_cierre', 'neto_actual', ...(hayC ? ['neto_comparativo'] : [])]
        : ['valor_bruto_inicio', 'altas', 'bajas', 'transferencias', 'revaluo', 'valor_bruto_cierre', 'dep_acum_inicio', 'dep_acum_bajas', 'dep_acum_transferencias', 'dep_ejercicio', 'dep_revaluo', 'dep_acum_cierre', 'perdidas_desvalorizacion', 'neto_actual', ...(hayC ? ['neto_comparativo'] : [])];
      const rows = A.BU.map(x => ({ v: [x.categoria, ...k.map(c => nz(x[c]))], s: 'n' }));
      rows.push({ v: ['Totales', ...k.map(c => r2(A.BU.reduce((s, x) => s + nz(x[c]), 0)))], s: 'tot' });
      pages.push({ hoja: 'Anexo BU', titulo: `${M.anexos.bu.toUpperCase()} — BIENES DE USO`, sub: sub(`al ${cierre}`), orient: red ? 'p' : 'l', cols, rows, moneda: monedaTxt, entidad: encab(),
        pie: red ? 'Anexo reducido generado desde las cuentas contables: cargá el template anexo_bienes_uso para exponer altas, bajas y depreciaciones del ejercicio.' : '' });
    }
    // ── Anexo CMV
    if (A.CMV) {
      const C = A.CMV;
      const rr = (l, k, s) => row(l, C.act[k], C.comp[k], s || 'n', s ? 0 : 1);
      const rows = [rr('Existencia inicial', 'ei'), rr('Compras del ejercicio', 'compras'), ...(C.act.prod || C.comp.prod ? [rr('Costo de producción', 'prod')] : []), rr('Existencia final', 'ef'), rr('COSTO DE LOS BIENES VENDIDOS', 'cv', 'tot')];
      rows.forEach(r => { if (r.v[0] === 'Existencia final') { r.v[2] = -nz(r.v[2]); if (hayC) r.v[3] = r.v[3] == null ? null : -nz(r.v[3]); } });
      pages.push({ hoja: 'Anexo CMV', titulo: `${M.anexos.cmv.toUpperCase()} — COSTO DE LOS BIENES VENDIDOS`, sub: sub(`por el ejercicio finalizado el ${cierre}`), orient: 'p', cols: colsN(), rows, moneda: monedaTxt, entidad: encab(),
        pie: C.fuente === 'deducido' ? 'Anexo deducido: existencias según Bienes de cambio y compras por diferencia. Cargá el template anexo_cmv para exponer los importes reales.' : '' });
    }
    // ── Anexo Gastos
    if (A.GASTOS) {
      const fs = A.GASTOS.filas;
      const usa = c => fs.some(x => x[c] || x[c + '_comp']);
      const fn = ['costo_servicios', 'comercializacion', 'administracion', 'gastos_financiacion'].filter(usa);
      const lbl = { costo_servicios: 'Costo de servicios', comercializacion: 'Gastos de comercialización', administracion: 'Gastos de administración', gastos_financiacion: 'Gastos de financiación' };
      const cols = [{ t: 'Rubro', w: 38 }, ...fn.map(c => ({ t: lbl[c], w: 15, num: true })), { t: `Total al ${cierre}`, w: 15, num: true }, ...(hayC ? [{ t: `Total al ${cierreC}`, w: 15, num: true }] : [])];
      const rows = fs.map(x => ({ v: [x.concepto, ...fn.map(c => x[c]), r2(fn.reduce((s, c) => s + nz(x[c]), 0)), ...(hayC ? [r2(fn.reduce((s, c) => s + nz(x[c + '_comp']), 0))] : [])], s: 'n' }));
      rows.push({ v: ['Totales', ...fn.map(c => r2(fs.reduce((s, x) => s + nz(x[c]), 0))), r2(fs.reduce((s, x) => s + fn.reduce((t, c) => t + nz(x[c]), 0), 0)), ...(hayC ? [r2(fs.reduce((s, x) => s + fn.reduce((t, c) => t + nz(x[c + '_comp']), 0), 0))] : [])], s: 'tot' });
      pages.push({ hoja: 'Anexo Gastos', titulo: `${M.anexos.gastos.toUpperCase()} — INFORMACIÓN REQUERIDA POR EL ART. 64 INC. I) b) DE LA LEY 19.550`, sub: sub(`por el ejercicio finalizado el ${cierre}`), orient: 'l', cols, rows, moneda: monedaTxt, entidad: encab() });
    }
    // ── Anexo activos biológicos (Agro)
    if (A.BIO && A.BIO.bio) {
      const k = ['valor_bruto_inicio', 'altas', 'bajas', 'transferencias', 'valor_bruto_cierre', 'dep_acum_inicio', 'dep_ejercicio', 'dep_acum_cierre', 'neto_actual', ...(hayC ? ['neto_comparativo'] : [])];
      const t = { valor_bruto_inicio: 'Valor al inicio', altas: 'Altas', bajas: 'Bajas', transferencias: 'Transf.', valor_bruto_cierre: 'Valor al cierre', dep_acum_inicio: 'Dep. acum. inicio', dep_ejercicio: 'Dep. del ejercicio', dep_acum_cierre: 'Dep. acum. cierre', neto_actual: `Neto al ${cierre}`, neto_comparativo: `Neto al ${cierreC}` };
      const rows = A.BIO.bio.map(x => ({ v: [x.categoria, ...k.map(c => nz(x[c]))], s: 'n' }));
      rows.push({ v: ['Totales', ...k.map(c => r2(A.BIO.bio.reduce((s, x) => s + nz(x[c]), 0)))], s: 'tot' });
      pages.push({ hoja: 'Anexo Biológicos', titulo: `${M.anexos.bio.toUpperCase()} — ACTIVOS BIOLÓGICOS (FACTOR DE PRODUCCIÓN)`, sub: sub(`al ${cierre}`), orient: 'l', cols: [{ t: 'Categoría', w: 26 }, ...k.map(c => ({ t: t[c], w: 12, num: true }))], rows, moneda: monedaTxt, entidad: encab() });
    }
    if (A.BIO && A.BIO.costos) {
      const cs = A.BIO.costos;
      const rows = cs.filter(c => c.agricola || c.pecuaria).map(c => ({ v: [c.concepto.replace(/_/g, ' ').replace(/^./, m => m.toUpperCase()), c.agricola, c.pecuaria, r2(c.agricola + c.pecuaria)], s: 'n' }));
      rows.push({ v: ['Totales', r2(cs.reduce((s, c) => s + c.agricola, 0)), r2(cs.reduce((s, c) => s + c.pecuaria, 0)), r2(cs.reduce((s, c) => s + c.agricola + c.pecuaria, 0))], s: 'tot' });
      pages.push({ hoja: 'Costos Agro', titulo: 'COSTOS DE PRODUCCIÓN AGROPECUARIA POR ACTIVIDAD', sub: `por el ejercicio finalizado el ${cierre}`, orient: 'p', cols: [{ t: 'Concepto', w: 50 }, { t: 'Agrícola', w: 16, num: true }, { t: 'Pecuaria', w: 16, num: true }, { t: 'Total', w: 16, num: true }], rows, moneda: monedaTxt, entidad: encab() });
    }
    return pages;
  }

  // ════════════ Excel (ExcelJS) ════════════
  async function excel(bal, pages, mapeoFilas, ExcelJS) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ImpoBot'; wb.created = new Date();
    const NF = '#,##0.00;(#,##0.00);"-"';
    const AZUL = 'FF0B3D5C', GRIS = 'FFEFF3F7', AMAR = 'FFFFF2B3';
    for (const p of pages) {
      const ws = wb.addWorksheet(p.hoja.slice(0, 31), { pageSetup: { paperSize: 9, orientation: p.orient === 'l' ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
        views: [{ showGridLines: false }] });
      const n = p.cols.length;
      ws.columns = p.cols.map(c => ({ width: Math.max(8, Math.round((c.w || 12) * (p.hoja === 'Carátula' ? 0.9 : 0.95))) }));
      let r = 1;
      const merge = (row, txt, font, align) => { ws.mergeCells(row, 1, row, n); const c = ws.getCell(row, 1); c.value = txt; c.font = font; c.alignment = Object.assign({ horizontal: 'center', vertical: 'middle', wrapText: true }, align || {}); };
      if (p.entidad) merge(r++, p.entidad, { bold: true, size: 12, color: { argb: AZUL } });
      merge(r++, p.titulo, { bold: true, size: 13, color: { argb: AZUL } });
      if (p.sub) merge(r++, p.sub, { italic: true, size: 10 });
      if (p.moneda) merge(r++, p.moneda, { size: 9, color: { argb: 'FF5D6B7A' } });
      if (!bal.datos.modoFinal) { merge(r++, 'BORRADOR — no apto para presentación', { bold: true, size: 9, color: { argb: 'FFB42318' } }); }
      r++;
      if (p.hoja !== 'Carátula') {
        const h = ws.getRow(r++);
        p.cols.forEach((c, i) => { const cell = h.getCell(i + 1); cell.value = c.t; cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }; cell.alignment = { horizontal: c.num ? 'right' : 'left', vertical: 'middle', wrapText: true }; });
        h.height = p.orient === 'l' ? 32 : 18;
      }
      for (const rw of p.rows) {
        const row = ws.getRow(r);
        if (rw.s === 'txt' || rw.s === 'sec' || rw.s === 'sub2') {
          ws.mergeCells(r, 1, r, n);
          const c = row.getCell(1); c.value = rw.v[0];
          c.font = rw.s === 'sec' ? { bold: true, size: 10, color: { argb: AZUL } } : rw.s === 'sub2' ? { bold: true, italic: true, size: 9.5 } : { size: 9.5 };
          c.alignment = { wrapText: true, vertical: 'top' };
          if (rw.s === 'txt') row.height = Math.max(15, Math.ceil(String(rw.v[0]).length / (p.cols.reduce((s, x) => s + x.w, 0) * 1.1)) * 13);
          if (rw.falta) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMAR } };
          r++; continue;
        }
        if (rw.s === 'kv') {
          ws.mergeCells(r, 2, r, n);
          const k = row.getCell(1), v = row.getCell(2);
          k.value = rw.v[0]; k.font = { bold: true, size: 9.5 }; v.value = rw.v[1]; v.font = { size: 9.5 }; v.alignment = { horizontal: 'left', wrapText: true };
          if (rw.falta) v.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMAR } };
          r++; continue;
        }
        rw.v.forEach((v, i) => {
          const c = row.getCell(i + 1); c.value = v === '' ? null : v;
          const numCol = (p.cols[i] && p.cols[i].num) || (p.capital && rw.s === 'n' && i >= 1);
          if (typeof v === 'number') { c.numFmt = (p.capital && i === 1) ? '#,##0' : NF; c.alignment = { horizontal: 'right' }; }
          if (i === 0 && rw.i) c.alignment = { indent: rw.i };
          c.font = { size: 9.5, bold: rw.s === 'tot' || rw.s === 'sub' || rw.s === 'h' || (rw.s === 'kv' && i === 0) };
          if (rw.s === 'sub' && (numCol || typeof v === 'number')) c.border = { top: { style: 'thin' } };
          if (rw.s === 'tot' && (numCol || typeof v === 'number' || i === 0)) { c.border = { top: { style: 'thin' }, bottom: { style: 'double' } }; }
          if (rw.s === 'tot') c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } };
          if (rw.s === 'h') { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }; }
          if ((rw.falta && i === 1) || (rw.revisar && i === 0 && !bal.datos.modoFinal)) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMAR } };
        });
        r++;
      }
      if (p.pie) { r++; ws.mergeCells(r, 1, r, n); const c = ws.getCell(r, 1); c.value = p.pie; c.font = { italic: true, size: 8.5, color: { argb: 'FF5D6B7A' } }; c.alignment = { wrapText: true }; ws.getRow(r).height = 24; r++; }
      if (p.hoja !== 'Carátula' && p.hoja !== 'Notas') {
        r += 2; ws.mergeCells(r, 1, r, n);
        const c = ws.getCell(r, 1);
        c.value = firma(bal.datos); c.font = { size: 8.5 }; c.alignment = { horizontal: 'right', wrapText: true }; ws.getRow(r).height = 36;
      }
    }
    // Mapeo
    const wm = wb.addWorksheet('Mapeo de cuentas');
    wm.columns = [{ header: 'Código', width: 12 }, { header: 'Cuenta', width: 46 }, { header: 'Saldo actual (deudor + / acreedor −)', width: 20 }, { header: 'Saldo comparativo reexpresado', width: 20 }, { header: 'Rubro RT 54', width: 44 }];
    wm.getRow(1).font = { bold: true };
    for (const m of mapeoFilas) { const rr = wm.addRow([m.codigo, m.nombre, m.act, m.comp, m.rubro]); rr.getCell(3).numFmt = NF; rr.getCell(4).numFmt = NF; }
    // Validaciones
    const wv = wb.addWorksheet('Validaciones');
    wv.columns = [{ header: 'Tipo', width: 16 }, { header: 'Detalle', width: 110 }, { header: 'Diferencia', width: 16 }];
    wv.getRow(1).font = { bold: true };
    const rep = bal.reporte;
    rep.controles.forEach(c => { const rr = wv.addRow([c.ok ? 'Control OK' : 'Control ✗', c.control, c.diferencia]); rr.getCell(3).numFmt = NF; rr.getCell(1).font = { bold: true, color: { argb: c.ok ? 'FF127A3E' : 'FFB42318' } }; });
    rep.errores.forEach(t => wv.addRow(['Error', t]).getCell(1).font = { bold: true, color: { argb: 'FFB42318' } });
    rep.advertencias.forEach(t => wv.addRow(['Advertencia', t]).getCell(1).font = { bold: true, color: { argb: 'FF9A5B00' } });
    rep.faltantes.forEach(t => wv.addRow(['Dato faltante', t]));
    rep.info.forEach(t => wv.addRow(['Información', t]));
    wv.getColumn(2).alignment = { wrapText: true };
    return wb.xlsx.writeBuffer();
  }
  function firma(D) {
    const c = D.contador ? `${D.contador}${D.tomo || D.folio ? ` — ${D.consejo || 'C.P.C.E.'} T° ${D.tomo || '…'} F° ${D.folio || '…'}` : ''}` : '[Contador Público — T° F°]';
    return `Firmado a los efectos de su identificación con mi informe de fecha ${D.fechaInforme || '[fecha]'}\n${c}`;
  }

  // ════════════ PDF (jsPDF + autotable) ════════════
  function pdf(bal, pages, jsPDFCtor) {
    const doc = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'p', compress: true });
    const AZUL = [11, 61, 92], GRIS = [239, 243, 247], AMAR = [255, 242, 179];
    const borr = !bal.datos.modoFinal;
    let first = true;
    for (const p of pages) {
      if (!first) doc.addPage('a4', p.orient === 'l' ? 'l' : 'p'); else if (p.orient === 'l') { doc.deletePage(1); doc.addPage('a4', 'l'); }
      first = false;
      const W = doc.internal.pageSize.getWidth();
      let y = 14;
      const center = (t, size, style, color) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor(...(color || [0, 0, 0])); const ls = doc.splitTextToSize(String(t), W - 24); doc.text(ls, W / 2, y, { align: 'center' }); y += ls.length * size * 0.42 + 1.2; };
      if (p.entidad) center(p.entidad, 11, 'bold', AZUL);
      center(p.titulo, 12, 'bold', AZUL);
      if (p.sub) center(p.sub, 9, 'italic');
      if (p.moneda) center(p.moneda, 8, 'normal', [93, 107, 122]);
      y += 2;
      const totW = p.cols.reduce((s, c) => s + (c.w || 10), 0), avail = W - 20;
      const colStyles = {}; p.cols.forEach((c, i) => { colStyles[i] = { cellWidth: (c.w || 10) / totW * avail, halign: c.num ? 'right' : 'left' }; });
      const body = p.rows.map(rw => {
        if (rw.s === 'txt' || rw.s === 'sec' || rw.s === 'sub2') return [{ content: rw.v[0], colSpan: p.cols.length, _s: rw.s, _falta: rw.falta }];
        if (rw.s === 'kv') return [{ content: rw.v[0], _s: 'kv' }, { content: rw.v[1] == null ? '' : String(rw.v[1]), colSpan: p.cols.length - 1, _s: 'kvv', _falta: rw.falta, styles: { halign: 'left' } }];
        return rw.v.map((v, i) => ({ content: typeof v === 'number' ? (p.capital && i === 1 ? String(v) : fmt(v)) : (v == null ? '' : String(v)), _s: rw.s, _i: i === 0 ? rw.i : 0, _num: typeof v === 'number', _falta: (rw.falta && i === 1) || (rw.revisar && i === 0 && borr) }));
      });
      const isCar = p.hoja === 'Carátula';
      doc.autoTable({
        startY: y, head: isCar ? undefined : [p.cols.map(c => c.t)], body, theme: 'plain', margin: { left: 10, right: 10, top: 14, bottom: 22 },
        styles: { font: 'helvetica', fontSize: p.cols.length > 13 ? 5.6 : p.orient === 'l' && p.cols.length > 10 ? 6.4 : 8.3, cellPadding: { top: 1, bottom: 1, left: 1.4, right: 1.4 }, overflow: 'linebreak', textColor: [20, 20, 20] },
        headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: p.cols.length > 13 ? 5.4 : p.orient === 'l' && p.cols.length > 10 ? 6.2 : 8 },
        columnStyles: colStyles,
        didParseCell: d => {
          if (d.section !== 'body') return;
          const raw = d.cell.raw || {}; const s = raw._s;
          if (s === 'sec') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = AZUL; d.cell.styles.fontSize += 0.6; }
          if (s === 'sub2') { d.cell.styles.fontStyle = 'bolditalic'; }
          if (s === 'sub' || s === 'h' || (s === 'kv' && d.column.index === 0)) d.cell.styles.fontStyle = 'bold';
          if (s === 'tot') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = GRIS; }
          if (s === 'h') d.cell.styles.fillColor = GRIS;
          if (raw._i) d.cell.styles.cellPadding = { top: 1, bottom: 1, left: 1.4 + 4 * raw._i, right: 1.4 };
          if (raw._num) { d.cell.styles.halign = 'right'; d.cell.styles.overflow = 'visible'; }
          if (raw._falta && borr) d.cell.styles.fillColor = AMAR;
          if (s === 'txt') { d.cell.styles.halign = 'justify'; }
        },
        didDrawCell: d => {
          if (d.section !== 'body') return;
          const raw = d.cell.raw || {}; const s = raw._s;
          const numCol = p.cols[d.column.index] && p.cols[d.column.index].num;
          if ((s === 'sub' || s === 'tot') && numCol && String(raw.content || '').trim() !== '') { doc.setDrawColor(40); doc.setLineWidth(0.2); doc.line(d.cell.x + 1, d.cell.y, d.cell.x + d.cell.width - 1, d.cell.y); if (s === 'tot') { const yb = d.cell.y + d.cell.height; doc.line(d.cell.x + 1, yb - 0.3, d.cell.x + d.cell.width - 1, yb - 0.3); doc.line(d.cell.x + 1, yb + 0.3, d.cell.x + d.cell.width - 1, yb + 0.3); } }
        }
      });
      let yf = doc.lastAutoTable.finalY + 4;
      const H = doc.internal.pageSize.getHeight();
      if (p.pie) { doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(93, 107, 122); const ls = doc.splitTextToSize(p.pie, W - 20); if (yf + ls.length * 3.2 > H - 24) { doc.addPage('a4', p.orient === 'l' ? 'l' : 'p'); yf = 16; } doc.text(ls, 10, yf); yf += ls.length * 3.2 + 2; }
      if (!isCar && p.hoja !== 'Notas') {
        const f = firma(bal.datos).split('\n');
        if (yf + 16 > H - 20) { doc.addPage('a4', p.orient === 'l' ? 'l' : 'p'); yf = 16; }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(40);
        const fl = f.flatMap(t => doc.splitTextToSize(t, 72)); doc.line(W - 86, yf + 10, W - 12, yf + 10); doc.text(fl, W - 49, yf + 14, { align: 'center' });
      }
    }
    // Pie de página y marca de agua en todas las páginas
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120);
      doc.text(`${bal.datos.razonSocial || '[Razón social]'} — Estados contables al ${bal.datos.cierre || '[cierre]'}`, 10, H - 8);
      doc.text(`Página ${i} de ${total}`, W - 10, H - 8, { align: 'right' });
      if (borr) {
        doc.saveGraphicsState && doc.saveGraphicsState();
        if (doc.GState) doc.setGState(new doc.GState({ opacity: 0.08 }));
        doc.setFont('helvetica', 'bold'); doc.setFontSize(70); doc.setTextColor(180, 35, 24);
        doc.text('BORRADOR', W / 2, H / 2, { align: 'center', angle: 35 });
        doc.restoreGraphicsState && doc.restoreGraphicsState();
      }
    }
    return doc.output('arraybuffer');
  }

  async function zip(bal, mapeoFilas, libs, extra) {
    const pages = documento(bal);
    const xbuf = await excel(bal, pages, mapeoFilas, libs.ExcelJS);
    const pbuf = pdf(bal, pages, libs.jsPDF);
    const json = JSON.stringify(libs.Engine.reporteJSON(bal, extra), null, 2);
    const z = new libs.JSZip();
    z.file('RT54_Presentacion.xlsx', xbuf); z.file('RT54_Presentacion.pdf', pbuf); z.file('rt54_reporte.json', json);
    return { zip: await z.generateAsync({ type: libs.node ? 'nodebuffer' : 'blob', compression: 'DEFLATE' }), xlsx: xbuf, pdf: pbuf, json, pages };
  }

  return { documento, excel, pdf, zip, fmt };
});
