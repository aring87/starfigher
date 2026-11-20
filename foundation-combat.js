/* Standalone foundation prototype. The shipping game does not import this file. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.STARFIGHTER_FOUNDATION_COMBAT = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const POLICY = Object.freeze({
    version: 1,
    sources: Object.freeze(['fighter', 'force', 'bit', 'missile', 'pod-contact', 'delta']),
    elements: Object.freeze(['neutral', 'heat', 'ion', 'cryo']),
    regions: Object.freeze(['regular', 'armor', 'core']),
    affinity: Object.freeze({ neutral: 1, weak: 1.2, resistant: .85 }),
    armorScale: .25,
    maximumShields: 4,
    maximumDose: 100,
    serviceDose: 12,
    forceBlockDose: 2.5
  });
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(name + ' must be an object');
    return value;
  }
  function number(value, name, minimum = 0, maximum = Infinity, integer = false) {
    if (!Number.isFinite(value)) throw new TypeError(name + ' must be finite');
    if (value < minimum || value > maximum || (integer && !Number.isInteger(value))) throw new RangeError(name + ' is outside its allowed range');
    return value;
  }
  function boolean(value, name, fallback = false) {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
    return value;
  }
  function requiredBoolean(value, name) {
    if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
    return value;
  }
  function id(value, allowed, name) {
    if (!allowed.includes(value)) throw new RangeError('Unknown ' + name + ': ' + String(value));
    return value;
  }
  function affinity(value, name) {
    return value === undefined || value === null ? null : id(value, POLICY.elements.slice(1), name);
  }
  function buildData(build) {
    object(build, 'build');
    const stats = object(build.stats, 'build.stats'), events = object(build.events, 'build.events');
    for (const key of ['fighterDamage', 'forceDamage', 'bitDamage', 'missileDamage', 'chargeDamage', 'rearForceDamage', 'coreDamage']) {
      number(stats[key], 'build.stats.' + key, Number.MIN_VALUE);
    }
    number(stats.shieldedChargeDamageBonus, 'build.stats.shieldedChargeDamageBonus');
    number(stats.forceBlockDoseBonus, 'build.stats.forceBlockDoseBonus');
    for (const key of ['maxHullBonus', 'startingShields', 'podBarrierBonus']) number(stats[key], 'build.stats.' + key, 0, Infinity, true);
    for (const key of ['flightSpeed', 'chargeSpeed']) number(stats[key], 'build.stats.' + key, Number.MIN_VALUE);
    for (const key of ['shieldPickupDoseBonus', 'pickupSurgeDuration', 'pickupSurgePower', 'coreBreakDoseBonus', 'coreBreakSurgeDuration', 'coreBreakSurgePower', 'bitBlockDoseBonus', 'apexRepairHull', 'surplusPickupDose']) {
      number(events[key], 'build.events.' + key);
    }
    for (const key of ['recoveryOnFirstShield', 'ordinaryHullGuard', 'contactGuard', 'secondChance']) {
      if (typeof events[key] !== 'boolean') throw new TypeError('build.events.' + key + ' must be boolean');
    }
    number(events.setForceShieldEvery, 'build.events.setForceShieldEvery', 0, Infinity, true);
    number(events.setForceShieldLimit, 'build.events.setForceShieldLimit', 0, Infinity, true);
    return { stats, events };
  }

  function resolveHit(packet, target, build, options = {}) {
    object(packet, 'packet'); object(target, 'target'); object(options, 'options');
    const { stats } = buildData(build);
    const base = number(packet.amount, 'packet.amount');
    const source = id(packet.source, POLICY.sources, 'damage source');
    const element = id(packet.element === undefined ? 'neutral' : packet.element, POLICY.elements, 'element');
    const region = id(target.region, POLICY.regions, 'target region');
    const blocked = boolean(target.protected, 'target.protected');
    const charged = boolean(packet.charged, 'packet.charged'), rear = boolean(packet.rear, 'packet.rear');
    const shielded = boolean(packet.shielded, 'packet.shielded');
    const elementsEnabled = boolean(options.elementsEnabled, 'options.elementsEnabled');
    const weakness = affinity(target.weakness, 'weakness'), resistance = affinity(target.resistance, 'resistance');
    if (weakness && weakness === resistance) throw new RangeError('An element cannot be both weak and resistant');
    const scripted = source === 'delta';
    const sourceScale = scripted ? 1 : ({ fighter: stats.fighterDamage, force: stats.forceDamage, bit: stats.bitDamage, missile: stats.missileDamage, 'pod-contact': stats.forceDamage })[source];
    const chargeScale = !scripted && source === 'fighter' && charged ? stats.chargeDamage * (shielded ? 1 + stats.shieldedChargeDamageBonus : 1) : 1;
    const rearScale = !scripted && source === 'force' && rear ? stats.rearForceDamage : 1;
    const elementScale = scripted || !elementsEnabled || element === 'neutral' ? 1 : element === weakness ? POLICY.affinity.weak : element === resistance ? POLICY.affinity.resistant : 1;
    const regionScale = !scripted && region === 'armor' ? POLICY.armorScale : 1;
    const coreScale = !scripted && region === 'core' ? stats.coreDamage : 1;
    for (const [name, scale] of Object.entries({ sourceScale, chargeScale, rearScale, elementScale, regionScale, coreScale })) number(scale, name);
    const amount = blocked ? 0 : base * sourceScale * chargeScale * rearScale * elementScale * regionScale * coreScale;
    number(amount, 'resolved damage');
    return Object.freeze({ amount, sourceScale, chargeScale, rearScale, elementScale, regionScale, coreScale, protected: blocked, policy: scripted ? 'scripted' : 'standard' });
  }

  function runState(value) {
    object(value, 'state');
    const maxHp = number(value.maxHp, 'state.maxHp', 1, Infinity, true);
    const guards = object(value.guards, 'state.guards');
    if (!Array.isArray(value.rewardIds) || value.rewardIds.some(key => typeof key !== 'string' || !key.length)) throw new TypeError('state.rewardIds must contain nonempty strings');
    if (new Set(value.rewardIds).size !== value.rewardIds.length) throw new RangeError('state.rewardIds must be unique');
    return {
      hp: number(value.hp, 'state.hp', 0, maxHp, true), maxHp,
      shields: number(value.shields, 'state.shields', 0, POLICY.maximumShields, true),
      dose: number(value.dose, 'state.dose', 0, POLICY.maximumDose),
      surgeTime: number(value.surgeTime, 'state.surgeTime'), surgePower: number(value.surgePower, 'state.surgePower'),
      guards: {
        ablative: requiredBoolean(guards.ablative, 'state.guards.ablative'),
        phase: requiredBoolean(guards.phase, 'state.guards.phase'),
        secondChance: requiredBoolean(guards.secondChance, 'state.guards.secondChance')
      },
      pickupSurgeReady: requiredBoolean(value.pickupSurgeReady, 'state.pickupSurgeReady'),
      shieldRepairReady: requiredBoolean(value.shieldRepairReady, 'state.shieldRepairReady'),
      rewardIds: [...value.rewardIds], damageTaken: number(value.damageTaken === undefined ? 0 : value.damageTaken, 'state.damageTaken'),
      forceSetBlocks: number(value.forceSetBlocks, 'state.forceSetBlocks', 0, Infinity, true),
      setShieldsGranted: number(value.setShieldsGranted, 'state.setShieldsGranted', 0, Infinity, true)
    };
  }
  function createRunState(build, overrides = {}) {
    const { stats, events } = buildData(build); object(overrides, 'overrides');
    const maxHp = owns(overrides, 'maxHp') ? overrides.maxHp : 3 + stats.maxHullBonus;
    return runState({ hp: maxHp, maxHp, shields: Math.min(POLICY.maximumShields, stats.startingShields), dose: 0, surgeTime: 0, surgePower: 0,
      guards: { ablative: events.ordinaryHullGuard, phase: events.contactGuard, secondChance: events.secondChance },
      pickupSurgeReady: true, shieldRepairReady: true, rewardIds: [], damageTaken: 0, forceSetBlocks: 0, setShieldsGranted: 0, ...overrides });
  }
  function applyRunEvent(build, state, event) {
    const { stats, events } = buildData(build), next = runState(state); object(event, 'event');
    // Queued rewards and pickups cannot revive a run after its lethal hit.
    if (next.hp === 0 && ['missionStart', 'coreBreak', 'forceBlock', 'bitBlock', 'shieldPickup', 'combatPickup', 'surplusPickup', 'apexClear', 'miniService'].includes(event.type)) return next;
    const dose = amount => { next.dose = Math.min(POLICY.maximumDose, next.dose + amount); };
    const surge = (duration, power) => {
      if (!(duration > 0 && power > 0)) return;
      next.surgeTime = Math.max(next.surgeTime, duration); next.surgePower = Math.max(next.surgePower, power);
    };
    const pickup = () => {
      if (!next.pickupSurgeReady) return;
      next.pickupSurgeReady = false; surge(events.pickupSurgeDuration, events.pickupSurgePower);
    };
    const rewardId = () => {
      if (typeof event.id !== 'string' || !event.id.trim()) throw new TypeError(event.type + ' needs a nonempty reward id');
      if (next.rewardIds.includes(event.id)) return false;
      next.rewardIds.push(event.id); return true;
    };
    switch (event.type) {
      case 'tick':
        next.surgeTime = Math.max(0, next.surgeTime - number(event.seconds, 'event.seconds'));
        if (next.surgeTime === 0) next.surgePower = 0;
        break;
      case 'missionStart':
        next.guards = { ablative: events.ordinaryHullGuard, phase: events.contactGuard, secondChance: events.secondChance };
        next.pickupSurgeReady = true; next.shieldRepairReady = true;
        next.forceSetBlocks = 0; next.setShieldsGranted = 0;
        break;
      case 'coreBreak':
        dose(events.coreBreakDoseBonus); surge(events.coreBreakSurgeDuration, events.coreBreakSurgePower);
        break;
      case 'forceBlock':
        dose(POLICY.forceBlockDose + stats.forceBlockDoseBonus);
        if (events.setForceShieldEvery > 0 && next.setShieldsGranted < events.setForceShieldLimit) {
          next.forceSetBlocks = Math.min(events.setForceShieldEvery, next.forceSetBlocks + 1);
          if (next.forceSetBlocks >= events.setForceShieldEvery && next.shields < POLICY.maximumShields) {
            next.shields++; next.setShieldsGranted++;
          }
        }
        break;
      case 'bitBlock': dose(events.bitBlockDoseBonus); break;
      case 'shieldPickup': {
        const gained = next.shields < POLICY.maximumShields;
        if (gained) { next.shields++; dose(events.shieldPickupDoseBonus); }
        else dose(events.surplusPickupDose);
        if (next.shieldRepairReady) {
          next.shieldRepairReady = false;
          if (events.recoveryOnFirstShield) next.hp = Math.min(next.maxHp, next.hp + 1);
        }
        pickup(); break;
      }
      case 'combatPickup': pickup(); break;
      case 'surplusPickup': dose(events.surplusPickupDose); pickup(); break;
      case 'apexClear':
        if (rewardId()) next.hp = Math.min(next.maxHp, next.hp + events.apexRepairHull);
        break;
      case 'miniService': {
        id(event.choice, ['repair', 'shield', 'dose'], 'mini service');
        if (!rewardId()) break;
        if (event.choice === 'repair') {
          if (next.hp >= next.maxHp) throw new RangeError('Repair service requires missing hull');
          next.hp++;
        } else if (event.choice === 'shield') {
          if (next.shields >= POLICY.maximumShields) throw new RangeError('Shield service requires an available reserve');
          next.shields++;
        } else dose(POLICY.serviceDose);
        break;
      }
      case 'hit': {
        const incoming = number(event.damage, 'event.damage', 1, Infinity, true);
        id(event.kind, ['projectile', 'contact'], 'incoming hit kind');
        if (boolean(event.protected, 'event.protected') || next.hp <= 0) break;
        if (event.kind === 'contact' && events.contactGuard && next.guards.phase) { next.guards.phase = false; break; }
        if (next.shields > 0) { next.shields--; break; }
        if (events.ordinaryHullGuard && next.guards.ablative) { next.guards.ablative = false; break; }
        const before = next.hp;
        next.hp = Math.max(0, next.hp - incoming);
        if (next.hp === 0 && events.secondChance && next.guards.secondChance) { next.hp = 1; next.guards.secondChance = false; }
        next.damageTaken += before - next.hp;
        break;
      }
      default: throw new RangeError('Unknown run event: ' + String(event.type));
    }
    return next;
  }
  return Object.freeze({ POLICY, resolveHit, createRunState, applyRunEvent });
});
