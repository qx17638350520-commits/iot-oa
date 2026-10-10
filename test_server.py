import json, sqlite3, threading, unittest, urllib.request, urllib.error
from server import Handler, ThreadingHTTPServer, DB
class ServerTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.base=f'http://127.0.0.1:{cls.server.server_port}'
 @classmethod
 def tearDownClass(cls):
  cls.server.shutdown()
  with sqlite3.connect(DB) as c:c.execute("DELETE FROM state WHERE key LIKE 'test_%'")
 def test_health(self):
  d=json.load(urllib.request.urlopen(self.base+'/api/health'));self.assertTrue(d['ok']);self.assertEqual(d['hardware'],'simulation')
 def test_roundtrip(self):
  data={'场景':'智慧建筑','nodes':[{'x':120,'on':False}]};r=urllib.request.Request(self.base+'/api/state/test_scene',data=json.dumps(data).encode(),headers={'Content-Type':'application/json'},method='POST');self.assertEqual(json.load(urllib.request.urlopen(r)),data);self.assertEqual(json.load(urllib.request.urlopen(self.base+'/api/state/test_scene')),data)
 def test_no_db_download(self):
  with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(self.base+'/data/platform.sqlite3')
  self.assertEqual(e.exception.code,403)
 def test_missing_state(self):self.assertIsNone(json.load(urllib.request.urlopen(self.base+'/api/state/test_missing')))
 def test_bad_json(self):
  r=urllib.request.Request(self.base+'/api/state/test_bad',data=b'invalid',method='POST')
  with self.assertRaises(urllib.error.HTTPError) as e:urllib.request.urlopen(r)
  self.assertEqual(e.exception.code,400)
 def test_page_and_assets(self):
  for path in ['/','/static/style.css','/static/app.js','/static/twin.js','/static/exams.js','/static/annotation.js','/static/knowledge.js','/static/learning.js','/static/admin.js','/static/detection.js','/static/vendor/vision/model.json','/data/questions.json']:
   with urllib.request.urlopen(self.base+path) as response:
    self.assertEqual(response.status,200);self.assertGreater(len(response.read()),0)
if __name__=='__main__':unittest.main()
