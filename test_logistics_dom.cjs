const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const C=require('./dist/static/logistics-core.js');const decode=v=>v.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
class Element {
  constructor(tag = 'div', attrs = {}) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.id = attrs.id || '';
    this.value = attrs.value || '';
    this.checked = 'checked' in attrs;
    this.width = Number(attrs.width) || 960;
    this.height = Number(attrs.height) || 640;
    this.className = attrs.class || '';
    this._text = '';
    this._connectedRoot = false;
    this.classList = {
      toggle: (name, enabled) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const add = enabled === undefined ? !names.has(name) : enabled;
        if (add) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
      },
      add: name => this.classList.toggle(name, true),
      remove: name => this.classList.toggle(name, false)
    };
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
  }
  get value() { return this._value; }
  set value(value) { this._value = String(value); }
  get isConnected() { return this._connectedRoot || Boolean(this.parentElement?.isConnected); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = String(value ?? '');
  }
  set innerHTML(html) {
    this.textContent = '';
    const stack = [this];
    let cursor = 0;
    for (const match of String(html).matchAll(/<\/?([a-zA-Z][\w-]*)([^>]*?)>/g)) {
      const [all, rawTag, rawAttrs] = match;
      const tag = rawTag.toLowerCase();
      if (match.index > cursor) stack.at(-1)._text += decode(html.slice(cursor, match.index));
      cursor = match.index + all.length;
      if (all.startsWith('</')) {
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === tag) { stack.length = i; break; }
        }
        continue;
      }
      const attrs = {};
      for (const attribute of rawAttrs.matchAll(/([\w-]+)(?:="([^"]*)"|='([^']*)'|=([^\s]+))?/g)) {
        attrs[attribute[1]] = decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
      }
      const child = new Element(tag, attrs);
      stack.at(-1).appendChild(child);
      if (!['input', 'br', 'hr', 'img', 'meta', 'link'].includes(tag)) stack.push(child);
    }
    if (cursor < html.length) stack.at(-1)._text += decode(html.slice(cursor));
    this.walk(element => {
      if (element.tag !== 'select') return;
      element.options = element.children.filter(child => child.tag === 'option');
      const chosen = element.options.find(option => 'selected' in option.attrs) || element.options[0];
      element.value = chosen?.value || chosen?.textContent || '';
      element.options.forEach(option => { option.text = option.textContent; });
      element.selectedIndex = element.options.indexOf(chosen);
    });
  }
  appendChild(child) {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
  }
  walk(fn) { for (const child of this.children) { fn(child); child.walk(fn); } }
  matches(selector) {
    const compound=selector.match(/^([\w]+)(\[[^\]]+\])$/);if(compound)return this.tag===compound[1]&&this.matches(compound[2]);
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('[')) return selector.slice(1, -1) in this.attrs;
    return this.tag === selector;
  }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    if (parts.length > 1) return this.querySelectorAll(parts[0]).flatMap(element => element.querySelectorAll(parts.slice(1).join(' ')));
    const found = [];
    this.walk(element => { if (element.matches(selector)) found.push(element); });
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getContext(kind) {
    assert.equal(kind, '2d');
    return this.context ||= canvasContext();
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  setPointerCapture() {}
  focus() {}
  click() { return this.onclick?.({ target: this }); }
}

(async()=>{let saved=null,fail=false,msg='',download=null;const host=new Element();host._connectedRoot=true;const ctx={window:{},fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(__dirname+'/dist/data/questions.json','utf8'))}),LogisticsCore:C,escapeHTML,console,setTimeout,clearTimeout,Date,prompt:()=> '教学签收',downloadJSON:(n,d)=>{download=d},FormData:class{constructor(f){this.f=f}*[Symbol.iterator](){for(const e of this.f.querySelectorAll('input').concat(this.f.querySelectorAll('select'),this.f.querySelectorAll('textarea')))yield[e.attrs.name,e.value]}},toast:s=>{msg=s},navigate:()=>{},api:async(k,m,d)=>{if(m==='POST'){if(fail)throw Error('storage full');saved=JSON.parse(JSON.stringify(d));return saved}return saved}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/dist/static/logistics.js','utf8'),ctx);const M=ctx.window.Logistics;await M.render(host,'overview');await host.querySelector('#loadDemo').onclick();assert.equal(saved.products.length,2);await M.render(host,'transport');let plan=host.querySelectorAll('form').find(f=>f.dataset.form==='plan');plan.onsubmit({preventDefault(){},target:plan});await M.stop();assert.equal(saved.tasks.length,1);const task=saved.tasks[0];await host.querySelectorAll('[data-action]').find(b=>b.dataset.action==='dispatch').onclick();assert.equal(saved.products[0].stock,100);await M.render(host,'coldchain');let form=host.querySelector('form');const set=(name,v)=>{form.querySelectorAll('input').find(e=>e.attrs.name===name).value=v};set('temp',12);set('offset',4);form.onsubmit({preventDefault(){},target:form});await M.stop();assert.equal(saved.alarms.length,2);assert.equal(saved.tasks[0].progress,10);await M.render(host,'coldchain');form=host.querySelector('form');set('temp',5);set('distance',20);set('offset',0);form.onsubmit({preventDefault(){},target:form});await M.stop();assert.equal(saved.tasks[0].status,'arrived');host.querySelector('[data-deliver]').onclick();await M.stop();assert.equal(saved.tasks[0].status,'delivered');
await M.render(host,'warehouse');form=host.querySelector('form');for(const [name,value]of Object.entries({sku:'NEW',name:'New',zone:'A',qty:'10',min:'2',max:'8',humidity:'80'}))set(name,value);const before=JSON.stringify(saved);fail=true;form.onsubmit({preventDefault(){},target:form});await M.stop();assert.equal(JSON.stringify(saved),before);assert.match(msg,/storage full/);fail=false;form.onsubmit({preventDefault(){},target:form});await M.stop();assert.equal(saved.products.at(-1).stock,10);
for(const page of ['overview','warehouse','transport','coldchain','alarms','reports','calendar','cases']){await M.render(host,page);assert.ok(host.textContent.length>100);assert.ok(host.querySelector('#exportLogistics'));}assert.match(host.textContent,/当前已提供 1500 道主问题的默认题库/);assert.match(host.textContent,/新增原创 AI 草稿仍待教师学科审核/);assert.ok(!host.textContent.includes('完整 1500 道题库与可靠领域大模型能力仍需后续建设'));host.querySelector('#exportLogistics').onclick();assert.equal(download.tasks[0].status,'delivered');
console.log('PASS: real rendered logistics handlers with explicit mock DOM: sample initialization, planning, inventory debit, alarm injection/recovery, signing, failed save rollback/retry, eight routes and export. Not browser rendering QA.');})().catch(e=>{console.error(e);process.exitCode=1});
