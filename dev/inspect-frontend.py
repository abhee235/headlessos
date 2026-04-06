#!/usr/bin/env python3
"""Inspect HeadlessOS frontend via Chrome DevTools Protocol."""

import json
import asyncio
import base64
import sys

try:
    import websockets
except ImportError:
    print("Installing websockets...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets", "-q"])
    import websockets

import urllib.request


def get_ws_url():
    """Get WebSocket URL for the localhost:3000 tab."""
    data = urllib.request.urlopen("http://localhost:9222/json").read()
    tabs = json.loads(data)
    for tab in tabs:
        if "localhost:3000" in tab.get("url", ""):
            return tab["webSocketDebuggerUrl"]
    raise RuntimeError("No localhost:3000 tab found in Chrome")


async def capture():
    ws_url = get_ws_url()
    print(f"Connecting to: {ws_url}\n")

    async with websockets.connect(ws_url, max_size=50 * 1024 * 1024) as ws:
        # Title
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                                  "params": {"expression": "document.title"}}))
        r = json.loads(await ws.recv())
        print("Title:", r["result"]["result"]["value"])

        # Body text
        await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate",
                                  "params": {"expression": "document.body.innerText"}}))
        r = json.loads(await ws.recv())
        print("\n--- Page Text Content ---")
        print(r["result"]["result"]["value"][:2000])

        # HTML structure
        await ws.send(json.dumps({"id": 3, "method": "Runtime.evaluate",
                                  "params": {"expression": "document.querySelector('#root').innerHTML.substring(0, 3000)"}}))
        r = json.loads(await ws.recv())
        print("\n--- HTML Structure ---")
        print(r["result"]["result"]["value"][:3000])

        # Screenshot
        await ws.send(json.dumps({"id": 4, "method": "Page.captureScreenshot",
                                  "params": {"format": "png"}}))
        r = json.loads(await ws.recv())
        img = r["result"]["data"]
        with open("dev/screenshot.png", "wb") as f:
            f.write(base64.b64decode(img))
        print("\n✅ Screenshot saved to dev/screenshot.png")

        # Console errors
        print("\nDone! Check dev/screenshot.png for visual output.")


if __name__ == "__main__":
    asyncio.run(capture())
