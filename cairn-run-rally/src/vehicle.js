import { clamp, expSmoothing, wrapAngle } from './math.js';
import { CAIRN_R4, SURFACES } from './content.js';
import {
  aeroDownforceN, axleGripCapacity, axleInertiaKg, axleLoads, drivenAxleShares,
  lateralLoadTransfer, relaxTyreState, stepPowertrain, stepWheelSpeed
} from './dynamics.js';
import { nearestStagePoint, sampleStage } from './stage.js';

const GRAVITY = 9.81;
// Slip angle at which an axle reaches peak lateral force. The front axle
// already carries more load, so the rear needs a slightly earlier peak to keep
// the front/rear cornering stiffness ratio the chassis was balanced around —
// give the rear a later peak and the car is an unrecoverable spin machine.
const PEAK_SLIP_ANGLE_REAR_SCALE = 0.91;
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
    this.boggedTimer = 0;
    this.lastLateralDistance = 0;
    this.recoveryCooldown = 0;
    this.needsRecovery = false;
    this.lastSafeDistance = Math.max(12, road.s);
    this.lastSafeTimer = 0;
    this.wheelSpeed = { front: 0, rear: 0 };
    this.chassisSpeedAtLastStep = 0;
    this.slipRatio = { front: 0, rear: 0 };
    this.slipAngleState = { front: 0, rear: 0 };
    this.tyreSigma = { front: 0, rear: 0 };
    this.axleCapacity = { front: 0, rear: 0 };
    this.tyreForces = null;
    this.wheelSpin = 0;
    this.wheelLock = 0;
    this.downforceN = 0;
    this.gear = 1;
    this.rpm = 1500;
    this.shiftPulse = 0;
    this.shiftRemaining = 0;
    if (repair) this.damage = { engine: 0, steering: 0, suspension: 0, brakes: 0, body: 0 };
  }

  recover() {
    this.reset(Math.max(14, this.lastSafeDistance - 10), false);
    this.vx = 0;
    this.vz = 0;
    // Rejoining at racing pace is how one recovery becomes a loop of them: the
    // car is dropped into the corner it just failed, and fails it again.
    this.recoveryCooldown = 4;
    this.damage.body = clamp(this.damage.body + 0.025, 0, this.profile.durability.body);
  }

  /**
   * Wheel speed is simulation state, but the chassis velocity can also be set
   * from outside the simulation — a spawn, a recovery, a test harness placing
   * a car at speed. Rolling wheels are the right answer there; treating the
   * jump as a locked-wheel skid is not.
   */
  syncWheels(longitudinalSpeed = null) {
    const speed = longitudinalSpeed === null
      ? this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw)
      : longitudinalSpeed;
    this.wheelSpeed.front = speed;
    this.wheelSpeed.rear = speed;
    this.slipRatio.front = 0;
    this.slipRatio.rear = 0;
    this.chassisSpeedAtLastStep = speed;
    return speed;
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
    this.recoveryCooldown = Math.max(0, (this.recoveryCooldown || 0) - dt);
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
    // No force in the model can move the chassis this far in one step, so a
    // jump this large came from outside it: roll the wheels with it.
    if (Math.abs(u - this.chassisSpeedAtLastStep) > 2.5) this.syncWheels(u);

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
    // Speed-sensitive steering. Full lock at 140 km/h is not a control, it is a
    // crash: a fifth of the travel was worth about 0.9 g, so nothing between
    // straight and sideways was reachable. The limit is tied to the grip the
    // surface actually has, so a wet stage gives up lock as well as speed.
    const authoredLock = this.profile.steeringLockRad * (1 + this.tuning.steeringRatio * 0.18);
    const gripLimit = Math.max(2.5, baseMu * GRAVITY * 1.15);
    const lockForSpeed = Math.atan(this.profile.wheelbaseM * gripLimit / Math.max(16, speed * speed)) * 2.6 + 0.03;
    const maxSteer = Math.min(authoredLock, Math.max(0.07, lockForSpeed));
    this.steerAuthority = maxSteer / authoredLock;
    this.maxSteerRad = maxSteer;
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
    const lowSpeed = clamp(Math.abs(u) / 2.2, 0, 1);

    const engineHealth = 1 - this.damage.engine * 0.46;
    const brakeHealth = 1 - this.damage.brakes * 0.38;
    const driveShare = drivenAxleShares(this.profile.drive, this.profile.torqueSplitFront ?? this.profile.frontWeightFraction);
    // The engine is geared to the driven wheels, not to the ground: spin the
    // wheels up on gravel and the revs flare even though the car is not.
    const drivenWheelSpeed = driveShare.front * this.wheelSpeed.front + driveShare.rear * this.wheelSpeed.rear;
    const powertrain = stepPowertrain(
      { gear: this.gear, rpm: this.rpm, shiftRemaining: this.shiftRemaining },
      {
        speedMps: drivenWheelSpeed,
        shiftSpeedMps: Math.sign(u || 1) * Math.min(Math.abs(drivenWheelSpeed), Math.abs(u) + 2.5),
        throttle: input.throttle,
        shiftUp: input.shiftUp,
        shiftDown: input.shiftDown
      },
      this.profile,
      dt,
      { automatic: this.assists.automatic }
    );
    this.gear = powertrain.gear;
    this.rpm = powertrain.rpm;
    this.shiftRemaining = powertrain.shiftRemaining;
    if (powertrain.shifted) this.shiftPulse = 1;
    let driveForce = 0;
    let brakeCommand = 0;
    if (u >= -0.5) {
      driveForce = powertrain.driveForceN * engineHealth - Math.sign(u) * powertrain.engineBrakeForceN * engineHealth;
      if (u > 0.4) brakeCommand = input.brake * this.profile.brakeForceN * brakeHealth;
      else if (input.brake > 0.15 && input.throttle < 0.1) driveForce = -input.brake * 3700 * engineHealth;
    } else {
      driveForce = -input.brake * 3700 * engineHealth;
      brakeCommand = input.throttle * this.profile.brakeForceN * brakeHealth;
    }
    const tractionSlip = Math.max(this.slipRatio.front * driveShare.front, this.slipRatio.rear * driveShare.rear);
    if (this.assists.stability && driveForce > 0) {
      const slide = Math.max(this.slipAmount * 0.72, clamp((tractionSlip - 0.16) * 1.6, 0, 1));
      if (slide > 0.09) driveForce *= clamp(1 - slide, 0.32, 1);
    }
    if (this.assists.braking && this.slipAmount > 0.55) brakeCommand *= 1 - (this.slipAmount - 0.55) * 0.35;
    const brakeBias = clamp(this.profile.brakeBiasFront + this.tuning.brakeBias * 0.08, 0.45, 0.78);
    const brakeForce = { front: brakeCommand * brakeBias, rear: brakeCommand * (1 - brakeBias) };
    // The handbrake is a rear brake, not a shove: it locks the rear wheels and
    // the friction circle does the rest of the work.
    brakeForce.rear += input.handbrake * 7200;
    // Downforce and road bank both press the car into the surface.
    const downforce = aeroDownforceN(u, this.profile);
    this.downforceN = downforce;
    const bankAngle = Math.atan(road.camber);
    const normalScale = 1 / Math.max(0.55, Math.cos(bankAngle));
    const axleNormal = {
      front: (frontLoad + downforce * this.profile.frontWeightFraction) * normalScale,
      rear: (rearLoad + downforce * (1 - this.profile.frontWeightFraction)) * normalScale
    };
    const centreHeight = clamp(this.profile.rideHeightM * 0.92 * (1 + this.tuning.rideHeight * 0.1), 0.3, 0.75);
    const frontRollShare = clamp(this.profile.frontWeightFraction * 0.9 + 0.07 + this.tuning.damping * 0.12, 0.3, 0.75);
    const transfer = lateralLoadTransfer(mass, this.lateralAcceleration, this.profile.trackM, centreHeight, frontRollShare);
    const capacity = {
      front: axleGripCapacity(axleNormal.front, transfer.front, muFront, staticLoads.front) * groundGrip,
      rear: axleGripCapacity(axleNormal.rear, transfer.rear, muRear, staticLoads.rear) * groundGrip
    };
    // Loose surfaces reach peak grip much later in the slip ratio than tarmac.
    const peakSlip = clamp(0.09 + surfaceData.roughness * 0.28 + (surfaceData.sink || 0) * 0.3, 0.08, 0.34);
    // A loose surface deforms before the tyre bites, so its force needs a longer
    // roll to build than tarmac does.
    const relaxation = 0.38 + (surfaceData.sink || 0) * 1.4;
    // A loose surface also reaches peak cornering force at a much larger slip
    // angle than tarmac, which is why gravel rewards a sideways line.
    const peakSlipAngle = clamp(0.058 + surfaceData.roughness * 0.22 + (surfaceData.sink || 0) * 0.34, 0.05, 0.24);
    const geometricAlpha = { front: alphaFront, rear: alphaRear };
    const axlePeakAngle = { front: peakSlipAngle, rear: peakSlipAngle * PEAK_SLIP_ANGLE_REAR_SCALE };
    const longitudinal = { front: 0, rear: 0 };
    const lateral = { front: 0, rear: 0 };
    const axleInertia = { front: 0, rear: 0 };
    for (const axle of ['front', 'rear']) {
      const share = driveShare[axle];
      axleInertia[axle] = axleInertiaKg(this.profile, this.gear, share);
      // Relaxation acts on the tyre's own slip angle, not on the force it
      // produces, which is where the lag physically lives.
      this.slipAngleState[axle] = relaxTyreState(this.slipAngleState[axle], geometricAlpha[axle], u, dt, relaxation);
      let axleBrake = brakeForce[axle];
      // Braking help is anti-lock: it modulates the axle whose slip ratio has
      // run past the peak of the curve, which is exactly where a wheel locks.
      if (this.assists.braking && axleBrake > 0) {
        const excess = (-this.slipRatio[axle] - peakSlip) / peakSlip;
        axleBrake *= clamp(1 - excess * 0.85, 0.15, 1);
      }
      const wheel = stepWheelSpeed({
        wheelSpeed: this.wheelSpeed[axle],
        roadSpeed: u,
        slipAngle: this.slipAngleState[axle],
        driveForceN: driveForce * share,
        brakeForceN: axleBrake,
        capacityN: capacity[axle],
        inertiaKg: axleInertia[axle],
        peakSlip,
        peakSlipAngle: axlePeakAngle[axle],
        grounded: this.grounded,
        dt
      });
      this.wheelSpeed[axle] = wheel.wheelSpeed;
      this.slipRatio[axle] = wheel.slipRatio;
      this.tyreSigma[axle] = wheel.sigma;
      this.axleCapacity[axle] = capacity[axle];
      longitudinal[axle] = wheel.force;
      lateral[axle] = wheel.lateral * lowSpeed;
    }
    this.wheelSpin = clamp((drivenWheelSpeed - u) / 6, -1, 1);
    this.wheelLock = clamp((Math.abs(u) - Math.min(Math.abs(this.wheelSpeed.front), Math.abs(this.wheelSpeed.rear))) / 8, 0, 1);
    const tyreForces = { longitudinal, lateral };
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
      // Stability control only ever takes rotation away. The old form also
      // added it when the car was rotating less than the steering asked for,
      // which spun the car by torquing it away from its own velocity.
      const desiredYawRate = clamp(u / this.profile.wheelbaseM * Math.tan(steerAngle), -2.2, 2.2);
      const excess = this.yawRate - desiredYawRate;
      if (excess * this.yawRate > 0) yawTorque -= excess * this.profile.yawInertiaKgM2 * 1.35;
    }

    const localAx = longitudinalForce / mass + v * this.yawRate;
    const localAy = lateralForce / mass - u * this.yawRate;
    const worldAx = forwardX * localAx + rightX * localAy;
    const worldAz = forwardZ * localAx + rightZ * localAy;
    this.vx += worldAx * dt;
    this.vz += worldAz * dt;
    this.yawRate += yawTorque / this.profile.yawInertiaKgM2 * dt;

    if (this.grounded && Math.abs(road.camber) > 1e-4) {
      // Below walking pace the tyres simply hold the car on the camber.
      const bankAccel = -GRAVITY * Math.sin(bankAngle) * clamp((speed - 0.4) / 1.6, 0, 1) * dt;
      const roadRightX = Math.cos(road.heading), roadRightZ = -Math.sin(road.heading);
      this.vx += roadRightX * bankAccel;
      this.vz += roadRightZ * bankAccel;
    }
    if (!onRoad) {
      // Verge drag used to be a flat velocity sink that stood in for a surface
      // model. The surface now carries its own friction and rolling resistance,
      // so this only adds the scrub of ploughing further from the road.
      const scrub = Math.exp(-(0.32 + Math.min(1.1, Math.abs(road.lateral) * 0.02)) * dt);
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
    this.chassisSpeedAtLastStep = u;
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

    // A car that is off the road and no longer making ground is bogged, however
    // close to the edge it stopped. Distance alone used to miss that, and left
    // a car ploughing the verge at walking pace with no way out.
    const offRoad = Math.abs(road.lateral) > road.width * 0.5 + 1.5;
    // Driving back towards the road makes almost no progress along it, so
    // route distance alone would call a car that is rescuing itself bogged.
    const closing = Math.abs(road.lateral) < this.lastLateralDistance - dt * 0.8;
    this.lastLateralDistance = Math.abs(road.lateral);
    this.boggedTimer = offRoad && !closing && this.progress - previousProgress < dt * 2.5
      ? this.boggedTimer + dt
      : Math.max(0, this.boggedTimer - dt * 3);
    // Being off the road is not itself a reason to be teleported back: a car
    // that can still drive should drive itself back. The bogged timer above is
    // what catches the one that cannot.
    const stranded = road.distance > 65
      || (Math.abs(road.lateral) > road.width * 0.5 + 15 && this.speed < 2.2)
      || (Math.abs(road.lateral) > road.width * 0.5 + 7 && this.speed < 0.45)
      || this.boggedTimer > 4;
    this.recoveryTimer = stranded ? this.recoveryTimer + dt : Math.max(0, this.recoveryTimer - dt * 2);
    this.needsRecovery = this.recoveryTimer > 2.2;
  }
}
