// ═══ WIND RUN — versione leggera (ultimi 30 giorni) ═══
// Va incluso in index.html con:  <script src="windrun.js"></script>  prima di </body>
(function(){
    'use strict';

    const CARD_HTML =
    '<div class="sec">Wind run (distanza percorsa dal vento)</div>' +
    '<div class="grid"><div class="card cv cw">' +
      '<div class="lbl">🌬 Wind run</div>' +
      '<div class="ex-tabs">' +
        '<button class="ex-tab active" onclick="switchTab(this,\'w\',\'d\')">Oggi</button>' +
        '<button class="ex-tab" onclick="switchTab(this,\'w\',\'7\')">7 giorni</button>' +
        '<button class="ex-tab" onclick="switchTab(this,\'w\',\'mo\')">Mese</button>' +
      '</div>' +
      '<div id="w_d" class="ex-panel show"><div class="val" id="wrD">--</div><div class="unit">km dalle 00:00</div><div class="sub">Media: <span id="wrDavg">--</span> km/h</div></div>' +
      '<div id="w_7" class="ex-panel"><div class="val" id="wr7">--</div><div class="unit">km ultimi 7 giorni</div><div class="sub">Media: <span id="wr7avg">--</span> km/giorno</div></div>' +
      '<div id="w_mo" class="ex-panel"><div class="val" id="wrMo">--</div><div class="unit">km questo mese</div><div class="sub">Giorno più ventoso: <span id="wrMoMax">--</span></div></div>' +
      '<div class="sub" style="font-size:.62rem;font-style:italic;margin-top:8px;">ⓘ Calcolato da velocità media × tempo, su mediane orarie di ThingSpeak: valore approssimato.</div>' +
    '</div></div>';

    const CHART_HTML =
    '<div class="chart-box" style="grid-column:1/-1;"><div class="chart-title">🌬 Wind run (km al giorno)</div>' +
      '<div class="chart-toolbar" style="margin-bottom:4px;">' +
        '<button class="ct-btn active" id="wrB7" onclick="wrSetPeriod(\'7d\')">7 giorni</button>' +
        '<button class="ct-btn" id="wrB30" onclick="wrSetPeriod(\'30d\')">30 giorni</button>' +
      '</div>' +
      '<div class="chart-wrap"><canvas id="chartWR"></canvas></div></div>';

    const secGraf = Array.prototype.find.call(document.querySelectorAll('.sec'), function(s){ return s.textContent.indexOf('Grafici Storici') !== -1; });
    if(secGraf){
        const tmp = document.createElement('div');
        tmp.innerHTML = CARD_HTML;
        while(tmp.firstChild) secGraf.parentNode.insertBefore(tmp.firstChild, secGraf);
    }
    const grid = document.querySelector('.chart-grid');
    if(grid) grid.insertAdjacentHTML('beforeend', CHART_HTML);

    // km = somma (velocità media km/h × Δt ore), Δt limitato a 90 minuti (buchi dati)
    const WR_CAP_MIN = 90;
    function dayKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

    function daily(feeds){
        const out={}; let prev=null;
        feeds.forEach(function(f){
            const v=parseFloat(f.field4), t=new Date(f.created_at).getTime();
            if(isNaN(v)||isNaN(t)) return;
            if(prev!==null){
                const dtH=Math.min((t-prev)/3600000, WR_CAP_MIN/60);
                if(dtH>0){ const k=dayKey(new Date(t)); out[k]=(out[k]||0)+v*dtH; }
            }
            prev=t;
        });
        return out;
    }

    let days={}, period='7d', chartObj=null, busy=false;

    // Una sola passata sugli ultimi 30 giorni, a blocchi da 4 giorni
    // (5760 campioni/min < limite 8000 di ThingSpeak).
    function loadAll(){
        if(busy) return; busy=true;
        const end=new Date(), start=new Date(end.getTime()-30*86400000);
        fetchThingSpeakRange(start,end,60,4).then(function(feeds){
            days=daily(despikeWind(feeds||[]));
            update();
        }).catch(function(e){ console.warn('[windrun]',e); })
          .finally(function(){ busy=false; });
    }

    function sum(pred){ let s=0; for(const k in days){ if(pred(k)) s+=days[k]; } return s; }
    function maxDay(pred){
        let bk=null,bv=-1;
        for(const k in days){ if(pred(k)&&days[k]>bv){ bv=days[k]; bk=k; } }
        return bk?(bk.substring(8)+'/'+bk.substring(5,7)+' · '+bv.toFixed(0)+' km'):'--';
    }

    function update(){
        const now=new Date(), today=dayKey(now);
        const d7=dayKey(new Date(now.getTime()-6*86400000));
        const mo=today.substring(0,7);
        const kmD=sum(function(k){return k===today;}), km7=sum(function(k){return k>=d7&&k<=today;});
        const h=now.getHours()+now.getMinutes()/60;
        safeSet('wrD',kmD.toFixed(1));
        safeSet('wrDavg',h>0.25?(kmD/h).toFixed(1):'--');
        safeSet('wr7',km7.toFixed(0));
        safeSet('wr7avg',(km7/7).toFixed(0));
        safeSet('wrMo',sum(function(k){return k.indexOf(mo)===0;}).toFixed(0));
        safeSet('wrMoMax',maxDay(function(k){return k.indexOf(mo)===0;}));
        drawChart();
    }

    window.wrSetPeriod=function(p){
        period=p;
        el('wrB7').classList.toggle('active',p==='7d');
        el('wrB30').classList.toggle('active',p==='30d');
        drawChart();
    };

    function drawChart(){
        const cv=el('chartWR'); if(!cv) return;
        const now=new Date(), labels=[], vals=[], n=period==='7d'?7:30;
        for(let i=n-1;i>=0;i--){
            const k=dayKey(new Date(now.getTime()-i*86400000));
            labels.push(k.substring(8)+'/'+k.substring(5,7));
            vals.push(+(days[k]||0).toFixed(1));
        }
        const avg=vals.reduce(function(a,b){return a+b;},0)/vals.length;
        const ds=[
            { type:'bar', label:'km', data:vals, backgroundColor:'rgba(63,185,80,0.55)', borderColor:'#3fb950', borderWidth:1 },
            { type:'line', label:'Media', data:vals.map(function(){return avg;}), borderColor:'#e3b341', borderDash:[6,4], borderWidth:1.5, pointRadius:0, fill:false }
        ];
        const opts={
            responsive:true, maintainAspectRatio:false, animation:{duration:300},
            plugins:{ legend:{labels:{color:'#8b949e',font:{size:10},boxWidth:12}}, datalabels:{display:false},
                tooltip:{backgroundColor:'#161b22',borderColor:'#30363d',borderWidth:1,titleColor:'#e6edf3',bodyColor:'#8b949e'} },
            scales:{
                x:{ ticks:{color:'#8b949e',font:{size:9},maxRotation:0,maxTicksLimit:12}, grid:{color:'#1c2430'}, border:{color:'#30363d'} },
                y:{ min:0, ticks:{color:'#8b949e',font:{size:9}}, grid:{color:'#1c2430'}, border:{color:'#30363d'}, title:{display:true,text:'km',color:'#8b949e',font:{size:9}} }
            }
        };
        if(chartObj){ chartObj.data.labels=labels; chartObj.data.datasets=ds; chartObj.options=opts; chartObj.update('none'); }
        else chartObj=new Chart(cv,{type:'bar',data:{labels:labels,datasets:ds},options:opts});
    }

    setTimeout(loadAll, 10000);
    setInterval(loadAll, 900000);
})();
