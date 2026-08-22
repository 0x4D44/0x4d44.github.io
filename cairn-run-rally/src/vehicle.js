import { angleLerp, clamp, expSmoothing, wrapAngle } from './math.js';
import { CAIRN_R4 } from './content.js';
import { nearestStagePoint, sampleStage } from './stage.js';

const GRAVITY = 9.81;
const TYRE_FRONT = 72000;
const TYRE_REAR = 68000;
const LANDING_DAMAGE_CAP_SCALE = { suspension: 0.72 / 0.78, body: 0.82 / 0.9 };
const cloneProfile = value => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneProfile);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneProfile(child)]));
};
const isDeepFrozen = value => {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
};
const freezeProfile = value => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeProfile(child);
  return Object.freeze(value);
};

export class RallyCar {
  constructor(stage, profile = CAIRN_R4) {
    this.stage = stage;
    this.profile = isDeepFrozen(profile) ? profile : freezeProfile(cloneProfile(profile));
    this.suspensionResponse = {
      travel: this.profile.suspension.travelM / CAIRN_R4.suspension.travelM,
      spring: this.profile.suspension.springHz / CAIRN_R4.suspension.springHz,
      damping: this.profile.suspension.dampingRatio / CAIRN_R4.suspension.dampingRatio
    };
    this.damage = { engine: 0, steering: 0, suspension: 0, brakes: 0, body: 0 };
    this.reset(14, true);
  }

  reset(distance = 14, repair = true) {
    const road = sampleStage(this.stage, distance);
    this.x = road.x;
    this.z = road.z;
    this.y = road.y + this.profile.rideHeightM;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.yaw = road.heading;
    this.yawRate = 0;
    this.steer = 0;
    this.roll = road.camber;
    this.pitch = -Math.atan(road.grade);
    this.rollVelocity = 0;
    this.pitchVelocity = 0;
    this.progress = road.s;
    this.progressIndex = road.index;
    this.lateral = 0;
    this.surface = road.surface;
    this.grounded = true;
    this.airTime = 0;
    this.slipAngle = 0;
    this.slipAmount = 0;
    this.longitudinalSpeed = 0;
    this.lateralSpeed = 0;
    this.acceleration = 0;
    this.lateralAcceleration = 0;
    this.collisionImpulse = 0;
    this.collisionCooldown = 0;
    this.recoveryTimer = 0;
    this.needsRecovery = false;
    this.lastSafeDistance = Math.max(12, road.s);
    this.lastSafeTimer = 0;
    this.gear = 1;
    this.rpm = 1500;
    this.shiftPulse = 0;
    if (repair) this.damage = { engine: 0, steering: 0, suspension: 0, brakes: 0, body: 0 };
  }

  recover() {
    this.reset(Math.max(14, this.lastSafeDistance - 6), false);
    this.vx = 0;
    this.vz = 0;
    this.damage.body = clamp(this.damage.body + 0.025, 0, this.profile.durability.body);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get speedKph() { return this.speed * 3.6; }
  get damageTotal() { return (this.damage.engine + this.damage.steering + this.damage.suspension + this.damage.brakes + this.damage.body) / 5; }

  step(rawInput, dt) {
    const input = {
      steer: clamp(rawInput.steer || 0, -1, 1),
      throttle: clamp(rawInput.throttle || 0, 0, 1),
      brake: clamp(rawInput.brake || 0, 0, 1),
      handbrake: clamp(rawInput.handbrake || 0, 0, 1)
    };
    this.collisionImpulse *= Math.exp(-9 * dt);
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.shiftPulse = Math.max(0, this.shiftPulse - dt * 4);

    let road = nearestStagePoint(this.stage, this.x, this.z, this.progressIndex, 70);
    if (road.distance > 75) road = nearestStagePoint(this.stage, this.x, this.z, Math.round(this.progress / 4), 260);
    const previousProgress = this.progress;
    this.progressIndex = road.index;
    this.progress = road.s;
    this.lateral = road.lateral;

    const forwardX = Math.sin(this.yaw), forwardZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    let u = this.vx * forwardX + this.vz * forwardZ;
    let v = this.vx * rightX + this.vz * rightZ;
    const speed = Math.hypot(u, v);

    const roadHalfWidth = road.width * 0.5;
    const onRoad = Math.abs(road.lateral) <= roadHalfWidth + 0.7;
    this.surface = onRoad ? road.surface : 'grass';
    const baseMu = this.surface === 'compact' ? 0.91 : this.surface === 'loose' ? 0.69 : 0.43;
    const looseRearBias = this.surface === 'loose' ? 0.90 : 0.96;
    const gripDamage = 1 - this.damage.suspension * 0.26;
    const muFront = baseMu * this.profile.tyreGrip.front * gripDamage;
    let muRear = baseMu * (this.surface === 'loose' ? looseRearBias : this.profile.tyreGrip.rear) * gripDamage * (1 - input.handbrake * 0.70);

    const steerRate = 10.5 * (1 - this.damage.steering * 0.18);
    const steeringBias = this.damage.steering * 0.10 * Math.sin(2.47 + this.damage.body * 5.2);
    const steerTarget = clamp(input.steer + steeringBias, -1, 1);
    this.steer += (steerTarget - this.steer) * expSmoothing(steerRate, dt);
    const maxSteer = this.profile.steeringLockRad / (1 + speed * 0.014);
    const steerAngle = this.steer * maxSteer;

    const brakeTransfer = input.brake * clamp(Math.abs(u) / 12, 0, 1) * 0.16;
    const frontAxle = this.profile.wheelbaseM * (1 - this.profile.frontWeightFraction);
    const rearAxle = this.profile.wheelbaseM * this.profile.frontWeightFraction;
    const mass = this.profile.massKg;
    const frontLoad = mass * GRAVITY * (rearAxle / (frontAxle + rearAxle) + brakeTransfer);
    const rearLoad = mass * GRAVITY - frontLoad;
    const denominator = Math.max(2.2, Math.abs(u));
    const steeringDirection = u < -0.5 ? -1 : 1;
    const alphaFront = Math.atan2(v + frontAxle * this.yawRate, denominator) - steerAngle * steeringDirection;
    const alphaRear = Math.atan2(v - rearAxle * this.yawRate, denominator);
    const groundGrip = this.grounded ? 1 : 0.015;
    let forceFront = clamp(-TYRE_FRONT * alphaFront, -muFront * frontLoad, muFront * frontLoad) * groundGrip;
    let forceRear = clamp(-TYRE_REAR * alphaRear, -muRear * rearLoad, muRear * rearLoad) * groundGrip;

    if (Math.abs(u) < 2.2) {
      const lowSpeed = clamp(Math.abs(u) / 2.2, 0, 1);
      forceFront *= lowSpeed;
      forceRear *= lowSpeed;
    }

    const engineHealth = 1 - this.damage.engine * 0.46;
    const brakeHealth = 1 - this.damage.brakes * 0.38;
    let driveForce = 0;
    let brakeForce = 0;
    if (u >= -0.5) {
      driveForce = input.throttle * 8200 * engineHealth * (1 - clamp(Math.max(0, u) / 57, 0, 0.78));
      if (u > 0.4) brakeForce = -input.brake * this.profile.brakeForceN * brakeHealth;
      else if (input.brake > 0.15 && input.throttle < 0.1) driveForce = -input.brake * 3700 * engineHealth;
    } else {
      driveForce = -input.brake * 3700 * engineHealth;
      brakeForce = input.throttle * 8500 * brakeHealth;
    }
    const handbrakeDirection = Math.sign(u);
    brakeForce += -handbrakeDirection * input.handbrake * 2600 * clamp(Math.abs(u) / 1.5, 0, 1);
    const traction = this.grounded ? 1 : 0.015;
    driveForce *= traction;
    brakeForce *= traction;
    const drag = -this.profile.dragCoefficient * u * Math.abs(u);
    const rolling = -Math.sign(u) * (onRoad ? 145 : 510) * clamp(Math.abs(u) / 1.5, 0, 1) * traction;
    const gradeForce = this.grounded ? -mass * GRAVITY * road.grade : 0;
    const longitudinalForce = driveForce + brakeForce + drag + rolling + gradeForce;
    const lateralForce = forceFront * Math.cos(steerAngle) + forceRear;
    const yawTorque = frontAxle * forceFront * Math.cos(steerAngle) - rearAxle * forceRear;

    const localAx = longitudinalForce / mass + v * this.yawRate;
    const localAy = lateralForce / mass - u * this.yawRate;
    const worldAx = forwardX * localAx + rightX * localAy;
    const worldAz = forwardZ * localAx + rightZ * localAy;
    this.vx += worldAx * dt;
    this.vz += worldAz * dt;
    this.yawRate += yawTorque / this.profile.yawInertiaKgM2 * dt;

    if (!onRoad) {
      const scrub = Math.exp(-(1.5 + Math.min(2.0, Math.abs(road.lateral) * 0.025)) * dt);
      this.vx *= scrub;
      this.vz *= scrub;
      this.yawRate *= Math.exp(-0.7 * dt);
    }
    if (speed < 1.25 && Math.abs(input.steer) < 0.1) {
      this.yawRate *= Math.exp(-8 * dt);
      const dampedV=v*Math.exp(-9*dt),deltaV=dampedV-v;
      this.vx+=rightX*deltaV;this.vz+=rightZ*deltaV;v=dampedV;
    }

    this.yawRate = clamp(this.yawRate, -2.8, 2.8);
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    road = nearestStagePoint(this.stage, this.x, this.z, this.progressIndex, 75);
    this.progressIndex = road.index;
    this.progress = road.s;
    this.lateral = road.lateral;
    const groundY = road.y + road.camber * road.lateral + this.profile.rideHeightM;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    const landingVelocity = this.vy;
    if (this.y <= groundY + 0.035) {
      this.y = groundY;
      const roadVerticalVelocity = road.grade * Math.max(0, u);
      if (!this.grounded && this.airTime > 0.16 && landingVelocity < -4.2) {
        const severity = clamp((-landingVelocity - 4.0) / 14, 0, 1);
        this.damage.suspension = clamp(this.damage.suspension + severity * 0.11, 0, this.profile.durability.suspension * LANDING_DAMAGE_CAP_SCALE.suspension);
        this.damage.body = clamp(this.damage.body + severity * 0.05, 0, this.profile.durability.body * LANDING_DAMAGE_CAP_SCALE.body);
        this.collisionImpulse = Math.max(this.collisionImpulse, severity * 0.7);
      }
      this.vy = roadVerticalVelocity;
      this.grounded = true;
      this.airTime = 0;
    } else {
      this.grounded = false;
      this.airTime += dt;
    }

    this.checkHazardCollisions(dt);

    const newForwardX = Math.sin(this.yaw), newForwardZ = Math.cos(this.yaw);
    const newRightX = Math.cos(this.yaw), newRightZ = -Math.sin(this.yaw);
    u = this.vx * newForwardX + this.vz * newForwardZ;
    v = this.vx * newRightX + this.vz * newRightZ;
    this.longitudinalSpeed = u;
    this.lateralSpeed = v;
    this.slipAngle = Math.atan2(v, Math.max(2, Math.abs(u)));
    this.slipAmount = clamp((Math.abs(this.slipAngle) - 0.035) / 0.33, 0, 1);
    this.acceleration = localAx;
    this.lateralAcceleration = localAy;

    const suspensionSoftness = 1 + this.damage.suspension * 1.5 * this.suspensionResponse.travel;
    const targetRoll = clamp(-localAy * 0.021 * this.suspensionResponse.travel * suspensionSoftness + road.camber, -0.21, 0.21);
    const targetPitch = clamp(-Math.atan(road.grade) + input.brake * 0.038 * this.suspensionResponse.travel * suspensionSoftness - input.throttle * 0.012 * this.suspensionResponse.travel, -0.18, 0.18);
    this.roll = this.springAngle(this.roll, targetRoll, 'rollVelocity', 9 * this.suspensionResponse.spring / suspensionSoftness, 6.5 * this.suspensionResponse.damping, dt);
    this.pitch = this.springAngle(this.pitch, targetPitch, 'pitchVelocity', 10 * this.suspensionResponse.spring / suspensionSoftness, 7 * this.suspensionResponse.damping, dt);

    this.updatePowertrain(speed, dt);
    this.updateRecovery(road, onRoad, previousProgress, dt);
    return { road, onRoad, collisionImpulse: this.collisionImpulse };
  }

  springAngle(value, target, velocityKey, stiffness, damping, dt) {
    this[velocityKey] += ((target - value) * stiffness * stiffness - this[velocityKey] * damping) * dt;
    return value + this[velocityKey] * dt;
  }

  updatePowertrain(speed, dt) {
    const kph = speed * 3.6;
    const thresholds = [0, 25, 50, 78, 110, 145];
    let gear = 1;
    for (let i = 1; i < thresholds.length; i += 1) if (kph >= thresholds[i]) gear = i + 1;
    gear = Math.min(6, gear);
    if (gear !== this.gear) this.shiftPulse = 1;
    this.gear = gear;
    const low = thresholds[gear - 1] || 0;
    const high = thresholds[gear] || 180;
    const ratio = clamp((kph - low) / Math.max(1, high - low), 0, 1);
    this.rpm = 1900 + ratio * 5200 + Math.abs(this.slipAngle) * 1000;
    this.rpm += this.shiftPulse * -900;
  }

  checkHazardCollisions(dt) {
    if (this.collisionCooldown > 0) return;
    const radius = 1.05;
    for (const hazard of this.stage.colliders || this.stage.hazards) {
      if (Math.abs(hazard.s - this.progress) > 42) continue;
      const dx = this.x - hazard.x, dz = this.z - hazard.z;
      const minDistance = radius + hazard.radius;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= minDistance * minDistance) continue;
      const distance = Math.sqrt(distanceSq) || 0.001;
      const nx = dx / distance, nz = dz / distance;
      const normalSpeed = -(this.vx * nx + this.vz * nz);
      if (normalSpeed <= 0.2) continue;
      const restitution = hazard.type === 'post' ? 0.12 : 0.32;
      const impulse = normalSpeed * (1 + restitution);
      this.vx += nx * impulse;
      this.vz += nz * impulse;
      this.x = hazard.x + nx * (minDistance + 0.03);
      this.z = hazard.z + nz * (minDistance + 0.03);
      this.yawRate += (nx * Math.cos(this.yaw) - nz * Math.sin(this.yaw)) * clamp(normalSpeed * 0.12, -1.8, 1.8);
      const severity = clamp((normalSpeed - 2.5) / 23, 0, 1),feedback=clamp(normalSpeed/20,0,1);
      const side = Math.sign(nx * Math.cos(this.yaw) + nz * -Math.sin(this.yaw)) || 1;
      this.damage.body = clamp(this.damage.body + severity * 0.24, 0, this.profile.durability.body);
      this.damage.steering = clamp(this.damage.steering + severity * 0.13 * (0.7 + Math.abs(side) * 0.3), 0, this.profile.durability.steering);
      this.damage.suspension = clamp(this.damage.suspension + severity * 0.10, 0, this.profile.durability.suspension);
      this.damage.engine = clamp(this.damage.engine + severity * 0.075, 0, this.profile.durability.engine);
      this.damage.brakes = clamp(this.damage.brakes + severity * 0.045, 0, this.profile.durability.brakes);
      this.collisionImpulse = Math.max(this.collisionImpulse, feedback);
      this.collisionCooldown = 0.28;
      break;
    }
  }

  updateRecovery(road, onRoad, previousProgress, dt) {
    const movingForward = this.progress > previousProgress && this.longitudinalSpeed > 2;
    if (onRoad && Math.abs(road.lateral) < road.width * 0.38 && movingForward && this.speed > 3) {
      this.lastSafeTimer += dt;
      if (this.lastSafeTimer > 0.6) { this.lastSafeDistance = this.progress; this.lastSafeTimer = 0; }
    } else this.lastSafeTimer = 0;

    const stranded = road.distance > 65 || (Math.abs(road.lateral) > 34 && this.speed < 2.2) || (Math.abs(road.lateral) > 18 && this.speed < 0.45);
    this.recoveryTimer = stranded ? this.recoveryTimer + dt : Math.max(0, this.recoveryTimer - dt * 2);
    this.needsRecovery = this.recoveryTimer > 2.2;
  }
}
