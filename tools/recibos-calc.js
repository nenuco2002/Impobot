(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RecibosCalc=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function centavos(n){return Math.round((Number(n)||0)*100);}
  function esGanancias(d){return String(d.code||'').replace(/^0+/,'')==='209'||/ganancias|retenci[oó]n\s+(?:de\s+)?(?:4ta|cuarta|4ª)/i.test(d.desc||'');}
  function ganancias(descuentos){return (descuentos||[]).filter(esGanancias).reduce(function(s,d){return s+centavos(d.monto);},0)/100;}
  function liquidar(bruto,descuentos,gananciasNueva,redondear){
    var anterior=ganancias(descuentos),actual=Number(gananciasNueva);
    if(!Number.isFinite(actual)||actual<0)throw Error('La retención de Ganancias debe ser un importe válido.');
    var total=(descuentos||[]).reduce(function(s,d){return s+centavos(d.monto);},0)-centavos(anterior)+centavos(actual);
    var antes=centavos(bruto)-total;
    var ajuste=redondear?Math.round(antes/100)*100-antes:0;
    return {totalDesc:total/100,netoBase:antes/100,redondeo:ajuste/100,neto:(antes+ajuste)/100};
  }
  return {esGanancias:esGanancias,ganancias:ganancias,liquidar:liquidar};
});
