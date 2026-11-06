import asyncio, json, subprocess, sys, time, urllib.request, pathlib
import websockets
html=pathlib.Path(sys.argv[1]).resolve(); exprs=sys.argv[2:]
port=9700+int(time.time())%200; profile=pathlib.Path.home()/"snap/chromium/common"/f"eval-{port}"
proc=subprocess.Popen(["chromium","--headless=new","--no-sandbox","--disable-gpu","--window-size=1280,720","--allow-file-access-from-files",f"--remote-debugging-port={port}",f"--user-data-dir={profile}","about:blank"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def target():
    for _ in range(60):
        try:
            p=[t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json")) if t["type"]=="page"]
            if p: return p[0]
        except Exception: pass
        time.sleep(0.25)
async def main():
    t=target()
    async with websockets.connect(t["webSocketDebuggerUrl"],max_size=2**30) as ws:
        mid=0
        async def call(m,**p):
            nonlocal mid; mid+=1; await ws.send(json.dumps({"id":mid,"method":m,"params":p}))
            while True:
                r=json.loads(await ws.recv())
                if r.get("id")==mid: return r.get("result",r)
        await call("Page.enable"); await call("Page.navigate",url=html.as_uri()); await asyncio.sleep(4)
        for e in exprs:
            r=await call("Runtime.evaluate",expression=e,returnByValue=True,awaitPromise=True)
            print(">>",e[:60]); print(json.dumps(r.get("result",{}).get("value",r),indent=None)[:600]); await asyncio.sleep(1.2)
        await call("Browser.close")
asyncio.run(main())
try: proc.terminate()
except Exception: pass
