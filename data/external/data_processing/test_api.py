#!/usr/bin/env python3
from dotenv import load_dotenv
import os
import requests

load_dotenv(os.path.dirname(__file__) + "/.env")
key = os.getenv("OPENAI_API_KEY")
print(f"Key loaded: {key[:20]}...")

r = requests.post(
    "https://api.openai.com/v1/chat/completions",
    headers={"Authorization": f"Bearer {key}"},
    json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]}
)
print(f"Status: {r.status_code}")
print(r.json())
