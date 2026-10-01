// ═══ Sensori aggiuntivi (BMP280) + stato sensori e invio dati ═══
// Va incluso in index.html con:  <script src="stato.js"></script>  dopo rosa.js
// Legge l'ultimo valore di ogni sensore da openSenseMap (box con 10 sensori) e da
// ThingSpeak (campi 1-8) e segnala dati vecchi, valori fuori range e incongruenze.
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
    '.st-t td.n{color:var(--txt);font-weight:600}.st-t td.ty{color:var(--sub)}';
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
        return { data: out, err: err };
    }

    // ─── Valutazione e disegno ───
    function render(osm, osmErr, ts, tsErr){
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
            let tCell = '<span style="color:var(--sub)">non inviato</span>', tDot = 'na';
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

            // Stesso sensore su due piattaforme: i valori devono coincidere
            const tol = { T: 1.5, H: 5, Pslm: 2 }[s.key];
            if (tol && o && t && o.v !== null && t.v !== null && o.t && t.t && Math.abs(o.t - t.t) < 10 * 60000 && Math.abs(o.v - t.v) > tol) {
                flag('warn', 'ThingSpeak (' + fmtV(t.v, s.dec) + ') e openSenseMap (' + fmtV(o.v, s.dec) + ') non coincidono');
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
            .then(function(r){ render(osm, osmErr, r.data, r.err); })
            .catch(function(e){ console.warn('[stato]', e); })
            .then(function(){ busy = false; });
    }
    setTimeout(refresh, 5000);
    setInterval(refresh, REFRESH_MS);
})();
