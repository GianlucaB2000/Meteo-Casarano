import os
import requests
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


TETTO_CHANNEL = 3217870
ORTO_CHANNEL = 3358319
CASA_CHANNEL = 3211426

TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID")

DATA_TEST_REPORT = datetime.now(TZ_LOCALE).strftime("%Y-%m-%d")TZ_LOCALE = ZoneInfo("Europe/Rome")

FILE_STATO_REPORT = "ultimo_report.txt"


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


def leggi_canale(channel_id):
    url = (
        f"https://api.thingspeak.com/channels/"
        f"{channel_id}/feeds.json?days=1"
    )

    risposta = requests.get(url, timeout=30)
    risposta.raise_for_status()

    dati = risposta.json()

    return dati.get("feeds", [])


def valore(feed, campo):
    if not feed:
        return None

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


def ultima_lettura(feeds):
    if not feeds:
        return None

    return feeds[-1]


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

        return (adesso - data).total_seconds() / 60

    except Exception:
        return None


# ==========================================================
# ZAMBRETTI — STESSA LOGICA DELL'ESP
# ==========================================================

ZAM_TABLE = [
    None,
    "A", "B", "D", "H", "O", "R", "U", "V", "X",
    "A", "B", "E", "K", "N", "P", "S", "W", "X", "Z",
    "A", "B", "C", "F", "G", "I", "J", "L", "M", "Q",
    "T", "Y", "Z"
]


ZAM_DESCR = [
    "Bello e stabile",
    "Bello",
    "In miglioramento",
    "Bello ma variabile",
    "Bello, possibili rovesci",
    "Abbastanza bello, in migl.",
    "Abbastanza bello, variabile",
    "Abbastanza bello, poi piogge",
    "Rovesci presto, poi migl.",
    "Variabile, in miglioramento",
    "Abbastanza bello, rovesci prob.",
    "Instabile, poi sereno",
    "Instabile, prob. miglioramento",
    "Rovesci con schiarite",
    "Rovesci, peggioramento",
    "Variabile, qualche pioggia",
    "Instabile, schiarite brevi",
    "Instabile, pioggia dopo",
    "Instabile, piogge",
    "Molto instabile, schiarite",
    "Piogge, peggioramento",
    "Piogge, molto instabile",
    "Piogge frequenti",
    "Molto instabile, pioggia",
    "Burrasca, poss. miglioramento",
    "Burrasca e piogge"
]


def pressione_tre_ore(feeds):
    """
    Calcola il trend barometrico su 3 ore usando
    i timestamp reali di ThingSpeak.

    Restituisce:
        delta hPa/3h
        descrizione trend
    """

    punti = []

    for feed in feeds:
        pressione = valore(feed, "field3")
        timestamp = feed.get("created_at")

        if pressione is None or not timestamp:
            continue

        if pressione <= 800 or pressione >= 1100:
            continue

        try:
            data = datetime.fromisoformat(
                timestamp.replace("Z", "+00:00")
            )

            punti.append((data, pressione))

        except Exception:
            pass

    if len(punti) < 2:
        return None, None

    punti.sort(key=lambda x: x[0])

    ultimo_tempo, ultima_pressione = punti[-1]

    target = ultimo_tempo.timestamp() - (3 * 3600)

    precedenti = [
        punto
        for punto in punti[:-1]
        if punto[0].timestamp() <= ultimo_tempo.timestamp()
    ]

    if not precedenti:
        return None, None

    precedente = min(
        precedenti,
        key=lambda x: abs(
            x[0].timestamp() - target
        )
    )

    delta_tempo = (
        ultimo_tempo - precedente[0]
    ).total_seconds()

    if delta_tempo <= 0:
        return None, None

    delta_pressione = (
        ultima_pressione - precedente[1]
    ) * (3 * 3600 / delta_tempo)

    if delta_pressione > 1.6:
        trend = "IN SALITA"

    elif delta_pressione < -1.6:
        trend = "IN DISCESA"

    else:
        trend = "STABILE"

    return delta_pressione, trend


def calcola_zambretti(pressione, delta_3h):
    """
    Replica calcZambrettiIndex() dell'ESP.

    pressione = pressione al livello del mare
    delta_3h  = variazione normalizzata in hPa/3h
    """

    if pressione is None or delta_3h is None:
        return None, None, "Dati insufficienti"

    if pressione <= 800 or pressione >= 1100:
        return None, None, "Pressione fuori scala"

    mese = datetime.now(TZ_LOCALE).month

    pc = pressione + 10

    if 5 <= mese <= 9:
        pc += 5

    P = int(pc * 10 + 0.5)

    estate = 6 <= mese <= 8
    inverno = mese == 12 or mese <= 2

    if delta_3h > 1.6:

        z = 179 - (2 * P) // 129

        if estate:
            z -= 1

        if inverno:
            z += 1

        z = max(20, min(32, z))

    elif delta_3h < -1.6:

        z = 130 - P // 81

        if estate:
            z += 1

        if inverno:
            z -= 1

        z = max(1, min(9, z))

    else:

        z = 147 - (5 * P) // 376

        z = max(10, min(19, z))

    lettera = ZAM_TABLE[z]

    descrizione = ZAM_DESCR[
        ord(lettera) - ord("A")
    ]

    return z, lettera, descrizione


print()
print("===================================")
print("       METEO CASARANO")
print("===================================")
print()


# ==========================================================
# TETTO
# ==========================================================

print("Leggo Tetto...")

tetto = leggi_canale(TETTO_CHANNEL)

if not tetto:
    invia_telegram(
        "🚨 ALERT METEO CASARANO\n\n"
        "Nessun dato ricevuto dal TETTO."
    )

    raise RuntimeError("Nessun dato Tetto")


print("Tetto - letture 24h:", len(tetto))

t_temp = serie(tetto, "field1")
t_hum = serie(tetto, "field2")
t_press = serie(tetto, "field3")
t_wind = serie(tetto, "field4")
t_gust = serie(tetto, "field5")
t_dir = serie(tetto, "field6")
t_light = serie(tetto, "field7")


ultimo_tetto = ultima_lettura(tetto)

temp_now = valore(ultimo_tetto, "field1")
hum_now = valore(ultimo_tetto, "field2")
press_now = valore(ultimo_tetto, "field3")
wind_now = valore(ultimo_tetto, "field4")
gust_now = valore(ultimo_tetto, "field5")
dir_now = valore(ultimo_tetto, "field6")
light_now = valore(ultimo_tetto, "field7")


delta_pressione, trend_pressione = pressione_tre_ore(tetto)


z_numero, z_lettera, z_testo = calcola_zambretti(
    press_now,
    delta_pressione
)


# ==========================================================
# ORTO
# ==========================================================

print("Leggo Orto...")

try:
    orto = leggi_canale(ORTO_CHANNEL)

except Exception as e:
    print("Errore lettura Orto:", e)
    orto = []


print("Orto - letture 24h:", len(orto))

o_temp = serie(orto, "field1")
o_hum = serie(orto, "field2")
o_soil = serie(orto, "field3")
o_delta = serie(orto, "field4")
o_lux = serie(orto, "field6")
o_uv = serie(orto, "field8")


ultimo_orto = ultima_lettura(orto)

o_temp_now = valore(ultimo_orto, "field1")
o_hum_now = valore(ultimo_orto, "field2")
o_soil_now = valore(ultimo_orto, "field3")
o_delta_now = valore(ultimo_orto, "field4")
o_lux_now = valore(ultimo_orto, "field6")
o_uv_now = valore(ultimo_orto, "field8")


# ==========================================================
# CASA
# ==========================================================

print("Leggo Casa...")

try:
    casa = leggi_canale(CASA_CHANNEL)

except Exception as e:
    print("Errore lettura Casa:", e)
    casa = []


print("Casa - letture 24h:", len(casa))

# Casa:
# field1 = temperatura
# field2 = umidita
#
# field5 = pressione
# NON VIENE UTILIZZATA

c_temp = serie(casa, "field1")
c_hum = serie(casa, "field2")


ultimo_casa = ultima_lettura(casa)

c_temp_now = valore(ultimo_casa, "field1")
c_hum_now = valore(ultimo_casa, "field2")


# ==========================================================
# ETA AGGIORNAMENTI
# ==========================================================

eta_tetto = eta_minuti(ultimo_tetto)
eta_orto = eta_minuti(ultimo_orto)
eta_casa = eta_minuti(ultimo_casa)


print("Eta Tetto:", eta_tetto)
print("Eta Orto:", eta_orto)
print("Eta Casa:", eta_casa)


# ==========================================================
# CONTROLLO TETTO
# ==========================================================

if eta_tetto is not None and eta_tetto > 10:
    invia_telegram(
        "🚨 ALERT METEO CASARANO\n\n"
        f"Tetto senza aggiornamenti da "
        f"{eta_tetto:.0f} minuti."
    )


mancanti = []


if ultimo_tetto.get("field1") is None:
    mancanti.append("temperatura")


if ultimo_tetto.get("field2") is None:
    mancanti.append("umidita")


if ultimo_tetto.get("field3") is None:
    mancanti.append("pressione")


if mancanti:
    invia_telegram(
        "🚨 ALERT METEO CASARANO\n\n"
        "Dati mancanti Tetto: "
        + ", ".join(mancanti)
    )


# ==========================================================
# CONTROLLO CASA
# ==========================================================

if eta_casa is not None and eta_casa > 10:
    invia_telegram(
        "🚨 ALERT METEO CASARANO\n\n"
        f"Stazione CASA senza aggiornamenti da "
        f"{eta_casa:.0f} minuti."
    )


mancanti_casa = []


if ultimo_casa:

    if ultimo_casa.get("field1") is None:
        mancanti_casa.append("temperatura")

    if ultimo_casa.get("field2") is None:
        mancanti_casa.append("umidita")


if mancanti_casa:
    invia_telegram(
        "🚨 ALERT METEO CASARANO\n\n"
        "Dati mancanti CASA: "
        + ", ".join(mancanti_casa)
    )


# ==========================================================
# REPORT ORARIO
# ==========================================================

adesso_locale = datetime.now(TZ_LOCALE)

data_locale = adesso_locale.strftime("%Y-%m-%d")
ora_corrente = adesso_locale.strftime("%Y-%m-%d-%H")

ultimo_report = ""

try:
    with open(FILE_STATO_REPORT, "r") as f:
        ultimo_report = f.read().strip()

except FileNotFoundError:
    ultimo_report = ""


# Il report viene inviato una sola volta per ogni ora.
# Non dipende dal minuto esatto di esecuzione di GitHub Actions.

if (
    data_locale == DATA_TEST_REPORT
    and ora_corrente != ultimo_report
):

    testo = (
        "📊 REPORT METEO CASARANO\n"
        "━━━━━━━━━━━━━━━━━━\n\n"
    )


    # ======================================================
    # TETTO
    # ======================================================

    testo += "🏠 TETTO\n"


    if temp_now is not None:
        testo += f"Temperatura: {temp_now:.1f} °C\n"


    if hum_now is not None:
        testo += f"Umidita: {hum_now:.1f} %\n"


    if press_now is not None:
        testo += f"Pressione: {press_now:.1f} hPa\n"


    if wind_now is not None:
        testo += f"Vento: {wind_now:.1f} km/h\n"


    if gust_now is not None:
        testo += f"Raffica: {gust_now:.1f} km/h\n"


    if dir_now is not None:
        testo += f"Direzione: {dir_now:.0f}°\n"


    if light_now is not None:
        testo += f"Luce: {light_now:.0f}\n"


    testo += "\n"


    # ======================================================
    # ESTREMI TETTO
    # ======================================================

    if t_temp:
        testo += (
            f"Temp. 24h: "
            f"{min(t_temp):.1f} / "
            f"{max(t_temp):.1f} °C\n"
        )


    if t_hum:
        testo += (
            f"Umidita 24h: "
            f"{min(t_hum):.1f} / "
            f"{max(t_hum):.1f} %\n"
        )


    if t_press:
        testo += (
            f"Pressione 24h: "
            f"{min(t_press):.1f} / "
            f"{max(t_press):.1f} hPa\n"
        )


    if t_wind:
        testo += (
            f"Vento medio max 24h: "
            f"{max(t_wind):.1f} km/h\n"
        )


    if t_gust:
        testo += (
            f"Raffica max 24h: "
            f"{max(t_gust):.1f} km/h\n"
        )


    testo += "\n"


    # ======================================================
    # PRESSIONE / ZAMBRETTI
    # ======================================================

    testo += "📈 PRESSIONE\n"


    if delta_pressione is not None:
        testo += (
            f"Trend 3h: "
            f"{delta_pressione:+.1f} hPa "
            f"({trend_pressione})\n"
        )

    else:
        testo += "Trend 3h: dati insufficienti\n"


    if z_numero is not None:
        testo += (
            f"Zambretti: {z_lettera} "
            f"(indice {z_numero}) — "
            f"{z_testo}\n"
        )

    else:
        testo += "Zambretti: dati insufficienti\n"


    testo += "\n"


    # ======================================================
    # CASA
    # ======================================================

    testo += "🏠 CASA\n"


    if c_temp_now is not None:
        testo += (
            f"Temperatura: "
            f"{c_temp_now:.1f} °C\n"
        )

    else:
        testo += "Temperatura: dato non disponibile\n"


    if c_hum_now is not None:
        testo += (
            f"Umidita: "
            f"{c_hum_now:.1f} %\n"
        )

    else:
        testo += "Umidita: dato non disponibile\n"


    if eta_casa is not None:
        testo += (
            f"Aggiornamento: "
            f"{eta_casa:.0f} min fa\n"
        )


    if c_temp:
        testo += (
            f"Temp. 24h: "
            f"{min(c_temp):.1f} / "
            f"{max(c_temp):.1f} °C\n"
        )


    if c_hum:
        testo += (
            f"Umidita 24h: "
            f"{min(c_hum):.1f} / "
            f"{max(c_hum):.1f} %\n"
        )


    testo += "\n"


    # ======================================================
    # ORTO
    # ======================================================

    testo += "🌱 ORTO\n"


    if o_temp_now is not None:
        testo += f"Temperatura: {o_temp_now:.1f} °C\n"


    if o_hum_now is not None:
        testo += f"Umidita: {o_hum_now:.1f} %\n"


    if o_soil_now is not None:
        testo += f"Temp. suolo: {o_soil_now:.1f} °C\n"


    if o_delta_now is not None:
        testo += f"Delta solare: {o_delta_now:.1f}\n"


    if o_lux_now is not None:
        testo += f"Luce: {o_lux_now:.0f} lux\n"


    if o_uv_now is not None:
        testo += f"UV: {o_uv_now:.2f}\n"


    if eta_orto is not None:
        testo += (
            f"Aggiornamento: "
            f"{eta_orto:.0f} min fa\n"
        )


    if o_temp:
        testo += (
            f"Temp. 24h: "
            f"{min(o_temp):.1f} / "
            f"{max(o_temp):.1f} °C\n"
        )


    if o_hum:
        testo += (
            f"Umidita 24h: "
            f"{min(o_hum):.1f} / "
            f"{max(o_hum):.1f} %\n"
        )


    if o_soil:
        testo += (
            f"Suolo 24h: "
            f"{min(o_soil):.1f} / "
            f"{max(o_soil):.1f} °C\n"
        )


    testo += (
        "\n"
        "Pioggia: dato locale della stazione, "
        "non disponibile su ThingSpeak.\n\n"
    )


    testo += (
        "🕐 "
        + adesso_locale.strftime("%d/%m/%Y %H:%M")
    )


    invia_telegram(testo)

    # Memorizza l'ora appena inviata.
    with open(FILE_STATO_REPORT, "w") as f:
        f.write(ora_corrente)

    print("Report orario Telegram inviato.")


else:
    print("Report orario non inviato.")


print()
print("=== FINE CONTROLLO ===")
print()
