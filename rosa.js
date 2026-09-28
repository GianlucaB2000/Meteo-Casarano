// ═══ ROSA DEI VENTI v2 — frequenze per direzione + slider orario ═══
// Va incluso in index.html con:  <script src="rosa.js"></script>  prima di </body>
// Sfondo opzionale: carica nel repository un'immagine quadrata "mappa.jpg".
(function(){
    'use strict';

    const SIZE = 240;
    const ARROW_DOWNWIND = false;   // false = freccia verso la provenienza del vento; true = verso dove va
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
        '<button class="wr-btn" id="rsB7d">7 giorni</button>' +
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
    function cutoff(){ const h=period==='3h'?3:period==='24h'?24:168; return Date.now()-h*3600000; }
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
        if(bgOk){ ctx.globalAlpha=0.55; const sq=Math.min(bg.width,bg.height); ctx.drawImage(bg,(bg.width-sq)/2,(bg.height-sq)/2,sq,sq,cx-R,cy-R,2*R,2*R); ctx.globalAlpha=1; ctx.fillStyle='rgba(13,17,23,0.45)'; ctx.fillRect(0,0,W,W); }
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
                    ctx.fillStyle=speedColor(BANDS[b],0.9); ctx.fill();
                    ctx.strokeStyle='rgba(13,17,23,0.6)'; ctx.lineWidth=0.5; ctx.stroke();
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
        [['N',0],['E',90],['S',180],['O',270]].forEach(function(x){ const a=(x[1]-90)*Math.PI/180; ctx.font='bold 11px sans-serif'; ctx.fillStyle=x[0]==='N'?'#f85149':'#cdd9e5'; ctx.fillText(x[0],cx+Math.cos(a)*R*0.80,cy+Math.sin(a)*R*0.80); });
        // freccia direzione (live oppure campione scelto con lo slider)
        // Punta verso la direzione DA CUI arriva il vento (come i petali).
        // Per farla puntare dove il vento va, metti ARROW_DOWNWIND = true.
        const cur=curSample();
        const dd=ARROW_DOWNWIND ? cur.d+180 : cur.d;
        const ang=(dd-90)*Math.PI/180, ux=Math.cos(ang), uy=Math.sin(ang), px=-uy, py=ux;
        const rs=r0+2, rh=R*0.66, rt=R*0.90, hw=9;
        const col=speedColor(cur.v,1);
        function arrowPath(k){
            ctx.beginPath();
            ctx.moveTo(cx+ux*rs, cy+uy*rs); ctx.lineTo(cx+ux*rh, cy+uy*rh);
            ctx.lineWidth=3+k; ctx.lineCap='round';
        }
        // contorno scuro + freccia colorata
        arrowPath(3); ctx.strokeStyle='rgba(13,17,23,0.9)'; ctx.stroke();
        arrowPath(0); ctx.strokeStyle=col; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx+ux*rt, cy+uy*rt);
        ctx.lineTo(cx+ux*rh+px*hw, cy+uy*rh+py*hw);
        ctx.lineTo(cx+ux*rh-px*hw, cy+uy*rh-py*hw);
        ctx.closePath(); ctx.fillStyle=col; ctx.fill();
        ctx.strokeStyle= cur.live ? '#0d1117' : '#58a6ff'; ctx.lineWidth=1.6; ctx.stroke();
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
            const lbl=period==='3h'?'3 ore':period==='24h'?'24 ore':'7 giorni';
            html+='Prevalente ('+lbl+'): <span style="color:#e3b341">'+nm+' '+(stats.bestN/stats.tot*100).toFixed(0)+'%</span> · media '+stats.avg.toFixed(1)+' km/h · calma '+(stats.calm/stats.tot*100).toFixed(0)+'%<br>';
        }
        if(cur.live){ html+='<span style="color:var(--grn)">● Adesso</span>: '+windMedName(cur.d).n+' '+cur.d.toFixed(0)+'° · '+cur.v.toFixed(1)+' km/h'; }
        else { const d=new Date(cur.t); html+='<span style="color:#58a6ff">'+pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes())+'</span>: '+windMedName(cur.d).n+' '+cur.d.toFixed(0)+'° · '+cur.v.toFixed(1)+' km/h'+(isNaN(cur.g)?'':' · raffica '+cur.g.toFixed(0)); }
        box.innerHTML=html;
    }

    // ─── Eventi ───
    function setPeriod(p){
        period=p;
        ['3h','24h','7d'].forEach(function(x){ el('rsB'+x).classList.toggle('active',x===p); });
        rebuild();
    }
    el('rsB3h').onclick=function(){ setPeriod('3h'); };
    el('rsB24h').onclick=function(){ setPeriod('24h'); };
    el('rsB7d').onclick=function(){ setPeriod('7d'); };
    el('rsSl').addEventListener('input',function(){ scrub=true; render(); });
    el('rsLive').onclick=function(){ scrub=false; const sl=el('rsSl'); sl.value=sl.max; render(); };

    // La pagina chiama drawCompass(dir, vel) ogni 15 s con il dato live: lo intercettiamo.
    window.drawCompass=function(dir,speed){ liveDir=dir||0; liveSpeed=speed||0; render(); };

    // ─── Dati: ultimi 7 giorni grezzi, a blocchi da 4 giorni (limite 8000 di ThingSpeak) ───
    let busy=false;
    function loadSeries(){
        if(busy) return; busy=true;
        const end=new Date(), start=new Date(end.getTime()-7*86400000);
        fetchThingSpeakRange(start,end,null,4).then(function(feeds){
            feeds=despikeWind(feeds||[]);
            series=feeds.map(function(f){ return { t:new Date(f.created_at).getTime(), d:parseFloat(f.field6), v:parseFloat(f.field4), g:parseFloat(f.field5) }; })
                        .filter(function(p){ return !isNaN(p.d)&&!isNaN(p.v)&&p.d>=0&&p.d<=360; });
            rebuild();
        }).catch(function(e){ console.warn('[rosa]',e); })
          .finally(function(){ busy=false; });
    }
    setTimeout(loadSeries,7000);
    setInterval(loadSeries,300000);
    render();
})();
