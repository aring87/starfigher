#!/usr/bin/env node
'use strict';

// Dependency-free controller tests. The DOM below preserves a small real tree
// so delegated card selections, cleanup, and dynamically replaced UI are tested.
// No browser, player profile, or storage is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const trainingSource = fs.readFileSync(path.join(__dirname, '..', 'training.js'), 'utf8');
const lessonIds = ['move', 'fire', 'force', 'mount', 'spectrum', 'support', 'delta', 'cores', 'salvage', 'synergy', 'progression'];
const introLessonIds = ['move', 'fire', 'force', 'mount', 'cores'];

function walk(node) {
  return [node, ...node.children.flatMap(walk)];
}

class MockElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.id = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this._text = '';
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  appendChild(node) {
    node.remove();
    node.parentElement = this;
    this.children.push(node);
    return node;
  }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  prepend(node) {
    node.remove();
    node.parentElement = this;
    this.children.unshift(node);
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter(node => node !== this);
    this.parentElement = null;
  }
  replaceChildren(...nodes) {
    this.children.forEach(node => { node.parentElement = null; });
    this.children = [];
    this._text = '';
    this.append(...nodes);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatchEvent(event) {
    event.target ||= this;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    event.stopPropagation ||= () => {};
    for (const callback of this.listeners.get(event.type) || []) callback(event);
    return !event.defaultPrevented;
  }
  click() { if (!this.disabled) this.dispatchEvent({type: 'click'}); }
  change() { this.dispatchEvent({type: 'change'}); }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  querySelectorAll(selector) {
    return walk(this).slice(1).filter(node => selector.startsWith('.')
      ? node.className.split(/\s+/).includes(selector.slice(1))
      : selector.startsWith('#') ? node.id === selector.slice(1)
      : node.tagName === selector.toUpperCase());
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function createHarness(options={}) {
  const document = {
    activeElement: null,
    createElement(tagName) { return new MockElement(tagName, document); },
    getElementById(id) { return [...walk(document.head), ...walk(document.body)].find(node => node.id === id) || null; },
  };
  document.head = new MockElement('head', document);
  document.body = new MockElement('body', document);
  const root = new MockElement('main', document);
  root.id = 'game-shell';
  document.body.appendChild(root);
  const sandbox = {document, window: {}};
  // Fail immediately if the UI controller ever tries to touch persistent saves.
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(sandbox, name, {get() { throw new Error(`Unexpected ${name} access`); }});
    Object.defineProperty(sandbox.window, name, {get() { throw new Error(`Unexpected window.${name} access`); }});
  }
  vm.runInNewContext(trainingSource, sandbox, {filename: 'training.js'});
  let paused = false, practiceAllowed=true;
  const calls = {began: 0, scenes: [], finishes: []};
  const api = sandbox.window.StarfighterTraining.create({
    root,
    begin() { calls.began++;return options.beginResult; },
    setupLesson(id) { calls.scenes.push(id); },
    finish(result) { calls.finishes.push(result); },
    isPaused: () => paused,
    isPractice: () => practiceAllowed,
    pauseToggle() { paused = !paused; },
  });
  const nodes = () => walk(root);
  const button = text => {
    const found = nodes().find(node => node.tagName === 'BUTTON' && node.textContent === text);
    assert.ok(found, `Expected button: ${text}`);
    return found;
  };
  const next = () => {
    const found = nodes().find(node => node.tagName === 'BUTTON' && node.className === 'sf-primary');
    assert.ok(found, 'Continue or graduate button must exist');
    return found;
  };
  const goals = () => root.querySelector('.sf-training-goals').children.map(node => node.dataset.done === 'true');
  const card = name => {
    const found = nodes().find(node => node.tagName === 'BUTTON' && node.children.some(child => child.tagName === 'B' && child.textContent === name));
    assert.ok(found, `Expected workshop card: ${name}`);
    return found;
  };
  function select(id) {
    const select = root.querySelector('select');
    assert.ok(select, 'Lesson replay selector exists');
    const route=api.course==='intro'?introLessonIds:lessonIds;
    assert.ok(route.includes(id),`${id} must belong to the current course`);
    select.value = String(route.indexOf(id));
    select.change();
    assert.equal(api.lessonId, id);
  }
  const waiting = () => assert.equal(next().disabled, true, `${api.lessonId} must wait for its evidence`);
  const ready = () => assert.equal(next().disabled, false, `${api.lessonId} must unlock after its evidence`);
  return {api, root, document, calls, button, next, goals, card, select, waiting, ready,
    setPractice(value){practiceAllowed=value},
    get paused() { return paused; },
    get exports() { return sandbox.window.StarfighterTraining; },
  };
}

function completeLesson(h, id) {
  const {api} = h;
  switch (id) {
    case 'move':
      api.tick(1 / 60, {x: 100, y: 100});
      api.tick(1 / 60, {x: 130, y: 100});
      api.tick(1 / 60, {x: 160, y: 100});
      h.waiting();
      api.tick(1 / 60, {x: 190, y: 100, precision: true});
      break;
    case 'fire':
      api.note('shot', {charge: 0});
      api.note('shot', {charge: 0.69});
      h.waiting();
      api.note('shot', {charge: 0.7});
      break;
    case 'force':
      api.note('pickup', {type: 'crystal', color: 'yellow'});
      h.waiting();
      api.note('pickup', {type: 'crystal', color: 'red'});
      break;
    case 'mount':
      if(api.course==='intro'){
        api.note('podBlock');assert.deepEqual(h.goals(),[false,false,false],'A docked block must not bypass deployment');
        api.tick(1/60,{podMode:'deployed',dockSide:'front'});api.note('podBlock');assert.deepEqual(h.goals(),[true,true,false]);
        api.tick(1/60,{podMode:'docked',dockSide:'rear'});h.waiting();
        api.tick(1/60,{podMode:'returning',dockSide:'front'});h.waiting();
        api.tick(1/60,{pod:{mode:'docked',dockSide:'front'}});break;
      }
      api.note('podBlock');
      assert.deepEqual(h.goals(), [false, false, false, false], 'A pre-deployment block is not enough');
      api.tick(1 / 60, {podMode: 'deployed', dockSide: 'front'});
      api.note('podBlock');
      api.tick(1 / 60, {podMode: 'docked', dockSide: 'rear'});
      h.waiting();
      api.tick(1 / 60, {pod: {mode: 'docked', dockSide: 'front'}});
      break;
    case 'spectrum':
      api.note('shot', {charge: 0, color: 'blue'});
      api.note('shot', {charge: 0, color: 'yellow'});
      assert.deepEqual(h.goals(), [false, false, false, false], 'Shots before collecting their crystal do not count');
      api.note('pickup', {type: 'crystal', color: 'red'});
      h.waiting();
      api.note('pickup', {type: 'crystal', color: 'blue'});
      assert.deepEqual(h.goals(), [true, false, false, false], 'Collecting blue alone does not demonstrate its pattern');
      api.note('shot', {charge: 0, color: 'red'});
      assert.deepEqual(h.goals(), [true, false, false, false], 'The shot must use the collected blue pattern');
      api.note('shot', {charge: 0, color: 'blue'});
      assert.deepEqual(h.goals(), [true, true, false, false]);
      h.waiting();
      api.note('pickup', {type: 'crystal', color: 'yellow'});
      api.note('shot', {charge: 0, color: 'blue'});
      assert.deepEqual(h.goals(), [true, true, true, false], 'Collecting yellow and firing another color cannot finish');
      h.waiting();
      api.note('shot', {charge: 0, color: 'yellow'});
      break;
    case 'support':
      api.note('shot', {charge: 0});
      api.note('bitBlock');
      api.note('shieldHit');
      assert.deepEqual(h.goals(), [false, false, false, false, false]);
      api.note('pickup', {type: 'missile'});
      api.note('pickup', {type: 'bit'});
      api.note('pickup', {type: 'shield'});
      api.note('bitBlock');
      api.note('shieldHit');
      h.waiting();
      api.note('shot', {charge: 0});
      break;
    case 'delta':
      api.tick(1 / 60, {dose: 99.9});
      h.waiting();
      api.tick(1 / 60, {dose: 100});
      assert.deepEqual(h.goals(), [true, false]);
      h.waiting();
      api.note('delta');
      break;
    case 'cores':
      api.note('armorHit');
      h.waiting();
      api.note('weakHit');
      break;
    case 'salvage':
      api.note('pickup', {type: 'shield'});
      h.waiting();
      api.note('gear');
      break;
    case 'synergy':
      h.card('CORE BORER').click();
      h.card('CAPACITOR PLATING').click();
      h.waiting();
      assert.match(h.root.querySelector('.sf-training-feedback').textContent, /does not activate/);
      h.card('SIEGE COIL').click();
      assert.equal(h.card('CORE BORER').getAttribute('aria-pressed'), 'false');
      assert.equal(h.card('SIEGE COIL').getAttribute('aria-pressed'), 'true');
      assert.equal(h.root.querySelector('.sf-training-combo').dataset.active, 'true');
      break;
    case 'progression':
      assert.match(h.root.textContent,/three active run perks/);
      assert.match(h.root.textContent,/Recovery services apply once/);
      assert.doesNotMatch(h.root.textContent,/Field Module|Doctrine/);
      h.button('RUN PERK').click();
      h.waiting();
      assert.equal(h.root.querySelector('.sf-training-reward-log').children.length, 0);
      h.button('GARAGE').click();
      h.waiting();
      h.button('RECOVERY SERVICE').click();
      h.waiting();
      h.button('RUN PERK').click();
      assert.equal(h.root.querySelector('.sf-training-reward-log').children.length, 3);
      break;
    default: throw new Error(`Unknown lesson ${id}`);
  }
  h.ready();
}

if (require.main === module) {
  let passed = 0;
  const failures = [];
  function test(name, fn) {
    if (process.env.STARFIGHTER_TEST_FILTER && !name.includes(process.env.STARFIGHTER_TEST_FILTER)) return;
    try { fn(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failures.push({name, error}); console.error(`FAIL ${name}: ${error.stack}`); }
  }

  test('first-flight offer invokes each callback exactly once after cleanup', () => {
    const h = createHarness();
    let trained = 0, skipped = 0;
    h.api.offer({onTrain() { trained++; assert.equal(h.api.active, false); assert.equal(h.root.children.length, 0); }});
    assert.equal(h.api.active, true);
    assert.equal(h.api.lessonId, null);
    h.button('ENTER FLIGHT SCHOOL').click();
    assert.equal(trained, 1);
    h.api.offer({onSkip() { skipped++; assert.equal(h.api.active, false); assert.equal(h.root.children.length, 0); }});
    h.button('SKIP TO STORY').click();
    assert.equal(skipped, 1);
    assert.equal(h.calls.began, 0);
    assert.equal(h.calls.finishes.length, 0);
  });

  test('a refused practice start never mounts lesson instructions or the Flight School marker',()=>{
    const h=createHarness({beginResult:false});h.api.start();assert.equal(h.api.active,false);assert.equal(h.api.lessonId,null);assert.equal(h.root.children.length,0);assert.equal(h.calls.scenes.length,0);
  });

  test('leaving practice removes lesson instructions before any menu or briefing can use them',()=>{
    const h=createHarness();h.api.start();assert.ok(h.root.querySelector('.sf-training-panel'));h.setPractice(false);h.api.tick(0,{});assert.equal(h.api.active,false);assert.equal(h.api.lessonId,null);assert.equal(h.root.children.length,0);assert.equal(h.calls.finishes.length,0);
  });

  for (const id of lessonIds) test(`${id}: real evidence unlocks explicit Continue`, () => {
    const h = createHarness();
    h.api.start();
    h.select(id);
    const panel = h.root.querySelector('.sf-training-panel');
    const body = h.root.querySelector('.sf-training-body');
    assert.equal(body.parentElement, panel, 'Lesson instructions have their own scrolling body');
    assert.equal(h.root.querySelector('.sf-training-goals').parentElement, body);
    assert.equal(h.root.querySelector('.sf-training-footer').parentElement, panel, 'Essential actions stay outside the scroll body');
    assert.equal(h.root.querySelector('.sf-training-feedback').parentElement,h.root.querySelector('.sf-training-footer'),'Objective and synergy feedback stays visible beside the actions');
    assert.equal(h.root.querySelector('select').parentElement, panel, 'Replay stays outside the scroll body');
    h.waiting();
    h.next().click();
    assert.equal(h.api.lessonId, id, 'A disabled Continue must not advance');
    completeLesson(h, id);
    h.api.tick(60, {x: 900, y: 400, dose: 100});
    assert.equal(h.api.lessonId, id, 'Completion and elapsed time must not auto-advance');
    assert.equal(h.calls.finishes.length, 0);
    h.next().click();
    if (id === 'progression') {
      assert.equal(h.api.active, false);
      assert.equal(h.calls.finishes.length, 1);
      assert.equal(h.calls.finishes[0].completed, false,'Replaying one final lesson does not demonstrate the entire course');
    } else assert.equal(h.api.lessonId, lessonIds[lessonIds.indexOf(id) + 1]);
  });

  test('all 11 lessons progress in order and graduate with the Story return flag', () => {
    const h = createHarness();
    assert.equal(Array.from(h.exports.lessonIds).join(','), lessonIds.join(','));
    h.api.start({continueStory: true});
    for (const id of lessonIds) {
      assert.equal(h.api.lessonId, id);
      completeLesson(h, id);
      h.next().click();
    }
    assert.equal(h.calls.began, 1);
    assert.equal(h.calls.scenes.join(','), lessonIds.join(','));
    assert.equal(h.calls.finishes.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls.finishes[0])), {completed: true, continueStory: true, skippedLessons: 0});
    assert.equal(h.api.active, false);
    assert.equal(h.api.lessonId, null);
    assert.equal(h.root.children.length, 0);
  });

  test('First Flight introduces exactly five essentials and graduates from demonstrated practice',()=>{
    const h=createHarness();assert.deepEqual(Array.from(h.exports.introLessonIds),introLessonIds);assert.ok(Object.isFrozen(h.exports.introLessonIds));assert.deepEqual(Array.from(h.exports.lessonIds),lessonIds);
    h.api.start({course:'intro',continueStory:true});assert.equal(h.api.course,'intro');assert.match(h.root.querySelector('.sf-training-brand').textContent,/FIRST FLIGHT/);
    for(let index=0;index<introLessonIds.length;index++){
      const id=introLessonIds[index];assert.equal(h.api.lessonId,id);assert.match(h.root.querySelector('.sf-training-step').textContent,new RegExp(`LESSON ${index+1} / 5`));
      assert.doesNotMatch(h.root.textContent,/gear|doctrine|rarity|synerg|asterprint|missile|\bbits?\b|\brear\b|\bV\b/i,'First Flight must not introduce advanced systems');
      assert.equal(h.root.querySelector('select').children.length,6,'Replay exposes only the five-course route plus its placeholder');h.waiting();h.next().click();assert.equal(h.api.lessonId,id);
      completeLesson(h,id);assert.equal(Number.parseFloat(h.root.querySelector('.sf-training-progress').querySelector('i').style.width),(index+1)*20);
      if(index===4){assert.equal(h.next().textContent,'CONTINUE TO GARAGE');assert.match(h.root.querySelector('.sf-training-kicker').textContent,/^05 \/ BOSS ARMOR$/);}
      h.next().click();
    }
    assert.equal(h.calls.scenes.join(','),introLessonIds.join(','));assert.deepEqual(JSON.parse(JSON.stringify(h.calls.finishes[0])),{completed:true,continueStory:true,skippedLessons:0});assert.equal(h.root.children.length,0);assert.equal(h.api.lessonId,null);
  });

  test('intro mount requires deployment, a deployed interception, and a real front recall',()=>{
    const h=createHarness();h.api.start({course:'intro'});h.select('mount');assert.equal(h.goals().length,3);assert.doesNotMatch(h.root.textContent,/\bV\b|\brear\b/i);
    h.api.tick(0,{podMode:'docked',dockSide:'front'});h.api.note('podBlock');assert.deepEqual(h.goals(),[false,false,false]);
    h.api.tick(0,{podMode:'deployed',dockSide:'front'});h.api.tick(0,{podMode:'docked',dockSide:'front'});h.api.note('podBlock');assert.deepEqual(h.goals(),[true,false,false],'Recalling first and blocking at the front does not demonstrate a deployed interception');
    h.api.tick(0,{podMode:'deployed',dockSide:'front'});h.api.note('podBlock');h.waiting();h.button('PAUSE').click();h.api.tick(0,{podMode:'docked',dockSide:'front'});h.waiting();h.button('RESUME').click();h.api.tick(0,{podMode:'docked',dockSide:'front'});h.ready();
    h.button('RETRY').click();assert.deepEqual(h.goals(),[false,false,false]);h.api.note('podBlock');assert.deepEqual(h.goals(),[false,false,false]);completeLesson(h,'mount');h.next().click();assert.equal(h.api.lessonId,'cores');
  });

  test('skips and replay jumps cannot award course completion',()=>{
    for(const course of['intro','full']){
      const h=createHarness(),route=course==='intro'?introLessonIds:lessonIds;h.api.start({course,continueStory:true});
      for(let index=0;index<route.length-1;index++)h.button('SKIP LESSON').click();assert.equal(h.api.lessonId,route.at(-1));completeLesson(h,route.at(-1));h.next().click();
      assert.equal(h.calls.finishes[0].completed,false);assert.equal(h.calls.finishes[0].skippedLessons,route.length-1);
      h.api.start({course});h.select(route.at(-1));completeLesson(h,route.at(-1));h.next().click();assert.equal(h.calls.finishes[1].completed,false,'The final objective alone cannot graduate a route');
    }
  });

  test('intro replay is route-local and demonstrated replays can recover a skipped lesson',()=>{
    const h=createHarness();h.api.start({course:'intro'});h.button('SKIP LESSON').click();assert.equal(h.api.lessonId,'fire');
    const replay=h.root.querySelector('select');for(const value of['7','5','-1','NaN','progression']){replay.value=value;replay.change();assert.equal(h.api.lessonId,'fire','An invalid route index must not jump into advanced lessons');}
    h.select('move');completeLesson(h,'move');h.next().click();for(const id of introLessonIds.slice(1)){assert.equal(h.api.lessonId,id);completeLesson(h,id);h.next().click();}
    assert.equal(h.calls.finishes[0].completed,true,'Every route objective has now been demonstrated');assert.equal(h.calls.finishes[0].skippedLessons,1);
  });

  test('course restarts clear evidence and keep the full eleven-lesson school available',()=>{
    const h=createHarness();h.api.start({course:'intro',continueStory:true});completeLesson(h,'move');assert.equal(h.root.querySelector('.sf-training-progress').querySelector('i').style.width,'20%');
    h.api.start({course:'full'});assert.equal(h.api.course,'full');assert.equal(h.api.lessonId,'move');assert.equal(h.root.querySelector('.sf-training-progress').querySelector('i').style.width,'0%');assert.equal(h.root.querySelector('select').children.length,12);assert.match(h.root.querySelector('.sf-training-brand').textContent,/FLIGHT SCHOOL/);
    h.select('mount');assert.equal(h.goals().length,4);assert.match(h.root.textContent,/V FRONT \/ REAR/);completeLesson(h,'mount');
    h.api.start({course:'intro'});assert.equal(h.api.lessonId,'move');assert.deepEqual(h.goals(),[false,false]);h.select('cores');completeLesson(h,'cores');h.next().click();assert.deepEqual(JSON.parse(JSON.stringify(h.calls.finishes[0])),{completed:false,continueStory:false,skippedLessons:0});
    h.api.start({course:'unsupported'});assert.equal(h.api.course,'full');assert.equal(h.root.querySelector('select').children.length,12);h.api.close();assert.equal(h.root.children.length,0);
  });

  test('First Flight offer uses concise copy and cleans up before course callbacks',()=>{
    const h=createHarness();let trained=0,skipped=0;h.api.offer({course:'intro',onTrain(){trained++;assert.equal(h.api.active,false);assert.equal(h.root.children.length,0);h.api.start({course:'intro',continueStory:true});}});
    assert.equal(h.root.querySelector('.sf-training').getAttribute('aria-label'),'First Flight choice');assert.doesNotMatch(h.root.textContent,/gear|doctrine|rarity|synerg|asterprint|garage/i);h.button('PLAY FIRST FLIGHT').click();assert.equal(trained,1);assert.equal(h.api.lessonId,'move');assert.equal(h.api.course,'intro');
    h.api.offer({course:'intro',onSkip(){skipped++;assert.equal(h.api.active,false);assert.equal(h.root.children.length,0);}});h.button('SKIP TO STORY').click();assert.equal(skipped,1);assert.equal(h.calls.finishes.length,0);
    h.api.start({course:'intro'});h.setPractice(false);h.api.tick(0,{});assert.equal(h.api.active,false);assert.equal(h.root.children.length,0);assert.equal(h.calls.finishes.length,0);
  });

  test('pause blocks gameplay evidence, card choices, and Continue until resumed', () => {
    const h = createHarness();
    h.api.start();
    h.select('fire');
    h.button('PAUSE').click();
    assert.equal(h.paused, true);
    assert.equal(h.root.querySelector('.sf-training-paused').hidden, false);
    h.api.note('shot', {charge: 0});
    h.api.note('shot', {charge: 1});
    assert.deepEqual(h.goals(), [false, false]);
    h.button('RESUME').click();
    completeLesson(h, 'fire');
    h.button('PAUSE').click();
    h.waiting();
    h.next().click();
    assert.equal(h.api.lessonId, 'fire');
    h.button('RESUME').click();
    h.ready();
    h.select('synergy');
    h.api.tick(0, {paused: true});
    h.card('SIEGE COIL').click();
    h.card('CAPACITOR PLATING').click();
    h.waiting();
    h.api.tick(0, {paused: false});
    h.card('SIEGE COIL').click();
    h.card('CAPACITOR PLATING').click();
    h.ready();
  });

  test('retry resets lesson evidence; skip and exit report a partial school', () => {
    const h = createHarness();
    h.api.start();
    h.api.tick(1 / 60, {x: 100, y: 100});
    h.api.tick(1 / 60, {x: 130, y: 100, focus: true});
    h.button('RETRY').click();
    assert.equal(h.api.lessonId, 'move');
    h.api.retry();assert.equal(h.api.lessonId,'move');
    assert.deepEqual(h.goals(), [false, false]);
    h.api.tick(1 / 60, {x: 400, y: 100, focus: true});
    assert.deepEqual(h.goals(), [false, false], 'Retry must reset the previous position sample');
    h.button('SKIP LESSON').click();
    assert.equal(h.api.lessonId, 'fire');
    h.button('EXIT SCHOOL').click();
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls.finishes[0])), {completed: false, continueStory: false, skippedLessons: 1});
    assert.equal(h.root.children.length, 0);
  });

  test('replay changes scenes; close is silent; styles inject once per document', () => {
    const h = createHarness();
    h.api.start();
    h.select('synergy');
    h.card('SIEGE COIL').click();
    h.select('fire');
    assert.equal(h.calls.scenes.join(','), 'move,synergy,fire');
    h.api.close();
    h.api.note('shot', {charge: 1});
    h.api.tick(1, {x: 300, y: 200});
    assert.equal(h.api.active, false);
    assert.equal(h.api.lessonId, null);
    assert.equal(h.calls.finishes.length, 0);
    assert.equal(h.root.children.length, 0);
    h.api.start();
    h.api.close();
    h.exports.create({root: h.root});
    assert.equal(walk(h.document.head).filter(node => node.id === 'starfighter-training-style').length, 1);
  });

  test('skipping the final lesson exits without a completion award', () => {
    const h = createHarness();
    h.api.start();
    h.select('progression');
    h.button('SKIP LESSON').click();
    assert.equal(h.api.active, false);
    assert.equal(h.calls.finishes[0].completed, false);
    assert.equal(h.calls.finishes[0].skippedLessons, 1);
  });

  console.log(`\n${passed} controller checks passed; ${failures.length} failed.`);
  if (failures.length) process.exitCode = 1;
}

module.exports = {createHarness, completeLesson, lessonIds, introLessonIds};
