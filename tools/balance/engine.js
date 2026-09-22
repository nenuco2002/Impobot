/* ImpoBot · Balance de Presentación RT 54 — motor
 * Puro (sin DOM). Recibe matrices de celdas (array de filas) ya leídas del Excel
 * y devuelve un modelo completo del balance + reporte de validaciones.
 * Navegador: window.BalEngine · Node: module.exports
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BalEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const r2 = n => Math.round(((+n || 0) + Number.EPSILON) * 100) / 100;
  const nz = n => (typeof n === 'number' && isFinite(n) ? n : 0);
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const EPS = 1;
  const fm = n => (+n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');   // tolerancia de cuadre ($1 por redondeos)

  // ───────────── Números y fechas ─────────────
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let t = String(v).replace(/ /g, ' ').replace(/[$\s]/g, '').replace(/[−–]/g, '-');
    if (!t || !/\d/.test(t)) return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
    if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
    const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
    if (lc > ld) t = t.replace(/\./g, '').replace(',', '.');
    else if (ld > lc) { if (lc === -1 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); else t = t.replace(/,/g, ''); }
    const n = parseFloat(t);
    return isNaN(n) ? null : (neg ? -n : n);
  }
  function fecha(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`;
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return fecha(d); }
    const m = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(String(v));
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`; }
    const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(String(v)); if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return String(v).trim();
  }

  // ───────────── Catálogo de rubros ─────────────
  // tipo: A activo · P pasivo · PN · R resultado ; signo de exposición: A = saldo, P/PN/R = −saldo
  const RUBROS = [
    ['ac_caja', 'A', 'AC', 'Caja y bancos'], ['ac_inv', 'A', 'AC', 'Inversiones'], ['ac_cred_ventas', 'A', 'AC', 'Créditos por ventas'],
    ['ac_otros_cred', 'A', 'AC', 'Otros créditos'], ['ac_bcambio', 'A', 'AC', 'Bienes de cambio'], ['ac_bio', 'A', 'AC', 'Activos biológicos', 'agro'], ['ac_otros', 'A', 'AC', 'Otros activos'],
    ['anc_cred_ventas', 'A', 'ANC', 'Créditos por ventas'], ['anc_otros_cred', 'A', 'ANC', 'Otros créditos'], ['anc_bcambio', 'A', 'ANC', 'Bienes de cambio'],
    ['anc_inv', 'A', 'ANC', 'Inversiones'], ['anc_bu', 'A', 'ANC', 'Bienes de uso'], ['anc_pi', 'A', 'ANC', 'Propiedades de inversión'], ['anc_intang', 'A', 'ANC', 'Activos intangibles'],
    ['anc_bio', 'A', 'ANC', 'Activos biológicos', 'agro'], ['anc_llave', 'A', 'ANC', 'Llave de negocio'], ['anc_otros', 'A', 'ANC', 'Otros activos'],
    ['pc_comerciales', 'P', 'PC', 'Deudas comerciales'], ['pc_prestamos', 'P', 'PC', 'Préstamos'], ['pc_remun', 'P', 'PC', 'Remuneraciones y cargas sociales'],
    ['pc_fiscales', 'P', 'PC', 'Cargas fiscales'], ['pc_anticipos', 'P', 'PC', 'Anticipos de clientes'], ['pc_dividendos', 'P', 'PC', 'Dividendos a pagar'],
    ['pc_otras', 'P', 'PC', 'Otras deudas'], ['pc_prev', 'P', 'PC', 'Previsiones'],
    ['pnc_comerciales', 'P', 'PNC', 'Deudas comerciales'], ['pnc_prestamos', 'P', 'PNC', 'Préstamos'], ['pnc_fiscales', 'P', 'PNC', 'Cargas fiscales'],
    ['pnc_otras', 'P', 'PNC', 'Otras deudas'], ['pnc_prev', 'P', 'PNC', 'Previsiones'],
    ['pn_capital', 'PN', 'PN', 'Capital suscripto'], ['pn_ajuste', 'PN', 'PN', 'Ajuste de capital'], ['pn_aportes', 'PN', 'PN', 'Aportes irrevocables'],
    ['pn_primas', 'PN', 'PN', 'Primas de emisión'], ['pn_rlegal', 'PN', 'PN', 'Reserva legal'], ['pn_otras_res', 'PN', 'PN', 'Otras reservas'],
    ['pn_rna', 'PN', 'PN', 'Resultados no asignados'], ['pn_resej', 'PN', 'PN', 'Resultado del ejercicio (asiento de cierre)'],
    ['er_ventas', 'R', 'ER', 'Ventas netas de bienes y servicios'], ['er_cmv', 'R', 'ER', 'Costo de los bienes vendidos y servicios prestados'],
    ['er_agro_prod', 'R', 'ER', 'Resultado por producción agropecuaria', 'agro'], ['er_agro_ten', 'R', 'ER', 'Resultado por tenencia de activos biológicos', 'agro'],
    ['er_gcom', 'R', 'ER', 'Gastos de comercialización'], ['er_gadm', 'R', 'ER', 'Gastos de administración'], ['er_gotros', 'R', 'ER', 'Otros gastos'],
    ['er_rinv', 'R', 'ER', 'Resultados de inversiones en entes relacionados'],
    ['er_rfin', 'R', 'ER', 'Resultados financieros y por tenencia (incluido RECPAM)'], ['er_otros', 'R', 'ER', 'Otros ingresos y egresos'],
    ['er_ig', 'R', 'ER', 'Impuesto a las ganancias'],
    ['excluir', 'X', 'X', '— Excluir (cuenta totalizadora / de orden) —']
  ].map(([id, tipo, grupo, label, soloModelo]) => ({ id, tipo, grupo, label, soloModelo: soloModelo || null }));
  const RUB = Object.fromEntries(RUBROS.map(r => [r.id, r]));
  const rubrosPara = modelo => RUBROS.filter(r => !r.soloModelo || r.soloModelo === modelo);

  // ───────────── Modelos ─────────────
  const MODELOS = {
    caba: { id: 'caba', nombre: 'CABA/PBA', consejo: 'Consejo Profesional de Ciencias Económicas de la Ciudad Autónoma de Buenos Aires / Provincia de Buenos Aires',
      anexos: { bu: 'Anexo I', intang: 'Anexo II', cmv: 'Anexo III', gastos: 'Anexo IV', bio: null } },
    cordoba: { id: 'cordoba', nombre: 'Córdoba', consejo: 'Consejo Profesional de Ciencias Económicas de Córdoba',
      anexos: { bu: 'Anexo I', intang: 'Anexo II', cmv: 'Anexo III', gastos: 'Anexo IV', bio: null } },
    agro: { id: 'agro', nombre: 'Agro', consejo: 'Consejo Profesional de Ciencias Económicas de la jurisdicción',
      anexos: { bu: 'Anexo I', intang: 'Anexo II', cmv: 'Anexo III', gastos: 'Anexo V', bio: 'Anexo IV' } }
  };

  // ───────────── Lectura de sumas y saldos ─────────────
  const RE_H_NOMBRE = /^(CUENTA|CUENTAS|DESCRIPCION|NOMBRE|DENOMINACION|DETALLE|NOMBRE (DE )?(LA )?CUENTA|DESCRIPCION (DE )?(LA )?CUENTA|DENOMINACION (DE )?(LA )?CUENTA)$/;
  const RE_H_COD = /^(CODIGO|COD\.?|NRO\.?|NUMERO|N°|NRO\.? CUENTA|CUENTA N°|CODIGO CUENTA|COD\. CUENTA|ID)$/;
  function detectarColumnas(filas) {
    for (let i = 0; i < Math.min(filas.length, 40); i++) {
      const h = (filas[i] || []).map(norm);
      const col = re => h.findIndex(x => re.test(x));
      const nombre = h.findIndex(x => RE_H_NOMBRE.test(x) || /^(CUENTA|DESCRIPCION)\b/.test(x) && !/SALDO|DEBE|HABER/.test(x));
      if (nombre < 0) continue;
      const saldo = col(/^SALDO( FINAL| AL CIERRE| ACTUAL| DEL PERIODO)?$|^SALDO AL /);
      const sd = col(/SALDO.*DEUD|^DEUDOR$/), sa = col(/SALDO.*ACREED|^ACREEDOR$/);
      const debe = col(/^(MONTO |IMPORTE |TOTAL |SUMAS? )?(DEBE|DEBITOS?)$/), haber = col(/^(MONTO |IMPORTE |TOTAL |SUMAS? )?(HABER|CREDITOS?)$/);
      if (saldo < 0 && (sd < 0 || sa < 0) && (debe < 0 || haber < 0)) continue;
      let cod = h.findIndex(x => RE_H_COD.test(x));
      const imput = col(/IMPUTABLE|IMP\.?$|TIPO$/);
      return { fila: i, nombre, cod, saldo, sd, sa, debe, haber, imput };
    }
    return null;
  }
  // Separa "1.1.01.001 Caja" → código + nombre
  const RE_COD_EMBEBIDO = /^\s*(\d+(?:[.\-]\d+)+|\d{3,})\s+[-–]?\s*(.+)$/;
  function leerSumasYSaldos(filas, etiqueta) {
    const avisos = [];
    const c = detectarColumnas(filas);
    if (!c) return { cuentas: [], avisos: [`${etiqueta}: no se encontró la fila de encabezados (se esperan columnas "Cuenta" y "Saldo" o "Debe/Haber" o "Saldo deudor/acreedor").`], ok: false };
    const cuentas = [];
    for (let i = c.fila + 1; i < filas.length; i++) {
      const f = filas[i] || [];
      let nombre = String(f[c.nombre] == null ? '' : f[c.nombre]).trim();
      let codigo = c.cod >= 0 ? String(f[c.cod] == null ? '' : f[c.cod]).trim() : '';
      if (!nombre && !codigo) continue;
      if (!codigo) { const m = RE_COD_EMBEBIDO.exec(nombre); if (m) { codigo = m[1]; nombre = m[2].trim(); } }
      if (!codigo && /^TOTAL(ES)?\b|^SUMAS? IGUALES|^DIFERENCIA\b(?! DE CAMBIO)/.test(norm(nombre))) continue;
      if (codigo && /^TOTAL(ES)?$|^SUMAS? IGUALES$/.test(norm(nombre))) continue;
      let saldo = null;
      if (c.saldo >= 0) saldo = num(f[c.saldo]);
      if (saldo == null && (c.sd >= 0 || c.sa >= 0)) { const d = num(f[c.sd]), a = num(f[c.sa]); if (d != null || a != null) saldo = nz(d) - nz(a); }
      if (saldo == null && (c.debe >= 0 || c.haber >= 0)) { const d = num(f[c.debe]), a = num(f[c.haber]); if (d != null || a != null) saldo = nz(d) - nz(a); }
      const imputable = c.imput >= 0 ? !/^(N|NO|T|TOTALIZADORA|RUBRO)$/.test(norm(f[c.imput])) : null;
      if (saldo == null && !codigo) continue;
      cuentas.push({ codigo, nombre, saldo: r2(nz(saldo)), imputable });
    }
    // Excluir cuentas totalizadoras: con "Imputable = N" o cuyo código es prefijo de otra con saldo
    let excl = 0;
    const cods = cuentas.filter(x => x.codigo).map(x => x.codigo);
    const conSep = cods.some(k => /[.\-]/.test(k));
    for (const x of cuentas) {
      if (x.imputable === false) { x.totalizadora = true; continue; }
      if (!x.codigo) continue;
      if (conSep ? cods.some(o => o !== x.codigo && (o.startsWith(x.codigo + '.') || o.startsWith(x.codigo + '-')))
                 : cods.some(o => o.length > x.codigo.length && o.startsWith(x.codigo)))
        x.totalizadora = true;
    }
    const hojas = cuentas.filter(x => !x.totalizadora);
    excl = cuentas.length - hojas.length;
    if (excl) avisos.push(`${etiqueta}: ${excl} cuenta(s) totalizadora(s) excluidas para no duplicar saldos.`);
    const suma = r2(hojas.reduce((s, x) => s + x.saldo, 0));
    if (Math.abs(suma) > EPS) avisos.push(`${etiqueta}: el balance de sumas y saldos no cierra — diferencia deudor − acreedor = ${fm(suma)}.`);
    return { cuentas: hojas.filter(x => x.saldo !== 0 || x.codigo), avisos, ok: true, sumaControl: suma, columnas: c };
  }

  // ───────────── Auto-mapeo ─────────────
  // Reglas por palabra clave, evaluadas en orden. Cada una: [regex, rubro, (opcional) restricción de signo/código]
  const REGLAS = [
    [/LEY 25\.?413.*(CREDITO|A CTA|A COMPUTAR|A CUENTA|CONT\.? PAT)|IMPUESTO (A LOS|S\/) DEBITOS Y CREDITOS A COMPUTAR/, 'ac_otros_cred'],
    [/PASIVO POR IMPUESTO DIFERIDO|IMPUESTO DIFERIDO PASIVO/, 'pnc_fiscales'],
    [/ANTICIPOS? (DE|DE LOS) CLIENTES|COBROS ANTICIPADOS|SE[NÑ]AS RECIBIDAS/, 'pc_anticipos'],
    [/ACTIVO POR IMPUESTO DIFERIDO|IMPUESTO DIFERIDO ACTIVO/, 'anc_otros_cred'],
    [/RESULTADOS? (DE )?EJERC(ICIOS|\.)? ?ANT|RESULTADOS? ANTERIORES/, 'pn_rna'],
    [/^RESULTADOS? DEL (EJERCICIO|PERIODO)$/, 'pn_resej'],
    // Resultados primero (nombres ambiguos como "Intereses" o "Impuestos")
    [/IMPUESTO A LAS GANANCIAS(?! A PAGAR| DIFERIDO ACTIVO| ANTICIPO|.*SALDO A FAVOR)|^GANANCIAS \(IMPUESTO\)|IMP\.? GANANCIAS DEL EJERCICIO|CARGO POR IMPUESTO/, 'er_ig', 'R'],
    [/^VENTAS?|INGRESOS POR (VENTAS|SERVICIOS)|SERVICIOS PRESTADOS|HONORARIOS (GANADOS|COBRADOS|PERCIBIDOS)|FACTURACION|^INTERMEDIACION|ASESORAMIENTO|COMISIONES (GANADAS|COBRADAS|PERCIBIDAS)|DESCUENTOS? (Y BONIFICACIONES )?(CONCEDIDOS|OTORGADOS)|DEVOLUCIONES S\/ VENTAS/, 'er_ventas', 'R'],
    [/COSTO DE (LAS |LOS )?(MERCADERIAS |BIENES |PRODUCTOS )?(VENDID|VENTA)|^C\.?M\.?V\.?|COSTO DE (LOS )?SERVICIOS PRESTADOS|COSTO DE PRODUCCION VENDIDA|^COSTO DE (MATERIALES|MERCADERIAS?|LA MERCADERIA|PRODUCTOS)/, 'er_cmv', 'R'],
    [/RESULTADO POR PRODUCCION|PRODUCCION AGRICOLA|PRODUCCION PECUARIA|PRODUCCION AGROPECUARIA/, 'er_agro_prod', 'R'],
    [/TENENCIA.*(ACTIVOS BIOLOGICOS|HACIENDA|SEMOVIENTES)|VALUACION.*(HACIENDA|ACTIVOS BIOLOGICOS)/, 'er_agro_ten', 'R'],
    [/R\.?E\.?C\.?P\.?A\.?M|EXPOSICION (AL CAMBIO|A LA INFLACION)|INTERES(ES)?|DIFERENCIAS? DE CAMBIO|DIF\.? DE CAMBIO|RESULTADO POR TENENCIA|GASTOS BANCARIOS|COMISIONES (Y GASTOS )?BANCARI|DESCUENTOS OBTENIDOS|RENTA|DIVIDENDOS GANADOS|RESULTADO (DE|POR) (INVERSIONES|OPERACIONES FINANCIERAS)|COMISIONES BANCARIAS/, 'er_rfin', 'R'],
    [/RESULTADO (DE|POR) (VENTA|BAJA) DE BIENES DE USO|RECUPERO|INGRESOS VARIOS|OTROS INGRESOS|INGRESOS EXTRAORDINARIOS|OTROS EGRESOS|SINIESTRO|DONACION/, 'er_otros', 'R'],
    [/^OTROS GASTOS$|GASTOS VARIOS NO OPERATIVOS/, 'er_gotros', 'R'],
    [/RESULTADOS? (DE )?INVERSIONES EN (ENTES|SOCIEDADES)|VALOR PATRIMONIAL PROPORCIONAL|V\.?P\.?P/, 'er_rinv', 'R'],
    [/\b(COMERCIALIZACION|COMERCIALES|G\.? ?COM\.?)$|- ?COMERCIALIZACION|\(COMERCIALIZACION\)/, 'er_gcom', 'R'],
    [/\b(ADMINISTRACION|ADMINISTRATIVOS|G\.? ?ADM\.?)$|- ?ADMINISTRACION|\(ADMINISTRACION\)/, 'er_gadm', 'R'],
    [/COMISIONES|PUBLICIDAD|PROPAGANDA|FLETES|INGRESOS BRUTOS(?! A PAGAR)|IIBB(?! A PAGAR)|DEUDORES INCOBRABLES|INCOBRABLES|GASTOS DE (COMERCIALIZACION|VENTAS|EXPORTACION)|EMBALAJE|PROMOCION|MARKETING/, 'er_gcom', 'R'],
    [/SUELDOS|JORNALES|CARGAS SOCIALES|CONTRIBUCIONES|APORTES PATRONALES|HONORARIOS|ALQUILER|ENERGIA|ELECTRICIDAD|LUZ|GAS|AGUA|TELEFON|TLEFON|TELEF\.|INTERNET|REPRESENTACION|LIBRERIA|OSDE|MEDICINA PREPAGA|OBRA SOCIAL|INACAP|FAECYS|SELLOS|BIENES PERSONALES|PAPELERIA|(?<!MUEBLES Y )(?<!MUEBLES E )UTILES(?! Y MUEBLES)|MANTENIMIENTO|REPARACION|SEGUROS|IMPUESTOS|TASAS|MOVILIDAD|VIATICOS|LIMPIEZA|AMORTIZACION(ES)? (DEL EJERCICIO|BIENES|DE )|DEPRECIACION(ES)? (DEL EJERCICIO|BIENES|DE )|GASTOS (GENERALES|DE ADMINISTRACION|VARIOS)|SERVICIOS|CUOTAS|SUSCRIPCIONES|CORREO|SOFTWARE|LICENCIAS|CAPACITACION|REFRIGERIO|ART\b|SEGURO DE VIDA|INDEMNIZACION|SAC|AGUINALDO|VACACIONES/, 'er_gadm', 'R'],
    // Patrimonio neto
    [/AJUSTE (DEL |DE )?CAPITAL/, 'pn_ajuste'], [/^CAPITAL( SOCIAL| SUSCRIPTO| SUSCRITO)?$|^CAPITAL SOCIAL|ACCIONES EN CIRCULACION|CUOTAS SOCIALES/, 'pn_capital'],
    [/APORTES? IRREVOCABLES?|APORTES A CUENTA DE FUTURAS/, 'pn_aportes'], [/PRIMA(S)? DE EMISION/, 'pn_primas'],
    [/RESERVA LEGAL/, 'pn_rlegal'], [/RESERVA/, 'pn_otras_res'],
    [/RESULTADOS? (NO ASIGNADOS|ACUMULADOS|DE EJERCICIOS ANTERIORES|ANTERIORES)|A\.?R\.?E\.?A/, 'pn_rna'],
    [/^RESULTADO DEL EJERCICIO|^GANANCIA DEL EJERCICIO|^PERDIDA DEL EJERCICIO|^RESULTADO DEL PERIODO/, 'pn_resej'],
    // Activo
    [/^CAJA|BANCO|FONDO FIJO|VALORES A DEPOSITAR|MONEDA EXTRANJERA|RECAUDACIONES A DEPOSITAR|MERCADO ?PAGO|CUENTA CORRIENTE BANC|CAJA DE AHORRO/, 'ac_caja'],
    [/PLAZO FIJO|FONDOS? COMUNES? DE INVERSION|F\.?C\.?I\b|TITULOS PUBLICOS|ACCIONES CON COTIZACION|CAUCION|INVERSIONES TRANSITORIAS|INVERSIONES TEMPORARIAS/, 'ac_inv'],
    [/DEUDORES POR VENTAS|CLIENTES|DOCUMENTOS A COBRAR|CHEQUES DIFERIDOS A COBRAR|TARJETAS? DE CREDITO A COBRAR|DEUDORES MOROSOS|DEUDORES EN GESTION|CUPONES A COBRAR|PREVISION (PARA )?DEUDORES INCOBRABLES|PREVISION INCOBRABLES/, 'ac_cred_ventas'],
    [/IVA (CREDITO|SALDO A FAVOR|SALDO TECNICO A FAVOR)|CREDITO FISCAL|ANTICIPOS? (DE )?(IMPUESTO|GANANCIAS|IIBB|INGRESOS BRUTOS)|RETENCION(ES)?.*SUFRID|PERCEPCION(ES)?.*SUFRID|RETENCIONES? (SUFRIDAS|DE )|PERCEPCIONES? (SUFRIDAS|DE )|SALDO A FAVOR|A FAVOR|ANTICIPOS? A PROVEEDORES|GASTOS PAGADOS POR ADELANTADO|SEGUROS A DEVENGAR|DEUDORES VARIOS|CREDITOS? VARIOS|PRESTAMOS AL PERSONAL|ANTICIPOS? AL PERSONAL|ANTICIPO DE SUELDOS|SOCIOS? CUENTA PARTICULAR|CUENTA PARTICULAR SOCIO|DEPOSITOS EN GARANTIA|IMPUESTO DIFERIDO ACTIVO|SIRCREB|IMPUESTO (A LOS|S\/) DEBITOS Y CREDITOS A COMPUTAR|LEY 25\.?413 A COMPUTAR/, 'ac_otros_cred'],
    [/MERCADERIA|MATERIAS? PRIMAS?|PRODUCTOS? (TERMINADOS|EN PROCESO|EN CURSO)|STOCK|INVENTARIO|EXISTENCIAS?|MATERIALES|INSUMOS|ANTICIPOS? A PROVEEDORES DE BIENES|HACIENDA PARA VENTA|CEREALES|GRANOS|SEMILLAS|AGROQUIMICOS/, 'ac_bcambio'],
    [/HACIENDA|RODEO|VIENTRES|REPRODUCTORES|PLANTACIONES|MONTES FRUTALES|SEMENTERAS|CULTIVOS EN (CURSO|DESARROLLO)|ACTIVOS? BIOLOGICOS?/, 'anc_bio'],
    [/INMUEBLES?|TERRENOS?|EDIFICIOS?|RODADOS?|VEHICULOS?|MUEBLES|UTILES(?! DE)|INSTALACIONES|MAQUINARIAS?|EQUIPOS?|HERRAMIENTAS|OBRAS EN CURSO|MEJORAS|AERONAVES|BIENES DE USO|AMORTIZACION(ES)? ACUMULADA|DEPRECIACION(ES)? ACUMULADA|AMORT\.? ACUM|DEP\.? ACUM|ALAMBRADOS|MOLINOS|TRACTORES|COSECHADORAS|SILOS/, 'anc_bu'],
    [/MARCAS|PATENTES|LICENCIAS|DESARROLLO DE SOFTWARE|GASTOS DE ORGANIZACION|ACTIVOS? INTANGIBLES?|DERECHOS DE|CONCESIONES|FRANQUICIAS/, 'anc_intang'],
    [/PARTICIPACION(ES)? (EN )?(SOCIEDADES|ENTES)|ACCIONES DE (SOCIEDADES|OTRAS)|INVERSIONES PERMANENTES|INVERSIONES EN SOCIEDADES/, 'anc_inv'],
    [/PROPIEDADES DE INVERSION|INMUEBLES (EN ALQUILER|DE RENTA)/, 'anc_pi'],
    [/LLAVE DE NEGOCIO/, 'anc_llave'],
    // Pasivo
    [/PROVEEDORES|DOCUMENTOS A PAGAR|DEUDAS COMERCIALES|CHEQUES DIFERIDOS A PAGAR|ACREEDORES (COMERCIALES|VARIOS COMERCIALES)|E-?CHEQ A PAGAR|FACTURAS A RECIBIR/, 'pc_comerciales'],
    [/PRESTAMOS?|DEUDAS BANCARIAS|DEUDAS FINANCIERAS|ADELANTOS? EN (CUENTA CORRIENTE|CTA\.? CTE\.?)|DESCUBIERTO|GIRO EN DESCUBIERTO|OBLIGACIONES NEGOCIABLES|TARJETAS? DE CREDITO A PAGAR|LEASING A PAGAR|ACUERDO(S)? BANCARIO/, 'pc_prestamos'],
    [/SUELDOS.*A PAGAR|JORNALES A PAGAR|REMUNERACIONES A PAGAR|FAECYS A PAGAR|INACAP A PAGAR|SEC A PAGAR|OSECAC A PAGAR|SINDICATO.*A PAGAR|CARGAS SOCIALES A PAGAR|APORTES? (Y CONTRIBUCIONES )?A PAGAR|CONTRIBUCIONES A PAGAR|SINDICATO|OBRA SOCIAL A PAGAR|ART A PAGAR|SAC A PAGAR|PROVISION (SAC|AGUINALDO|VACACIONES)|F\.?931 A PAGAR|SEGURO DE VIDA OBLIGATORIO A PAGAR|UOCRA|FONDO DE CESE|IERIC/, 'pc_remun'],
    [/IVA (DEBITO|A PAGAR|SALDO A PAGAR)|DEBITO FISCAL|IMPUESTOS? A PAGAR|(GANANCIAS|IVA|IIBB|INGRESOS BRUTOS|RETENC|PERCEP|IMP\.|IMPUESTO|SELLOS|TASA).*A PAGAR|PROVISION (PARA )?IMPUESTOS?|INGRESOS BRUTOS A PAGAR|IIBB A PAGAR|GANANCIAS A PAGAR|IMPUESTO A LAS GANANCIAS A PAGAR|PROVISION (IMPUESTO|GANANCIAS)|RETENCIONES A (PAGAR|DEPOSITAR)|PERCEPCIONES A (PAGAR|DEPOSITAR)|PLAN(ES)? DE PAGO|MORATORIA|TASAS? MUNICIPALES A PAGAR|BIENES PERSONALES (A PAGAR|ACCIONES)|SICORE A PAGAR|IMPUESTO DIFERIDO PASIVO|ARBA A PAGAR|AGIP A PAGAR|CONVENIO MULTILATERAL A PAGAR/, 'pc_fiscales'],
    [/ANTICIPOS? (DE|DE LOS) CLIENTES|COBROS ANTICIPADOS|SEÑAS RECIBIDAS/, 'pc_anticipos'],
    [/DIVIDENDOS A PAGAR|UTILIDADES A PAGAR/, 'pc_dividendos'],
    [/PREVISION(ES)? (PARA )?(DESPIDOS|JUICIOS|CONTINGENCIAS|RIESGOS)/, 'pc_prev'],
    [/ACREEDORES VARIOS|DEUDAS VARIAS|OTRAS DEUDAS|OTROS PASIVOS|TARJETAS? (DE CREDITO )?A PAGAR|HONORARIOS A PAGAR|SOCIOS? (CUENTA|CTA\.?) (PARTICULAR|CORRIENTE) ACREEDOR|DIRECTORES A PAGAR|ALQUILERES A PAGAR|SERVICIOS A PAGAR|GASTOS A PAGAR|CUENTAS A PAGAR/, 'pc_otras'],
    // Amortizaciones/depreciaciones del ejercicio → gasto
    [/AMORTIZACION|DEPRECIACION/, 'er_gadm', 'R']
  ];
  // Rango por código (plan de cuentas numérico habitual): 1 activo, 2 pasivo, 3 PN, 4 ingresos, 5/6 egresos
  function grupoPorCodigo(cod) {
    const c = String(cod || '').replace(/[^\d.\-]/g, '');
    if (!c) return null;
    const p = c.split(/[.\-]/);
    const d0 = p[0][0];
    if (d0 === '1') return p.length > 1 && p[1] ? (+p[1] >= 2 ? 'ANC' : 'AC') : (c.length >= 2 ? (c[1] === '2' ? 'ANC' : 'AC') : 'A');
    if (d0 === '2') return p.length > 1 && p[1] ? (+p[1] >= 2 ? 'PNC' : 'PC') : (c.length >= 2 ? (c[1] === '2' ? 'PNC' : 'PC') : 'P');
    if (d0 === '3') return 'PN';
    if (d0 === '4' || d0 === '5' || d0 === '6' || d0 === '7') return 'ER';
    return null;
  }
  const A_NC = { ac_caja: 'ac_caja', ac_inv: 'anc_inv', ac_cred_ventas: 'anc_cred_ventas', ac_otros_cred: 'anc_otros_cred', ac_bcambio: 'anc_bcambio', ac_bio: 'anc_bio', ac_otros: 'anc_otros' };
  const NC_A = Object.fromEntries(Object.entries(A_NC).map(([a, b]) => [b, a]));
  const P_NC = { pc_comerciales: 'pnc_comerciales', pc_prestamos: 'pnc_prestamos', pc_fiscales: 'pnc_fiscales', pc_otras: 'pnc_otras', pc_prev: 'pnc_prev', pc_remun: 'pnc_otras', pc_anticipos: 'pnc_otras', pc_dividendos: 'pnc_otras' };
  const NC_P = { pnc_comerciales: 'pc_comerciales', pnc_prestamos: 'pc_prestamos', pnc_fiscales: 'pc_fiscales', pnc_otras: 'pc_otras', pnc_prev: 'pc_prev' };

  const RE_PATRIMONIAL = /A PAGAR|A COBRAR|A DEPOSITAR|A DEVENGAR|A RENDIR|ACUMULAD|\bACUM\b|SALDO A FAVOR|A FAVOR|SUFRID|A COMPUTAR|A CTA\.?|A CUENTA|CREDITO FISCAL|DEBITO FISCAL|^PREVISION|^PROVISION|^ANTICIPOS?\b|\bDIFERIDO\b|RESULTADOS? DE EJERC|RESULTADOS? DEL EJERCICIO|NO ASIGNADOS/;
  function sugerirRubro(cta, modelo) {
    const n = norm(cta.nombre), g = grupoPorCodigo(cta.codigo);
    let r = null, conf = 'baja';
    for (const [re, rub, soloR] of REGLAS) {
      if (!re.test(n)) continue;
      if (soloR === 'R' && g && g !== 'ER') continue;           // p.ej. "Intereses a pagar" no es resultado
      if (soloR === 'R' && !g && RE_PATRIMONIAL.test(n)) continue; // sin código: "Sueldos a pagar", "Previsión…" son patrimoniales
      if (!soloR && g === 'ER') continue;                       // una cuenta 4/5 no es patrimonial
      r = rub; conf = 'media'; break;
    }
    // Ajuste corriente / no corriente por código
    if (r && g) {
      if (g === 'ANC' && A_NC[r]) r = A_NC[r];
      if (g === 'AC' && NC_A[r]) r = NC_A[r];
      if (g === 'PNC' && P_NC[r]) r = P_NC[r];
      if (g === 'PC' && NC_P[r]) r = NC_P[r];
      const tipoR = RUB[r].grupo;
      const coher = (g === 'AC' || g === 'ANC' || g === 'A') ? RUB[r].tipo === 'A' : (g === 'PC' || g === 'PNC' || g === 'P') ? RUB[r].tipo === 'P' : g === 'PN' ? RUB[r].tipo === 'PN' : g === 'ER' ? RUB[r].tipo === 'R' : true;
      conf = coher ? 'alta' : 'baja';
      if (!coher) r = null;
      void tipoR;
    }
    if (!r && g) { // sin palabra clave: rubro "otros" del grupo por código
      r = { AC: 'ac_otros_cred', ANC: 'anc_otros', A: 'ac_otros_cred', PC: 'pc_otras', PNC: 'pnc_otras', P: 'pc_otras', PN: 'pn_rna', ER: cta.saldo < 0 ? 'er_otros' : 'er_gadm' }[g];
      conf = 'baja';
    }
    if (!r) { // sin código ni palabra clave: por signo (muy baja confianza)
      r = cta.saldo >= 0 ? 'ac_otros_cred' : 'pc_otras'; conf = 'baja';
    }
    if (r && !g && ['er_gcom', 'er_gadm', 'er_gotros'].includes(r) && cta.saldo < 0) {
      r = /SERVICIO|ASESOR|VENTA|INTERMEDIAC|COMISION|HONORARIO|FACTURAC|ABONO/.test(n) ? 'er_ventas' : 'er_otros'; conf = 'baja';
    }
    if (r && !g && /LARGO PLAZO|NO CORRIENTES?\b|\bL\.? ?P\.?$|A MAS DE (UN|1) ANO/.test(n)) { if (A_NC[r]) r = A_NC[r]; if (P_NC[r]) r = P_NC[r]; }
    if (r === 'anc_bio' && modelo !== 'agro') r = 'anc_otros';
    if (r === 'er_agro_prod' || r === 'er_agro_ten') { if (modelo !== 'agro') r = 'er_otros'; }
    return { rubro: r, confianza: conf };
  }

  const claveCta = c => (c.codigo ? 'C:' + String(c.codigo).trim() : 'N:' + norm(c.nombre)) + (c.dup ? '#' + c.dup : '');

  // Une actual y comparativo en una sola lista de cuentas
  // Cuentas homónimas sin código ("PUBLICIDAD" dos veces): se distinguen por orden de aparición
  function numerar(lista) {
    const vistos = {};
    return lista.map(c => { const k = claveCta(c); vistos[k] = (vistos[k] || 0) + 1; return Object.assign({}, c, { dup: vistos[k] > 1 ? vistos[k] : 0 }); });
  }
  function unirCuentas(act, comp, coef) {
    const m = new Map();
    act = numerar(act); comp = numerar(comp || []);
    for (const c of act) m.set(claveCta(c), { codigo: c.codigo, nombre: c.nombre, dup: c.dup, act: c.saldo, compOrig: 0, comp: 0 });
    for (const c of comp) {
      const k = claveCta(c);
      const e = m.get(k) || (m.set(k, { codigo: c.codigo, nombre: c.nombre, dup: c.dup, act: 0, compOrig: 0, comp: 0 }), m.get(k));
      e.compOrig = r2(e.compOrig + c.saldo);
    }
    for (const e of m.values()) e.comp = r2(e.compOrig * coef);
    const vals = [...m.values()];
    return vals.some(v => v.codigo) ? vals.sort((a, b) => String(a.codigo || 'zz').localeCompare(String(b.codigo || 'zz'), 'es', { numeric: true }) || a.nombre.localeCompare(b.nombre)) : vals; // sin códigos: se respeta el orden del sistema
  }

  // ───────────── Lectura de templates ─────────────
  // Busca la fila de encabezados técnicos (nombres con guión bajo) y devuelve objetos
  function tablaTecnica(filas, claveObligatoria) {
    for (let i = 0; i < Math.min(filas.length, 10); i++) {
      const h = (filas[i] || []).map(x => String(x == null ? '' : x).trim());
      if (!h.includes(claveObligatoria)) continue;
      const out = [];
      for (let j = i + 1; j < filas.length; j++) {
        const f = filas[j] || []; const o = {}; let alguno = false;
        h.forEach((k, ix) => { if (!k) return; const v = f[ix]; o[k] = v; if (v != null && v !== '') alguno = true; });
        if (!alguno) continue;
        const primera = String(o[claveObligatoria] == null ? '' : o[claveObligatoria]).trim();
        if (!primera || /^(Completar|Categoria$|Concepto$)/i.test(primera)) continue;
        out.push(o);
      }
      return out;
    }
    return null;
  }
  function leerMetadata(libro) { // libro: {hoja: filas}
    const md = { general: {}, capital: [], distribucion: [], notas: [], efeAnterior: null, efeActual: null, efeDirecto: null, avisos: [] };
    const hoja = n => { const k = Object.keys(libro).find(x => norm(x) === norm(n)); return k ? libro[k] : null; };
    const dg = hoja('Datos Generales');
    if (dg) for (const f of dg) { const k = String(f[0] == null ? '' : f[0]).trim(); if (k && f[1] != null && f[1] !== '' && !/^Campo$/i.test(k)) md.general[k] = f[1]; }
    const cap = hoja('Composicion Capital');
    if (cap) for (const f of cap.slice(1)) if (f[0]) md.capital.push({ clase: String(f[0]), cantidad: num(f[1]), vn: num(f[2]), suscripto: num(f[3]), integrado: num(f[4]) });
    const dr = hoja('Distribucion Resultados');
    if (dr) for (const f of dr.slice(1)) if (f[0] && num(f[1])) md.distribucion.push({ concepto: String(f[0]), monto: num(f[1]) });
    const nt = hoja('Notas');
    if (nt) for (const f of nt.slice(1)) if (f[0]) md.notas.push({ tipo: String(f[0]), detalle: f[1] == null ? '' : String(f[1]).trim() });
    const efe = (n) => {
      const h = hoja(n); if (!h) return null;
      const o = {}; let alguno = false;
      for (const f of h) { const k = String(f[0] == null ? '' : f[0]).trim(); const v = num(f[1]); if (k && v != null) { o[k] = v; alguno = true; } const v2 = num(f[2]); if (k && v2 != null) { o[k + ' |ant'] = v2; } }
      return alguno ? o : null;
    };
    md.efeAnterior = efe('EFE Ejercicio Anterior'); md.efeActual = efe('EFE Ejercicio Actual'); md.efeDirecto = efe('EFE Directo Manual');
    if (md.efeActual && md.efeDirecto) md.avisos.push('Metadata: están completas "EFE Ejercicio Actual" y "EFE Directo Manual". Se usa el método directo y se ignora la hoja indirecta.');
    return md;
  }
  const G = (md, k) => { const f = Object.keys(md.general).find(x => norm(x) === norm(k)); return f ? md.general[f] : ''; };

  function leerAnexoBU(libro) {
    const k = Object.keys(libro).find(x => /bienes_de_uso/i.test(x)) || Object.keys(libro)[0];
    const t = tablaTecnica(libro[k], 'categoria'); if (!t) return null;
    const campos = ['valor_bruto_inicio', 'altas', 'bajas', 'transferencias', 'revaluo', 'valor_bruto_cierre', 'dep_acum_inicio', 'dep_acum_bajas', 'dep_acum_transferencias', 'dep_ejercicio', 'dep_revaluo', 'dep_acum_cierre', 'perdidas_desvalorizacion', 'neto_actual', 'neto_comparativo'];
    return t.map(o => { const r = { categoria: String(o.categoria).trim() }; for (const c of campos) r[c] = num(o[c]); return r; });
  }
  function leerAnexoCMV(libro) {
    const k = Object.keys(libro).find(x => /costo_ventas/i.test(x)) || Object.keys(libro)[0];
    const t = tablaTecnica(libro[k], 'concepto'); if (!t) return null;
    const o = {}; let alguno = false;
    for (const f of t) { const c = norm(f.concepto); const a = num(f.actual), p = num(f.comparativo); if (a != null || p != null) alguno = true; o[c] = { actual: a, comparativo: p }; }
    return alguno ? o : null;
  }
  function leerAnexoGastos(libro) {
    const k = Object.keys(libro).find(x => /gastos_por_naturaleza/i.test(x)) || Object.keys(libro)[0];
    const t = tablaTecnica(libro[k], 'concepto'); if (!t) return null;
    const cols = ['comercializacion', 'administracion', 'costo_servicios', 'gastos_financiacion'];
    const rows = t.map(o => { const r = { concepto: String(o.concepto).trim() }; for (const c of cols) { r[c] = nz(num(o[c])); r[c + '_comp'] = nz(num(o[c + '_comp'])); } return r; })
      .filter(r => cols.some(c => r[c] || r[c + '_comp']));
    return rows.length ? rows : null;
  }
  function leerBiologicos(libro) {
    const k = Object.keys(libro).find(x => /biolog/i.test(x));
    const t = k ? tablaTecnica(libro[k], 'categoria') : null;
    const bio = t ? t.filter(o => !/^Categoria$/i.test(String(o.categoria))).map(o => { const r = { categoria: String(o.categoria).trim() }; for (const c of Object.keys(o)) if (c !== 'categoria' && c) r[c] = num(o[c]); return r; }) : null;
    const kc = Object.keys(libro).find(x => /costos_agro/i.test(x));
    const tc = kc ? tablaTecnica(libro[kc], 'concepto') : null;
    const costos = tc ? tc.filter(o => num(o.agricola) != null || num(o.pecuaria) != null).map(o => ({ concepto: String(o.concepto), agricola: nz(num(o.agricola)), pecuaria: nz(num(o.pecuaria)) })) : null;
    return { bio: bio && bio.length ? bio : null, costos: costos && costos.some(c => c.agricola || c.pecuaria) ? costos : null };
  }

  // ───────────── Construcción del balance ─────────────
  function construir(input) {
    const { cuentas, mapeo, modelo: modeloId, coef, metadata, anexos, opciones } = input;
    const modelo = MODELOS[modeloId] || MODELOS.caba;
    const md = metadata || { general: {}, capital: [], distribucion: [], notas: [], avisos: [] };
    const rep = { errores: [], advertencias: [], faltantes: [], controles: [], info: [] };
    const hayComp = cuentas.some(c => c.compOrig);
    const modoFinal = norm(G(md, 'Modo')) === 'FINAL';

    // Totales por rubro y detalle
    const rub = {}; // id → {act, comp, cuentas:[]}
    for (const r of RUBROS) rub[r.id] = { act: 0, comp: 0, compOrig: 0, cuentas: [] };
    const sinMapear = [];
    for (const c of cuentas) {
      const id = mapeo[claveCta(c)];
      if (!id || !RUB[id]) { sinMapear.push(c); continue; }
      if (id === 'excluir') continue;
      const s = RUB[id].tipo === 'A' ? 1 : -1;
      rub[id].act = r2(rub[id].act + s * c.act); rub[id].comp = r2(rub[id].comp + s * c.comp); rub[id].compOrig = r2(rub[id].compOrig + s * c.compOrig);
      if (c.act || c.comp) rub[id].cuentas.push({ codigo: c.codigo, nombre: c.nombre, act: r2(s * c.act), comp: r2(s * c.comp), compOrig: r2(s * c.compOrig) });
    }
    // Capital suscripto se expone a valor nominal; su reexpresión integra "Ajuste de capital"
    const capReexpEnLibros = coef !== 1 && Math.abs(rub.pn_capital.act - rub.pn_capital.compOrig) > EPS && Math.abs(rub.pn_capital.act - rub.pn_capital.comp) <= Math.max(EPS, Math.abs(rub.pn_capital.act) * 0.005);
    if (capReexpEnLibros) rep.info.push('La cuenta Capital social está reexpresada en los registros contables (varía en la misma proporción que el coeficiente): se expone tal como surge de los libros. Si corresponde exponer el capital a valor nominal, reclasificá la diferencia a Ajuste de capital.');
    if (!capReexpEnLibros && rub.pn_capital.comp !== rub.pn_capital.compOrig) {
      const dif = r2(rub.pn_capital.comp - rub.pn_capital.compOrig);
      rub.pn_ajuste.comp = r2(rub.pn_ajuste.comp + dif); rub.pn_capital.comp = rub.pn_capital.compOrig;
      rub.pn_capital.cuentas.forEach(c => { c.comp = c.compOrig; });
      rub.pn_ajuste.cuentas.push({ codigo: '', nombre: 'Reexpresión del capital comparativo', act: 0, comp: dif });
    }
    if (sinMapear.length) rep.errores.push(`${sinMapear.length} cuenta(s) sin rubro asignado: ${sinMapear.slice(0, 8).map(c => c.nombre).join(', ')}${sinMapear.length > 8 ? '…' : ''}`);

    const suma = (grupo, per) => r2(RUBROS.filter(r => r.grupo === grupo).reduce((s, r) => s + rub[r.id][per], 0));
    const lineas = grupo => RUBROS.filter(r => r.grupo === grupo && (rub[r.id].act || rub[r.id].comp)).map(r => ({ id: r.id, label: r.label, act: rub[r.id].act, comp: rub[r.id].comp }));

    // ── Estado de Resultados
    const erLineas = RUBROS.filter(r => r.grupo === 'ER').map(r => ({ id: r.id, label: r.label, act: rub[r.id].act, comp: rub[r.id].comp }));
    const L = id => erLineas.find(x => x.id === id) || { act: 0, comp: 0 };
    const sumER = (ids, per) => r2(ids.reduce((s, id) => s + L(id)[per], 0));
    const bruto = { act: sumER(['er_ventas', 'er_cmv'], 'act'), comp: sumER(['er_ventas', 'er_cmv'], 'comp') };
    const idsAgro = modelo.id === 'agro' ? ['er_agro_prod', 'er_agro_ten'] : [];
    const operativo = ids => ({ act: r2(bruto.act + sumER([...idsAgro, 'er_gcom', 'er_gadm', 'er_gotros'], 'act')), comp: r2(bruto.comp + sumER([...idsAgro, 'er_gcom', 'er_gadm', 'er_gotros'], 'comp')) });
    const resOp = operativo();
    const antesIG = { act: r2(resOp.act + sumER(['er_rinv', 'er_rfin', 'er_otros'], 'act')), comp: r2(resOp.comp + sumER(['er_rinv', 'er_rfin', 'er_otros'], 'comp')) };
    const resNeto = { act: r2(antesIG.act + L('er_ig').act), comp: r2(antesIG.comp + L('er_ig').comp) };
    const ER = { lineas: erLineas, bruto, resOp, antesIG, resNeto, agro: modelo.id === 'agro' };
    const hayResultados = erLineas.some(l => l.act);
    if (!hayResultados) rep.errores.push('El balance de sumas y saldos del ejercicio no tiene cuentas de resultado con saldo: parece ser posterior al asiento de cierre. Usá el balance ANTES del cierre de resultados.');
    if (rub.pn_resej.act && hayResultados) rep.advertencias.push('Hay cuentas mapeadas a "Resultado del ejercicio (asiento de cierre)" y además cuentas de resultado con saldo: revisá que el resultado no quede duplicado en el PN.');

    // ── Estado de Situación Patrimonial
    const tot = per => {
      const AC = suma('AC', per), ANC = suma('ANC', per), PC = suma('PC', per), PNC = suma('PNC', per);
      const PNcuentas = suma('PN', per);
      const res = per === 'act' ? resNeto.act : resNeto.comp;
      const PN = r2(PNcuentas + (rub.pn_resej[per] ? 0 : res));
      return { AC, ANC, A: r2(AC + ANC), PC, PNC, P: r2(PC + PNC), PNcuentas, PN, PyPN: r2(PC + PNC + PN) };
    };
    const tA = tot('act'), tC = tot('comp');
    const ESP = { AC: lineas('AC'), ANC: lineas('ANC'), PC: lineas('PC'), PNC: lineas('PNC'), PN: lineas('PN'), tot: { act: tA, comp: tC } };
    const difA = r2(tA.A - tA.PyPN), difC = r2(tC.A - tC.PyPN);
    rep.controles.push({ control: 'ESP ejercicio actual: Activo = Pasivo + PN', ok: Math.abs(difA) <= EPS, diferencia: difA });
    if (hayComp) rep.controles.push({ control: 'ESP comparativo: Activo = Pasivo + PN', ok: Math.abs(difC) <= EPS * Math.max(1, coef), diferencia: difC });
    if (Math.abs(difA) > EPS) rep.errores.push(`El ESP del ejercicio no balancea: Activo − (Pasivo + PN) = ${fm(difA)}.`);
    if (hayComp && Math.abs(difC) > EPS * Math.max(1, coef)) rep.errores.push(`El ESP comparativo no balancea: diferencia ${fm(difC)}.`);
    if (tA.PN < 0) rep.advertencias.push('Patrimonio neto negativo: corresponde nota y párrafo de énfasis (art. 94 inc. 5° LGS).');

    // ── EEPN
    const colsPN = ['pn_capital', 'pn_ajuste', 'pn_aportes', 'pn_primas', 'pn_rlegal', 'pn_otras_res', 'pn_rna'];
    const inicio = {}, cierre = {}, distrib = {}, resultado = {}, otros = {};
    for (const c of colsPN) { inicio[c] = rub[c].comp; cierre[c] = rub[c].act; distrib[c] = 0; resultado[c] = 0; }
    inicio.pn_rna = r2(inicio.pn_rna + (rub.pn_resej.comp || 0) + (rub.pn_resej.comp ? 0 : resNeto.comp)); // RNA inicial incluye el resultado del ejercicio anterior
    cierre.pn_rna = r2(cierre.pn_rna + (rub.pn_resej.act || 0) + (rub.pn_resej.act ? 0 : resNeto.act));
    resultado.pn_rna = resNeto.act;
    const movDistrib = [];
    for (const d of md.distribucion || []) {
      const n = norm(d.concepto), v = r2(d.monto * (hayComp ? 1 : 1));
      if (/RESERVA LEGAL/.test(n)) { distrib.pn_rlegal += v; distrib.pn_rna -= v; movDistrib.push({ concepto: 'Reserva legal', monto: v }); }
      else if (/DIVIDENDO|HONORARIOS/.test(n)) { distrib.pn_rna -= v; movDistrib.push({ concepto: d.concepto, monto: v }); }
      else if (/RESERVA/.test(n)) { distrib.pn_otras_res += v; distrib.pn_rna -= v; movDistrib.push({ concepto: d.concepto, monto: v }); }
      else { distrib.pn_rna -= v; movDistrib.push({ concepto: d.concepto, monto: v }); }
    }
    // Nota: la distribución cargada en la metadata es la PROPUESTA sobre el resultado actual (se expone en nota),
    // la que impacta en el EEPN es la aprobada del ejercicio anterior. Se detecta por diferencia.
    const distribAprobada = {};
    for (const c of colsPN) { otros[c] = r2(cierre[c] - inicio[c] - resultado[c]); distribAprobada[c] = 0; }
    // Heurística: si Reserva legal aumentó y RNA bajó sin otra causa → absorción por asamblea
    if (otros.pn_rlegal > 0) { distribAprobada.pn_rlegal = otros.pn_rlegal; distribAprobada.pn_rna = -otros.pn_rlegal; otros.pn_rlegal = 0; otros.pn_rna = r2(otros.pn_rna + distribAprobada.pn_rlegal); }
    if (otros.pn_otras_res > 0 && otros.pn_rna < 0) { const t = Math.min(otros.pn_otras_res, -otros.pn_rna); distribAprobada.pn_otras_res = t; distribAprobada.pn_rna = r2(distribAprobada.pn_rna - t); otros.pn_otras_res = r2(otros.pn_otras_res - t); otros.pn_rna = r2(otros.pn_rna + t); }
    if (otros.pn_rna < 0) { distribAprobada.pn_rna = r2(distribAprobada.pn_rna + otros.pn_rna); distribAprobada._dividendos = r2(-otros.pn_rna); otros.pn_rna = 0; }
    const totalFila = o => r2(colsPN.reduce((s, c) => s + nz(o[c]), 0));
    const EEPN = {
      columnas: colsPN.map(c => ({ id: c, label: RUB[c].label })),
      filas: [
        { label: 'Saldos al inicio del ejercicio', v: inicio, total: totalFila(inicio) },
        { label: 'Distribución de resultados aprobada por asamblea (reservas / dividendos)', v: distribAprobada, total: totalFila(distribAprobada), opcional: true },
        (() => {
          const escala = colsPN.reduce((s, c) => s + Math.abs(inicio[c]) + Math.abs(cierre[c]), 0);
          const tol = Math.max(EPS, escala * 1e-5);
          const esRedondeo = colsPN.some(c => Math.abs(otros[c]) > 0.005) && colsPN.every(c => Math.abs(otros[c]) <= tol);
          return { label: esRedondeo ? 'Diferencias de redondeo por reexpresión' : 'Aportes, capitalizaciones y otros movimientos', v: otros, total: totalFila(otros), opcional: true,
            revisar: !esRedondeo && (Math.abs(totalFila(otros)) > EPS || colsPN.some(c => Math.abs(otros[c]) > EPS)) };
        })(),
        { label: 'Resultado del ejercicio', v: resultado, total: resNeto.act },
        { label: 'Saldos al cierre del ejercicio', v: cierre, total: totalFila(cierre), total_: true }
      ],
      comparativo: { inicio: r2(tC.PN - resNeto.comp), resultado: resNeto.comp, cierre: tC.PN },
      propuesta: movDistrib
    };
    if (EEPN.filas[2].revisar) rep.advertencias.push(`EEPN: hay movimientos de PN no explicados por el resultado ni por distribución de reservas (total ${fm(totalFila(otros))}). Se exponen como "Aportes, capitalizaciones y otros movimientos": revisá y detallá.`);
    if (distribAprobada._dividendos) rep.info.push(`EEPN: se infirió una distribución de dividendos/honorarios aprobada de ${fm(distribAprobada._dividendos)} (disminución de Resultados no asignados).`);
    if (Math.abs(EEPN.filas[4].total - tA.PN) > EPS) rep.errores.push('EEPN: el saldo final no coincide con el PN del ESP.');
    if (hayComp) rep.advertencias.push('EEPN comparativo: sin el balance de dos ejercicios atrás, la columna comparativa expone saldo inicial deducido (cierre − resultado). Si hubo aportes o dividendos en el ejercicio anterior, ajustalo.');

    // ── Anexo Bienes de uso
    const avBU = [];
    let BU = null;
    if (anexos && anexos.bu && anexos.bu.length) {
      BU = anexos.bu.map(x => {
        const o = Object.assign({}, x);
        const vbCalc = r2(nz(o.valor_bruto_inicio) + nz(o.altas) - nz(o.bajas) + nz(o.transferencias) + nz(o.revaluo));
        if (o.valor_bruto_cierre == null) o.valor_bruto_cierre = vbCalc;
        else if (Math.abs(o.valor_bruto_cierre - vbCalc) > EPS) avBU.push(`Anexo BU · ${o.categoria}: valor bruto de cierre ${o.valor_bruto_cierre} ≠ inicio + altas − bajas ± transf. + revalúo (${vbCalc}).`);
        const daCalc = r2(nz(o.dep_acum_inicio) - nz(o.dep_acum_bajas) + nz(o.dep_ejercicio) + nz(o.dep_acum_transferencias) + nz(o.dep_revaluo));
        if (o.dep_acum_cierre == null) o.dep_acum_cierre = daCalc;
        else if (Math.abs(o.dep_acum_cierre - daCalc) > EPS) avBU.push(`Anexo BU · ${o.categoria}: depreciación acumulada al cierre ${o.dep_acum_cierre} ≠ fórmula RT 54 (${daCalc}).`);
        const netoCalc = r2(o.valor_bruto_cierre - o.dep_acum_cierre - nz(o.perdidas_desvalorizacion));
        if (o.neto_actual == null) o.neto_actual = netoCalc;
        else if (Math.abs(o.neto_actual - netoCalc) > EPS) avBU.push(`Anexo BU · ${o.categoria}: neto actual ${o.neto_actual} ≠ bruto − depreciación (${netoCalc}).`);
        return o;
      });
      const totNeto = r2(BU.reduce((s, x) => s + nz(x.neto_actual), 0));
      const okBU = Math.abs(totNeto - rub.anc_bu.act) <= EPS;
      rep.controles.push({ control: `${modelo.anexos.bu} Bienes de uso: neto al cierre = rubro Bienes de uso del ESP`, ok: okBU, diferencia: r2(totNeto - rub.anc_bu.act) });
      if (!okBU) rep.advertencias.push(`Anexo de bienes de uso (${fm(totNeto)}) no coincide con el rubro Bienes de uso del ESP (${fm(rub.anc_bu.act)}).`);
      const totComp = r2(BU.reduce((s, x) => s + nz(x.neto_comparativo), 0));
      if (hayComp && totComp) { const okc = Math.abs(totComp - rub.anc_bu.comp) <= EPS * Math.max(1, coef); rep.controles.push({ control: 'Anexo BU: neto comparativo = Bienes de uso comparativo', ok: okc, diferencia: r2(totComp - rub.anc_bu.comp) }); }
    } else if (rub.anc_bu.act) {
      rep.faltantes.push('Anexo de bienes de uso: no se cargó. Se genera un anexo reducido desde las cuentas (sin altas, bajas ni depreciación del ejercicio).');
      const cats = {};
      for (const c of rub.anc_bu.cuentas) {
        const n = norm(c.nombre), esDep = /AMORT|DEPREC/.test(n);
        const base = n.replace(/AMORTIZACION(ES)?|DEPRECIACION(ES)?|ACUMULADAS?|AMORT\.?|DEP\.?|ACUM\.?|\bDE\b|\bDEL\b|[-.]/g, ' ').replace(/\s+/g, ' ').trim() || 'Otros';
        const k = Object.keys(cats).find(x => norm(x) === base || base.startsWith(norm(x)) || norm(x).startsWith(base)) || (esDep ? base : c.nombre);
        cats[k] = cats[k] || { categoria: k, valor_bruto_cierre: 0, dep_acum_cierre: 0, neto_actual: 0, neto_comparativo: 0 };
        if (esDep) cats[k].dep_acum_cierre = r2(cats[k].dep_acum_cierre - c.act); else cats[k].valor_bruto_cierre = r2(cats[k].valor_bruto_cierre + c.act);
        cats[k].neto_actual = r2(cats[k].neto_actual + c.act); cats[k].neto_comparativo = r2(cats[k].neto_comparativo + c.comp);
      }
      BU = Object.values(cats); BU._reducido = true;
    }
    rep.advertencias.push(...avBU);

    // ── Anexo Costo de ventas
    let CMV = null;
    const bcA = r2(rub.ac_bcambio.act + rub.anc_bcambio.act), bcC = r2(rub.ac_bcambio.comp + rub.anc_bcambio.comp);
    const cmvER = { act: -L('er_cmv').act, comp: -L('er_cmv').comp };
    if (anexos && anexos.cmv) {
      const g = (k, p) => { const x = anexos.cmv[norm(k)]; return x ? x[p] : null; };
      const per = p => {
        const ei = nz(g('Existencia inicial', p)), co = nz(g('Compras', p)), cp = nz(g('Costo de producción', p)), ef = nz(g('Existencia final', p));
        const f = (p === 'comparativo') ? coef : 1;
        let cv = g('Costo de ventas', p); const calc = r2(ei + co + cp - ef);
        if (cv == null) cv = calc;
        return { ei: r2(ei * f), compras: r2(co * f), prod: r2(cp * f), ef: r2(ef * f), cv: r2(cv * f), calc: r2(calc * f), cvCargado: g('Costo de ventas', p) != null };
      };
      CMV = { act: per('actual'), comp: per('comparativo'), fuente: 'anexo' };
      if (CMV.act.cvCargado && Math.abs(CMV.act.cv - CMV.act.calc) > EPS) rep.advertencias.push(`Anexo CMV: el costo de ventas cargado (${CMV.act.cv}) difiere del cálculo EI + compras + producción − EF (${CMV.act.calc}).`);
      const ok = Math.abs(CMV.act.cv - cmvER.act) <= EPS;
      rep.controles.push({ control: `${modelo.anexos.cmv} Costo de ventas = línea Costo del Estado de Resultados`, ok, diferencia: r2(CMV.act.cv - cmvER.act) });
      if (!ok) rep.advertencias.push(`Anexo CMV (${fm(CMV.act.cv)}) no coincide con el costo de ventas del ER (${fm(cmvER.act)}).`);
      const okEF = Math.abs(CMV.act.ef - bcA) <= EPS;
      rep.controles.push({ control: 'Anexo CMV: existencia final = Bienes de cambio del ESP', ok: okEF, diferencia: r2(CMV.act.ef - bcA) });
    } else if (cmvER.act) {
      CMV = { act: { ei: bcC, compras: r2(cmvER.act - bcC + bcA), prod: 0, ef: bcA, cv: cmvER.act }, comp: { ei: null, compras: null, prod: 0, ef: bcC, cv: cmvER.comp }, fuente: 'deducido' };
      rep.faltantes.push('Anexo de costo de ventas: no se cargó. Se deduce con existencias = Bienes de cambio y "Compras" por diferencia; en el comparativo falta la existencia inicial.');
    }

    // ── Anexo Gastos (art. 64 LGS)
    let GASTOS = null;
    const funcER = { comercializacion: -L('er_gcom').act, administracion: -L('er_gadm').act, costo_servicios: 0, gastos_financiacion: null };
    if (anexos && anexos.gastos) {
      GASTOS = { filas: anexos.gastos.map(g => { const o = Object.assign({}, g); for (const c of ['comercializacion', 'administracion', 'costo_servicios', 'gastos_financiacion']) o[c + '_comp'] = r2(nz(o[c + '_comp']) * coef); return o; }), fuente: 'anexo' };
      const tf = c => r2(GASTOS.filas.reduce((s, x) => s + nz(x[c]), 0));
      for (const [c, lbl, er] of [['comercializacion', 'Gastos de comercialización', 'er_gcom'], ['administracion', 'Gastos de administración', 'er_gadm']]) {
        const ok = Math.abs(tf(c) - (-L(er).act)) <= EPS;
        rep.controles.push({ control: `${modelo.anexos.gastos} Gastos: total ${lbl.toLowerCase()} = línea del ER`, ok, diferencia: r2(tf(c) + L(er).act) });
        if (!ok) rep.advertencias.push(`Anexo de gastos: ${lbl} (${fm(tf(c))}) no coincide con el ER (${fm((-L(er).act))}).`);
      }
    } else {
      const filas = [];
      for (const [id, fn] of [['er_gcom', 'comercializacion'], ['er_gadm', 'administracion'], ['er_gotros', 'administracion']]) {
        for (const c of rub[id].cuentas) {
          let f = filas.find(x => norm(x.concepto) === norm(c.nombre));
          if (!f) { f = { concepto: c.nombre, comercializacion: 0, administracion: 0, costo_servicios: 0, gastos_financiacion: 0, comercializacion_comp: 0, administracion_comp: 0, costo_servicios_comp: 0, gastos_financiacion_comp: 0 }; filas.push(f); }
          f[fn] = r2(f[fn] - c.act); f[fn + '_comp'] = r2(f[fn + '_comp'] - c.comp);
        }
      }
      if (filas.length) { GASTOS = { filas, fuente: 'cuentas' }; rep.info.push('Anexo de gastos generado desde las cuentas de resultado (una fila por cuenta). Para agrupar por naturaleza cargá el template anexo_gastos.'); }
    }
    void funcER;

    // ── Activos biológicos (Agro)
    let BIO = null;
    if (modelo.id === 'agro') {
      if (anexos && anexos.bio && (anexos.bio.bio || anexos.bio.costos)) {
        BIO = anexos.bio;
        if (BIO.bio) {
          const t = r2(BIO.bio.reduce((s, x) => s + nz(x.neto_actual), 0)), rb = r2(rub.anc_bio.act + rub.ac_bio.act);
          const ok = Math.abs(t - rb) <= EPS;
          rep.controles.push({ control: `${modelo.anexos.bio} Activos biológicos = rubros Activos biológicos del ESP`, ok, diferencia: r2(t - rb) });
          if (!ok) rep.advertencias.push(`Anexo de activos biológicos (${fm(t)}) no coincide con el ESP (${fm(rb)}).`);
        }
      } else rep.faltantes.push('Modelo Agro: falta el anexo de activos biológicos (Anexo IV) y la distribución de costos agropecuarios.');
    }

    // ── Estado de Flujo de Efectivo
    const eqEfvo = !!(opciones && opciones.inversionesSonEfectivo);
    const efvo = per => r2(rub.ac_caja[per] + (eqEfvo ? rub.ac_inv[per] : 0));
    const d = id => r2(rub[id].act - rub[id].comp);
    let depEj = 0, depFuente = '';
    if (BU && !BU._reducido) { depEj = r2(BU.reduce((s, x) => s + nz(x.dep_ejercicio), 0)); depFuente = 'Anexo de bienes de uso'; }
    else { depEj = r2(-[...rub.er_gcom.cuentas, ...rub.er_gadm.cuentas, ...rub.er_gotros.cuentas, ...rub.er_cmv.cuentas].filter(c => /AMORTIZ|DEPRECIA/.test(norm(c.nombre))).reduce((s, c) => s + c.act, 0)); depFuente = 'cuentas de amortización del ER'; }
    let EFE;
    if (md.efeDirecto) {
      EFE = { metodo: 'directo', manual: true, datos: md.efeDirecto };
      rep.info.push('EFE: método directo cargado manualmente en la metadata.');
    } else if (md.efeActual) {
      EFE = { metodo: 'indirecto', manual: true, datos: md.efeActual };
      rep.info.push('EFE: método indirecto cargado manualmente en la metadata (hoja "EFE Ejercicio Actual").');
    } else {
      const op = [
        ['Resultado neto del ejercicio', resNeto.act],
        ['Depreciaciones y amortizaciones', depEj],
        ['(Aumento) / disminución de créditos por ventas', -r2(d('ac_cred_ventas') + d('anc_cred_ventas'))],
        ['(Aumento) / disminución de otros créditos', -r2(d('ac_otros_cred') + d('anc_otros_cred'))],
        ['(Aumento) / disminución de bienes de cambio', -r2(d('ac_bcambio') + d('anc_bcambio'))],
        ...(modelo.id === 'agro' ? [['(Aumento) / disminución de activos biológicos', -r2(d('ac_bio') + d('anc_bio'))]] : []),
        ['(Aumento) / disminución de otros activos corrientes', -d('ac_otros')],
        ['Aumento / (disminución) de deudas comerciales', r2(d('pc_comerciales') + d('pnc_comerciales'))],
        ['Aumento / (disminución) de remuneraciones y cargas sociales', d('pc_remun')],
        ['Aumento / (disminución) de cargas fiscales', r2(d('pc_fiscales') + d('pnc_fiscales'))],
        ['Aumento / (disminución) de anticipos de clientes y otras deudas', r2(d('pc_anticipos') + d('pc_otras') + d('pnc_otras') + d('pc_prev') + d('pnc_prev'))]
      ];
      const inv = [
        ['Adquisiciones netas de bienes de uso', -r2(d('anc_bu') + depEj)],
        ['Variación de inversiones corrientes (no equivalentes de efectivo)', eqEfvo ? 0 : -d('ac_inv')],
        ['Variación de activos intangibles, propiedades de inversión y llave', -r2(d('anc_intang') + d('anc_pi') + d('anc_llave'))],
        ['Variación de inversiones no corrientes y otros activos no corrientes', -r2(d('anc_inv') + d('anc_otros'))]
      ];
      const pnSinRes = r2((tA.PN - resNeto.act) - tC.PN);
      const fin = [
        ['Aumento / (disminución) de préstamos', r2(d('pc_prestamos') + d('pnc_prestamos'))],
        ['Aportes de capital, dividendos pagados y otros movimientos del PN', r2(pnSinRes + d('pc_dividendos'))]
      ];
      const t = a => r2(a.reduce((s, x) => s + x[1], 0));
      const tOp = t(op), tInv = t(inv), tFin = t(fin);
      const ini = efvo('comp'), fin_ = efvo('act'), varReal = r2(fin_ - ini), varCausas = r2(tOp + tInv + tFin);
      EFE = { metodo: 'indirecto', manual: false, inicio: ini, cierre: fin_, variacion: varReal, operativas: op, inversion: inv, financiacion: fin, tOp, tInv, tFin, varCausas, depFuente, eqEfvo };
      const ok = Math.abs(varReal - varCausas) <= EPS * 2;
      rep.controles.push({ control: 'EFE: variación del efectivo = suma de causas', ok, diferencia: r2(varReal - varCausas) });
      if (!ok) rep.errores.push(`EFE: no cierra por ${fm(r2(varReal - varCausas))} (suele indicar un ESP que no balancea o una cuenta mal mapeada).`);
      if (!hayComp) rep.advertencias.push('EFE: sin balance comparativo el efectivo inicial y las variaciones se calculan contra cero (primer ejercicio). Si no es el primer ejercicio, cargá el comparativo.');
      rep.info.push(`EFE: depreciaciones tomadas de ${depFuente} (${fm(depEj)}).`);
    }
    EFE.anterior = md.efeAnterior || null;

    // ── Metadata faltante
    const obligatorios = ['Razón Social', 'CUIT', 'Actividad Principal', 'Domicilio Legal', 'Fecha Inicio Ejercicio', 'Fecha Cierre Ejercicio', 'Número de Ejercicio'];
    for (const k of obligatorios) if (!G(md, k)) rep.faltantes.push(`Metadata: falta "${k}".`);
    if (hayComp && !G(md, 'Fecha Cierre Comparativo')) rep.faltantes.push('Metadata: falta "Fecha Cierre Comparativo".');
    for (const k of ['Contador Público', 'Tomo', 'Folio', 'Fecha Informe Contador']) if (!G(md, k)) rep.faltantes.push(`Metadata: falta "${k}" (firma del contador).`);
    if (!md.capital.length && rub.pn_capital.act) rep.faltantes.push('Metadata: falta la composición del capital (hoja Composicion Capital).');
    if (md.capital.length) {
      const sus = r2(md.capital.reduce((s, x) => s + nz(x.suscripto), 0));
      const ok = Math.abs(sus - rub.pn_capital.act) <= EPS;
      rep.controles.push({ control: 'Composición del capital (suscripto) = Capital del ESP', ok, diferencia: r2(sus - rub.pn_capital.act) });
      if (!ok) rep.advertencias.push(`Capital suscripto según metadata (${fm(sus)}) ≠ Capital del ESP (${fm(rub.pn_capital.act)}).`);
    }
    for (const n of md.notas) if (!n.detalle) rep.faltantes.push(`Nota "${n.tipo}": sin detalle.`);
    if (hayComp && (!coef || coef === 1)) rep.advertencias.push('Comparativo sin reexpresar (coeficiente = 1). Si hubo inflación en el período, cargá el índice de actualización.');
    rep.advertencias.push(...(md.avisos || []));

    // ── Notas
    const cierreTxt = fecha(G(md, 'Fecha Cierre Ejercicio')) || '[fecha de cierre]';
    const NOTAS = [];
    NOTAS.push({ titulo: 'Normas contables aplicadas', texto:
      `Los presentes estados contables han sido preparados de acuerdo con las normas contables profesionales argentinas contenidas en la Resolución Técnica N° 54 (Norma Unificada Argentina de Contabilidad) de la FACPCE, adoptada por el ${modelo.consejo}` +
      (modelo.id === 'agro' ? ', incluidas las disposiciones aplicables a la actividad agropecuaria' : '') + '.\n' +
      `Las cifras se presentan en moneda homogénea de ${cierreTxt}` + (hayComp ? `. Las cifras del ejercicio comparativo han sido reexpresadas aplicando el coeficiente ${String(coef).replace('.', ',')}` + (G(md, 'Denominación Moneda') ? ` (${G(md, 'Denominación Moneda')})` : '') : '') + '.' });
    const detalle = [];
    for (const g of ['AC', 'ANC', 'PC', 'PNC']) for (const r of RUBROS.filter(x => x.grupo === g)) if (rub[r.id].cuentas.length > 1 || (rub[r.id].cuentas.length === 1 && r.id !== 'ac_caja')) {
      if (!rub[r.id].act && !rub[r.id].comp) continue;
      detalle.push({ rubro: `${r.label} (${{ AC: 'corriente', ANC: 'no corriente', PC: 'corriente', PNC: 'no corriente' }[g]})`, cuentas: rub[r.id].cuentas, act: rub[r.id].act, comp: rub[r.id].comp });
    }
    NOTAS.push({ titulo: 'Composición de los principales rubros', tabla: detalle });
    if (md.capital.length) NOTAS.push({ titulo: 'Capital social', capital: md.capital });
    for (const n of md.notas) NOTAS.push({ titulo: n.tipo, texto: n.detalle || (modoFinal ? '' : '[COMPLETAR]') });
    if (movDistrib.length) NOTAS.push({ titulo: 'Propuesta de distribución de resultados', distribucion: movDistrib, resultado: resNeto.act });
    if (tA.PN < 0) NOTAS.push({ titulo: 'Patrimonio neto negativo', texto: 'Al cierre del ejercicio el patrimonio neto de la sociedad resulta negativo, encontrándose comprendida en la causal de disolución prevista en el artículo 94 inciso 5° de la Ley General de Sociedades. [COMPLETAR con las medidas previstas por los socios/accionistas].' });

    return {
      modelo, metadata: md, datos: {
        razonSocial: G(md, 'Razón Social'), cuit: G(md, 'CUIT'), actividad: G(md, 'Actividad Principal'), domicilio: G(md, 'Domicilio Legal'),
        duracion: G(md, 'Duración de la Entidad'), inscripcion: fecha(G(md, 'Fecha de Inscripción del Estatuto')), modificacion: fecha(G(md, 'Fecha Última Modificación del Estatuto')),
        registro: G(md, 'Número IGJ / Legajo'), nroEjercicio: G(md, 'Número de Ejercicio'), inicio: fecha(G(md, 'Fecha Inicio Ejercicio')), cierre: fecha(G(md, 'Fecha Cierre Ejercicio')),
        inicioComp: fecha(G(md, 'Fecha Inicio Comparativo')), cierreComp: fecha(G(md, 'Fecha Cierre Comparativo')),
        contador: G(md, 'Contador Público'), matricula: G(md, 'Matrícula'), tomo: G(md, 'Tomo'), folio: G(md, 'Folio'), consejo: G(md, 'Consejo Profesional'), cuitContador: G(md, 'CUIT Contador'),
        fechaInforme: fecha(G(md, 'Fecha Informe Contador')), moneda: G(md, 'Denominación Moneda'), coef, modoFinal, hayComp
      },
      ESP, ER, EEPN, EFE, NOTAS, anexos: { BU, CMV, GASTOS, BIO }, rubros: rub, reporte: rep
    };
  }

  function reporteJSON(bal, extra) {
    const rep = bal.reporte;
    return Object.assign({
      generado: new Date().toISOString(), generador: 'ImpoBot · Balance de Presentación RT 54', modelo: bal.modelo.nombre,
      entidad: bal.datos.razonSocial || null, cuit: bal.datos.cuit || null, cierre: bal.datos.cierre || null,
      estado: rep.errores.length ? 'con_errores' : rep.advertencias.length || rep.faltantes.length ? 'con_advertencias' : 'ok',
      totales: { activo: bal.ESP.tot.act.A, pasivo: bal.ESP.tot.act.P, patrimonioNeto: bal.ESP.tot.act.PN, resultadoNeto: bal.ER.resNeto.act,
        comparativo: bal.datos.hayComp ? { activo: bal.ESP.tot.comp.A, pasivo: bal.ESP.tot.comp.P, patrimonioNeto: bal.ESP.tot.comp.PN, resultadoNeto: bal.ER.resNeto.comp } : null },
      controles: rep.controles, errores: rep.errores, advertencias: rep.advertencias, datosFaltantes: rep.faltantes, informacion: rep.info
    }, extra || {});
  }

  // Coeficiente estimado a partir de (Capital + Ajuste de capital) actual / comparativo (sin aportes en el ejercicio)
  function estimarCoef(act, comp, modelo) {
    const tot = lista => lista.reduce((s, c) => { const r = sugerirRubro({ codigo: c.codigo, nombre: c.nombre, saldo: c.saldo }, modelo || 'caba').rubro; return s + (r === 'pn_capital' || r === 'pn_ajuste' ? -c.saldo : 0); }, 0);
    const a = tot(act), c = tot(comp || []);
    if (a > 0 && c > 0 && a / c > 1.0001 && a / c < 20) return Math.round(a / c * 1e6) / 1e6;
    return null;
  }

  return { estimarCoef, RUBROS, RUB, rubrosPara, MODELOS, num, fecha, norm, r2, leerSumasYSaldos, sugerirRubro, claveCta, unirCuentas, grupoPorCodigo,
    leerMetadata, leerAnexoBU, leerAnexoCMV, leerAnexoGastos, leerBiologicos, construir, reporteJSON };
});
