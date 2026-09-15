import requests
from statistics import mean

CHANNEL_ID = 3217870

url = f"https://api.thingspeak.com/channels/{CHANNEL_ID}/feeds.json?results=8000"

r = requests.get(url, timeout=30)
r.raise_for_status()

feeds = r.json()["feeds"]

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

temperatura = valori("field1")
umidita = valori("field2")
pressione = valori("field3")
vento = valori("field4")

print("=== METEO CASARANO ===")
print("Letture ricevute:", len(feeds))

if temperatura:
    print(f"Temperatura: {min(temperatura):.1f} / {max(temperatura):.1f} °C | media {mean(temperatura):.1f} °C")

if umidita:
    print(f"Umidità: {min(umidita):.1f} / {max(umidita):.1f}% | media {mean(umidita):.1f}%")

if pressione:
    print(f"Pressione: {min(pressione):.1f} / {max(pressione):.1f} hPa | media {mean(pressione):.1f} hPa")

if vento:
    print(f"Vento: {min(vento):.1f} / {max(vento):.1f} | media {mean(vento):.1f}")

# Controllo stazione
if not feeds:
    raise RuntimeError("Nessun dato ricevuto da ThingSpeak")

ultimo = feeds[-1]
print("Ultima lettura:", ultimo.get("created_at"))

if ultimo.get("field1") is None and ultimo.get("field2") is None and ultimo.get("field3") is None:
    print("ATTENZIONE: temperatura, umidità e pressione non sono disponibili nell'ultima lettura.")
# =========================
# TEST TELEGRAM
# =========================

import os

TG_BOT_TOKEN = os.environ.get("TG_BOT_TOKEN")
TG_CHAT_ID = os.environ.get("TG_CHAT_ID")

if TG_BOT_TOKEN and TG_CHAT_ID:
    telegram_url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"

    risposta = requests.get(
        telegram_url,
        params={
            "chat_id": TG_CHAT_ID,
            "text": "✅ Test Telegram GitHub Actions: connessione OK!"
        },
        timeout=20
    )

    print("Telegram HTTP:", risposta.status_code)
    print("Telegram risposta:", risposta.text)
else:
    raise RuntimeError("Secret Telegram mancanti")
