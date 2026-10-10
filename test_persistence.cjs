/* Dependency-free persistence regression tests against the real app.js api().
 * Run: node test_persistence.cjs
 * Network completions are explicitly gated; no server, DOM, or sleeps needed.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'static', 'app.js'), 'utf8');
const apiEnd = source.indexOf('window.toast');
assert.ok(apiEnd > 0, 'app.js must declare api before window.toast');
// Include queue declarations before window.api without evaluating the UI code.
const apiSource = source.slice(0, apiEnd);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// An event-loop checkpoint drains all pending promise work; it advances no clock
// and cannot complete a gated request. Assertions decide whether dispatch ran.
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
const clone = value => JSON.parse(JSON.stringify(value));
const observe = promise => promise.then(
  value => ({ status: 'fulfilled', value }),
  reason => ({ status: 'rejected', reason })
);

function harness({ protocol = 'http:', local = false } = {}) {
  const requests = [], storage = new Map(), remote = new Map();
  let storageFailure = null;
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) {
      if (storageFailure) throw storageFailure;
      storage.set(key, String(value));
    }
  };
  const context = {
    window: { LOCAL_MODE: local },
    location: { protocol },
    localStorage,
    fetch(url, options) {
      const gate = deferred();
      const key = url.replace(/^.*\//, '');
      const request = {
        url, options, key,
        succeed(value = options.method === 'GET'
          ? (remote.has(key) ? remote.get(key) : null)
          : JSON.parse(options.body)) {
          if (options.method !== 'GET') remote.set(key, clone(value));
          gate.resolve({ ok: true, json: async () => clone(value) });
        },
        respond(response) { gate.resolve(response); },
        fail(error) { gate.reject(error); }
      };
      requests.push(request);
      return gate.promise;
    }
  };
  vm.createContext(context);
  vm.runInContext(apiSource, context, { filename: 'static/app.js:api' });
  assert.equal(typeof context.window.api, 'function', 'real api was extracted');
  return {
    api: context.window.api, requests, storage, remote,
    failStorage(error) { storageFailure = error; }
  };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('same normalized key serializes writes until the prior response is parsed', async () => {
  const h = harness();
  const first = h.api('learning', 'POST', { version: 1 });
  const second = h.api('/api/state/learning', 'POST', { version: 2 });
  const third = h.api('learning', 'POST', { version: 3 });
  await checkpoint();
  assert.equal(h.requests.length, 1, 'queued writes must not race the first write');
  assert.equal(h.requests[0].url, '/api/state/learning');
  assert.equal(h.requests[0].options.headers['Content-Type'], 'application/json');
  const body = deferred();
  h.requests[0].respond({ ok: true, json: () => body.promise });
  await checkpoint();
  assert.equal(h.requests.length, 1, 'HTTP headers alone must not settle the write');
  body.resolve({ version: 1 });
  assert.deepEqual(await first, { version: 1 });
  await checkpoint();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].url, '/api/state/learning');
  assert.deepEqual(JSON.parse(h.requests[1].options.body), { version: 2 });
  h.requests[1].succeed();
  await second;
  await checkpoint();
  assert.equal(h.requests.length, 3);
  assert.deepEqual(JSON.parse(h.requests[2].options.body), { version: 3 });
  h.requests[2].succeed();
  await third;
  assert.deepEqual(h.remote.get('learning'), { version: 3 });
});

test('each write snapshots nested JSON at invocation, including queued writes', async () => {
  const h = harness();
  const payload = { nested: { note: 'first' }, values: [1] };
  const first = h.api('annotation', 'POST', payload);
  payload.nested.note = 'second';
  payload.values.push(2);
  const second = h.api('/api/state/annotation', 'POST', payload);
  payload.nested.note = 'after both calls';
  payload.values.push(3);
  await checkpoint();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(JSON.parse(h.requests[0].options.body), {
    nested: { note: 'first' }, values: [1]
  });
  h.requests[0].succeed();
  await first;
  await checkpoint();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(JSON.parse(h.requests[1].options.body), {
    nested: { note: 'second' }, values: [1, 2]
  });
  h.requests[1].succeed();
  await second;
});

test('a read waits for all earlier writes to its normalized key', async () => {
  const h = harness();
  const first = h.api('experiments', 'POST', { version: 1 });
  const second = h.api('/api/state/experiments', 'POST', { version: 2 });
  const read = h.api('experiments');
  await checkpoint();
  assert.equal(h.requests.length, 1, 'read must not run ahead of queued writes');
  h.requests[0].succeed();
  await first;
  await checkpoint();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].options.method, 'POST');
  h.requests[1].succeed();
  await second;
  await checkpoint();
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].options.method, 'GET');
  assert.equal('body' in h.requests[2].options, false, 'GET never sends a JSON body');
  h.requests[2].succeed();
  assert.deepEqual(await read, { version: 2 });
});

test('independent keys can write and read while another key is blocked', async () => {
  const h = harness();
  const blocked = h.api('learning', 'POST', { slow: true });
  const other = h.api('workspace', 'POST', { name: 'Room A' });
  await checkpoint();
  assert.equal(h.requests.length, 2, 'different keys must dispatch in parallel');
  const workspaceWrite = h.requests.find(r => r.key === 'workspace');
  workspaceWrite.succeed();
  await other;
  const read = h.api('/api/state/workspace');
  await checkpoint();
  assert.equal(h.requests.length, 3, 'an unrelated write cannot block this read');
  assert.equal(h.requests[2].options.method, 'GET');
  h.requests[2].succeed();
  assert.deepEqual(await read, { name: 'Room A' });
  h.requests.find(r => r.key === 'learning').succeed();
  await blocked;
});

test('network rejection propagates but does not poison the next queued write', async () => {
  const h = harness();
  const failure = new Error('connection interrupted');
  const failed = observe(h.api('twin', 'POST', { version: 1 }));
  const recovered = h.api('/api/state/twin', 'POST', { version: 2 });
  await checkpoint();
  assert.equal(h.requests.length, 1);
  h.requests[0].fail(failure);
  const result = await failed;
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, failure, 'caller must receive the failed save');
  await checkpoint();
  assert.equal(h.requests.length, 2, 'later writes must continue after rejection');
  h.requests[1].succeed();
  assert.deepEqual(await recovered, { version: 2 });
  const read = h.api('twin');
  await checkpoint();
  assert.equal(h.requests.length, 3);
  h.requests[2].succeed();
  assert.deepEqual(await read, { version: 2 });
});

test('HTTP and response-JSON failures reach the caller and release the queue', async () => {
  for (const kind of ['HTTP', 'JSON']) {
    const h = harness();
    const failure = new Error('invalid response JSON');
    const failed = observe(h.api('knowledge_workspace', 'POST', { version: 1 }));
    const next = h.api('knowledge_workspace', 'POST', { version: 2 });
    await checkpoint();
    assert.equal(h.requests.length, 1);
    h.requests[0].respond(kind === 'HTTP'
      ? { ok: false, json() { assert.fail('failed HTTP response must not be parsed'); } }
      : { ok: true, json: async () => { throw failure; } });
    const result = await failed;
    assert.equal(result.status, 'rejected', `${kind} failure must not be swallowed`);
    if (kind === 'HTTP') assert.match(result.reason.message, /保存失败/);
    else assert.equal(result.reason, failure);
    await checkpoint();
    assert.equal(h.requests.length, 2, `${kind} failure must release the next write`);
    h.requests[1].succeed();
    await next;
  }
});

test('a failed write does not permanently prevent subsequent reads', async () => {
  const h = harness();
  h.remote.set('results', [{ score: 88 }]);
  const failed = observe(h.api('results', 'POST', [{ score: 99 }]));
  await checkpoint();
  h.requests[0].fail(new Error('offline'));
  assert.equal((await failed).status, 'rejected');
  const read = h.api('/api/state/results');
  await checkpoint();
  assert.equal(h.requests.length, 2);
  h.requests[1].succeed();
  assert.deepEqual(await read, [{ score: 88 }]);
});

test('file and hosted-local modes retain localStorage keys and JSON behavior', async () => {
  for (const config of [{ protocol: 'file:' }, { protocol: 'https:', local: true }]) {
    const h = harness(config);
    assert.equal(await h.api('learning'), null);
    const data = { nested: { note: 'saved' }, values: [1, 2] };
    assert.deepEqual(clone(await h.api('/api/state/learning', 'POST', data)), data);
    assert.equal(h.storage.get('iot_learning'), JSON.stringify(data));
    data.nested.note = 'mutated';
    const read = await h.api('learning');
    assert.deepEqual(clone(read), { nested: { note: 'saved' }, values: [1, 2] });
    read.nested.note = 'also mutated';
    assert.equal((await h.api('/api/state/learning')).nested.note, 'saved');
    const one = h.api('learning', 'POST', { version: 1 });
    const two = h.api('/api/state/learning', 'POST', { version: 2 });
    await Promise.all([one, two]);
    assert.deepEqual(clone(await h.api('learning')), { version: 2 });
    assert.equal(h.requests.length, 0, 'local mode must never fetch state');
  }
});

test('localStorage failure propagates and a later retry can save', async () => {
  for (const config of [{ protocol: 'file:' }, { protocol: 'https:', local: true }]) {
    const h = harness(config);
    await h.api('workspace', 'POST', { name: 'Original' });
    const quota = new Error('storage quota exceeded');
    h.failStorage(quota);
    const failed = await observe(h.api('workspace', 'POST', { name: 'Unsaved' }));
    assert.equal(failed.status, 'rejected');
    assert.equal(failed.reason, quota);
    assert.deepEqual(JSON.parse(h.storage.get('iot_workspace')), { name: 'Original' });
    h.failStorage(null);
    await h.api('/api/state/workspace', 'POST', { name: 'Retried' });
    assert.deepEqual(clone(await h.api('workspace')), { name: 'Retried' });
    assert.equal(h.requests.length, 0);
  }
});

test('Knowledge keeps newer edits dirty when an older save finishes and flushes them on stop', async () => {
  const knowledge = fs.readFileSync(path.join(__dirname, 'static', 'knowledge.js'), 'utf8');
  function extract(startMarker, endMarker) {
    const start = knowledge.indexOf(startMarker);
    const end = knowledge.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `Knowledge fixture markers exist: ${startMarker}`);
    return knowledge.slice(start, end);
  }
  // Use the exact production save/changed/stop bodies. UI-only dependencies are
  // small stubs; the save itself uses the real gated api from the other tests.
  const persistence = extract('async function save(show)', 'function metrics()');
  const stop = extract('stopActive=async()=>', 'metrics();view();');
  const h = harness(), timers = new Map();
  let nextTimer = 0;
  const context = {
    state: { datasetName: 'First edit', rows: [], triples: [], config: {} },
    api: h.api,
    metrics() {}, toast() {}, find() { return null; }, readConfig() { return true; },
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.createContext(context);
  vm.runInContext(`
    const KEY='knowledge_workspace';
    let saveTimer=null, changeVersion=0, dirty=false, active=true, stopActive=null, tab='data';
    ${persistence}
    ${stop}
    globalThis.fixture={save,changed,stop:()=>stopActive(),status:()=>({dirty,active,changeVersion})};
  `, context, { filename: 'static/knowledge.js:persistence-fixture' });
  const k = context.fixture;
  k.changed();
  const first = k.save(false);
  await checkpoint();
  assert.equal(h.requests.length, 1);
  assert.equal(JSON.parse(h.requests[0].options.body).datasetName, 'First edit');
  context.state.datasetName = 'Newest edit';
  k.changed();
  assert.equal(timers.size, 1, 'new edit has a pending autosave');
  h.requests[0].succeed();
  await first;
  assert.equal(k.status().dirty, true, 'old response cannot mark a newer edit clean');
  assert.equal(k.status().active, true);
  const leaving = k.stop();
  assert.equal(timers.size, 0, 'stop cancels the debounce and flushes immediately');
  await checkpoint();
  assert.equal(h.requests.length, 2, 'stop must save the newer dirty state');
  assert.equal(JSON.parse(h.requests[1].options.body).datasetName, 'Newest edit');
  assert.equal(k.status().dirty, true, 'newest edit stays dirty until its save succeeds');
  h.requests[1].succeed();
  await leaving;
  assert.equal(h.remote.get('knowledge_workspace').datasetName, 'Newest edit');
  assert.equal(k.status().dirty, false);
  assert.equal(k.status().active, false);
});

let suiteFinished = false;
process.once('beforeExit', () => {
  if (!suiteFinished) {
    console.error('FAIL: persistence suite stalled on an unresolved promise');
    process.exitCode = 1;
  }
});

(async () => {
  let passed = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      passed++;
      console.log(`PASS: ${name}`);
    } catch (error) {
      console.error(`FAIL: ${name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }
  console.log(`${passed}/${tests.length} persistence regression tests passed (real api, gated fetch, mocked localStorage).`);
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { suiteFinished = true; });
