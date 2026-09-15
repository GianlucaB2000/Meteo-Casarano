```python
import os
import requests
from statistics import mean
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


# ============================================================
# CONFIGURAZIONE
# ============================================================

TETTO_CHANNEL = 3217870
ORTO_CHANNEL = 3358319

TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID")

# Report orario di prova SOLO per il 15 settembre 2026
DATA_TEST_REPORT = "2026-09-15"

TZ_LOCALE = ZoneInfo("Europe/Rome")


# ============================================================
# TELEGRAM
# ============================================================

def invia_telegram(testo):

    if not TG_BOT_TOKEN or not TG_CHAT_ID:
        print("Telegram non configurato.")
        return

    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"

    risposta = requests.get(
        url,
        params={
            "chat_id": TG_CHAT_ID,
            "text": testo
        },
        timeout=20
    )

    print("Telegram HTTP:", risposta.status_code)

    if risposta.status_code != 200:
        print("Telegram:", risposta.text)


# ============================================================
# THINGSPEAK
# ============================================================

def leggi_canale(channel_id):

    url = (
        f"https://api.thingspeak.com/channels/"
        f"{channel_id}/feeds.json?days=1"
    )

    risposta = requests.get(
        url,
        timeout=30
    )

    risposta.raise_for_status()

    dati = risposta.json()

    return dati.get("feeds", [])


# ============================================================
# CONVERSIONE VALORI
# ============================================================

def valore(feed, campo):

    v = feed.get(campo)

    if v is None:
        return None

    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def serie(feeds, campo):

    risultato = []

    for feed in feeds:

        v = valore(feed, campo)

        if v is not None:
            risultato.append(v)

    return risultato


# ============================================================
# ULTIMA LETTURA
# ============================================================

def ultima_lettura(feeds):

    if not feeds:
        return None

    return feeds[-1]


# ============================================================
# TIMESTAMP
# ============================================================

def eta_minuti(feed):

    if not feed:
        return None

    created = feed.get("created_at")

    if not created:
        return None

    try:

        data = datetime.fromisoformat(
            created.replace("Z", "+00:00")
        )

        adesso = datetime.now(timezone.utc)

        return (
            adesso - data
        ).total_seconds() / 60

    except Exception:

        return None


# ============================================================
# TREND PRESSIONE 3 ORE
# ============================================================

def pressione_tre_ore(feeds):

    punti = []

    for feed in feeds:

        p = valore(feed, "field3")

        ts = feed.get("created_at")

        if p is None or not ts:
            continue

        try:

            data = datetime.fromisoformat(
                ts.replace("Z", "+00:00")
            )

            punti.append(
                (data, p)
            )

        except Exception:
            pass

    if len(punti) < 2:
        return None, None

    punti.sort()

    ultimo_tempo, ultima_p = punti[-1]

    # Cerchiamo il dato più vicino a 3 ore prima
    target = ultimo_tempo.timestamp() - 3 * 3600

    precedente = min(
        punti[:-1],
        key=lambda x: abs(
            x[0].timestamp() - target
        )
    )

    delta = ultima_p - precedente[1]

    if delta <= -1.6:
        trend = "IN CALO"

    elif delta >= 1.6:
        trend = "IN AUMENTO"

    else:
        trend = "STABILE"

    return delta, trend


# ============================================================
# ZAMBRETTI
# ============================================================

ZAMBRETTI = {
    1: "Stabile, bel tempo",
    2: "Bel tempo",
    3: "Bel tempo, in peggioramento",
    4: "Bel tempo, possibile peggioramento",
    5: "Bel tempo, possibili rovesci",
    6: "Abbastanza bello, miglioramento",
    7: "Abbastanza bello, possibili rovesci",
    8: "Abbastanza bello, pioggia più tardi",
    9: "Rovesci iniziali, miglioramento",
    10: "Variabile, in miglioramento",
    11: "Abbastanza bello, rovesci probabili",
    12: "Piuttosto instabile, miglioramento più tardi",
    13: "Instabile, probabilmente in miglioramento",
    14: "Rovesci, schiarite",
    15: "Rovesci, in peggioramento",
    16: "Variabile, qualche pioggia",
    17: "Instabile, pioggia a tratti",
    18: "Instabile, pioggia",
    19: "Instabile, pioggia a tratti, peggioramento",
    20: "Pioggia a tratti, molto instabile",
    21: "Pioggia a tratti, forte",
    22: "Pioggia, a tratti intensa",
    23: "Temporalesco, possibile miglioramento",
    24: "Temporalesco, molta pioggia",
    25: "Temporalesco",
    26: "Temporalesco, possibile miglioramento"
}


def calcola_zambretti(
    pressione,
    delta_3h,
    direzione=None
):

    if pressione is None or delta_3h is None:
        return None, "Dati insufficienti"

    # Italia = emisfero nord
    #
    # Zambretti classico:
    # calo      -> 127 - 0.12 P
    # stabile   -> 144 - 0.13 P
    # aumento   -> 185 - 0.16 P

    if delta_3h <= -1.6:

        z = 127 - 0.12 * pressione
        trend = "in calo"

    elif delta_3h >= 1.6:

        z = 185 - 0.16 * pressione
        trend = "in aumento"

    else:

        z = 144 - 0.13 * pressione
        trend = "stabile"

    # Correzione classica semplificata per direzione vento
    if direzione is not None:

        try:
            d = float(direzione)

            # Sud: +2
            if 157.5 <= d < 202.5:
                z += 2

            # Est/Ovest: +1
            elif (
                67.5 <= d < 112.5
                or 247.5 <= d < 292.5
            ):
                z += 1

        except (ValueError, TypeError):
            pass

    z = int(round(z))

    # Limiti della scala Zambretti
    z = max(1, min(26, z))

    return z, trend


# ============================================================
# LETTURA TETTO
# ============================================================

print()
print("========================================")
print("        METEO CASARANO")
print("========================================")

tetto = leggi_canale(TETTO_CHANNEL)

print(
    "Tetto - letture 24h:",
    len(tetto)
)

if not tetto:

    invia_telegram(
        "🚨 ALERT METEO CASARANO\n\n"
        "Nessun dato ricevuto dal TETTO."
    )

    raise RuntimeError(
        "Nessun dato Tetto"
    )


# ============================================================
# DATI TETTO
# ============================================================

t_temp = serie(tetto, "field1")
t_hum = serie(tetto, "field2")
t_press = serie(tetto, "field3")
t_wind = serie(tetto, "field4")
t_gust = serie(tetto, "field5")
t_dir = serie(tetto, "field6")
t_light = serie(tetto, "field7")

ultimo_tetto = ultima_lettura(tetto)

temp_now = valore(
    ultimo_tetto,
    "field1"
)

hum_now = valore(
    ultimo_tetto,
    "field2"
)

press_now = valore(
    ultimo_tetto,
    "field3"
)

wind_now = valore(
    ultimo_tetto,
    "field4"
)

gust_now = valore(
    ultimo_tetto,
    "field5"
)

dir_now = valore(
    ultimo_tetto,
    "field6"
)

light_now = valore(
    ultimo_tetto,
    "field7"
)


# ============================================================
# ESTREMI
# ============================================================

print(
    "Temperatura:",
    min(t_temp) if t_temp else None,
    max(t_temp) if t_temp else None
)

print(
    "Pressione:",
    min(t_press) if t_press else None,
    max(t_press) if t_press else None
)

print(
    "Raffica:",
    max(t_gust) if t_gust else None
)


# ============================================================
# TREND 3 ORE
# ============================================================

delta_pressione, trend_pressione = pressione_tre_ore(
    tetto
)

print(
    "Trend pressione 3h:",
    delta_pressione,
    trend_pressione
)


# ============================================================
# ZAMBRETTI
# ============================================================

z_numero, z_trend = calcola_zambretti(
    press_now,
    delta_pressione,
    dir_now
)

z_testo = None

if z_numero is not None:

    z_testo = ZAMBRETTI.get(
        z_numero,
        "Previsione non disponibile"
    )

    print(
        "Zambretti:",
        z_numero,
        z_testo
    )


# ============================================================
# LETTURA ORTO
# ============================================================

try:

    orto = leggi_canale(ORTO_CHANNEL)

    print(
        "Orto - letture 24h:",
        len(orto)
    )

except Exception as e:

    print(
        "Errore lettura Orto:",
        e
    )

    orto = []


# ============================================================
# DATI ORTO
# ============================================================

o_temp = serie(orto, "field1")
o_hum = serie(orto, "field2")
o_soil = serie(orto, "field3")
o_delta = serie(orto, "field4")
o_lux = serie(orto, "field6")
o_uv = serie(orto, "field8")

ultimo_orto = ultima_lettura(orto)

o_temp_now = valore(
    ultimo_orto,
    "field1"
)

o_hum_now = valore(
    ultimo_orto,
    "field2"
)

o_soil_now = valore(
    ultimo_orto,
    "field3"
)

o_delta_now = valore(
    ultimo_orto,
    "field4"
)

o_lux_now = valore(
    ultimo_orto,
    "field6"
)

o_uv_now = valore(
    ultimo_orto,
    "field8"
)


# ============================================================
# ETA STAZIONI
# ============================================================

eta_tetto = eta_minuti(
    ultimo_tetto
)

eta_orto = eta_minuti(
    ultimo_orto
)

print(
    "Età Tetto:",
    eta_tetto,
    "min"
)

print(
    "Età Orto:",
    eta_orto,
    "min"
)


# ============================================================
# CONTROLLO STAZIONE TETTO
# ============================================================

if eta_tetto is not None:

    if eta_tetto > 10:

        invia_telegram(
            "🚨 ALERT METEO CASARANO\n\n"
            f"Tetto senza aggiornamenti da "
            f"{eta_tetto:.1f} minuti."
        )


# ============================================================
# CONTROLLO DATI TETTO MANCANTI
# ============================================================

mancanti = []

if ultimo_tetto.get("field1") is None:
    mancanti.append("temperatura")

if ultimo_tetto.get("field2") is None:
    mancanti.append("umidità")

if ultimo_tetto.get("field3") is None:
    mancanti.append("pressione")


if mancanti:

    invia_telegram(
        "⚠️ ALERT METEO CASARANO\n\n"
        "Dati mancanti TETTO:\n"
        + "\n".join(
            f"- {x}" for x in mancanti
        )
    )


# ============================================================
# REPORT ORARIO
# ============================================================

adesso_locale = datetime.now(
    TZ_LOCALE
)

data_locale = (
    adesso_locale.strftime(
        "%Y-%m-%d"
    )
)

minuto_locale = (
    adesso_locale.minute
)


# Il workflow gira ogni 5 minuti.
# Inviamo il report soltanto nei primi 4 minuti
# di ogni ora.

if (
    data_locale == DATA_TEST_REPORT
    and minuto_locale < 5
):

    testo = (
        "📊 REPORT METEO CASARANO\n"
        "━━━━━━━━━━━━━━━━━━\n\n"
    )

    # --------------------------------------------------------
    # TETTO
    # --------------------------------------------------------

    testo += "🏠 TETTO\n"

    if temp_now is not None:
        testo += (
            f"🌡️ Temp: {temp_now:.1f} °C\n"
        )

    if t_temp:
        testo += (
            f"   24h: {min(t_temp):.1f} / "
            f"{max(t_temp):.1f} °C\n"
        )

    if hum_now is not None:
        testo += (
            f"💧 Umidità: {hum_now:.1f}%\n"
        )

    if press_now is not None:
        testo += (
            f"🔵 Pressione: {press_now:.1f} hPa\n"
        )

    if t_press:
        testo += (
            f"   24h: {min(t_press):.1f} / "
            f"{max(t_press):.1f} hPa\n"
        )

    if wind_now is not None:
        testo += (
            f"💨 Vento medio: {wind_now:.1f} km/h\n"
        )

    if gust_now is not None:
        testo += (
            f"💨 Raffica: {gust_now:.1f} km/h\n"
        )

    if t_gust:
        testo += (
            f"   Raffica max 24h: "
            f"{max(t_gust):.1f} km/h\n"
        )

    if dir_now is not None:
        testo += (
            f"🧭 Direzione: {dir_now:.0f}°\n"
        )

    if light_now is not None:
        testo += (
            f"☀️ Luce: {light_now:.1f}\n"
        )

    # --------------------------------------------------------
    # TREND
    # --------------------------------------------------------

    testo += "\n📈 TREND BAROMETRICO 3h\n"

    if delta_pressione is not None:

        testo += (
            f"{delta_pressione:+.1f} hPa"
        )

        if trend_pressione:
            testo += (
                f" — {trend_pressione}"
            )

        testo += "\n"

    else:

        testo += (
            "Dati insufficienti\n"
        )

    # --------------------------------------------------------
    # ZAMBRETTI
    # --------------------------------------------------------

    testo += "\n🔮 ZAMBRETTI\n"

    if z_numero is not None:

        testo += (
            f"Indice: {z_numero}/26\n"
            f"Tendenza: {z_trend}\n"
            f"Previsione: {z_testo}\n"
        )

    else:

        testo += (
            "Dati insufficienti\n"
        )

    # --------------------------------------------------------
    # ORTO
    # --------------------------------------------------------

    testo += "\n🌱 ORTO\n"

    if o_temp_now is not None:

        testo += (
            f"🌡️ Temp aria: "
            f"{o_temp_now:.1f} °C\n"
        )

    if o_temp:

        testo += (
            f"   24h: {min(o_temp):.1f} / "
            f"{max(o_temp):.1f} °C\n"
        )

    if o_hum_now is not None:

        testo += (
            f"💧 Umidità: "
            f"{o_hum_now:.1f}%\n"
        )

    if o_soil_now is not None:

        testo += (
            f"🌱 Temp suolo: "
            f"{o_soil_now:.1f} °C\n"
        )

    if o_delta_now is not None:

        testo += (
            f"☀️ Delta solare: "
            f"{o_delta_now:.1f}\n"
        )

    if o_lux_now is not None:

        testo += (
            f"💡 Lux: "
            f"{o_lux_now:.1f}\n"
        )

    if o_uv_now is not None:

        testo += (
            f"🔆 UV: "
            f"{o_uv_now:.1f}\n"
        )

    if eta_orto is not None:

        if eta_orto <= 10:

            testo += (
                "🟢 Stato: ONLINE\n"
            )

        else:

            testo += (
                f"🔴 Stato: OFFLINE "
                f"({eta_orto:.1f} min)\n"
            )

    # --------------------------------------------------------
    # PIOGGIA
    # --------------------------------------------------------

    testo += (
        "\n🌧️ PIOGGIA\n"
        "Non disponibile su ThingSpeak.\n"
        "Dato locale della stazione.\n"
    )

    # --------------------------------------------------------
    # ORARIO
    # --------------------------------------------------------

    testo += (
        f"\n🕐 Report: "
        f"{adesso_locale.strftime('%d/%m/%Y %H:%M')}"
    )

    print()
    print("========================================")
    print("INVIO REPORT TELEGRAM")
    print("========================================")
    print(testo)

    invia_telegram(testo)

else:

    print(
        "Report orario non inviato."
    )
```
