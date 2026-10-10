from pathlib import Path
import shutil,json
root=Path(__file__).resolve().parent
site=root/'site';dist=site/'dist';dist.mkdir(exist_ok=True)
shutil.copytree(root/'static',dist/'static',dirs_exist_ok=True)
(dist/'data').mkdir(exist_ok=True);shutil.copy2(root/'data/questions.json',dist/'data/questions.json')
s=(root/'static/index.html').read_text().replace('<script src="/static/exams.js">','<script>window.LOCAL_MODE=true;</script><script src="/static/exams.js">').replace('本地服务 · SQLite 持久化','当前浏览器 · 本地数据保存').replace('独立教学工作区','浏览器独立工作区')
s=s.replace('本机数据保存 · 可导出备份','当前浏览器数据保存 · 请导出备份')
(dist/'index.html').write_text(s)
p=site/'.openai/hosting.json';m=json.loads(p.read_text());m['static']={'directory':'dist'};p.write_text(json.dumps(m,indent=2)+'\n')
(site/'.gitignore').write_text('node_modules/\n.sites/\n.DS_Store\n')
print('Prepared static site with explicit browser-local persistence')
