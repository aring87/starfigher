/* Authored weapon support groups. Pure encounter data; image loading, debris,
 * attack emission and damage remain the live game's responsibility.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.StarfighterEncounterTactics=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
  const miniNames=['WRECK REAVER','FORGE GNAWER','ABYSS STALKER','VESPER SHARD','SEED TYRANT','HOLLOW MAW','RELAY WARDEN','CINDER SERAPH','GRAVITY LANCER','SIGNAL EXECUTOR'];
  const miniTactics=[
    'Block pink fire; break a side assembly to open its firing lane.',
    'Silence a side cannon to remove its fan, then work the center reactor.',
    'Evade tracking fire; break side fins to reduce pursuit.',
    'Find a gap in the rotating ring and break a side fin to widen it.',
    'Hold a gap in the seed ring and strip its side assemblies.',
    'Break one side cannon, then cross through its missing salvo.',
    'Block the fan with Force; break side hardware to weaken support.',
    'Reposition between spreads; break a wing to thin the next fan.',
    'Read the ring speed; break a side plate to open a safer arc.',
    'Block pink fire; evade amber shots and strip the outer weapons.'
  ];
  const bossNames=['THE BLOODSTAR','TWIN MAW','HELIX CROWN','RIFT WRAITH','IRON BLOOM','VOID LEVIATHAN','PRISM WARDEN','GRAVEBELL','SOLAR HYDRA','OMEGA HEART'];
  const bossTactics=[
    'Use Force on aimed fire and break tentacles to open gaps in the rotating barrage.',
    'Silence one jaw to remove its fan and attack through that opening.',
    'Move through rotating gaps and break crown shells to remove their spokes.',
    'Reposition after each warp and destroy blades to thin its fan and wall.',
    'Hold a ring gap and break mandibles to open the bloom\'s barrage.',
    'Evade its lunge and break tails to weaken tracking fire and outer fan lanes.',
    'Read the rotating layers and break crystal fins to open their firing arcs.',
    'Break the horn to weaken pursuit and chain weights to clear rain lanes.',
    'Sever a head to stop its fan; the middle head also powers the beam.',
    'Use Force on pink volleys and destroy tendrils to thin its changing patterns.'
  ];
  const epicNames=['NULL CATHEDRAL','MIASMA THRONE'];
  const epicTactics=[
    'Dismantle tendrils between rituals, then destroy the active guardian.',
    'Strip firing heads and rear spines between rituals; defeat the active guardian.'
  ];
  const bossCounts=[[8,8],[3,4],[3,4],[3,4],[3,4],[5,6],[3,4],[3,4],[3,4],[3,5]],epicCounts=[[3,4,5,7],[3,4,5,7]];
  const catalogue=freeze([
    ...miniNames.map((name,type)=>({id:'mini-'+type,kind:'mini',type,name,tactic:miniTactics[type]})),
    ...bossNames.map((name,type)=>({id:'boss-'+type,kind:'boss',type,name,tactic:bossTactics[type]})),
    ...epicNames.map((name,epicId)=>({id:'epic-'+epicId,kind:'boss',type:10+epicId,epicId,name,tactic:epicTactics[epicId]}))
  ]);
  const part=(id,label,...indices)=>({id,label,indices});
  const range=(start,end,make)=>Array.from({length:Math.max(0,end-start)},(_,index)=>make(start+index));
  function hydraParts(nodeCount){return[
    part('hydra-head-0','upper head',0),part('hydra-head-1','middle head',1),part('hydra-head-2','lower head',2),
    ...range(4,nodeCount,index=>part('hydra-spine-'+index,'rear spine '+(index-3),index))
  ]}
  function describe(input){
    if(!input||typeof input!=='object'||Array.isArray(input))return null;
    const {kind,type,epicId}=input,phase=input.phase===undefined?1:input.phase;
    if(!['mini','boss'].includes(kind)||!Number.isInteger(type)||!Number.isInteger(phase))return null;
    const epic=kind==='boss'&&(epicId!==undefined||type>=10);
    const anomaly=epic?(epicId===undefined?type-10:epicId):null;
    if(epic&&(!Number.isInteger(anomaly)||anomaly<0||anomaly>1||type!==10+anomaly))return null;
    if(!epic&&(type<0||type>9)||phase<1||phase>(kind==='mini'?1:epic?4:2))return null;
    const expected=kind==='mini'?3:epic?epicCounts[anomaly][phase-1]:bossCounts[type][phase-1];
    const nodeCount=input.nodeCount===undefined?expected:input.nodeCount;
    if(!Number.isInteger(nodeCount)||nodeCount<1||nodeCount>32)return null;
    const row=catalogue.find(item=>item.kind===kind&&item.type===type);
    let parts=[],fanPorts={},beamPart,rainParts;
    if(kind==='mini'){
      parts=[part('upper','upper assembly',0),part('lower','lower assembly',2)];
      fanPorts={upper:'upper',lower:'lower'};
    }else if(epic){
      if(anomaly===0)parts=range(1,nodeCount,index=>part('omega-tendril-'+index,'tendril '+index,index));
      else parts=hydraParts(nodeCount);
    }else switch(type){
      case 0:parts=range(2,Math.min(8,nodeCount),index=>part('bloodstar-tentacle-'+index,'tentacle '+(index-1),index));break;
      case 1:
        parts=phase===1?[part('upper-jaw','upper jaw',0),part('lower-jaw','lower jaw',1)]:[part('upper-jaw','upper jaw',0,2),part('lower-jaw','lower jaw',1,3)];
        fanPorts={upper:'upper-jaw',lower:'lower-jaw'};break;
      case 2:parts=[part('shell-0','upper crown shell',0),part('shell-1','lower crown shell',1),...(phase===2?[part('shell-3','rear crown blade',3)]:[])];break;
      case 3:parts=[part('rift-blade-0','upper crescent blade',0),part('rift-blade-1','lower crescent blade',1),...(phase===2?[part('rift-blade-2','rear crescent blade',2)]:[])];break;
      case 4:parts=[part('bloom-jaw-0','upper mandible',0),part('bloom-jaw-1','forward beak',1),part('bloom-jaw-2','lower mandible',2)];break;
      case 5:parts=range(3,nodeCount,index=>part('void-tail-'+index,'ventral tail '+(index-2),index));break;
      case 6:parts=range(1,nodeCount,index=>part('prism-fin-'+index,index===1?'upper crystal fin':index===2?'lower crystal fin':'rear crystal fin',index));break;
      case 7:
        parts=[part('grave-horn','crown horn',0),...(phase===1?[part('grave-right-weight','right chain weight',2)]:[part('grave-left-weight','left chain weight',2),part('grave-right-weight','right chain weight',3)])];
        rainParts=parts.filter(item=>item.id!=='grave-horn').map(item=>item.id);break;
      case 8:
        parts=hydraParts(nodeCount);fanPorts={upper:'hydra-head-0',middle:'hydra-head-1',lower:'hydra-head-2'};beamPart='hydra-head-1';break;
      default:parts=range(1,nodeCount,index=>part('omega-tendril-'+index,'tendril '+index,index));break;
    }
    return freeze({name:row.name,tactic:row.tactic,parts,fanPorts,...(beamPart?{beamPart}:{}),...(rainParts?{rainParts}:{})});
  }
  function status(definition,nodes){
    if(!definition||typeof definition!=='object'||!Array.isArray(definition.parts)||!Array.isArray(nodes))return freeze([]);
    if(definition.parts.some(item=>!item||typeof item!=='object'||!Array.isArray(item.indices)))return freeze([]);
    return freeze(definition.parts.map(item=>({
      ...item,indices:[...item.indices],
      // A missing support is never evidence that a shared weapon was severed.
      destroyed:item.indices.length>0&&item.indices.every(index=>Number.isInteger(index)&&index>=0&&Object.hasOwn(nodes,index)&&nodes[index]?.destroyed===true)
    })));
  }
  return freeze({version:1,catalogue,describe,status});
});
