```python
import os
import requests
from statistics import mean
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


# ============================================================
# CONFIGURAZIONE
# ============================================================

CHANNEL_ID = 3217870

TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID")

# Report orario di prova SOLO per oggi
DATA_TEST_REPORT = "2026-09-15"

# Fuso orario locale
TZ_LOCALE = ZoneInfo("Europe/Rome")


# ============================================================
# THINGSPEAK - ULTIME 24 ORE
# ============================================================

url = (
    f"https://api.thingspeak.com/channels/"
    f"{CHANNEL_ID}/feeds.json?days=1"
)

r = requests.get(url, timeout=30)
r.raise_for_status()

feeds = r.json()["feeds"]


# ============================================================
# FUNZIONI
# ============================================================

def valori(field):
    risultato = []

    for feed in feeds:
        valore = feed.get(field)

        if valore is not None:
            try:
                risultato.append(float(valore))
            except (ValueError, TypeError):
                pass

    return risultato


def invia_telegram(testo):
    if not TG_BOT_TOKEN or not TG_CHAT_ID:
        print("Telegram non configurato.")
        return

    telegram_url = (
        f"https://api.telegram.org/bot"
        f"{TG_BOT_TOKEN}/sendMessage"
    )

    risposta = requests.get(
        telegram_url,
        params={
            "chat_id": TG_CHAT_ID,
            "text": testo
        },
        timeout=20
    )

    print("Telegram HTTP:", risposta.status_code)

    if risposta.status_code != 200:
        print("Telegram risposta:", risposta.text)


# ============================================================
# CONTROLLO GENERALE
# ============================================================

print("=== METEO CASARANO ===")
print("Letture ricevute:", len(feeds))

if not feeds:
    invia_telegram(
        "🚨 ALERT METEO CASARANO\n\n"
        "Nessun dato ricevuto da ThingSpeak."
    )

    raise RuntimeError("Nessun dato ricevuto da ThingSpeak")


# ============================================================
# LETTURA CAMPI
# ============================================================

temperatura = valori("field1")
umidita = valori("field2")
pressione = valori("field3")
vento = valori("field4")


# ============================================================
# ESTREMI 24 ORE
# ============================================================

if temperatura:
    print(
        f"Temperatura 24h: "
        f"{min(temperatura):.1f} / "
        f"{max(temperatura):.1f} °C | "
        f"media {mean(temperatura):.1f} °C"
    )

if umidita:
    print(
        f"Umidità 24h: "
        f"{min(umidita):.1f} / "
        f"{max(umidita):.1f}% | "
        f"media {mean(umidita):.1f}%"
    )

if pressione:
    print(
        f"Pressione 24h: "
        f"{min(pressione):.1f} / "
        f"{max(pressione):.1f} hPa | "
        f"media {mean(pressione):.1f} hPa"
    )

if vento:
    print(
        f"Vento 24h: "
        f"{min(vento):.1f} / "
        f"{max(vento):.1f} | "
        f"media {mean(vento):.1f}"
    )


# ============================================================
# ULTIMA LETTURA
# ============================================================

ultimo = feeds[-1]
created_at = ultimo.get("created_at")

print("Ultima lettura:", created_at)

minuti = None

if not created_at:

    invia_telegram(
        "🚨 ALERT METEO CASARANO\n\n"
        "Ultima lettura ThingSpeak senza timestamp."
    )

else:

    try:

        ultima_data = datetime.fromisoformat(
            created_at.replace("Z", "+00:00")
        )

        adesso_utc = datetime.now(timezone.utc)

        minuti = (
            adesso_utc - ultima_data
        ).total_seconds() / 60

        print(
            f"Età ultima lettura: "
            f"{minuti:.1f} minuti"
        )

        # ----------------------------------------------------
        # STAZIONE OFFLINE
        # ----------------------------------------------------

        if minuti > 10:

            invia_telegram(
                "🚨 ALERT METEO CASARANO\n\n"
                f"Stazione senza aggiornamenti da "
                f"{minuti:.1f} minuti.\n"
                f"Ultima lettura: {created_at}"
            )

    except Exception as e:

        print(
            "Errore controllo timestamp:",
            e
        )


# ============================================================
# CONTROLLO DATI MANCANTI
# ============================================================

mancanti = []

if ultimo.get("field1") is None:
    mancanti.append("temperatura")

if ultimo.get("field2") is None:
    mancanti.append("umidità")

if ultimo.get("field3") is None:
    mancanti.append("pressione")


if mancanti:

    testo = (
        "⚠️ ALERT METEO CASARANO\n\n"
        "Dati mancanti nell'ultima lettura:\n"
        + "\n".join(
            f"- {x}" for x in mancanti
        )
    )

    invia_telegram(testo)


# ============================================================
# ORA LOCALE
# ============================================================

adesso_locale = datetime.now(TZ_LOCALE)

data_locale = adesso_locale.strftime("%Y-%m-%d")
ora_locale = adesso_locale.hour
minuto_locale = adesso_locale.minute

print(
    f"Ora locale: "
    f"{adesso_locale.strftime('%d/%m/%Y %H:%M:%S')}"
)


# ============================================================
# REPORT ORARIO
# SOLO IL 15/09/2026
# ============================================================

if (
    data_locale == DATA_TEST_REPORT
    and minuto_locale < 5
):

    testo = (
        "📊 REPORT ORARIO METEO CASARANO\n\n"
    )

    # --------------------------------------------------------
    # TEMPERATURA
    # --------------------------------------------------------

    if temperatura:

        testo += (
            f"🌡️ Temperatura: "
            f"{temperatura[-1]:.1f} °C\n"
            f"   Min 24h: {min(temperatura):.1f} °C\n"
            f"   Max 24h: {max(temperatura):.1f} °C\n\n"
        )

    # --------------------------------------------------------
    # UMIDITÀ
    # --------------------------------------------------------

    if umidita:

        testo += (
            f"💧 Umidità: "
            f"{umidita[-1]:.1f}%\n"
            f"   Min 24h: {min(umidita):.1f}%\n"
            f"   Max 24h: {max(umidita):.1f}%\n\n"
        )

    # --------------------------------------------------------
    # PRESSIONE
    # --------------------------------------------------------

    if pressione:

        testo += (
            f"🔵 Pressione: "
            f"{pressione[-1]:.1f} hPa\n"
            f"   Min 24h: {min(pressione):.1f} hPa\n"
            f"   Max 24h: {max(pressione):.1f} hPa\n\n"
        )

    # --------------------------------------------------------
    # VENTO
    # --------------------------------------------------------

    if vento:

        testo += (
            f"💨 Vento: "
            f"{vento[-1]:.1f}\n"
            f"   Min 24h: {min(vento):.1f}\n"
            f"   Max 24h: {max(vento):.1f}\n\n"
        )

    # --------------------------------------------------------
    # STATO STAZIONE
    # --------------------------------------------------------

    if minuti is not None:

        if minuti <= 10:

            testo += "🟢 Stazione: ONLINE\n"

        else:

            testo += (
                f"🔴 Stazione: OFFLINE "
                f"({minuti:.1f} min)\n"
            )

    # --------------------------------------------------------
    # TIMESTAMP
    # --------------------------------------------------------

    testo += (
        f"\n🕐 Ultima lettura:\n"
        f"{created_at}"
    )

    print("\n=== INVIO REPORT ORARIO ===")
    print(testo)

    invia_telegram(testo)

else:

    print(
        "Nessun report orario: "
        "non siamo nella finestra prevista."
    )
```
