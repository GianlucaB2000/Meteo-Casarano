// ═══ ROSA DEI VENTI v2 — frequenze per direzione + slider orario ═══
// Va incluso in index.html con:  <script src="rosa.js"></script>  prima di </body>
// Sfondo opzionale: carica nel repository un'immagine quadrata "mappa.jpg".
(function(){
    'use strict';

    const SIZE = 240;
    const MAP_OPACITY = 1;         // 0-1: opacità della mappa di sfondo
    const MAP_DIM = 0.10;          // 0-1: leggero scurimento sopra la mappa (0 = nessuno)
    const BANDS = [2.5, 7.5, 12.5, 17.5, 25];           // colori = legenda km/h esistente
    const BAND_LIM = [5, 10, 15, 20];
    const SH = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
    function bandOf(v){ for(let i=0;i<BAND_LIM.length;i++){ if(v<BAND_LIM[i]) return i; } return 4; }

    let series=[], stats=null, period='24h', scrub=false, s24=[];
    let liveDir=0, liveSpeed=0, bgOk=false;

    // ─── Interfaccia: sostituisce i vecchi pulsanti, aggiunge periodo + slider ───
    const cv=el('cmp');
    if(!cv){ console.warn('[rosa] canvas non trovato'); return; }
    cv.width=SIZE; cv.height=SIZE; cv.style.maxWidth='100%';
    const oldToggle=document.querySelector('.wr-toggle');
    const ctl=document.createElement('div');
    ctl.style.cssText='margin-top:8px;width:'+SIZE+'px;max-width:100%;';
    ctl.innerHTML =
      '<div class="wr-toggle" style="justify-content:center;margin-top:0;">' +
        '<button class="wr-btn" id="rsB3h">3 ore</button>' +
        '<button class="wr-btn active" id="rsB24h">24 ore</button>' +
      '</div>' +
      '<input type="range" id="rsSl" min="0" max="0" value="0" style="width:100%;margin-top:10px;accent-color:#58a6ff;">' +
      '<div style="display:flex;justify-content:space-between;font-size:.55rem;color:var(--sub);"><span>-24h</span><button class="wr-btn" id="rsLive" style="padding:1px 8px;">● Adesso</button></div>' +
      '<div id="rsInfo" style="font-size:.62rem;color:var(--sub);line-height:1.6;margin-top:6px;text-align:center;">Caricamento storico…</div>';
    if(oldToggle){ oldToggle.style.display='none'; oldToggle.parentNode.insertBefore(ctl, oldToggle.nextSibling); }
    else cv.parentNode.appendChild(ctl);

    // Sfondo mappa (opzionale)
    const bg=new Image();
    bg.onload=function(){ bgOk=true; render(); };
    bg.src='mappa.jpg';

    // ─── Statistiche del periodo ───
    function cutoff(){ const h=period==='3h'?3:24; return Date.now()-h*3600000; }
    function rebuild(){
        const now=Date.now();
        s24=series.filter(function(p){ return p.t>=now-24*3600000; });
        const sl=el('rsSl');
        if(!scrub){ sl.max=Math.max(0,s24.length-1); sl.value=sl.max; }
        const sel=series.filter(function(p){ return p.t>=cutoff(); });
        const cnt=[]; for(let i=0;i<16;i++) cnt.push([0,0,0,0,0]);
        let calm=0, tot=0, sumV=0;
        sel.forEach(function(p){
            tot++; sumV+=p.v;
            if(p.v<1){ calm++; return; }
            const b=Math.round((((p.d%360)+360)%360)/22.5)%16;
            cnt[b][bandOf(p.v)]++;
        });
        let best=0, bestN=-1, maxN=0;
        cnt.forEach(function(c,i){ const n=c.reduce(function(a,b){return a+b;},0); if(n>bestN){ bestN=n; best=i; } if(n>maxN) maxN=n; });
        stats={cnt:cnt, tot:tot, calm:calm, best:best, bestN:bestN, maxN:maxN, avg:tot?sumV/tot:0};
        render();
    }

    // ─── Disegno ───
    function render(){
        const ctx=cv.getContext('2d'), W=cv.width, cx=W/2, cy=W/2, R=W/2-4;
        ctx.clearRect(0,0,W,W);
        // fondo
        ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,2*Math.PI); ctx.clip();
        const g=ctx.createRadialGradient(cx,cy,R*0.2,cx,cy,R);
        g.addColorStop(0,'#1e2d3d'); g.addColorStop(1,'#0d1117');
        ctx.fillStyle=g; ctx.fillRect(0,0,W,W);
        if(bgOk){ ctx.globalAlpha=MAP_OPACITY; const sq=Math.min(bg.width,bg.height); ctx.drawImage(bg,(bg.width-sq)/2,(bg.height-sq)/2,sq,sq,cx-R,cy-R,2*R,2*R); ctx.globalAlpha=1; if(MAP_DIM>0){ ctx.fillStyle='rgba(13,17,23,'+MAP_DIM+')'; ctx.fillRect(0,0,W,W); } }
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx,cy,R,0,2*Math.PI); ctx.strokeStyle='#58a6ff'; ctx.lineWidth=2; ctx.stroke();

        const r0=R*0.20, rMax=R*0.66;
        // anelli di scala (percentuale)
        ctx.font='8px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
        if(stats && stats.tot>0 && stats.maxN>0){
            const maxPct=stats.maxN/stats.tot*100;
            [0.5,1].forEach(function(f){
                const r=r0+(rMax-r0)*f;
                ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.strokeStyle='rgba(139,148,158,0.35)'; ctx.lineWidth=1; ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);
                ctx.fillStyle='#8b949e'; ctx.fillText((maxPct*f).toFixed(0)+'%', cx+3, cy-r+1);
            });
            // petali a strati di velocità
            for(let i=0;i<16;i++){
                const ang=i*22.5, a0=(ang-90-9)*Math.PI/180, a1=(ang-90+9)*Math.PI/180;
                let acc=0;
                for(let b=0;b<5;b++){
                    const n=stats.cnt[i][b]; if(!n) continue;
                    const rin=r0+(rMax-r0)*(acc/stats.maxN);
                    acc+=n;
                    const rout=r0+(rMax-r0)*(acc/stats.maxN);
                    ctx.beginPath(); ctx.arc(cx,cy,rout,a0,a1); ctx.arc(cx,cy,rin,a1,a0,true); ctx.closePath();
                    ctx.fillStyle=speedColor(BANDS[b],1); ctx.fill();
                    ctx.strokeStyle='rgba(13,17,23,0.85)'; ctx.lineWidth=0.8; ctx.stroke();
                }
            }
        }
        // centro: direzione prevalente
        ctx.beginPath(); ctx.arc(cx,cy,r0,0,2*Math.PI); ctx.fillStyle='rgba(13,17,23,0.85)'; ctx.fill();
        ctx.strokeStyle='#30363d'; ctx.lineWidth=1; ctx.stroke();
        ctx.textAlign='center';
        if(stats && stats.tot>0 && stats.bestN>0){
            ctx.fillStyle='#e3b341'; ctx.font='bold 13px sans-serif'; ctx.fillText(SH[stats.best], cx, cy-4);
            ctx.fillStyle='#cdd9e5'; ctx.font='9px sans-serif'; ctx.fillText((stats.bestN/stats.tot*100).toFixed(0)+'%', cx, cy+9);
        } else { ctx.fillStyle='#8b949e'; ctx.font='9px sans-serif'; ctx.fillText('--', cx, cy); }
        // tacche e lettere
        for(let i=0;i<36;i++){ const a=i*10*Math.PI/180-Math.PI/2, big=i%9===0; const ra=big?R*0.90:R*0.94; ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*ra,cy+Math.sin(a)*ra); ctx.lineTo(cx+Math.cos(a)*R*0.98,cy+Math.sin(a)*R*0.98); ctx.strokeStyle=big?'#8b949e':'#30363d'; ctx.lineWidth=big?1.3:0.7; ctx.stroke(); }
        ctx.textBaseline='middle';
        [['N',0],['E',90],['S',180],['O',270]].forEach(function(x){ const a=(x[1]-90)*Math.PI/180; ctx.font='bold 11px sans-serif'; const lx=cx+Math.cos(a)*R*0.80, ly=cy+Math.sin(a)*R*0.80; ctx.lineWidth=3; ctx.strokeStyle='rgba(13,17,23,0.95)'; ctx.strokeText(x[0],lx,ly); ctx.fillStyle=x[0]==='N'?'#ff6b63':'#ffffff'; ctx.fillText(x[0],lx,ly); });
        // triangolo sul bordo che punta verso il centro, dal lato da cui arriva il vento
        const cur=curSample();
        const ang=(cur.d-90)*Math.PI/180, ux=Math.cos(ang), uy=Math.sin(ang), px=-uy, py=ux;
        const rTip=R*0.66, rBase=R*0.95, hw=12;
        const fill=cur.live ? '#ffd60a' : '#38bdf8';   // giallo = adesso, azzurro = storico (slider)
        ctx.beginPath();
        ctx.moveTo(cx+ux*rTip, cy+uy*rTip);
        ctx.lineTo(cx+ux*rBase+px*hw, cy+uy*rBase+py*hw);
        ctx.lineTo(cx+ux*rBase-px*hw, cy+uy*rBase-py*hw);
        ctx.closePath();
        ctx.lineJoin='round';
        ctx.strokeStyle='rgba(0,0,0,0.95)'; ctx.lineWidth=8; ctx.stroke();   // alone nero
        ctx.strokeStyle='#ffffff';          ctx.lineWidth=4; ctx.stroke();   // bordo bianco
        ctx.fillStyle=fill; ctx.fill();
        updateInfo(cur);
    }

    function curSample(){
        if(scrub && s24.length){ const i=Math.min(s24.length-1, parseInt(el('rsSl').value,10)||0); return s24[i]; }
        return { t:Date.now(), d:liveDir, v:liveSpeed, g:NaN, live:true };
    }
    function pad(n){ return String(n).padStart(2,'0'); }
    function updateInfo(cur){
        const box=el('rsInfo'); if(!box) return;
        let html='';
        if(stats && stats.tot>0){
            const nm=windMedName(stats.best*22.5).n;
            const lbl=period==='3h'?'3 ore':'24 ore';
            html+='Prevalente ('+lbl+'): <span style="color:#e3b341">'+nm+' '+(stats.bestN/stats.tot*100).toFixed(0)+'%</span> · media '+stats.avg.toFixed(1)+' km/h · calma '+(stats.calm/stats.tot*100).toFixed(0)+'%<br>';
        }
        if(cur.live){ html+='<span style="color:var(--grn)">● Adesso</span>: '+windMedName(cur.d).n+' '+cur.d.toFixed(0)+'° · '+cur.v.toFixed(1)+' km/h'; }
        else { const d=new Date(cur.t); html+='<span style="color:#58a6ff">'+pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes())+'</span> (media 10′): '+windMedName(cur.d).n+' '+cur.d.toFixed(0)+'° · '+cur.v.toFixed(1)+' km/h'+(isNaN(cur.g)?'':' · raffica '+cur.g.toFixed(0)); }
        box.innerHTML=html;
    }

    // ─── Eventi ───
    function setPeriod(p){
        period=p;
        ['3h','24h'].forEach(function(x){ el('rsB'+x).classList.toggle('active',x===p); });
        rebuild();
    }
    el('rsB3h').onclick=function(){ setPeriod('3h'); };
    el('rsB24h').onclick=function(){ setPeriod('24h'); };
    el('rsSl').addEventListener('input',function(){ scrub=true; render(); });
    el('rsLive').onclick=function(){ scrub=false; const sl=el('rsSl'); sl.value=sl.max; render(); };

    // La pagina chiama drawCompass(dir, vel) ogni 15 s con il dato live: lo intercettiamo.
    window.drawCompass=function(dir,speed){ liveDir=dir||0; liveSpeed=speed||0; render(); };

    // Media a 10 minuti: velocità = media aritmetica, direzione = media VETTORIALE
    // pesata per la velocità (evita l'errore a cavallo di 0°/360°), raffica = massimo.
    function bucket10(pts){
        const m={};
        pts.forEach(function(p){ const k=Math.floor(p.t/600000); (m[k]=m[k]||[]).push(p); });
        return Object.keys(m).map(Number).sort(function(a,b){return a-b;}).map(function(k){
            const a=m[k]; let sx=0, sy=0, sv=0, g=NaN;
            a.forEach(function(p){
                const r=p.d*Math.PI/180;
                sx+=p.v*Math.sin(r); sy+=p.v*Math.cos(r); sv+=p.v;
                if(!isNaN(p.g) && (isNaN(g) || p.g>g)) g=p.g;
            });
            let d=Math.atan2(sx,sy)*180/Math.PI; d=(d+360)%360;
            if(sx*sx+sy*sy<1e-6) d=a[a.length-1].d;
            return { t:k*600000+300000, d:d, v:sv/a.length, g:g };
        });
    }

    // ─── Dati: ultime 24 ore grezze (1 richiesta, ~1400 righe), poi media a 10 minuti ───
    let busy=false;
    function loadSeries(){
        if(busy) return; busy=true;
        const end=new Date(), start=new Date(end.getTime()-24*3600000);
        fetchThingSpeakRange(start,end,null,4).then(function(feeds){
            feeds=despikeWind(feeds||[]);
            const pts=feeds.map(function(f){ return { t:new Date(f.created_at).getTime(), d:parseFloat(f.field6), v:parseFloat(f.field4), g:parseFloat(f.field5) }; })
                        .filter(function(p){ return !isNaN(p.d)&&!isNaN(p.v)&&p.d>=0&&p.d<=360; });
            series=bucket10(pts);
            rebuild();
        }).catch(function(e){ console.warn('[rosa]',e); })
          .finally(function(){ busy=false; });
    }
    setTimeout(loadSeries,7000);
    setInterval(loadSeries,300000);
    render();
})();
