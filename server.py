#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse, functools
if __name__ == '__main__':
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8770);a=p.parse_args()
 root=Path(__file__).resolve().parent/'dist'
 print(f'Logistics Training: http://127.0.0.1:{a.port}',flush=True)
 ThreadingHTTPServer(('127.0.0.1',a.port),functools.partial(SimpleHTTPRequestHandler,directory=str(root))).serve_forever()
