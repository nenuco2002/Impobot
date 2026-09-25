const { test } = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../tools/recibos-calc.js');

test('identifica retención de Ganancias aunque el código venga como 208', () => {
  const discounts = [{code:'0208',desc:'Impuesto a las Ganancias',monto:1507093.96}];
  assert.equal(calc.ganancias(discounts),1507093.96);
  const recibo=calc.liquidar(8576625,discounts,1507093.96,true);
  assert.equal(recibo.totalDesc,1507093.96);
  assert.equal(recibo.netoBase,7069531.04);
  assert.equal(recibo.redondeo,-0.04);
  assert.equal(recibo.neto,7069531);
});

test('editar Ganancias modifica neto y evita descontarla dos veces', () => {
  const discounts=[{code:'0201',desc:'Jubilación',monto:110},{code:'0209',desc:'Ganancias',monto:200}];
  assert.deepEqual(calc.liquidar(1000,discounts,201.33,true),{
    totalDesc:311.33,netoBase:688.67,redondeo:0.33,neto:689
  });
});

test('mantiene los centavos si se desactiva el ajuste', () => {
  assert.equal(calc.liquidar(1000.12,[],0,false).neto,1000.12);
});
