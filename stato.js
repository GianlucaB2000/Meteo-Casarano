// ═══ Sensori aggiuntivi (BMP280) + stato sensori e invio dati ═══  (versione B)
// Va incluso in index.html con:  <script src="stato.js"></script>  dopo rosa.js
// (carica questo file su GitHub con il nome stato.js, al posto del vecchio)
// Legge l'ultimo valore di ogni sensore da openSenseMap (box con 10 sensori) e da
// ThingSpeak (campi 1-8) e segnala dati vecchi, valori fuori range e incongruenze.
// NOVITA' B: card "Delta SHT40 - BMP280" con media notte / giorno / 72 ore,
// calcolata sullo storico di openSenseMap (entrambe le temperature dalla stessa fonte).
(function(){
    'use strict';

    const OSM_BOX = '6ab3d710e3bf1c00070bb789';
    const P = '6ab3d710e3bf1c00070bb';

    // Soglie (minuti) oltre le quali l'ultimo invio e' considerato in ritardo / fermo.
    // ThingSpeak: invio ogni minuto. openSenseMap: invio ogni 5-10 minuti.
    // Giallo = circa 2 invii saltati, rosso = molti invii saltati.
    const TS_WARN = 5,   TS_BAD = 30;
    const OSM_WARN = 20, OSM_BAD = 40;
    const REFRESH_MS = 120000;

    // Delta storico: finestra analizzata e fasce orarie (ora locale del browser).
    const DELTA_HOURS = 72;          // ore di storico scaricate da openSenseMap
    const NIGHT_FROM = 0,  NIGHT_TO = 6;    // notte: 00:00-06:00
    const DAY_FROM   = 11, DAY_TO   = 16;   // giorno: 11:00-16:00
    const PAIR_TOL_MS = 150000;      // due misure sono "dello stesso istante" se entro 2,5 minuti
    const DELTA_MAX_ABS = 5;         // scarta coppie con |delta| > 5 °C (glitch)
    const DELTA_REFRESH_MS = 1800000; // aggiorna lo storico ogni 30 minuti

    // Un sensore per riga. ts = numero campo ThingSpeak (null se non inviato li').
    const S = [
        { key:'T',    id:P+'78a', ts:1,    name:'Temperatura aria',    type:'SHT40',   unit:'°C',  dec:1, min:-15, max:48 },
        { key:'H',    id:P+'78b', ts:2,    name:'Umidità',             type:'SHT40',   unit:'%',   dec:1, min:0,   max:100 },
        { key:'Pslm', id:P+'78c', ts:3,    name:'Pressione slm',       type:'BMP280',  unit:'hPa', dec:1, min:940, max:1060 },
        { key:'V',    id:P+'78d', ts:4,    name:'Velocità vento',      type:'Hall 3144', unit:'km/h', dec:1, min:0, max:150 },
        { key:'G',    id:P+'78e', ts:5,    name:'Raffica',             type:'Hall 3144', unit:'km/h', dec:1, min:0, max:200 },
        { key:'D',    id:P+'78f', ts:6,    name:'Direzione vento',     type:'AS5600',  unit:'°',   dec:0, min:0,   max:360 },
        { key:'R',    id:P+'790', ts:8,    name:'Pioggia (oggi)',      type:'Hall 3144', unit:'mm', dec:2, min:0,  max:500 },
        { key:'L',    id:P+'791', ts:7,    name:'Luce ambientale',     type:'TSL2591', unit:'lux', dec:0, min:0,   max:200000 },
        { key:'Tb',   id:P+'792', ts:null, name:'Temperatura BMP280',  type:'BMP280',  unit:'°C',  dec:1, min:-15, max:60 },
        { key:'Praw', id:P+'793', ts:null, name:'Pressione BMP280 raw', type:'BMP280', unit:'hPa', dec:1, min:900, max:1060 }
    ];

    // ─── Stile ───
    const css = document.createElement('style');
    css.textContent =
    '.st-box{background:var(--bg2);border:1px solid var(--brd);border-radius:14px;padding:12px 14px;box-shadow:0 2px 10px rgba(0,0,0,.35);margin-top:9px}' +
    '.st-sum{display:flex;gap:18px;flex-wrap:wrap;font-size:.72rem;color:var(--sub)}' +
    '.st-sum b{color:var(--txt);font-weight:600}' +
    '.st-d{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle;background:var(--sub)}' +
    '.st-ok{background:var(--grn)}.st-warn{background:var(--ylw)}.st-bad{background:var(--red)}' +
    '.st-banner{margin-top:10px;padding:8px 10px;border-radius:8px;font-size:.72rem;line-height:1.6;background:var(--bg3);border:1px solid var(--brd)}' +
    '.st-banner.ok{border-color:#1f6f35;color:var(--grn)}.st-banner.warn{border-color:#8a6a14;color:var(--ylw)}.st-banner.bad{border-color:#8f2a26;color:var(--red)}' +
    '.st-banner ul{margin:4px 0 0 16px;color:var(--val)}' +
    '.st-tw{overflow-x:auto;margin-top:10px}' +
    '.st-t{width:100%;border-collapse:collapse;font-size:.7rem;min-width:560px}' +
    '.st-t th{text-align:left;font-size:.56rem;text-transform:uppercase;letter-spacing:.07em;color:var(--sub);padding:6px 8px;border-bottom:1px solid var(--brd);font-weight:600}' +
    '.st-t td{padding:7px 8px;border-bottom:1px solid var(--bg3);color:var(--val);white-space:nowrap}' +
    '.st-t td small{color:var(--sub);font-size:.6rem;margin-left:4px}' +
    '.st-t td.n{color:var(--txt);font-weight:600}.st-t td.ty{color:var(--sub)}' +
    '.dl-note{font-size:.62rem;color:var(--sub);font-style:italic;margin-top:8px;line-height:1.6}' +
    '.dl-note b{color:var(--val);font-style:normal}';
    document.head.appendChild(css);

    // ─── HTML (in fondo all'ultima colonna .wrap) ───
    const wraps = document.querySelectorAll('.wrap');
    const wrap = wraps[wraps.length - 1];
    const box = document.createElement('div');
    box.innerHTML =
    '<div class="sec">Sensori aggiuntivi — BMP280 <span style="text-transform:none;letter-spacing:0">(da openSenseMap)</span></div>' +
    '<div class="grid">' +
      '<div class="card"><div class="lbl">Temperatura BMP280</div><div class="val" id="xTb" style="font-size:1.5rem">--</div><div class="unit">°C</div><div class="sub">SHT40 − BMP280: <span id="xDT">--</span> °C</div></div>' +
      '<div class="card cp"><div class="lbl">Pressione BMP280 raw</div><div class="val" id="xPraw" style="font-size:1.5rem">--</div><div class="unit">hPa (alla quota della stazione)</div><div class="sub">slm − raw: <span id="xDP">--</span> hPa</div></div>' +
    '</div>' +
    '<div class="sec">Delta SHT40 − BMP280 <span style="text-transform:none;letter-spacing:0">(ultime ' + DELTA_HOURS + ' ore, da openSenseMap)</span></div>' +
    '<div class="grid">' +
      '<div class="card"><div class="lbl">Notte (' + String(NIGHT_FROM).padStart(2,'0') + '–' + String(NIGHT_TO).padStart(2,'0') + ')</div><div class="val" id="xDn" style="font-size:1.5rem">--</div><div class="unit">°C · <span id="xDnN">0</span> coppie</div></div>' +
      '<div class="card"><div class="lbl">Giorno (' + DAY_FROM + '–' + DAY_TO + ')</div><div class="val" id="xDd" style="font-size:1.5rem">--</div><div class="unit">°C · <span id="xDdN">0</span> coppie</div></div>' +
      '<div class="card"><div class="lbl">Media ' + DELTA_HOURS + ' ore</div><div class="val" id="xDa" style="font-size:1.5rem">--</div><div class="unit">°C · <span id="xDaN">0</span> coppie</div></div>' +
      '<div class="card"><div class="lbl">Giorno − notte</div><div class="val" id="xDs" style="font-size:1.5rem">--</div><div class="unit">°C (oscillazione)</div></div>' +
    '</div>' +
    '<div class="dl-note" id="xDnote">Calcolo del delta in corso…</div>' +
    '<div class="sec">Stato sensori e invio dati</div>' +
    '<div class="st-box">' +
      '<div class="st-sum"><div>ThingSpeak: <span id="stTS">…</span></div><div>openSenseMap: <span id="stOSM">…</span></div></div>' +
      '<div class="st-banner" id="stBanner">Controllo in corso…</div>' +
      '<div class="st-tw"><table class="st-t"><thead><tr><th>Sensore</th><th>Tipo</th><th>ThingSpeak</th><th>openSenseMap</th><th>Stato</th></tr></thead><tbody id="stBody"></tbody></table></div>' +
    '</div>';
    while (box.firstChild) wrap.appendChild(box.firstChild);

    // ─── Utility ───
    function g(id){ return document.getElementById(id); }
    function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
    function ageMin(t){ return (Date.now() - t) / 60000; }
    function fmtAge(a){
        if (a < 1.5) return 'ora';
        if (a < 90) return Math.round(a) + ' min fa';
        if (a < 48 * 60) return Math.round(a / 60) + ' h fa';
        return Math.round(a / 1440) + ' g fa';
    }
    function fmtV(v, dec){ return (v === null || v === undefined || isNaN(v)) ? '--' : Number(v).toFixed(dec); }
    function getJson(url){
        return fetch(url, { cache: 'no-store' }).then(function(r){
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }
    function lvl(a, warn, bad){ return a > bad ? 'bad' : (a > warn ? 'warn' : 'ok'); }
    function worst(a, b){
        const o = { na: 0, ok: 1, warn: 2, bad: 3 };
        return o[a] >= o[b] ? a : b;
    }

    // ─── Lettura dati ───
    function loadOsm(){
        return getJson('https://api.opensensemap.org/boxes/' + OSM_BOX + '?format=json').then(function(b){
            const out = {};
            (b.sensors || []).forEach(function(s){
                const lm = s.lastMeasurement;
                const v = lm ? parseFloat(lm.value) : NaN;
                out[s._id] = { v: isNaN(v) ? null : v, t: (lm && lm.createdAt) ? Date.parse(lm.createdAt) : null };
            });
            return out;
        });
    }
    async function loadTs(){
        // Un campo alla volta: cosi' si vede se un singolo campo ha smesso di arrivare.
        const out = {}; let err = null;
        for (const s of S) {
            if (!s.ts) continue;
            try {
                const d = await getJson('https://api.thingspeak.com/channels/' + TS_CH + '/fields/' + s.ts + '/last.json?api_key=' + TS_RKEY);
                const v = parseFloat(d && d['field' + s.ts]);
                out[s.key] = { v: isNaN(v) ? null : v, t: (d && d.created_at) ? Date.parse(d.created_at) : null };
            } catch (e) { err = e.message; out[s.key] = { v: null, t: null }; }
            await sleep(250);
        }
        // Ultimi ~20 minuti (1 campione/min) per il confronto con openSenseMap,
        // che invia medie su 5-10 minuti: un singolo valore istantaneo puo' differire.
        let win = null;
        try {
            const d = await getJson('https://api.thingspeak.com/channels/' + TS_CH + '/feeds.json?api_key=' + TS_RKEY + '&results=20');
            win = { T: [], H: [], Pslm: [] };
            ((d && d.feeds) || []).forEach(function(f){
                [['T', 1], ['H', 2], ['Pslm', 3]].forEach(function(k){
                    const v = parseFloat(f['field' + k[1]]); if (!isNaN(v)) win[k[0]].push(v);
                });
            });
        } catch (e) { win = null; }
        return { data: out, err: err, win: win };
    }

    // ─── Valutazione e disegno ───
    function render(osm, osmErr, ts, tsErr, win){
        const issues = [];
        let overall = 'ok';
        let lastTs = 0, lastOsm = 0;
        const rows = [];

        S.forEach(function(s){
            let sl = 'ok';
            const flag = function(l, msg){ sl = worst(sl, l); overall = worst(overall, l); issues.push(s.name + ': ' + msg); };

            // openSenseMap
            let oCell = '<span style="color:var(--sub)">n/d</span>', oDot = 'na';
            const o = osm ? osm[s.id] : null;
            if (osm) {
                if (!o || o.v === null || !o.t) { oDot = 'bad'; flag('bad', 'nessun dato su openSenseMap'); oCell = '--'; }
                else {
                    const a = ageMin(o.t); oDot = lvl(a, OSM_WARN, OSM_BAD);
                    lastOsm = Math.max(lastOsm, o.t);
                    if (oDot !== 'ok') flag(oDot, 'ultimo dato su openSenseMap ' + fmtAge(a));
                    if (o.v < s.min || o.v > s.max) { oDot = 'bad'; flag('bad', 'valore fuori range su openSenseMap (' + fmtV(o.v, s.dec) + ' ' + s.unit + ')'); }
                    oCell = fmtV(o.v, s.dec) + ' ' + s.unit + '<small>' + fmtAge(a) + '</small>';
                }
            }

            // ThingSpeak
            let tCell = '<span style="color:var(--sub)">non previsto su ThingSpeak</span>', tDot = 'na';
            const t = s.ts ? ts[s.key] : null;
            if (s.ts) {
                if (!t || t.v === null || !t.t) { tDot = 'bad'; flag('bad', 'nessun dato su ThingSpeak'); tCell = '--'; }
                else {
                    const a = ageMin(t.t); tDot = lvl(a, TS_WARN, TS_BAD);
                    lastTs = Math.max(lastTs, t.t);
                    if (tDot !== 'ok') flag(tDot, 'ultimo dato su ThingSpeak ' + fmtAge(a));
                    if (t.v < s.min || t.v > s.max) { tDot = 'bad'; flag('bad', 'valore fuori range su ThingSpeak (' + fmtV(t.v, s.dec) + ' ' + s.unit + ')'); }
                    tCell = fmtV(t.v, s.dec) + ' ' + s.unit + '<small>' + fmtAge(a) + '</small>';
                }
            }

            // Stesso sensore su due piattaforme: openSenseMap invia medie su 5-10 minuti,
            // ThingSpeak un valore al minuto. Si segnala solo se il valore di openSenseMap
            // cade fuori dall'intervallo (min-max) visto su ThingSpeak negli ultimi ~20 minuti.
            const tol = { T: 0.7, H: 3, Pslm: 1 }[s.key];
            const w = win ? win[s.key] : null;
            if (tol && o && o.v !== null && w && w.length >= 5) {
                const lo = Math.min.apply(null, w), hi = Math.max.apply(null, w);
                if (o.v < lo - tol || o.v > hi + tol) {
                    flag('warn', 'openSenseMap (' + fmtV(o.v, s.dec) + ') è fuori dall\'intervallo visto su ThingSpeak negli ultimi 20 min (' + fmtV(lo, s.dec) + '–' + fmtV(hi, s.dec) + ')');
                }
            }

            const label = { ok: 'OK', warn: 'Attenzione', bad: 'Problema', na: '—' }[sl];
            rows.push('<tr><td class="n">' + s.name + '</td><td class="ty">' + s.type + '</td>' +
                '<td><span class="st-d st-' + tDot + '"></span>' + tCell + '</td>' +
                '<td><span class="st-d st-' + oDot + '"></span>' + oCell + '</td>' +
                '<td><span class="st-d st-' + sl + '"></span>' + label + '</td></tr>');
        });
        g('stBody').innerHTML = rows.join('');

        // Sensori aggiuntivi + controlli incrociati SHT40 / BMP280
        const ov = function(key){ const s = S.find(function(x){ return x.key === key; }); const o = osm ? osm[s.id] : null; return (o && o.v !== null) ? o.v : null; };
        const oT = ov('T'), oTb = ov('Tb'), oPs = ov('Pslm'), oPr = ov('Praw');
        g('xTb').textContent = fmtV(oTb, 1);
        g('xPraw').textContent = fmtV(oPr, 1);
        if (oT !== null && oTb !== null) {
            const dT = oT - oTb; g('xDT').textContent = (dT > 0 ? '+' : '') + dT.toFixed(2);
            if (Math.abs(dT) > 3) { overall = worst(overall, 'warn'); issues.push('SHT40 e BMP280 differiscono di ' + dT.toFixed(1) + ' °C (oltre 3 °C: autoriscaldamento o sensore da controllare)'); }
        } else g('xDT').textContent = '--';
        if (oPs !== null && oPr !== null) {
            const dP = oPs - oPr; g('xDP').textContent = (dP > 0 ? '+' : '') + dP.toFixed(2);
            // ~139 m di quota corrispondono a circa 16-17 hPa
            if (dP < 14 || dP > 19.5) { overall = worst(overall, 'warn'); issues.push('differenza pressione slm − raw = ' + dP.toFixed(1) + ' hPa (attesi circa 16-17 hPa a 139 m: controlla la correzione di quota)'); }
        } else g('xDP').textContent = '--';

        // Riepilogo invio
        function sumLine(id, last, err, warn, bad, name){
            const e = g(id);
            if (err && !last) { e.innerHTML = '<span class="st-d st-bad"></span><b>non raggiungibile</b> (' + err + ')'; return 'bad'; }
            if (!last) { e.innerHTML = '<span class="st-d st-bad"></span><b>nessun dato</b>'; return 'bad'; }
            const a = ageMin(last), l = lvl(a, warn, bad);
            e.innerHTML = '<span class="st-d st-' + l + '"></span>ultimo invio <b>' + fmtAge(a) + '</b>';
            return l;
        }
        const l1 = sumLine('stTS', lastTs, tsErr, TS_WARN, TS_BAD);
        const l2 = sumLine('stOSM', lastOsm, osmErr, OSM_WARN, OSM_BAD);
        overall = worst(overall, worst(l1, l2));
        if (osmErr) issues.unshift('openSenseMap non raggiungibile dal browser (' + osmErr + '): lo stato dei suoi sensori non è verificabile adesso');
        if (tsErr && lastTs) issues.unshift('alcune richieste a ThingSpeak sono fallite (' + tsErr + ')');

        const b = g('stBanner');
        b.className = 'st-banner ' + overall;
        if (!issues.length) b.textContent = '✔ Tutti i sensori rispondono e i dati arrivano su entrambe le piattaforme.';
        else b.innerHTML = (overall === 'bad' ? '✖ ' : '⚠ ') + issues.length + (issues.length === 1 ? ' segnalazione' : ' segnalazioni') + ':<ul>' + issues.map(function(x){ return '<li>' + x + '</li>'; }).join('') + '</ul>';
    }

    let busy = false;
    function refresh(){
        if (busy) return;
        busy = true;
        let osm = null, osmErr = null;
        loadOsm().then(function(o){ osm = o; }).catch(function(e){ osmErr = e.message || String(e); })
            .then(function(){ return loadTs(); })
            .then(function(r){ render(osm, osmErr, r.data, r.err, r.win); })
            .catch(function(e){ console.warn('[stato]', e); })
            .then(function(){ busy = false; });
    }
    setTimeout(refresh, 5000);
    setInterval(refresh, REFRESH_MS);

    // ═══ Delta storico SHT40 − BMP280 (entrambe da openSenseMap) ═══
    // Scarica lo storico di temperatura SHT40 e temperatura BMP280 dalle ultime
    // DELTA_HOURS ore, accoppia le misure dello stesso istante e calcola la media
    // del delta (SHT40 − BMP280) di notte, di giorno e su tutto il periodo.
    function parseSeries(arr){
        const out = [];
        (arr || []).forEach(function(m){
            const v = parseFloat(m && m.value);
            const t = (m && m.createdAt) ? Date.parse(m.createdAt) : NaN;
            if (!isNaN(v) && !isNaN(t)) out.push({ t: t, v: v });
        });
        out.sort(function(a, b){ return a.t - b.t; });
        return out;
    }
    function pairSeries(A, B){
        // Per ogni misura di A cerca la misura di B piu' vicina nel tempo (entro PAIR_TOL_MS).
        const pairs = []; let j = 0;
        for (let i = 0; i < A.length; i++) {
            while (j + 1 < B.length && Math.abs(B[j + 1].t - A[i].t) <= Math.abs(B[j].t - A[i].t)) j++;
            if (B.length && Math.abs(B[j].t - A[i].t) <= PAIR_TOL_MS) pairs.push({ t: A[i].t, d: A[i].v - B[j].v });
        }
        return pairs;
    }
    function mean(a){ if (!a.length) return null; let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
    function sgn(v){ return (v === null) ? '--' : ((v > 0 ? '+' : '') + v.toFixed(2)); }

    function loadDelta(){
        const sT = S.find(function(x){ return x.key === 'T'; });
        const sB = S.find(function(x){ return x.key === 'Tb'; });
        const to = new Date(), from = new Date(to.getTime() - DELTA_HOURS * 3600000);
        const q = function(id){
            return getJson('https://api.opensensemap.org/boxes/' + OSM_BOX + '/data/' + id +
                '?from-date=' + from.toISOString() + '&to-date=' + to.toISOString() + '&format=json');
        };
        return Promise.all([q(sT.id), q(sB.id)]).then(function(r){
            const pairs = pairSeries(parseSeries(r[0]), parseSeries(r[1]))
                .filter(function(p){ return Math.abs(p.d) <= DELTA_MAX_ABS; });
            const all = [], night = [], day = [];
            pairs.forEach(function(p){
                all.push(p.d);
                const h = new Date(p.t).getHours();
                if (h >= NIGHT_FROM && h < NIGHT_TO) night.push(p.d);
                else if (h >= DAY_FROM && h < DAY_TO) day.push(p.d);
            });
            const MIN_N = 3;
            const mn = night.length >= MIN_N ? mean(night) : null;
            const md = day.length   >= MIN_N ? mean(day)   : null;
            const ma = all.length   >= MIN_N ? mean(all)   : null;
            g('xDn').textContent = sgn(mn); g('xDnN').textContent = night.length;
            g('xDd').textContent = sgn(md); g('xDdN').textContent = day.length;
            g('xDa').textContent = sgn(ma); g('xDaN').textContent = all.length;
            g('xDs').textContent = (mn !== null && md !== null) ? sgn(md - mn) : '--';
            g('xDnote').innerHTML =
                'Delta = temperatura SHT40 − temperatura BMP280, entrambe da openSenseMap (accoppiate sullo stesso istante, ' +
                'ultime ' + DELTA_HOURS + ' ore). Il BMP280 è fuori dal tubo di ventilazione, quindi il delta cambia tra giorno e notte ' +
                'anche per la diversa ventilazione, non solo per l\'offset dei sensori. ' +
                'Più coppie ci sono, più il valore è affidabile.';
        }).catch(function(e){
            console.warn('[delta]', e);
            g('xDnote').textContent = 'Storico openSenseMap non disponibile adesso (' + (e.message || e) + '): riprovo tra poco.';
        });
    }
    setTimeout(loadDelta, 7000);
    setInterval(loadDelta, DELTA_REFRESH_MS);
})();
