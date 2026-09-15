import requests
from datetime import datetime

CHANNEL_ID = 3217870

url = f"https://api.thingspeak.com/channels/{CHANNEL_ID}/feeds.json?results=10"

r = requests.get(url, timeout=20)
r.raise_for_status()

data = r.json()

print("=== METEO CASARANO ===")
print("Canale:", CHANNEL_ID)
print("Ultime letture:", len(data["feeds"]))

for feed in data["feeds"]:
    print(
        feed["created_at"],
        "field1=", feed["field1"],
        "field2=", feed["field2"],
        "field3=", feed["field3"],
        "field4=", feed["field4"]
    )
