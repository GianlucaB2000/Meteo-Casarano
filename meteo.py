```python
import os
import requests
from statistics import mean
from datetime import datetime, timezone

CHANNEL_ID = 3217870

TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID")

# ============================================================
# THINGSPEAK - ULTIME 24 ORE
# ============================================================

url = f"https://api.thingspeak.com/channels/{CHANNEL_ID}/feeds.json?days=1"

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
        f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    )

    risposta = requests.get(
        telegram_url,
        params={
            "chat_id": TG_CHAT_ID,
            "text": testo
        },
        timeout=20
    )

    print("Telegram:", risposta.status_code)


# ============================================================
# CONTROLLO DATI
# ============================================================

print("=== METEO CASARANO ===")
print("Letture ricevute:", len(feeds))

if not feeds:
    invia_telegram(
        "🚨 ALERT METEO CASARANO\n\n"
        "Nessun dato ricevuto da ThingSpeak."
    )
    raise RuntimeError("Nessun dato ricevuto da ThingSpeak")


temperatura = valori("field1")
umidita = valori("field2")
pressione = valori("field3")
vento = valori("field4")


# ============================================================
# ESTREMI 24 ORE
# ============================================================

if temperatura:
    print(
        f"Temperatura: {min(temperatura):.1f} / "
        f"{max(temperatura):.1f} °C | "
        f"media {mean(temperatura):.1f} °C"
    )

if umidita:
    print(
        f"Umidità: {min(umidita):.1f} / "
        f"{max(umidita):.1f}% | "
        f"media {mean(umidita):.1f}%"
    )

if pressione:
    print(
        f"Pressione: {min(pressione):.1f} / "
        f"{max(pressione):.1f} hPa | "
        f"media {mean(pressione):.1f} hPa"
    )

if vento:
    print(
        f"Vento: {min(vento):.1f} / "
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

        adesso = datetime.now(timezone.utc)

        minuti = (adesso - ultima_data).total_seconds() / 60

        print(f"Età ultima lettura: {minuti:.1f} minuti")

        if minuti > 10:
            invia_telegram(
                "🚨 ALERT METEO CASARANO\n\n"
                f"Stazione senza aggiornamenti da {minuti:.1f} minuti.\n"
                f"Ultima lettura: {created_at}"
            )

    except Exception as e:
        print("Errore controllo timestamp:", e)


# ============================================================
# DATI MANCANTI
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
        + "\n".join(f"- {x}" for x in mancanti)
    )

    invia_telegram(testo)


# ============================================================
# REPORT ORARIO - TEST SOLO PER OGGI
# ============================================================

if temperatura or umidita or pressione or vento:

    testo = "📊 REPORT ORARIO METEO CASARANO\n\n"

    if temperatura:
        testo += (
            f"🌡️ Temperatura: {temperatura[-1]:.1f} °C\n"
            f"   24h: {min(temperatura):.1f} / "
            f"{max(temperatura):.1f} °C\n"
        )

    if umidita:
        testo += (
            f"💧 Umidità: {umidita[-1]:.1f}%\n"
            f"   24h: {min(umidita):.1f} / "
            f"{max(umidita):.1f}%\n"
        )

    if pressione:
        testo += (
            f"🌡️ Pressione: {pressione[-1]:.1f} hPa\n"
            f"   24h: {min(pressione):.1f} / "
            f"{max(pressione):.1f} hPa\n"
        )

    if vento:
        testo += (
            f"💨 Vento: {vento[-1]:.1f}\n"
            f"   24h: {min(vento):.1f} / "
            f"{max(vento):.1f}\n"
        )

    if created_at:
        testo += f"\n🕐 Ultima lettura: {created_at}"

    invia_telegram(testo)
```
