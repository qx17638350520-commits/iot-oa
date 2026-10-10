/* Dependency-free digital-twin lifecycle regressions.
 * Run: node test_twin_lifecycle.cjs
 * Executes real static/twin.js and the real app.js navigation function in a VM.
 * DOM and Canvas are explicit mocks: these are state/lifecycle tests, not a
 * browser, pixel-rendering, accessibility, or screenshot verification.
 * Network writes are gated by each test; no server, npm packages, or sleeps.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const twinSource = fs.readFileSync(path.join(__dirname, 'static', 'twin.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, 'static', 'app.js'), 'utf8');
const navStart = appSource.indexOf('const names=');
const navEnd = appSource.indexOf("window.addEventListener('popstate'");
assert.ok(navStart >= 0 && navEnd > navStart, 'find the unmodified navigation declarations');
const navigationSource = appSource.slice(navStart, navEnd);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function observed(promise) {
  const result = { status: 'pending' };
  result.done = Promise.resolve(promise).then(
    value => { result.status = 'fulfilled'; result.value = value; },
    reason => { result.status = 'rejected'; result.reason = reason; }
  );
  return result;
}
function canvasContext() {
  const calls = new Map();
  const context = { calls };
  return new Proxy(context, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        calls.set(key, (calls.get(key) || 0) + 1);
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return { addColorStop() {} };
        if (key === 'measureText') return { width: String(args[0]).length * 7 };
      };
    }
  });
}

// Minimal DOM operations used by the production module, including actual
// element replacement/disconnection, data attributes, options, and handlers.
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

function harness({ gateReads = false } = {}) {
  const documentRoot = new Element('body');
  documentRoot._connectedRoot = true;
  documentRoot.innerHTML = '<nav><button data-page="twin"></button><button data-page="learning"></button></nav><div id="breadcrumb"></div><main id="content"></main>';
  const content = documentRoot.querySelector('#content');
  const reads = [], writes = [], notifications = [], timers = new Map();
  let saved = null, timerId = 0;
  const location = { hash: '#overview', protocol: 'http:' };
  const history = {
    replaceState(_state, _title, hash) { location.hash = hash; },
    pushState(_state, _title, hash) { location.hash = hash; }
  };
  const context = {
    document: {
      activeElement: null,
      createElement: tag => new Element(tag),
      getElementById: id => documentRoot.querySelector('#' + id),
      querySelectorAll: selector => documentRoot.querySelectorAll(selector)
    },
    location, history, console,
    escapeHTML,
    toast: message => notifications.push(message),
    downloadJSON() {},
    scrollTo() {},
    setInterval(callback) { timers.set(++timerId, callback); return timerId; },
    clearInterval(id) { timers.delete(id); },
    Learning: { async render(container) { container.innerHTML = '<p id="learning-page">Learning test destination</p>'; } },
    async api(key, method = 'GET', payload) {
      assert.equal(key, 'twin', 'only twin state is requested');
      const gate = deferred();
      if (method === 'GET') {
        const request = { succeed(value = saved) { gate.resolve(clone(value)); }, fail: gate.reject };
        reads.push(request);
        if (!gateReads) request.succeed();
      } else {
        assert.equal(method, 'POST');
        const data = clone(payload);
        writes.push({ data, succeed() { saved = clone(data); gate.resolve(clone(data)); }, fail: gate.reject });
      }
      return gate.promise;
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(twinSource, context, { filename: 'static/twin.js' });
  vm.runInContext(navigationSource, context, { filename: 'static/app.js:navigation' });
  const get = id => {
    const element = content.querySelector('#' + id);
    assert.ok(element, `expected #${id}`);
    return element;
  };
  return {
    context, twin: context.Twin, content, reads, writes, timers, notifications, location,
    get,
    saved: () => clone(saved),
    async start() { await context.navigate('twin'); },
    change(id, value) { const element = get(id); element.value = value; return element.onchange({ target: element }); },
    tick() { for (const callback of [...timers.values()]) callback(); },
    newHost() { const host = new Element('section'); content.appendChild(host); return host; }
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('navigation persists real unsaved scene/device edits and restores them on reentry', async () => {
  const h = harness();
  await h.start();
  h.change('sceneName', '导航保存场景');
  h.change('nodeName', '北楼温度探头');
  h.change('nodeX', '317');
  h.change('nodeY', '281');
  h.change('nodeZ', '72');
  h.change('alarmHigh', '34');
  h.change('envTemperature', '29');
  const originalCanvas = h.get('twinCanvas');
  assert.match(h.get('savedAt').textContent, /未保存/);
  const leaving = observed(h.context.navigate('learning'));
  await checkpoint();
  assert.equal(h.writes.length, 1);
  assert.equal(leaving.status, 'pending', 'navigation waits for actual persistence');
  assert.equal(h.get('twinCanvas'), originalCanvas, 'the old screen remains until save succeeds');
  assert.equal(h.content.inert, true);
  assert.equal(h.location.hash, '#twin');
  assert.equal(h.writes[0].data.name, '导航保存场景');
  assert.equal(h.writes[0].data.nodes[0].name, '北楼温度探头');
  assert.equal(h.writes[0].data.nodes[0].x, 317);
  assert.equal(h.writes[0].data.nodes[0].threshold.high, 34);
  assert.ok(h.writes[0].data.nodes.every(node => !('_screen' in node)), 'transient canvas positions are not persisted');
  h.writes[0].succeed();
  await leaving.done;
  assert.equal(leaving.status, 'fulfilled');
  assert.equal(h.location.hash, '#learning');
  assert.equal(originalCanvas.isConnected, false);
  h.get('learning-page');
  await h.context.navigate('twin');
  assert.equal(h.get('sceneName').value, '导航保存场景');
  assert.equal(h.get('nodeName').value, '北楼温度探头');
  assert.equal(h.get('nodeX').value, '317');
  assert.equal(h.get('nodeY').value, '281');
  assert.equal(h.get('nodeZ').value, '72');
  assert.equal(h.get('alarmHigh').value, '34');
  assert.equal(h.get('envTemperature').value, '29');
  assert.doesNotMatch(h.get('savedAt').textContent, /未保存/);
  await h.context.navigate('learning');
  assert.equal(h.writes.length, 1, 'revisiting an unchanged scene does not resave');
});

test('stop cancels simulation immediately and waits for persisted generated samples', async () => {
  const h = harness();
  await h.start();
  h.get('runTwin').click();
  assert.equal(h.timers.size, 1);
  const previousTick = [...h.timers.values()][0];
  h.tick(); h.tick();
  assert.equal(h.get('metricSamples').textContent, '2');
  const stopping = observed(h.twin.stop());
  assert.equal(h.timers.size, 0, 'timer is cleared before the network write completes');
  await checkpoint();
  assert.equal(stopping.status, 'pending');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].data.sampleCount, 2);
  assert.equal(h.writes[0].data.nodes[0].history.length, 2);
  previousTick();
  assert.equal(h.get('metricSamples').textContent, '2', 'a queued old timer callback cannot generate more readings');
  h.writes[0].succeed();
  await stopping.done;
  assert.equal(stopping.status, 'fulfilled');
  await h.twin.render(h.content.children[0]);
  assert.equal(h.get('metricSamples').textContent, '2');
  assert.equal(h.timers.size, 0, 'reentry stays paused');
});

test('failed navigation keeps edited state and a usable canvas; retry saves and navigates', async () => {
  const h = harness();
  await h.start();
  h.change('sceneName', '失败后保留的编辑');
  h.change('nodeName', '待重试的设备');
  const canvas = h.get('twinCanvas');
  const leaving = observed(h.context.navigate('learning'));
  await checkpoint();
  assert.equal(h.writes.length, 1);
  h.writes[0].fail(new Error('deliberate persistence failure'));
  await leaving.done;
  assert.equal(leaving.status, 'rejected');
  assert.match(leaving.reason.message, /deliberate persistence failure/);
  assert.equal(h.location.hash, '#twin');
  assert.equal(h.content.inert, false, 'failed navigation unlocks the current screen');
  assert.equal(h.get('twinCanvas'), canvas);
  assert.equal(h.get('sceneName').value, '失败后保留的编辑');
  assert.equal(h.get('nodeName').value, '待重试的设备');
  assert.match(h.get('savedAt').textContent, /未保存/);
  const drawsBeforeEdit = canvas.context.calls.get('clearRect');
  h.change('nodeX', '402');
  assert.ok(canvas.context.calls.get('clearRect') > drawsBeforeEdit, 'the preserved canvas context still redraws after failure');
  const retry = observed(h.context.navigate('learning'));
  await checkpoint();
  assert.equal(h.writes.length, 2);
  assert.equal(retry.status, 'pending');
  assert.equal(h.writes[1].data.name, '失败后保留的编辑');
  assert.equal(h.writes[1].data.nodes[0].name, '待重试的设备');
  assert.equal(h.writes[1].data.nodes[0].x, 402);
  h.writes[1].succeed();
  await retry.done;
  assert.equal(retry.status, 'fulfilled');
  h.get('learning-page');
  await h.context.navigate('twin');
  assert.equal(h.get('nodeX').value, '402');
  assert.equal(h.get('nodeName').value, '待重试的设备');
});

test('concurrent stop requests await one write and later stops do not duplicate it', async () => {
  const h = harness();
  await h.start();
  h.change('sceneName', '只保存一次');
  const first = observed(h.twin.stop());
  const second = observed(h.twin.stop());
  const third = observed(h.twin.stop());
  await checkpoint();
  assert.equal(h.writes.length, 1, 'concurrent stops share the dirty-state flush');
  assert.deepEqual([first.status, second.status, third.status], ['pending', 'pending', 'pending']);
  h.writes[0].succeed();
  await Promise.all([first.done, second.done, third.done]);
  assert.deepEqual([first.status, second.status, third.status], ['fulfilled', 'fulfilled', 'fulfilled']);
  await h.twin.stop();
  await h.twin.stop();
  assert.equal(h.writes.length, 1);
});

test('unused and unchanged modules stop without any persistence writes', async () => {
  const h = harness();
  await h.twin.stop();
  assert.equal(h.reads.length, 0);
  assert.equal(h.writes.length, 0);
  await h.start();
  await h.twin.stop();
  await h.twin.stop();
  assert.equal(h.writes.length, 0);
});

test('a stopped initial async load cannot remount its old screen', async () => {
  const h = harness({ gateReads: true });
  const oldHost = h.newHost();
  const loading = observed(h.twin.render(oldHost));
  await checkpoint();
  assert.equal(h.reads.length, 1);
  assert.equal(loading.status, 'pending');
  await h.twin.stop();
  h.content.innerHTML = '<p id="replacement">A different screen</p>';
  h.reads[0].succeed(h.twin.scenePreset('家居'));
  await loading.done;
  assert.equal(loading.status, 'fulfilled');
  assert.equal(oldHost.isConnected, false);
  assert.equal(oldHost.querySelector('#twinCanvas'), null, 'the obsolete host was never mounted');
  h.get('replacement');
  assert.equal(h.content.querySelector('#twinCanvas'), null);
  assert.equal(h.writes.length, 0);
});

test('an older load completing after reentry cannot overwrite the newer scene', async () => {
  const h = harness({ gateReads: true });
  const oldHost = h.newHost();
  const first = observed(h.twin.render(oldHost));
  await checkpoint();
  assert.equal(h.reads.length, 1);
  await h.twin.stop();
  oldHost.remove();
  const newHost = h.newHost();
  const second = observed(h.twin.render(newHost));
  await checkpoint();
  assert.equal(h.reads.length, 2);
  const newer = h.twin.scenePreset('商超');
  newer.name = '新载入的商超';
  h.reads[1].succeed(newer);
  await second.done;
  assert.equal(second.status, 'fulfilled');
  const newCanvas = h.get('twinCanvas');
  h.reads[0].succeed(h.twin.scenePreset('家居'));
  await first.done;
  assert.equal(first.status, 'fulfilled');
  assert.equal(h.get('twinCanvas'), newCanvas);
  assert.equal(h.get('sceneName').value, '新载入的商超');
  assert.equal(oldHost.querySelector('#twinCanvas'), null);
});

test('a failed initial read never autosaves a replacement and can be retried', async () => {
  const h = harness({ gateReads: true });
  const starting = observed(h.start());
  await checkpoint();
  assert.equal(h.reads.length, 1);
  h.reads[0].fail(new Error('deliberate read failure'));
  await starting.done;
  assert.equal(starting.status, 'fulfilled', 'the module renders a recoverable read error');
  assert.equal(h.content.querySelector('#twinCanvas'), null, 'no replacement scene is mounted');
  assert.match(h.content.textContent, /deliberate read failure/);
  const retryButton = h.content.querySelector('[data-retry-twin]');
  assert.ok(retryButton, 'the read-error screen exposes a retry');
  await h.twin.stop();
  await h.twin.stop();
  assert.equal(h.writes.length, 0, 'stopping a failed load cannot overwrite persisted state');
  const retry = observed(retryButton.click());
  await checkpoint();
  assert.equal(h.reads.length, 2);
  const recovered = h.twin.scenePreset('家居');
  recovered.name = '服务恢复后的既有场景';
  h.reads[1].succeed(recovered);
  await retry.done;
  assert.equal(retry.status, 'fulfilled');
  assert.equal(h.get('sceneName').value, '服务恢复后的既有场景');
  h.get('twinCanvas');
  await h.twin.stop();
  assert.equal(h.writes.length, 0, 'recovered unchanged state also requires no write');
});

let completed = 0;
// An accidentally unresolved gated promise must fail, not silently let Node
// exit successfully with an incomplete suite when its event loop becomes idle.
process.once('beforeExit', () => {
  if (completed !== tests.length) {
    console.error(`Lifecycle suite stopped early: ${completed}/${tests.length} tests completed`);
    process.exitCode = 1;
  }
});

(async () => {
  let failed = 0;
  for (const { name, run } of tests) {
    try { await run(); console.log('PASS', name); }
    catch (error) { failed++; console.error('FAIL', name); console.error(error.stack || error); }
    finally { completed++; }
  }
  if (failed) { console.error(`${failed}/${tests.length} lifecycle tests failed`); process.exitCode = 1; }
  else console.log(`${tests.length}/${tests.length} digital-twin lifecycle tests passed (mock DOM/Canvas, real module/navigation).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
