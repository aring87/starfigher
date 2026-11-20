/* Fixed field beats. Only new wave/hazard admission changes; live dangers,
 * mission clocks and sector threat values remain owned by the simulation. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterStageRhythm=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
  const approach=[
    {id:'entry',kind:'establish',start:0,end:5,enemyScale:1.2,hazards:false},
    {id:'pressure',kind:'pressure',start:5,end:16,enemyScale:.85,hazards:true},
    {id:'regroup',kind:'reposition',start:16,end:24,enemyScale:0,hazards:false},
    {id:'test',kind:'test',start:24,end:39,enemyScale:.8,hazards:true},
    {id:'elite-approach',kind:'approach',start:39,end:48,enemyScale:0,hazards:false}
  ];
  const postElite=[
    {id:'counterattack',kind:'pressure',start:0,end:10,enemyScale:.85,hazards:true},
    {id:'regroup',kind:'reposition',start:10,end:18,enemyScale:0,hazards:false},
    {id:'test',kind:'test',start:18,end:29,enemyScale:.8,hazards:true},
    {id:'apex-approach',kind:'approach',start:29,end:36,enemyScale:0,hazards:false}
  ];
  const schedules=freeze({approach,postElite});
  // Absolute simulation time makes pause, service, refit and checkpoint restore
  // resume the current beat without replaying missed waves or old notices.
  function describe({stage=1,post=false,clock=0}={}){
    const duration=post?36:48;
    if(Number(stage)===1)return freeze({id:'authored',kind:'authored',start:0,end:duration,duration,enemyScale:1,hazards:false});
    const timeline=post?schedules.postElite:schedules.approach;
    const time=Number.isFinite(clock)?Math.max(0,clock):0;
    const phase=timeline.find(beat=>time<beat.end)||timeline[timeline.length-1];
    return freeze({...phase,duration});
  }
  return freeze({version:1,schedules,describe});
});
