// ═══ Confronto Tetto: SHT40 vs BMP280 + pressione raw vs slm ═══
// Va incluso in confronto.html con:  <script src="confronto-bmp.js"></script>  prima di </body>
// SHT40 e pressione slm: ThingSpeak (field1, field3). BMP280 e pressione raw: openSenseMap.
(function(){
    'use strict';

    const OSM_BOX       = '6ab3d710e3bf1c00070bb789';
    const OSM_TEMP_BMP  = '6ab3d710e3bf1c00070bb792';   // Temperatura BMP280
    const OSM_PRESS_RAW = '6ab3d710e3bf1c00070bb793';   // Pressione BMP280 RAW
    const MIN = { raw:null, '10min':10, '30min':30, '1h':60, '3h':180 };

    // ─── Sezione HTML (in fondo alla pagina, sotto gli altri grafici) ───
    const wrap = document.querySelector('.wrap');
    const box = document.createElement('div');
    box.innerHTML =
    '<div class="sec">Sensori Tetto — SHT40 vs BMP280 e pressione raw <span id="bmpPer"></span></div>' +
    '<div class="status" id="bmpStatus">Caricamento…</div>' +
    '<div class="grid">' +
      '<div class="card" style="grid-column:1/-1;border-color:var(--acc);padding:16px;"><div class="lbl">SHT40 − BMP280 adesso (media 10 min)</div><div class="val" id="bDnow" style="font-size:2rem">--</div><div class="note" id="bDnowInfo">In attesa dati…</div></div>' +
      '<div class="card"><div class="lbl">Δ diurno (06-20)</div><div class="val" id="bDday">--</div></div>' +
      '<div class="card"><div class="lbl">Δ picco sole 13-16</div><div class="val" id="bDpeak">--</div></div>' +
      '<div class="card"><div class="lbl">Δ notturno</div><div class="val" id="bDnight">--</div></div>' +
    '</div>' +
    '<div class="note" style="margin:0 2px 12px;line-height:1.5">Il BMP280 sta più vicino all\'elettronica e può scaldarsi da solo: se di giorno legge più alto dell\'SHT40 (Δ negativo) e di notte i due si allineano, è autoriscaldamento.</div>' +
    '<div class="grid">' +
      '<div class="card"><div class="lbl">Pressione raw BMP280</div><div class="val" id="bPraw" style="font-size:1.3rem">--</div></div>' +
      '<div class="card"><div class="lbl">Pressione slm</div><div class="val" id="bPslm" style="font-size:1.3rem">--</div></div>' +
      '<div class="card"><div class="lbl">Differenza slm − raw</div><div class="val" id="bPdiff" style="font-size:1.3rem">--</div><div class="note" id="bPdiffN">--</div></div>' +
    '</div>' +
    '<div class="chart-box"><div class="chart-title">Temperatura: SHT40 vs BMP280</div><div class="chart-wrap" style="height:320px"><canvas id="cBmpTemp"></canvas></div></div>' +
    '<div class="chart-box"><div class="chart-title">Delta SHT40 − BMP280</div><div class="chart-wrap"><canvas id="cBmpDelta"></canvas></div></div>' +
    '<div class="chart-box"><div class="chart-title">Pressione: raw BMP280 vs slm</div><div class="chart-sub">La differenza dovrebbe restare quasi costante (correzione per i 139 m di quota).</div><div class="chart-wrap"><canvas id="cBmpPress"></canvas></div></div>';
    while(box.firstChild) wrap.appendChild(box.firstChild);

    // ─── Dati ───
    let D=null, cache={}, charts={}, seq=0;
    function st(t){ el('bmpStatus').textContent=t; }
    function num(v){ const x=parseFloat(v); return isNaN(x)?null:x; }

    // openSenseMap: un giorno per richiesta (il limite per richiesta è 10000 misure)
    function fetchOsm(sensorId, fromMs, toMs){
        const DAY=86400000, ranges=[];
        for(let s=fromMs;s<toMs;s+=DAY) ranges.push([s,Math.min(s+DAY,toMs)]);
        const out=[];
        return ranges.reduce(function(p,r){
            return p.then(function(){
                const url='https://api.opensensemap.org/boxes/'+OSM_BOX+'/data/'+sensorId+
                    '?from-date='+encodeURIComponent(new Date(r[0]).toISOString())+
                    '&to-date='+encodeURIComponent(new Date(r[1]).toISOString())+'&format=json';
                return fetch(url).then(function(res){ if(!res.ok) throw new Error('openSenseMap HTTP '+res.status); return res.json(); })
                    .then(function(arr){ (arr||[]).forEach(function(m){ const v=num(m.value), t=new Date(m.createdAt).getTime(); if(v!==null&&!isNaN(t)) out.push({t:t,v:v}); }); });
            });
        },Promise.resolve()).then(function(){
            out.sort(function(a,b){return a.t-b.t;});
            const seen={}; return out.filter(function(p){ if(seen[p.t]) return false; seen[p.t]=1; return true; });
        });
    }

    function loadBmp(days){
        const token=++seq; D=null; cache={};
        st('Caricamento dati (SHT40 da ThingSpeak, BMP280 da openSenseMap)…');
        el('bmpPer').textContent='— '+(days===1?'ultime 24h':'ultimi '+days+' giorni');
        const to=Date.now(), from=to-days*86400000;
        Promise.all([ fetchFeeds(TS_TETTO,TS_TETTO_KEY,days), fetchOsm(OSM_TEMP_BMP,from,to), fetchOsm(OSM_PRESS_RAW,from,to) ])
        .then(function(res){
            if(token!==seq) return;
            const feeds=res[0], bt=res[1], bp=res[2];
            if(!bt.length && !bp.length) throw new Error('nessun dato BMP280 su openSenseMap');
            const t=function(f){ return new Date(f.created_at).getTime(); };
            const sht =feeds.map(function(f){ return {t:t(f), v:num(f.field1)}; });
            const pslm=feeds.map(function(f){ const v=num(f.field3); return {t:t(f), v:(v!==null&&v>940&&v<1050)?v:null}; });
            const praw=bp.map(function(p){ return {t:p.t, v:(p.v>900&&p.v<1100)?p.v:null}; });
            despike(sht,1.2); despike(bt,1.2);
            D={sht:sht, bt:bt, pslm:pslm, bp:praw};
            renderBmp(getActiveMode());
        }).catch(function(e){ if(token!==seq) return; console.warn('[bmp]',e); st('Errore: '+e.message+' — controlla gli ID openSenseMap o la connessione.'); });
    }

    function build(mode){
        if(cache[mode]) return cache[mode];
        const m=MIN[mode]===undefined?10:MIN[mode];
        const sh=rollingMeanWindow(D.sht,m), bt=rollingMeanWindow(D.bt,m), ps=rollingMeanWindow(D.pslm,m), bp=rollingMeanWindow(D.bp,m);
        const temps=(sh.length&&bt.length)?alignByTimestamp(sh,bt).filter(function(p){return p.tetto!==null&&p.orto!==null;}).map(function(p){return {t:p.t,sht:p.tetto,bmp:p.orto,d:p.tetto-p.orto};}):[];
        const press=(ps.length&&bp.length)?alignByTimestamp(ps,bp).filter(function(p){return p.tetto!==null&&p.orto!==null;}).map(function(p){return {t:p.t,slm:p.tetto,raw:p.orto,d:p.tetto-p.orto};}):[];
        return (cache[mode]={temps:temps,press:press});
    }

    function f3(v){ return (v===null||isNaN(v))?'--':(v>=0?'+':'')+v.toFixed(3)+' °C'; }
    function hp(v){ return (v===null||isNaN(v))?'--':v.toFixed(2)+' hPa'; }

    function renderBmp(mode){
        if(!D) return;
        // schede: sempre su media 10 min
        const r=build('10min'), T=r.temps, P=r.press;
        if(T.length){
            const last=T[T.length-1], ago=Math.round((Date.now()-last.t)/60000);
            el('bDnow').textContent=f3(last.d);
            el('bDnowInfo').textContent='SHT40 '+last.sht.toFixed(2)+' °C · BMP280 '+last.bmp.toFixed(2)+' °C · aggiornato '+ago+' min fa';
            const sel=function(a,b){ return mean(T.filter(function(p){ const o=rome(p.t); return a(o); }).map(function(p){return p.d;})); };
            el('bDday').textContent=f3(sel(function(o){return o>=6&&o<20;}));
            el('bDpeak').textContent=f3(sel(function(o){return o>=13&&o<16;}));
            el('bDnight').textContent=f3(sel(function(o){return o<6||o>=20;}));
        }
        if(P.length){
            const last=P[P.length-1], ds=P.map(function(p){return p.d;});
            el('bPraw').textContent=hp(last.raw); el('bPslm').textContent=hp(last.slm);
            el('bPdiff').textContent=hp(mean(ds));
            el('bPdiffN').textContent='variazione: '+hp(Math.min.apply(null,ds))+' … '+hp(Math.max.apply(null,ds));
        }
        st((T.length?T.length+' punti temperatura':'nessun dato temperatura')+' · '+(P.length?P.length+' punti pressione':'nessun dato pressione')+' (media 10 min)');

        // grafici: seguono la visualizzazione scelta sopra (grezzi / 10 min / 30 min…)
        const rows=build(mode), isMobile=window.innerWidth<600;
        function opts(){
            return { responsive:true, maintainAspectRatio:false, spanGaps:true, interaction:{mode:'index',intersect:false}, layout:{padding:{right:10}},
                plugins:{ legend:{labels:{color:'#c5d0e0',boxWidth:14,padding:12,font:{size:isMobile?14:12}}} },
                elements:{ point:{radius:0}, line:{borderWidth:isMobile?1.4:1.2} },
                scales:{ x:{type:'time',time:{tooltipFormat:'dd/MM HH:mm',displayFormats:{hour:'HH:mm',day:'dd/MM'}},ticks:{color:'#8b9bb4',maxRotation:0,maxTicksLimit:isMobile?4:10,font:{size:isMobile?12:10}},grid:{color:'rgba(51,65,85,0.45)'}},
                         y:{ticks:{color:'#8b9bb4',maxTicksLimit:isMobile?6:8,font:{size:isMobile?13:11}},grid:{color:'rgba(51,65,85,0.45)'}} } };
        }
        Object.keys(charts).forEach(function(k){ if(charts[k]) charts[k].destroy(); });
        charts.temp=new Chart(el('cBmpTemp'),{type:'line',data:{datasets:[
            {label:'SHT40',data:rows.temps.map(function(p){return {x:p.t,y:p.sht};}),borderColor:'#38bdf8',tension:0.15},
            {label:'BMP280',data:rows.temps.map(function(p){return {x:p.t,y:p.bmp};}),borderColor:'#f59e0b',tension:0.15}]},options:opts()});
        charts.delta=new Chart(el('cBmpDelta'),{type:'line',data:{datasets:[
            {label:'Δ SHT40 − BMP280',data:rows.temps.map(function(p){return {x:p.t,y:p.d};}),borderColor:'#38bdf8',tension:0.15,
             fill:{target:{value:0},above:'rgba(251,146,60,0.25)',below:'rgba(74,222,128,0.25)'}}]},options:opts()});
        charts.press=new Chart(el('cBmpPress'),{type:'line',data:{datasets:[
            {label:'slm',data:rows.press.map(function(p){return {x:p.t,y:p.slm};}),borderColor:'#38bdf8',tension:0.15},
            {label:'raw BMP280',data:rows.press.map(function(p){return {x:p.t,y:p.raw};}),borderColor:'#c084fc',tension:0.15}]},options:opts()});
    }

    // Aggancio alle funzioni della pagina: ridisegno quando cambia modalità/periodo
    const origMake=window.makeCharts;
    window.makeCharts=function(m){ origMake(m); renderBmp(m); };
    const origLoad=window.loadData;
    window.loadData=function(d){ origLoad(d); loadBmp(d); };
    loadBmp(currentDays);
})();
