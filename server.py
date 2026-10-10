#!/usr/bin/env python3
"""IoT Studio demo: standard-library-only local server. Not production auth."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json, sqlite3, argparse, os
from urllib.parse import urlsplit, unquote
ROOT=Path(__file__).resolve().parent
DB=ROOT/'data'/'platform.sqlite3'
DB.parent.mkdir(exist_ok=True)
with sqlite3.connect(DB) as c: c.execute('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT),**kw)
 def respond(self, data, status=200):
  b=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  clean=unquote(urlsplit(self.path).path)
  if any(part==".." for part in clean.split("/")): return self.send_error(403)
  if self.path.startswith('/api/state/'):
   key=self.path.split('?',1)[0].split('/')[-1]
   with sqlite3.connect(DB) as c: row=c.execute('SELECT value FROM state WHERE key=?',(key,)).fetchone()
   return self.respond(json.loads(row[0]) if row else None)
  if self.path=='/api/health': return self.respond({'ok':True,'storage':'SQLite','hardware':'simulation','training':'not_started'})
  if self.path.startswith('/data/') and self.path!='/data/questions.json': return self.send_error(403)
  if self.path in ('/','/index.html'): self.path='/static/index.html'
  if not self.path.startswith(('/static/','/data/questions.json')): return self.send_error(404)
  return super().do_GET()
 def do_POST(self):
  if not self.path.startswith('/api/state/'): return self.send_error(404)
  try:
   n=int(self.headers.get('Content-Length',0))
   if n>15000000: return self.respond({'error':'数据超过15MB限制'},413)
   obj=json.loads(self.rfile.read(n));key=self.path.split('/')[-1]
   if not key.isidentifier(): return self.respond({'error':'invalid key'},400)
   with sqlite3.connect(DB) as c: c.execute('INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,json.dumps(obj,ensure_ascii=False)))
   return self.respond(obj)
  except Exception as e:return self.respond({'error':str(e)},400)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--host',default='127.0.0.1');a=p.parse_args();print(f'IoT Studio: http://{a.host}:{a.port}',flush=True);ThreadingHTTPServer((a.host,a.port),Handler).serve_forever()
