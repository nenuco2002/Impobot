(function(){
  'use strict';
  if(document.getElementById('impobot-report-button')) return;
  var title=(document.querySelector('h1')||{}).textContent||document.title||'Herramienta ImpoBot';
  title=title.trim();
  var button=document.createElement('button');
  button.id='impobot-report-button';
  button.type='button';
  button.title='Reportar un problema';
  button.setAttribute('aria-label','Reportar un problema en '+title);
  button.style.cssText='position:fixed;bottom:126px;right:20px;z-index:998;background:#fff;border:1px solid #d0d5dd;width:44px;height:44px;border-radius:50%;padding:0;cursor:pointer;box-shadow:0 2px 12px rgba(16,24,40,.18);transition:all .2s;overflow:hidden';
  button.innerHTML='<img src="/mascot-report.png" alt="" style="width:100%;height:100%;object-fit:cover">';
  button.addEventListener('mouseenter',function(){button.style.transform='scale(1.06)';button.style.borderColor='#0b82f5'});
  button.addEventListener('mouseleave',function(){button.style.transform='scale(1)';button.style.borderColor='#d0d5dd'});
  var overlay=document.createElement('div');
  overlay.id='impobot-report-modal';
  overlay.style.cssText='display:none;position:fixed;inset:0;background:rgba(15,23,42,.65);z-index:9999;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML='<div role="dialog" aria-modal="true" aria-label="Reportar un problema" style="background:#fff;color:#101828;border-radius:16px;padding:24px;max-width:440px;width:100%;font:14px Arial,sans-serif;box-shadow:0 10px 40px #0005">'+
    '<button type="button" data-close aria-label="Cerrar" style="float:right;background:none;border:0;font-size:20px;cursor:pointer;color:#475467">×</button>'+
    '<h2 style="font-size:18px;margin:0 0 6px">🐞 Reportar un problema</h2><p style="margin:0 0 16px;color:#475467">Ayudanos a mejorar ImpoBot.</p>'+
    '<form><label style="display:block;margin-bottom:5px">Herramienta afectada</label><input data-tool readonly style="box-sizing:border-box;width:100%;padding:9px;border:1px solid #d0d5dd;border-radius:8px;margin-bottom:12px;background:#f9fafb">'+
    '<label style="display:block;margin-bottom:5px">Descripción del problema *</label><textarea data-desc required rows="4" placeholder="¿Qué pasó? ¿Qué resultado esperabas?" style="box-sizing:border-box;width:100%;padding:9px;border:1px solid #d0d5dd;border-radius:8px;margin-bottom:12px;resize:vertical"></textarea>'+
    '<label style="display:block;margin-bottom:5px">Tu email (opcional)</label><input data-email type="email" style="box-sizing:border-box;width:100%;padding:9px;border:1px solid #d0d5dd;border-radius:8px;margin-bottom:12px">'+
    '<div data-msg role="status" style="margin-bottom:8px"></div><button type="submit" style="background:#0b82f5;color:#fff;border:0;border-radius:8px;padding:10px;width:100%;cursor:pointer;font-weight:bold">Enviar reporte</button></form></div>';
  document.body.appendChild(button);
  document.body.appendChild(overlay);
  var field=overlay.querySelector('[data-tool]');field.value=title;
  function close(){overlay.style.display='none';button.focus()}
  button.addEventListener('click',function(){overlay.style.display='flex';overlay.querySelector('[data-desc]').focus()});
  overlay.querySelector('[data-close]').addEventListener('click',close);
  overlay.addEventListener('click',function(e){if(e.target===overlay)close()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&overlay.style.display==='flex')close()});
  overlay.querySelector('form').addEventListener('submit',function(e){
    e.preventDefault();
    var desc=overlay.querySelector('[data-desc]').value.trim();if(!desc)return;
    var email=overlay.querySelector('[data-email]').value.trim();
    var msg=overlay.querySelector('[data-msg]');msg.textContent='Enviando…';
    fetch('https://formspree.io/f/xpwzakqj',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({herramienta:title,descripcion:desc,email:email,url:location.href})})
      .then(function(r){if(!r.ok)throw Error('No se pudo enviar');msg.textContent='✓ Reporte enviado. Gracias.';setTimeout(close,1800)})
      .catch(function(){msg.textContent='No se pudo enviar desde el formulario. Abrimos tu correo para completar el reporte.';location.href='mailto:impobot.ar@gmail.com?subject='+encodeURIComponent('Bug en '+title)+'&body='+encodeURIComponent(desc+'\n'+email)});
  });
})();
