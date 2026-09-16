import requests
import threading

def ping():
    requests.get('https://vyomplus.onrender.com/')
    threading.Timer(600, ping).start()