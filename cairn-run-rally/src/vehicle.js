import { clamp, expSmoothing, wrapAngle } from './math.js';
import { CAIRN_R4, SURFACES } from './content.js';
import { axleLoads, combinedTyreForces, drivenAxleShares, stepPowertrain } from './dynamics.js';
import { nearestStagePoint, sampleStage } from './stage.js';

const GRAVITY = 9.81;
const TYRE_FRONT = 72000;
const TYRE_REAR = 68000;
const LANDING_DAMAGE_CAP_SCALE = { suspension: 0.72 / 0.78, body: 0.82 / 0.9 };
const SURFACE_BY_ID = new Map(SURFACES.map(surface => [surface.id, surface]));
const DEFAULT_ASSISTS = Object.freeze({ automatic: true, stability: true, braking: true, paceNotes: true });
const DEFAULT_TUNING = Object.freeze({ brakeBias: 0, steeringRatio: 0, rideHeight: 0, damping: 0, tyreId: 'standard' });
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
  constructor(stage, profile = CAIRN_R4, options = {}) {
    this.stage = stage;
    this.profile = isDeepFrozen(profile) ? profile : freezeProfile(cloneProfile(profile));
    this.assists = { ...DEFAULT_ASSISTS, ...(options.assists || {}) };
    this.tuning = { ...DEFAULT_TUNING, ...(options.tuning || {}) };
    this.weather = { gripScale: 1, roadWetness: 0, ...(options.weather || {}) };
    this.suspensionResponse = {
      travel: this.profile.suspension.travelM / CAIRN_R4.suspension.travelM,
      spring: this.profile.suspension.springHz / CAIRN_R4.suspension.springHz,
      damping: this.profile.suspension.dampingRatio / CAIRN_R4.suspension.dampingRatio * (1 + this.tuning.damping * 0.5)
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
    this.longitudinalAcceleration = 0;
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
    this.shiftRemaining = 0;
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
      handbrake: clamp(rawInput.handbrake || 0, 0, 1),
      shiftUp: Boolean(rawInput.shiftUp),
      shiftDown: Boolean(rawInput.shiftDown)
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
    const surfaceData = SURFACE_BY_ID.get(this.surface) || SURFACE_BY_ID.get('grass');
    const wetLoss = this.surface === 'tarmac' ? this.weather.roadWetness * 0.16 : this.weather.roadWetness * 0.045;
    const baseMu = surfaceData.grip * this.weather.gripScale * (1 - wetLoss);
    const gripDamage = 1 - this.damage.suspension * 0.26;
    const tyreSurfaceScale = this.tyreSurfaceScale(this.tuning.tyreId, this.surface);
    const muFront = baseMu * this.profile.tyreGrip.front * gripDamage * tyreSurfaceScale;
    const muRear = baseMu * this.profile.tyreGrip.rear * gripDamage * tyreSurfaceScale;

    const steerRate = 10.5 * (1 - this.damage.steering * 0.18);
    const steeringBias = this.damage.steering * 0.10 * Math.sin(2.47 + this.damage.body * 5.2);
    const steerTarget = clamp(input.steer + steeringBias, -1, 1);
    this.steer += (steerTarget - this.steer) * expSmoothing(steerRate, dt);
    const maxSteer = this.profile.steeringLockRad * (1 + this.tuning.steeringRatio * 0.18) / (1 + speed * 0.014);
    const steerAngle = this.steer * maxSteer;

    const frontAxle = this.profile.wheelbaseM * (1 - this.profile.frontWeightFraction);
    const rearAxle = this.profile.wheelbaseM * this.profile.frontWeightFraction;
    const mass = this.profile.massKg;
    const loads = axleLoads(this.profile, this.longitudinalAcceleration);
    const staticLoads = axleLoads(this.profile, 0);
    const frontLoad = loads.front;
    const rearLoad = loads.rear;
    const denominator = Math.max(2.2, Math.abs(u));
    const steeringDirection = u < -0.5 ? -1 : 1;
    const alphaFront = Math.atan2(v + frontAxle * this.yawRate, denominator) - steerAngle * steeringDirection;
    const alphaRear = Math.atan2(v - rearAxle * this.yawRate, denominator);
    const groundGrip = this.grounded ? 1 : 0.015;
    let lateralDemandFront = -TYRE_FRONT * alphaFront;
    let lateralDemandRear = -TYRE_REAR * alphaRear;

    if (Math.abs(u) < 2.2) {
      const lowSpeed = clamp(Math.abs(u) / 2.2, 0, 1);
      lateralDemandFront *= lowSpeed;
      lateralDemandRear *= lowSpeed;
    }

    const engineHealth = 1 - this.damage.engine * 0.46;
    const brakeHealth = 1 - this.damage.brakes * 0.38;
    const powertrain = stepPowertrain(
      { gear: this.gear, rpm: this.rpm, shiftRemaining: this.shiftRemaining },
      { speedMps: u, throttle: input.throttle, shiftUp: input.shiftUp, shiftDown: input.shiftDown },
      this.profile,
      dt,
      { automatic: this.assists.automatic }
    );
    this.gear = powertrain.gear;
    this.rpm = powertrain.rpm;
    this.shiftRemaining = powertrain.shiftRemaining;
    if (powertrain.shifted) this.shiftPulse = 1;
    let driveDemand = 0;
    let serviceBrake = 0;
    if (u >= -0.5) {
      driveDemand = powertrain.driveForceN * engineHealth - Math.sign(u) * powertrain.engineBrakeForceN * engineHealth;
      if (u > 0.4) serviceBrake = -input.brake * this.profile.brakeForceN * brakeHealth;
      else if (input.brake > 0.15 && input.throttle < 0.1) driveDemand = -input.brake * 3700 * engineHealth;
    } else {
      driveDemand = -input.brake * 3700 * engineHealth;
      serviceBrake = input.throttle * this.profile.brakeForceN * brakeHealth;
    }
    if (this.assists.stability && this.slipAmount > 0.12 && driveDemand > 0) driveDemand *= clamp(1 - this.slipAmount * 0.72, 0.32, 1);
    if (this.assists.braking && this.slipAmount > 0.55) serviceBrake *= 1 - (this.slipAmount - 0.55) * 0.35;
    const driveShare = drivenAxleShares(this.profile.drive, this.profile.torqueSplitFront ?? this.profile.frontWeightFraction);
    const brakeBias = clamp(this.profile.brakeBiasFront + this.tuning.brakeBias * 0.08, 0.45, 0.78);
    const handbrakeForce = -Math.sign(u) * input.handbrake * 5200 * clamp(Math.abs(u) / 1.5, 0, 1);
    const longitudinalDemand = {
      front: driveDemand * driveShare.front + serviceBrake * brakeBias,
      rear: driveDemand * driveShare.rear + serviceBrake * (1 - brakeBias) + handbrakeForce
    };
    const capacity = {
      front: muFront * frontLoad * (staticLoads.front / frontLoad) ** 0.08 * groundGrip,
      rear: muRear * rearLoad * (staticLoads.rear / rearLoad) ** 0.08 * groundGrip
    };
    const tyreForces = combinedTyreForces(
      { front: lateralDemandFront, rear: lateralDemandRear },
      longitudinalDemand,
      capacity
    );
    this.axleLoads = { ...loads };
    this.tyreForces = {
      frontLongitudinal: tyreForces.longitudinal.front,
      rearLongitudinal: tyreForces.longitudinal.rear,
      frontLateral: tyreForces.lateral.front,
      rearLateral: tyreForces.lateral.rear
    };
    const forceFront = tyreForces.lateral.front;
    const forceRear = tyreForces.lateral.rear;
    const tyreLongitudinal = tyreForces.longitudinal.front + tyreForces.longitudinal.rear;
    const drag = -this.profile.dragCoefficient * u * Math.abs(u);
    const traction = this.grounded ? 1 : 0.015;
    const rolling = -Math.sign(u) * surfaceData.rollingResistance * clamp(Math.abs(u) / 1.5, 0, 1) * traction;
    const gradeForce = this.grounded ? -mass * GRAVITY * road.grade : 0;
    const longitudinalForce = tyreLongitudinal + drag + rolling + gradeForce;
    const lateralForce = forceFront * Math.cos(steerAngle) + forceRear;
    let yawTorque = frontAxle * forceFront * Math.cos(steerAngle) - rearAxle * forceRear;
    yawTorque -= this.yawRate * this.profile.yawInertiaKgM2 * 0.38;
    if (this.assists.stability && Math.abs(this.slipAngle) > 0.12) {
      const desiredYawRate = clamp(u / this.profile.wheelbaseM * Math.tan(steerAngle), -2.2, 2.2);
      yawTorque -= (this.yawRate - desiredYawRate) * this.profile.yawInertiaKgM2 * 1.35;
    }

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
    const roadTexture = (Math.sin(road.s * 0.79) + Math.sin(road.s * 2.17) * 0.35) * surfaceData.roughness * 0.018;
    const groundY = road.y + road.camber * road.lateral + this.profile.rideHeightM * (1 + this.tuning.rideHeight * 0.12) + roadTexture;
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
    this.longitudinalAcceleration = longitudinalForce / mass;
    this.lateralAcceleration = localAy;

    const suspensionSoftness = 1 + this.damage.suspension * 1.5 * this.suspensionResponse.travel;
    const targetRoll = clamp(-localAy * 0.021 * this.suspensionResponse.travel * suspensionSoftness + road.camber, -0.21, 0.21);
    const targetPitch = clamp(-Math.atan(road.grade) + input.brake * 0.038 * this.suspensionResponse.travel * suspensionSoftness - input.throttle * 0.012 * this.suspensionResponse.travel, -0.18, 0.18);
    this.roll = this.springAngle(this.roll, targetRoll, 'rollVelocity', 9 * this.suspensionResponse.spring / suspensionSoftness, 6.5 * this.suspensionResponse.damping, dt);
    this.pitch = this.springAngle(this.pitch, targetPitch, 'pitchVelocity', 10 * this.suspensionResponse.spring / suspensionSoftness, 7 * this.suspensionResponse.damping, dt);

    this.updateRecovery(road, onRoad, previousProgress, dt);
    return { road, onRoad, collisionImpulse: this.collisionImpulse };
  }

  springAngle(value, target, velocityKey, stiffness, damping, dt) {
    this[velocityKey] += ((target - value) * stiffness * stiffness - this[velocityKey] * damping) * dt;
    return value + this[velocityKey] * dt;
  }

  tyreSurfaceScale(tyreId, surfaceId) {
    if (tyreId === 'tarmac') return surfaceId === 'tarmac' ? 1.08 : 0.86;
    if (tyreId === 'wet') return this.weather.roadWetness > 0.25 ? 1.07 : 0.94;
    if (tyreId === 'gravel') return surfaceId === 'compact' || surfaceId === 'loose' ? 1.06 : 0.92;
    return 1;
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

    const stranded = road.distance > 65 || (Math.abs(road.lateral) > road.width * 0.5 + 9 && this.speed < 2.2) || (Math.abs(road.lateral) > road.width * 0.5 + 5 && this.speed < 0.45);
    this.recoveryTimer = stranded ? this.recoveryTimer + dt : Math.max(0, this.recoveryTimer - dt * 2);
    this.needsRecovery = this.recoveryTimer > 2.2;
  }
}
