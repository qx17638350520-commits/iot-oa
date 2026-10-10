/* Dependency-free logic and mocked-DOM lifecycle tests.
 * These checks do not constitute browser layout or visual verification.
 * Run: node test_learning.cjs
 */
'use strict';
const assert = require('node:assert/strict');
global.window = {};
require('./dist/static/learning.js');
const { Learning: L, Experiments: E } = window;
let assertions = 0;
function check(...args) { assert.equal(...args); assertions++; }

check(L.courses.length, 6);
check(L.courses.flatMap(c => c.lessons).length, 18);
check(E.tasks.length, 6);
check(L.catalog.length, 6);
check(E.catalog.length, 6);
for (const c of L.courses) {
  check(c.lessons.length, 3);
  for (const l of c.lessons) {
    check(l.sections.length, 2);
    check(l.quiz.answer >= 0 && l.quiz.answer < l.quiz.options.length, true);
    check(l.example.length > 20, true);
    check(l.task.length > 20, true);
    check(L.helpers.lessonComplete(l, { read: true, note: '实践记录足够长'.repeat(5), quizChecked: true, answer: l.quiz.answer, completedAt: new Date().toISOString() }), true);
    check(L.helpers.lessonComplete(l, { read: true, note: '短', quizChecked: true, answer: l.quiz.answer, completedAt: new Date().toISOString() }), false);
    check(L.helpers.lessonComplete(l, { read: true, note: '实践记录足够长'.repeat(5), quizChecked: true, answer: (l.quiz.answer + 1) % l.quiz.options.length, completedAt: new Date().toISOString() }), false);
  }
}
for (const e of E.tasks) {
  const r = { steps: e.steps.map(() => true), observations: '观察记录'.repeat(15), evidence: '依据记录'.repeat(10), reflection: '分析记录'.repeat(10), answers: e.quiz.map(q => q.answer), quizChecked: true, submittedAt: new Date().toISOString() };
  check(E.helpers.validateReport(e, r).length, 0);
  check(E.helpers.reportStatus(e, r), '已提交');
  check(E.helpers.gradeQuiz(e.quiz, r.answers).score, 100);
  check(E.helpers.validateReport(e, { ...r, quizChecked: false }).length, 1);
  check(E.helpers.validateReport(e, { ...r, steps: [true] }).length, 1);
  check(E.helpers.reportStatus(e, { ...r, observations: '' }), '进行中');
  check(E.helpers.reportStatus(e, null), '未开始');
}
for (const [filter, topic, matches, valid = true] of [
  ['factory/+/temperature', 'factory/a/temperature', true],
  ['factory/+/temperature', 'factory/a/b/temperature', false],
  ['a/#', 'a', true],
  ['a/#', 'a/b/c', true],
  ['+', '', false, false],
  ['#', '$SYS/test', false],
  ['$SYS/#', '$SYS/test', true],
  ['a/#/b', 'a/x/b', false, false],
  ['a+', 'a', false, false],
  ['a/+', 'a/', true],
  ['a', 'a/+', false, false],
  ['a/b', 'a/b', true],
  ['a/b', 'a/B', false]
]) {
  const r = E.helpers.topicMatches(filter, topic);
  check(r.valid, valid);
  check(r.matches, matches);
}
const normalized = L.helpers.normalizeState({ lessons: { 'architecture-1': { note: { danger: 1 }, read: 'yes', answer: 99, quizChecked: true, attempts: -5, completedAt: 'bad', openedAt: 'bad' }, unknown: { read: true } }, bookmarks: ['architecture', 'architecture', 'nope'], lastLesson: 'unknown' });
check(normalized.lessons['architecture-1'].note, '');
check(normalized.lessons['architecture-1'].answer, null);
check(normalized.lessons['architecture-1'].completedAt, null);
check(Object.keys(normalized.lessons).length, 1);
check(normalized.bookmarks.length, 1);
check(normalized.lastLesson, null);
const normalizedExperiments = E.helpers.normalizeState({ reports: { 'env-twin': { steps: 'x', observations: 42, answers: [999], quizChecked: true, submittedAt: new Date().toISOString() }, evil: {} } });
check(Object.keys(normalizedExperiments.reports).length, 1);
check(normalizedExperiments.reports['env-twin'].observations, '');
check(normalizedExperiments.reports['env-twin'].submittedAt, null);
check(normalizedExperiments.reports['env-twin'].answers[0], null);
check(L.helpers.normalizeState(null).version, 1);
check(E.helpers.normalizeState([]).version, 1);
check(L.helpers.percentage(1, 0), 0);
console.log(`PASS: ${assertions} learning, experiment, topic matching, content integrity, and restore-normalization assertions.`);

// Minimal DOM double: tests event and save lifecycles, not HTML parsing or layout.
class Element {
  constructor() {
    this.innerHTML = '';
    this.isConnected = true;
    this.handlers = {};
    this.nodes = new Map();
    this.dataset = {};
    this.classList = { toggle() {} };
  }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
    return this.nodes.get(selector);
  }
  appendChild(child) { this.child = child; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  contains() { return true; }
  scrollIntoView() {}
  focus() {}
}
global.document = { getElementById() { return true; }, createElement() { return new Element(); }, head: new Element() };
global.toast = () => {};
global.navigate = () => {};
global.downloadJSON = () => {};
const database = new Map();
let writeCount = 0;
// A controllable write gate verifies that stop actually waits, without timing assumptions.
let nextWriteGate = null;
global.api = async (key, method = 'GET', data) => {
  if (method === 'GET') return database.has(key) ? JSON.parse(JSON.stringify(database.get(key))) : null;
  if (nextWriteGate) {
    const gate = nextWriteGate;
    nextWriteGate = null;
    await gate;
  }
  database.set(key, JSON.parse(JSON.stringify(data)));
  writeCount++;
  return data;
};
const click = (root, dataset) => root.handlers.click({ target: { closest() { return { dataset, disabled: false }; } } });
const input = (root, selector, value, dataset = {}) => root.handlers.input({ target: { value, dataset, matches(s) { return s === selector; } } });

(async () => {
  const host = new Element();
  await L.render(host);
  const root = host.child;
  await click(root, { action: 'open-course', course: 'architecture' });
  const note = '离开课程页面前输入的实践记录，需要完整保存而不能被尚未执行的防抖定时器丢弃。';
  input(root, '[data-lesson-note]', note);
  let releaseWrite;
  nextWriteGate = new Promise(resolve => { releaseWrite = resolve; });
  const stopping = L.stop();
  let stopped = false;
  stopping.then(() => { stopped = true; });
  await Promise.resolve();
  await Promise.resolve();
  check(stopped, false, 'stop waits for persistence');
  releaseWrite();
  await stopping;
  check(database.get('learning').lessons['architecture-1'].note, note, 'exit before debounce retains the note');

  const experiment = E.tasks[0];
  const report = { startedAt: new Date().toISOString(), steps: experiment.steps.map(() => true), observations: '观察记录'.repeat(15), evidence: '操作依据'.repeat(10), reflection: '分析反思'.repeat(10), answers: experiment.quiz.map(q => q.answer), quizChecked: true, submittedAt: new Date().toISOString(), revisions: 1 };
  database.set('experiments', { reports: { [experiment.id]: report } });
  const experimentHost = new Element();
  await E.render(experimentHost);
  await click(experimentHost.child, { action: 'open-lab', lab: experiment.id });
  await E.stop();
  check(database.get('experiments').reports[experiment.id].submittedAt, report.submittedAt, 'opening a submitted report preserves submission');

  await E.render(experimentHost);
  const reportRoot = experimentHost.child;
  await click(reportRoot, { action: 'open-lab', lab: experiment.id });
  input(reportRoot, '[data-report-field]', '修改后的观察记录'.repeat(8), { reportField: 'observations' });
  await E.stop();
  check(database.get('experiments').reports[experiment.id].submittedAt, null, 'editing requires resubmission');
  check(database.get('experiments').reports[experiment.id].previousSubmittedAt, report.submittedAt);
  check(database.get('experiments').reports[experiment.id].observations, '修改后的观察记录'.repeat(8));
  check(writeCount >= 3, true);
  console.log('PASS: mocked-DOM async lifecycle, exit-before-debounce flush, awaited persistence, read-only report reopening, edit invalidation, and saved note/report verification.');
  console.log(`PASS: ${assertions} total assertions. No browser/UI rendering verification is claimed.`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
