#!/usr/bin/env node
'use strict';
// Controls editor lifecycle with a small DOM/event model. Tab/Enter browser
// defaults are modeled only after production leaves the event unprevented.
// Real browser rendering/key defaults and physical pad feel remain separate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const relative=baseline?'artifacts/usability-v157-baseline-controls-ui.js':'controls-ui.js',source=fs.readFileSync(path.join(root,relative),'utf8'),B=require('../input-bindings.js');
const walk=node=>[node,...node.children.flatMap(walk)];
class Element{
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentElement=null;this.attributes=new Map();this.listeners=new Map();this.style={};this.dataset={};this.className='';this.hidden=false;this.disabled=false;this.open=false;this.id='';this.text='';this.tabIndex=-1;this.type='';this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ')},contains:name=>this.className.split(/\s+/).includes(name)};}
 get textContent(){return this.text+this.children.map(child=>child.textContent).join('')}
 set textContent(value){this.text=String(value);this.replaceChildren()}
 appendChild(child){child.remove();child.parentElement=this;this.children.push(child);return child}
 append(...children){children.forEach(child=>this.appendChild(child))}
 replaceChildren(...children){this.children.forEach(child=>child.parentElement=null);this.children=[];children.forEach(child=>this.appendChild(child))}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null}
 contains(child){return walk(this).includes(child)}
 setAttribute(name,value){this.attributes.set(name,String(value))}
 getAttribute(name){return this.attributes.get(name)??null}
 matches(selector){return selector.split(',').some(part=>{part=part.trim();if(part===':disabled')return this.disabled;if(part==='[tabindex]')return this.tabIndex>=0;if(part==='a[href]')return this.tagName==='A'&&this.attributes.has('href');if(part.startsWith('.'))return this.classList.contains(part.slice(1));return this.tagName===part.toUpperCase()})}
 closest(selector){for(let node=this;node;node=node.parentElement){if(selector.includes('[hidden]')&&node.hidden||selector.includes('[inert]')&&node.inert||selector.includes('[aria-hidden="true"]')&&node.getAttribute('aria-hidden')==='true'||selector.includes('[aria-disabled="true"]')&&node.getAttribute('aria-disabled')==='true')return node}return null}
 querySelectorAll(selector){return walk(this).slice(1).filter(node=>node.matches(selector))}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn)}
 dispatchEvent(event){event.target||=this;for(const listener of this.listeners.get(event.type)||[])listener(event);return !event.defaultPrevented}
 focus(){this.ownerDocument.activeElement=this}
 scrollIntoView(){}
 getClientRects(){return this.closest('[hidden]')?[]:[this.getBoundingClientRect()]}
 getBoundingClientRect(){return{left:0,top:0,right:100,bottom:32}}
 click(){if(this.disabled)return;this.onclick?.({preventDefault(){},stopPropagation(){}});this.dispatchEvent({type:'click'})}
 showModal(){this.open=true}
 close(){this.open=false;this.dispatchEvent({type:'close'})}
}
function boot(){
 const listeners=new Map(),doc={activeElement:null,createElement(tag){return new Element(tag,doc)},getElementById(id){return walk(doc.body).find(node=>node.id===id)||null},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)}};
 doc.body=new Element('body',doc);const host=new Element('dialog',doc);doc.body.append(host);
 const sandbox={window:{StarfighterBindings:B},document:doc,getComputedStyle:node=>({display:node.style.display||'block',visibility:'visible'})};vm.runInNewContext(source,sandbox,{filename:relative});
 let bindings=B.normalize(B.defaults),changes=0;const ui=sandbox.window.StarfighterControlsUI.create({host,getBindings:()=>bindings,onChange:next=>{bindings=B.normalize(next);changes++;return{saved:true}}});ui.open();
 function press(code,extra={}){
  const event={type:'keydown',code,target:doc.activeElement,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){this.stopped=true},...extra};
  for(const fn of listeners.get('keydown')||[]){fn(event);if(event.stopped)break}
  if(!event.defaultPrevented&&code==='Tab'){
   const buttons=walk(host).filter(node=>node.tagName==='BUTTON'&&!node.disabled&&!node.closest('[hidden]'));
   const at=buttons.indexOf(doc.activeElement),sign=extra.shiftKey?-1:1;buttons[(at+sign+buttons.length)%buttons.length]?.focus();
  }else if(!event.defaultPrevented&&code==='Enter'&&doc.activeElement?.tagName==='BUTTON')doc.activeElement.click();
  return event;
 }
 return{ui,doc,host,press,get bindings(){return bindings},get changes(){return changes},begin(device='keyboard'){if(device==='controller')doc.getElementById('controls-tab-controller').click();const origin=doc.getElementById(`binding-${device}-fire-0`);origin.click();return origin}};
}
const results=[];function check(name,run){try{const details=run();results.push({name,passed:true,details});console.log('PASS '+name)}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
check('Tab can reach Clear This Binding and Enter can clear an alternate binding',()=>{
 const h=boot();h.begin();assert.equal(h.doc.activeElement.textContent,'CANCEL');const tab=h.press('Tab');assert.equal(tab.defaultPrevented,false,'Capture must not swallow Tab navigation');assert.equal(h.doc.activeElement.textContent,'CLEAR THIS BINDING');assert.equal(h.ui.isCapturing(),true);const enter=h.press('Enter');assert.equal(enter.defaultPrevented,false,'Reserved Enter must retain button activation');assert.equal(h.ui.isCapturing(),false);assert.deepEqual(h.bindings.keyboard.fire,['Space','KeyX']);assert.equal(h.changes,1);assert.equal(h.host.open,true);return{modeledNativeDefaults:['Tab focus','Enter activation']};
});
check('Enter activates the initially focused Cancel for keyboard and controller capture',()=>{
 for(const device of['keyboard','controller']){const h=boot(),before=JSON.stringify(h.bindings);h.begin(device);const enter=h.press('Enter');assert.equal(enter.defaultPrevented,false);assert.equal(h.ui.isCapturing(),false);assert.equal(h.host.open,true);assert.equal(h.changes,0);assert.equal(JSON.stringify(h.bindings),before);assert.equal(h.doc.activeElement.id,`binding-${device}-fire-0`)}return{devices:2};
});
check('Escape still cancels capture and restores the originating row without closing Controls',()=>{
 const h=boot(),before=JSON.stringify(h.bindings);h.begin();const event=h.press('Escape');assert.equal(event.defaultPrevented,true);assert.equal(h.ui.isCapturing(),false);assert.equal(h.host.open,true);assert.equal(h.doc.activeElement.id,'binding-keyboard-fire-0');assert.equal(JSON.stringify(h.bindings),before);
});
check('Space and Shift remain valid gameplay assignments while the capture buttons have focus',()=>{
 for(const [code,extra]of[['Space',{}],['ShiftLeft',{shiftKey:true}]]){const h=boot();h.begin();const event=h.press(code,extra);assert.equal(event.defaultPrevented,true);assert.equal(h.ui.isCapturing(),false);assert.equal(h.bindings.keyboard.fire[0],code);assert.equal(h.changes,1);assert.equal(h.doc.activeElement.id,'binding-keyboard-fire-0')}return{assigned:['Space','ShiftLeft'],limit:'Shift+Tab is not asserted; Shift itself remains a supported binding.'};
});
check('ordinary assignment and same-action swapping still rebuild a reachable binding row',()=>{
 const h=boot();h.begin();h.press('KeyJ');assert.equal(h.bindings.keyboard.fire[0],'KeyJ');assert.equal(h.host.open,true);assert.equal(h.doc.activeElement.id,'binding-keyboard-fire-0');h.begin();h.press('Space');assert.deepEqual(h.bindings.keyboard.fire,['Space','KeyJ','KeyX']);assert.equal(h.changes,2);
});
check('controller B remains assignable after neutral capture instead of triggering Cancel',()=>{
 const h=boot();h.begin('controller');h.ui.captureButtons([]);h.ui.captureButtons([1]);assert.equal(h.ui.isCapturing(),false);assert.equal(h.bindings.controller.fire[0],1);assert.equal(h.bindings.controller.delta[0],0);assert.equal(h.host.open,true);assert.equal(h.doc.activeElement.id,'binding-controller-fire-0');
});
const passed=results.filter(result=>result.passed).length,failed=results.length-passed,label=baseline?'baseline':'live';
const report={sourcePath:relative,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex'),passed,failed,results,limits:'Real controls editor/binding source in a small DOM lifecycle model. Tab focus and Enter button defaults are explicitly modeled after unprevented events. Native browser keyboard behavior, rendering and physical gamepad feel require separate checks.'};
fs.writeFileSync(path.join(root,`artifacts/capture-navigation-v157-${label}.json`),JSON.stringify(report,null,2)+'\n');console.log(`${passed} capture navigation groups passed, ${failed} failed`);if(failed)process.exitCode=1;
