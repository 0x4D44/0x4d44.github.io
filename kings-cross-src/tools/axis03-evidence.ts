// Axis 03 train dimensions: measured from the built Three.js coach meshes, then compared with
// the model figures and cited external figures. This never opens a WebGL context.
//
// node kings-cross-src/tools/axis03-evidence.ts \
//   --motion-report .scratch/round20-motion/axis05-evidence.json --out .scratch/round20-trains
// With a motion report and no explicit recording/anchor flags, use its exact frozen input copies.

import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import type { AnchorMap } from '../core/anchors.ts';
import {
  ALL_KINDS, DRIVING, EMU_FIGURES, FIGURES, TRAIN_SPECS, roofHeight, trainLayout,
} from '../core/train.ts';
import type { Family, Figure, TrainKind } from '../core/train.ts';
import * as trainFigures from '../core/train.ts';
import { buildTrain } from '../web/src/train.ts';

const WORKTREE = fileURLToPath(new URL('../../', import.meta.url));
const KX_DATA = '/Users/md/kx-data';
const DEFAULT_RECORDINGS = [
  `${KX_DATA}/recordings/td-Y9-20261107.ndjson`,
  `${KX_DATA}/recordings/td-Y9-20261108.ndjson`,
];
const BODY_MESH_NAMES = new Set(['body-shell', 'body-detail', 'livery-decals', 'cab-glass']);
const roundMm = (value: number): number => Math.round(value * 1000) / 1000;

// Prefer the train iterator's class-specific Figure once exported. On d077b080 it is absent:
// use Eversholt's published Class 802 table, https://eversholtrail.co.uk/fleet/class-802/
// (reviewed 2026-11-09): DPTS & DPTF 25.7 m; MS-TS-MF 26 m. This GWR source does not
// define coupling endpoints or publish a separate Hull 802/3 cab drawing. Keep that limit visible.
const exportedHullDrivingCar = (trainFigures as typeof trainFigures & { HULL_802_DRIVING_CAR?: Figure }).HULL_802_DRIVING_CAR;
const HULL_802_DRIVING_CAR: Figure = exportedHullDrivingCar ?? {
  value: 25.7, unit: 'm', basis: 'published',
  source: 'Eversholt Rail, Class 802 fleet dimensions, https://eversholtrail.co.uk/fleet/class-802/ (reviewed 2026-11-09): DPTS & DPTF 25.7 m; GWR fleet, coupling endpoints unspecified.',
};

export interface InputFingerprint {
  path: string;
  sha256: string;
  bytes: number;
}

export interface SourceCitation {
  label: string;
  url: string;
  basis: 'published' | 'drawn' | 'assumed';
  note?: string;
}

export interface PublishedValue {
  valueM: number;
  basis: 'published';
  sources: SourceCitation[];
  note?: string;
}

export interface ExpectedDimension {
  modelSpec: {
    valueM: number;
    basis: string;
    source: string;
    sourceFile: string;
    sources: SourceCitation[];
  };
  published: {
    status: 'reported' | 'source-conflict' | 'not-published';
    values: PublishedValue[];
    note?: string;
  };
}

export interface MeasuredCar {
  index: number;
  type: string;
  model: {
    vehicleLengthM: number;
    bodyWidthM: number;
    bodyRoofHeightAboveRailM: number;
  };
  geometry: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    lengthM: number;
    widthM: number;
    envelopeHeightM: number;
    heightAboveRailM: number;
  };
  expected: {
    lengthM: ExpectedDimension;
    widthM: ExpectedDimension;
    heightAboveRailM: ExpectedDimension;
  };
  geometryMinusModelSpecM: {
    lengthM: number;
    widthM: number;
    heightAboveRailM: number;
  };
}

export interface Axis03Report {
  schemaVersion: 1;
  method: {
    independentVerification: false;
    geometry: string;
    coordinateAxes: { length: 'z'; width: 'x'; height: 'y above rail head' };
    includedMeshes: string[];
    excludedMeshes: string[];
    excludedGroups: string[];
    comparisonMeaning: string;
    motionKinds: string;
  };
  inputs: {
    anchors: InputFingerprint & { area: string; anchorCount: number; sources: string[] };
    recordings: InputFingerprint[];
    motionReport?: InputFingerprint;
  };
  kinds: {
    kind: TrainKind;
    family: Family;
    classes: string;
    operator: string;
    cars: MeasuredCar[];
  }[];
  drawnKinds: {
    available: boolean;
    sourceReport?: string;
    lengthPolicy?: string;
    note: string;
    recordings: {
      path: string;
      sha256: string;
      trainCount: number;
      countsByKind: { kind: TrainKind; births: number }[];
      trains: { id: number; description: string; kind: TrainKind; lengthM: number; firstSeenSeconds: number }[];
    }[];
  };
}

export interface RecordingFingerprint extends InputFingerprint {}
export interface MotionReportFile extends InputFingerprint { content: unknown }

const citation = (label: string, url: string, basis: SourceCitation['basis'] = 'published'): SourceCitation => ({ label, url, basis });
const URLS = {
  hitachi2014: 'https://www.hitachi.com/content/dam/hitachi/global/en/insights/media/hitachihyoron/2014/r2014_10/r2014_10_105.pdf',
  wiki800: 'https://en.wikipedia.org/wiki/British_Rail_Class_800',
  wiki801: 'https://en.wikipedia.org/wiki/British_Rail_Class_801',
  wiki802: 'https://en.wikipedia.org/wiki/British_Rail_Class_802',
  wiki803: 'https://en.wikipedia.org/wiki/British_Rail_Class_803',
  angel802: 'https://angeltrains.co.uk/fleet/class-802/',
  eversholt802: 'https://eversholtrail.co.uk/fleet/class-802/',
  lumoBody: 'https://www.lumo.co.uk/who-we-are/lumonews/lumo-train-now-available-from-hornby',
  beacon803: 'https://beaconrail.com/en/fleet-item/cl-803/',
  wiki387: 'https://en.wikipedia.org/wiki/British_Rail_Class_387',
  wiki717: 'https://en.wikipedia.org/wiki/British_Rail_Class_717',
  wiki700: 'https://en.wikipedia.org/wiki/British_Rail_Class_700',
  wiki180: 'https://en.wikipedia.org/wiki/British_Rail_Class_180',
  angel180: 'https://angeltrains.co.uk/fleet/class-180/',
  siemens700: 'https://news.siemens.co.uk/resources/desiro-city-datasheet-high-res',
  gb800: 'https://gbtrains.uk/stock/800/',
} as const;

const CLASS_CITATIONS = {
  hitachi2014: citation('Hitachi Review 63(10), p. 647 Fig. 2: body lengths and inter-car gaps', URLS.hitachi2014),
  wiki800: citation('Wikipedia, British Rail Class 800', URLS.wiki800),
  wiki801: citation('Wikipedia, British Rail Class 801', URLS.wiki801),
  wiki802: citation('Wikipedia, British Rail Class 802', URLS.wiki802),
  wiki803: citation('Wikipedia, British Rail Class 803', URLS.wiki803),
  angel802: citation('Angel Trains, Class 802 fleet page', URLS.angel802),
  eversholt802: citation('Eversholt Rail, GWR Class 802 fleet page', URLS.eversholt802),
  lumoBody: citation('Lumo, shared A-train bodyshell statement (27 May 2025)', URLS.lumoBody),
  beacon803: citation('Beacon Rail, Class 803 fleet page', URLS.beacon803),
  wiki387: citation('Wikipedia, British Rail Class 387', URLS.wiki387),
  wiki717: citation('Wikipedia, British Rail Class 717', URLS.wiki717),
  wiki700: citation('Wikipedia, British Rail Class 700', URLS.wiki700),
  wiki180: citation('Wikipedia, British Rail Class 180', URLS.wiki180),
  angel180: citation('Angel Trains, Class 180 fleet page', URLS.angel180),
  siemens700: citation('Siemens, Desiro City electrical multiple unit for Thameslink datasheet', URLS.siemens700),
  gb800: citation('GB Trains, Class 800 drawing and dimensions', URLS.gb800, 'drawn'),
};

function lengthFigure(family: Family, type: string): Figure {
  if (family === 'at300') return DRIVING.has(type as never) ? FIGURES.drivingCarLength : FIGURES.intermediateCarLength;
  const figure = EMU_FIGURES[family as keyof typeof EMU_FIGURES];
  return DRIVING.has(type as never) && figure.drivingCarLength ? figure.drivingCarLength : figure.carLength;
}

function modelFigures(family: Family, type: string, kind: TrainKind): { length: Figure; width: Figure; height: { value: number; basis: string; source: string } } {
  if (family === 'at300') {
    return {
      length: kind === 'lumo5' ? { ...lengthFigure(family, type), basis: 'assumed', source: TRAIN_SPECS.lumo5.source } : kind === 'hull5' && DRIVING.has(type as never) ? HULL_802_DRIVING_CAR : lengthFigure(family, type),
      width: kind === 'lumo5' ? { ...FIGURES.bodyWidth, basis: 'assumed', source: TRAIN_SPECS.lumo5.source } : FIGURES.bodyWidth,
      height: {
        value: roofHeight(),
        basis: 'assumed + drawn',
        source: `Top of roof covers: FIGURES.roofEdgeHeight (${FIGURES.roofEdgeHeight.value} m, ${FIGURES.roofEdgeHeight.basis}) + FIGURES.roofCoverHeight (${FIGURES.roofCoverHeight.value} m, ${FIGURES.roofCoverHeight.basis}). ${FIGURES.roofEdgeHeight.source}`,
      },
    };
  }
  const figures = EMU_FIGURES[family as keyof typeof EMU_FIGURES];
  return {
    length: lengthFigure(family, type),
    width: figures.bodyWidth,
    height: { value: figures.height.value, basis: figures.height.basis, source: figures.height.source },
  };
}

function expectedDimension(
  model: { value: number; basis: string; source: string },
  published: PublishedValue[],
  modelSources: SourceCitation[],
  note?: string,
  sourceFile = 'kings-cross-src/core/train.ts',
): ExpectedDimension {
  const distinct = new Set(published.map((item) => item.valueM));
  return {
    modelSpec: { valueM: model.value, basis: model.basis, source: model.source, sourceFile, sources: modelSources },
    published: {
      status: published.length === 0 ? 'not-published' : distinct.size > 1 ? 'source-conflict' : 'reported',
      values: published,
      ...(note ? { note } : {}),
    },
  };
}

function modelDimensionSources(kind: TrainKind, dimension: 'length' | 'width' | 'height'): SourceCitation[] {
  if (kind === 'lner5' || kind === 'lner9' || kind === 'hull5' || kind === 'lumo5') {
    if (dimension === 'height') return [
      { ...CLASS_CITATIONS.gb800, note: 'Drawn reference reports 3.62 m but says its Hitachi attribution is undefined; the model roof-edge input remains assumed.' },
    ];
    if (kind === 'lumo5') return [
      { ...CLASS_CITATIONS.lumoBody, note: 'Qualitative shared-bodyshell evidence only; it publishes no numerical Class 803 dimension. The numerical transfer remains assumed.' },
      { ...CLASS_CITATIONS.beacon803, note: 'Owner publishes bogie dimensions, not overall car length, width or height.' },
    ];
    if (kind === 'hull5') return dimension === 'width' ? [CLASS_CITATIONS.angel802] : [
      { ...CLASS_CITATIONS.eversholt802, note: 'Published Class 802 DPTS/DPTF and intermediate lengths; GWR fleet, coupling endpoints unspecified.' },
    ];
    return dimension === 'length' ? [CLASS_CITATIONS.hitachi2014, CLASS_CITATIONS.wiki800, CLASS_CITATIONS.wiki801] : [CLASS_CITATIONS.wiki800, CLASS_CITATIONS.wiki801];
  }
  if (kind.startsWith('gn387')) return [CLASS_CITATIONS.wiki387];
  if (kind === 'gn717x6') return dimension === 'height'
    ? [{ ...CLASS_CITATIONS.wiki387, note: 'The model reuses the Class 387 published height as an assumed Class 717 height.' }]
    : [CLASS_CITATIONS.wiki717];
  if (kind === 'tl700x8' || kind === 'tl700x12') return dimension === 'height'
    ? [{ ...CLASS_CITATIONS.wiki387, note: 'The model reuses the Class 387 published height as an assumed Class 700 height.' }]
    : [CLASS_CITATIONS.wiki700, CLASS_CITATIONS.siemens700];
  if (kind === 'gc180x5') return dimension === 'height'
    ? [{ ...CLASS_CITATIONS.wiki387, note: 'Reference only: the Class 180 model height is assumed, not a published Class 180 figure.' }]
    : [CLASS_CITATIONS.wiki180, CLASS_CITATIONS.angel180];
  throw new Error(`no model source mapping for ${kind}`);
}

const noFigure = (note: string): PublishedValue[] => {
  void note;
  return [];
};

function publishedDimensions(kind: TrainKind, type: string): {
  length: { values: PublishedValue[]; note?: string };
  width: { values: PublishedValue[]; note?: string };
  height: { values: PublishedValue[]; note?: string };
} {
  if (kind === 'lner5' || kind === 'lner9') {
    const sources = [CLASS_CITATIONS.wiki800, CLASS_CITATIONS.wiki801];
    return {
      length: { values: [{ valueM: DRIVING.has(type as never) ? 25.85 : 26, basis: 'published', sources: [CLASS_CITATIONS.hitachi2014, ...sources], note: 'Allocated pitch from Fig. 2: cab body 25.350 m + half the 1.000 m gap; intermediate body 25.000 m + a whole gap. These are not separately printed body lengths.' }] },
      width: { values: [{ valueM: 2.7, basis: 'published', sources }] },
      height: { values: noFigure('Class 800/801 pages do not give an overall height.') , note: 'No published overall body/roof height was found for these classes.' },
    };
  }
  if (kind === 'hull5') {
    const drive = DRIVING.has(type as never);
    return {
      length: {
        values: [{ valueM: drive ? HULL_802_DRIVING_CAR.value : 26, basis: 'published', sources: [CLASS_CITATIONS.eversholt802, CLASS_CITATIONS.wiki802], ...(drive ? { note: 'Eversholt publishes 25.7 m for its GWR Class 802 DPTS/DPTF; coupling endpoints are unspecified, and no Hull 802/3-specific cab drawing is supplied.' } : {}) }],
        note: drive ? 'Use the published Class 802 driving-car figure, not the Class 800/801 allocated pitch. Eversholt does not define coupling endpoints; Hull fleet owner Angel Trains gives nominal 26 m only. The actual layout and measured mesh remain separately reported, including any difference while the train module awaits its class-specific figure.' : undefined,
      },
      width: { values: [{ valueM: 2.7, basis: 'published', sources: [CLASS_CITATIONS.angel802] }] },
      height: { values: noFigure('Class 802 sources do not give an overall height.'), note: 'No published overall body/roof height was found for Class 802.' },
    };
  }
  if (kind === 'lumo5') {
    return {
      length: { values: noFigure('The Class 803 page gives formation but no per-car length; model reuses Class 800/801 figures.') , note: 'No numerical Class 803 per-car length was found in the reviewed primary sources (Lumo, Beacon Rail and ORR). Lumo confirms a shared earlier UK A-train bodyshell; the 800/801 numerical transfer remains assumed.' },
      width: { values: noFigure('The Class 803 page gives no body width; model reuses Class 800/801 width.') , note: 'No numerical Class 803 width was found in the reviewed primary sources. Lumo’s shared-bodyshell statement supports the relationship, not an independently published 2.7 m dimension; the transfer remains assumed.' },
      height: { values: noFigure('The Class 803 page gives no overall height.') , note: 'No published overall body/roof height was found for Class 803.' },
    };
  }
  if (kind.startsWith('gn387')) {
    return {
      length: { values: [{ valueM: 20.39, basis: 'published', sources: [CLASS_CITATIONS.wiki387] }] },
      width: { values: [{ valueM: 2.8, basis: 'published', sources: [CLASS_CITATIONS.wiki387] }] },
      height: { values: [{ valueM: 3.77, basis: 'published', sources: [CLASS_CITATIONS.wiki387] }] },
    };
  }
  if (kind === 'gn717x6') {
    return {
      length: { values: [{ valueM: 20.2, basis: 'published', sources: [CLASS_CITATIONS.wiki717], note: 'The published car length is rounded to 0.1 m; the model divides Siemens’ 121.674 m unit length into six equal cars.' }] },
      width: { values: [{ valueM: 2.8, basis: 'published', sources: [CLASS_CITATIONS.wiki717] }] },
      height: { values: noFigure('The Class 717 page and Siemens datasheet do not give an overall height.'), note: 'No published overall body/roof height was found for Class 717.' },
    };
  }
  if (kind === 'tl700x8' || kind === 'tl700x12') {
    return {
      length: { values: [{ valueM: 20.2, basis: 'published', sources: [CLASS_CITATIONS.wiki700, CLASS_CITATIONS.siemens700], note: 'Wikipedia gives a generic 20.2 m car length; Siemens gives 8-car and 12-car unit lengths, not type-specific car lengths. The model’s 20.55/20.15 m split is inferred from those unit totals.' }], note: 'Class 700 model per-car split is assumed from published unit lengths; it is not a published per-car split.' },
      width: { values: [{ valueM: 2.8, basis: 'published', sources: [CLASS_CITATIONS.wiki700, CLASS_CITATIONS.siemens700] }] },
      height: { values: noFigure('The Class 700 page and Siemens datasheet do not give an overall height.'), note: 'No published overall body/roof height was found for Class 700.' },
    };
  }
  if (kind === 'gc180x5') {
    if (DRIVING.has(type as never)) {
      return {
        length: { values: [{ valueM: 23.71, basis: 'published', sources: [CLASS_CITATIONS.angel180, CLASS_CITATIONS.wiki180] }] },
        width: { values: [{ valueM: 2.73, basis: 'published', sources: [CLASS_CITATIONS.angel180, CLASS_CITATIONS.wiki180] }] },
        height: { values: noFigure('Class 180 Wikipedia and Angel Trains pages do not give an overall height.'), note: 'No published overall body/roof height was found for Class 180.' },
      };
    }
    return {
      length: { values: [
        { valueM: 23.02, basis: 'published', sources: [CLASS_CITATIONS.angel180], note: 'Fleet owner’s type-specific figure, selected for the model.' },
        { valueM: 23.03, basis: 'published', sources: [CLASS_CITATIONS.wiki180], note: 'Secondary figure, superseded for the model by the fleet owner.' },
      ], note: 'Prefer Angel Trains’ 23.02 m intermediate vehicles. Calculated from Angel Trains’ published formation and rounded car dimensions: 2×23.71 + 3×23.02 = 116.48 m (not a published whole-unit length), 0.04 m below the secondary whole-unit 116.52 m; no artificial length adjustment.' },
      width: { values: [{ valueM: 2.73, basis: 'published', sources: [CLASS_CITATIONS.angel180, CLASS_CITATIONS.wiki180] }] },
      height: { values: noFigure('Class 180 Wikipedia and Angel Trains pages do not give an overall height.'), note: 'No published overall body/roof height was found for Class 180.' },
    };
  }
  throw new Error(`no published dimension mapping for ${kind}`);
}

/** Measure the actual body/roof meshes in car-local metres, excluding separate running gear and pantographs. */
export function measureCarEnvelope(carGroup: THREE.Object3D, includedMeshNames: ReadonlySet<string> = BODY_MESH_NAMES): MeasuredCar['geometry'] {
  carGroup.updateWorldMatrix(true, true);
  const toCar = carGroup.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const world = new THREE.Vector3();
  carGroup.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !includedMeshNames.has(node.name)) return;
    const positions = node.geometry.getAttribute('position');
    if (!positions) return;
    node.updateWorldMatrix(true, false);
    for (let i = 0; i < positions.count; i++) {
      world.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).applyMatrix4(toCar);
      box.expandByPoint(world);
    }
  });
  if (box.isEmpty()) throw new Error(`${carGroup.name || 'car'} has no measurable body mesh`);
  const lengthM = box.max.z - box.min.z;
  const widthM = box.max.x - box.min.x;
  const envelopeHeightM = box.max.y - box.min.y;
  return {
    minX: roundMm(box.min.x), maxX: roundMm(box.max.x), minY: roundMm(box.min.y), maxY: roundMm(box.max.y),
    minZ: roundMm(box.min.z), maxZ: roundMm(box.max.z), lengthM: roundMm(lengthM), widthM: roundMm(widthM),
    envelopeHeightM: roundMm(envelopeHeightM), heightAboveRailM: roundMm(box.max.y),
  };
}

function measureKinds(): Axis03Report['kinds'] {
  return ALL_KINDS.map((kind) => {
    const spec = TRAIN_SPECS[kind];
    const layout = trainLayout(kind);
    const group = buildTrain(kind);
    group.updateMatrixWorld(true);
    const cars: MeasuredCar[] = layout.cars.map((car) => {
      const carGroup = group.getObjectByName(`car-${car.index}`);
      if (!carGroup) throw new Error(`${kind} car ${car.index} is missing from buildTrain()`);
      const geometry = measureCarEnvelope(carGroup);
      const figures = modelFigures(spec.family, car.type, kind);
      const published = publishedDimensions(kind, car.type);
      const lengthSourceFile = kind === 'hull5' && DRIVING.has(car.type) && !exportedHullDrivingCar
        ? 'kings-cross-src/tools/axis03-evidence.ts' : 'kings-cross-src/core/train.ts';
      const lengthM = expectedDimension(figures.length, published.length.values, modelDimensionSources(kind, 'length'), published.length.note, lengthSourceFile);
      const widthM = expectedDimension(figures.width, published.width.values, modelDimensionSources(kind, 'width'), published.width.note);
      const heightAboveRailM = expectedDimension(figures.height, published.height.values, modelDimensionSources(kind, 'height'), published.height.note);
      return {
        index: car.index,
        type: car.type,
        model: {
          vehicleLengthM: car.length,
          bodyWidthM: figures.width.value,
          bodyRoofHeightAboveRailM: figures.height.value,
        },
        geometry,
        expected: { lengthM, widthM, heightAboveRailM },
        geometryMinusModelSpecM: {
          lengthM: roundMm(geometry.lengthM - figures.length.value),
          widthM: roundMm(geometry.widthM - figures.width.value),
          heightAboveRailM: roundMm(geometry.heightAboveRailM - figures.height.value),
        },
      };
    });
    group.traverse((node) => {
      if (node instanceof THREE.Mesh) node.geometry.dispose();
    });
    return { kind, family: spec.family, classes: spec.classes, operator: spec.operator, cars };
  });
}

function validAnchorMap(value: unknown): AnchorMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('anchors input must be a JSON object');
  const candidate = value as Partial<AnchorMap>;
  if (candidate.area !== 'Y9' || !Array.isArray(candidate.anchors) || !Array.isArray(candidate.sources)) throw new Error('anchors input must be a Y9 anchor map with anchors and sources arrays');
  return candidate as AnchorMap;
}

function reportObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('motion report must be a JSON object');
  return value as Record<string, unknown>;
}

/** Prefer the exact frozen inputs linked by Axis 05; live source recordings may continue growing. */
export function motionReportInputPaths(value: unknown): { anchors: string; recordings: string[] } {
  const report = reportObject(value);
  const hashes = motionInputHashes(report);
  const anchors = hashes.anchors;
  const anchorPath = anchors && (typeof anchors.capturedPath === 'string' ? anchors.capturedPath : anchors.path);
  if (typeof anchorPath !== 'string') throw new Error('motion report does not identify its frozen anchors input');
  if (!Array.isArray(report.recordings) || report.recordings.length < 2) throw new Error('motion report must identify both frozen recording inputs');
  const recordings = report.recordings.map((itemValue, index) => {
    const item = reportObject(itemValue);
    const input = reportObject(item.input);
    const path = typeof input.capturedPath === 'string' ? input.capturedPath : input.path;
    if (typeof path !== 'string') throw new Error(`motion report does not identify frozen recording ${index + 1}`);
    return path;
  });
  return { anchors: anchorPath, recordings };
}

function motionInputHashes(report: Record<string, unknown>): { recordings?: unknown[]; anchors?: Record<string, unknown> } {
  const reproducibility = report.reproducibility;
  if (!reproducibility || typeof reproducibility !== 'object' || Array.isArray(reproducibility)) return {};
  const inputHashes = (reproducibility as Record<string, unknown>).inputHashes;
  if (!inputHashes || typeof inputHashes !== 'object' || Array.isArray(inputHashes)) return {};
  const hashes = inputHashes as Record<string, unknown>;
  const anchors = hashes.anchors && typeof hashes.anchors === 'object' && !Array.isArray(hashes.anchors) ? hashes.anchors as Record<string, unknown> : undefined;
  return { recordings: Array.isArray(hashes.recordings) ? hashes.recordings : undefined, anchors };
}

function drawnKindsFromMotionReport(
  report: Record<string, unknown>,
  motionReportPath: string,
  motionReportSha256: string,
  anchorSha256: string,
  recordings: readonly RecordingFingerprint[],
): Axis03Report['drawnKinds'] {
  const recorded = report.recordings;
  if (!Array.isArray(recorded) || recorded.length !== recordings.length) throw new Error('motion report recording count does not match the supplied recordings');
  const inputHashes = motionInputHashes(report);
  if (inputHashes.anchors?.sha256 && inputHashes.anchors.sha256 !== anchorSha256) throw new Error('motion report anchor hash does not match the supplied anchors');
  if (inputHashes.recordings && inputHashes.recordings.length !== recordings.length) throw new Error('motion report input recording hashes do not match the supplied recordings');

  const byKind = new Map<TrainKind, number>();
  for (const kind of ALL_KINDS) byKind.set(kind, 0);
  const outputRecordings: Axis03Report['drawnKinds']['recordings'] = [];
  for (const [index, itemValue] of recorded.entries()) {
    const item = reportObject(itemValue);
    const input = reportObject(item.input);
    const expected = recordings[index];
    if (input.sha256 !== expected!.sha256) throw new Error(`motion report recording ${index + 1} hash does not match the supplied recording`);
    const audit = reportObject(item.audit);
    if (!Array.isArray(audit.trains)) throw new Error(`motion report recording ${index + 1} has no audit.trains array`);
    const trains: Axis03Report['drawnKinds']['recordings'][number]['trains'] = [];
    const counts = new Map<TrainKind, number>(ALL_KINDS.map((kind) => [kind, 0]));
    for (const trainValue of audit.trains) {
      const train = reportObject(trainValue);
      const kind = train.kind;
      if (typeof train.id !== 'number' || !Number.isInteger(train.id) || typeof train.description !== 'string' || typeof train.lengthM !== 'number' || typeof train.firstSeenSeconds !== 'number' || typeof kind !== 'string' || !ALL_KINDS.includes(kind as TrainKind)) {
        throw new Error(`motion report recording ${index + 1} has an invalid birth-kind row`);
      }
      const trainKind = kind as TrainKind;
      counts.set(trainKind, counts.get(trainKind)! + 1);
      byKind.set(trainKind, byKind.get(trainKind)! + 1);
      trains.push({ id: train.id, description: train.description, kind: trainKind, lengthM: train.lengthM, firstSeenSeconds: train.firstSeenSeconds });
    }
    outputRecordings.push({
      path: expected!.path,
      sha256: expected!.sha256,
      trainCount: trains.length,
      countsByKind: ALL_KINDS.map((kind) => ({ kind, births: counts.get(kind)! })),
      trains,
    });
  }
  const lengthPolicy = typeof report.lengthPolicy === 'string' ? report.lengthPolicy : undefined;
  return {
    available: true,
    sourceReport: `${motionReportPath} (sha256 ${motionReportSha256})`,
    ...(lengthPolicy ? { lengthPolicy } : {}),
    note: `Kinds are copied from the motion report's physical-train birth records, which use the page's createTrainKinds resolver. This command does not replay or re-resolve them. ${lengthPolicy ?? 'Inspect the source report length policy to see whether timetable matching was available.'}`,
    recordings: outputRecordings,
  };
}

export function createAxis03Report(args: {
  anchors: AnchorMap;
  anchorFingerprint: InputFingerprint;
  recordings: readonly RecordingFingerprint[];
  motion?: MotionReportFile;
}): Axis03Report {
  const anchors = validAnchorMap(args.anchors);
  if (args.recordings.length < 2) throw new Error('axis03 evidence requires both recordings (at least two --recording inputs)');
  const reportObjectValue = args.motion ? reportObject(args.motion.content) : undefined;
  const drawnKinds = args.motion
    ? drawnKindsFromMotionReport(reportObjectValue!, args.motion.path, args.motion.sha256, args.anchorFingerprint.sha256, args.recordings)
    : {
      available: false,
      note: 'No motion report was supplied; no kinds are claimed as drawn in recording motion.',
      recordings: [],
    };
  const motionInputPolicy = args.motion && typeof reportObjectValue!.lengthPolicy === 'string'
    ? reportObjectValue!.lengthPolicy as string
    : args.motion ? 'See motion report for the resolver policy.' : 'No motion report supplied.';
  return {
    schemaVersion: 1,
    method: {
      independentVerification: false,
      geometry: 'For each car group from buildTrain(kind), take the axis-aligned bounding box of vertices in body-shell, body-detail, livery-decals and cab-glass meshes. body-detail contains the body panels, cab nose, roof, roof covers, skirt, underfloor blocks and merged end-connection details.',
      coordinateAxes: { length: 'z', width: 'x', height: 'y above rail head' },
      includedMeshes: [...BODY_MESH_NAMES],
      excludedMeshes: ['pantograph-mesh', 'bogie-mesh'],
      excludedGroups: ['pantograph', 'bogie-<car>-<axle> (including wheel markers and both LOD meshes)'],
      comparisonMeaning: 'Geometry is measured from built meshes; model.vehicleLengthM comes from the actual trainLayout. modelSpec lists the core dimensions except for the published Hull Class 802 driving-car reference if its core export is not yet available (sourceFile identifies the fallback). Geometry-to-spec deltas are not independent verification; a pending Hull geometry update remains visible as a delta. Published values are separate source comparisons. HeightAboveRailM is the highest included vertex y, not the vertical thickness of the mesh box.',
      motionKinds: `Copied from the supplied motion report at physical births; no replay or separate kind-resolution loop is run here. Resolver policy: ${motionInputPolicy}`,
    },
    inputs: {
      anchors: { ...args.anchorFingerprint, area: anchors.area, anchorCount: anchors.anchors.length, sources: [...anchors.sources] },
      recordings: args.recordings.map((recording) => ({ ...recording })),
      ...(args.motion ? { motionReport: { path: args.motion.path, sha256: args.motion.sha256, bytes: args.motion.bytes } } : {}),
    },
    kinds: measureKinds(),
    drawnKinds,
  };
}

const f = (value: number): string => Number.isFinite(value) ? value.toFixed(3) : '—';
function publishedCell(dimension: ExpectedDimension): string {
  if (!dimension.published.values.length) return `not found${dimension.published.note ? ` (${dimension.published.note})` : ''}`;
  return dimension.published.values.map((entry) => {
    const refs = entry.sources.map((source) => `[${source.label}](${source.url})`).join(', ');
    return `${f(entry.valueM)} m${refs ? ` (${refs})` : ''}${entry.note ? ` — ${entry.note}` : ''}`;
  }).join('<br>');
}

export function renderAxis03Markdown(report: Axis03Report): string {
  const lines = [
    '# Axis 03: train geometry and dimensions',
    '',
    `Measured ${report.kinds.length} train kinds and ${report.kinds.reduce((n, kind) => n + kind.cars.length, 0)} car meshes across all \`ALL_KINDS\` entries. Anchor map: ${report.inputs.anchors.area}, ${report.inputs.anchors.anchorCount} anchors. Recording inputs: ${report.inputs.recordings.length}.`,
    '',
    'The command builds Three.js geometry directly in Node and does not open WebGL or use a GPU. It measures the body/roof mesh envelope in car-local metres: z is length, x is width, and maximum y is height above the rail head. The vertical envelope thickness is also in the JSON.',
    '',
    'Pantograph meshes and all bogie/wheel meshes are excluded from the body/roof envelope. The included `body-detail` mesh also contains nose, roof covers, skirts, underfloor blocks, gangway bellows and coupler geometry; those pieces are not split out in the renderer. The measured length is therefore the car-associated drawn envelope, not a separately isolated bodyshell length.',
    '',
    '**Evidence limit:** built meshes and most model-spec values share the core dimension inputs; their difference is not independent verification. The Hull driving-car spec uses the published Class 802 figure even while an older train module may still draw the Class 800/801 pitch; its actual layout length and mesh delta remain in the JSON, and sourceFile identifies the fallback. The published columns show separate cited class figures. Missing published heights and class-specific transfers stay marked as such.',
    '',
    `Anchors SHA-256: \`${report.inputs.anchors.sha256}\`. Recordings: ${report.inputs.recordings.map((item) => `\`${basename(item.path)}\` (\`${item.sha256.slice(0, 12)}…\`)`).join(', ')}. These recordings are input provenance for the motion-kind join; they are not sources for the static dimensions.`,
    '',
  ];
  for (const kind of report.kinds) {
    lines.push(`## ${kind.kind} — ${kind.family}; ${kind.classes}`, '');
    lines.push('| Car | Type | Measured geometry L × W × H above rail (m) | Model spec L / W / H (m; basis) | Published length / width / height (m; source and basis) |');
    lines.push('|---:|---|---:|---|---|');
    for (const car of kind.cars) {
      const e = car.expected;
      const model = [e.lengthM, e.widthM, e.heightAboveRailM].map((d) => `${f(d.modelSpec.valueM)} (${d.modelSpec.basis})`).join(' / ');
      const pub = [e.lengthM, e.widthM, e.heightAboveRailM].map(publishedCell).join('<br><br>');
      lines.push(`| ${car.index} | ${car.type} | ${f(car.geometry.lengthM)} × ${f(car.geometry.widthM)} × ${f(car.geometry.heightAboveRailM)} | ${model} | ${pub} |`);
    }
    lines.push('');
  }
  lines.push('## Kinds drawn in recording motion at births', '');
  if (!report.drawnKinds.available) {
    lines.push(report.drawnKinds.note, '');
  } else {
    lines.push(`Source: ${report.drawnKinds.sourceReport}. ${report.drawnKinds.note}`, '');
    lines.push('| Recording | Births in motion report | Kind counts |');
    lines.push('|---|---:|---|');
    for (const recording of report.drawnKinds.recordings) {
      const counts = recording.countsByKind.filter((item) => item.births > 0).map((item) => `${item.kind}: ${item.births}`).join(', ') || 'none';
      lines.push(`| ${basename(recording.path)} | ${recording.trainCount} | ${counts} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(args: string[]): { anchors?: string; recordings?: string[]; out: string; motionReport?: string } {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: axis03-evidence.ts [--motion-report <axis05-evidence.json>] [--anchors <anchors.json>] [--recording <ndjson> --recording <ndjson> ...] [--out <.scratch/dir|/Users/md/kx-data/dir>]');
    process.exit(0);
  }
  const values = new Map<string, string[]>();
  const allowed = new Set(['--anchors', '--recording', '--motion-report', '--out']);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!, value = args[i + 1];
    if (!allowed.has(key) || value === undefined || value.startsWith('--') || (key !== '--recording' && values.has(key))) {
      throw new Error('usage: axis03-evidence.ts [--motion-report <axis05-evidence.json>] [--anchors <anchors.json>] [--recording <ndjson> --recording <ndjson> ...] [--out <.scratch/dir|/Users/md/kx-data/dir>]');
    }
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  return {
    ...(values.has('--anchors') ? { anchors: values.get('--anchors')![0] } : {}),
    ...(values.has('--recording') ? { recordings: values.get('--recording') } : {}),
    out: values.get('--out')?.[0] ?? '.scratch/round20-train-dimensions',
    ...(values.has('--motion-report') ? { motionReport: values.get('--motion-report')![0] } : {}),
  };
}

function inside(parent: string, child: string): boolean {
  const r = relative(parent, child);
  return r !== '' && !r.startsWith('..') && !isAbsolute(r);
}

async function fingerprint(path: string): Promise<InputFingerprint> {
  const abs = resolve(WORKTREE, path);
  const bytes = await readFile(abs);
  return { path: abs, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength };
}

async function safeOutputDirectory(path: string): Promise<string> {
  const requested = resolve(WORKTREE, path);
  const roots = [resolve(WORKTREE, '.scratch'), resolve(KX_DATA)];
  const root = roots.find((candidate) => inside(candidate, requested));
  if (!root) throw new Error('--out must be beneath this worktree .scratch or /Users/md/kx-data');
  await mkdir(root, { recursive: true });
  let ancestor = requested;
  for (;;) {
    try {
      const [actualAncestor, actualRoot] = await Promise.all([realpath(ancestor), realpath(root)]);
      if (!inside(actualRoot, actualAncestor) && actualAncestor !== actualRoot) throw new Error('output symlink escapes its allowed root');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      ancestor = dirname(ancestor);
    }
  }
  await mkdir(requested, { recursive: true });
  const [actual, actualRoot] = await Promise.all([realpath(requested), realpath(root)]);
  if (!inside(actualRoot, actual)) throw new Error('output directory resolves outside its allowed root');
  return actual;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const motion = options.motionReport ? {
    ...await fingerprint(options.motionReport),
    content: JSON.parse(await readFile(resolve(WORKTREE, options.motionReport), 'utf8')) as unknown,
  } satisfies MotionReportFile : undefined;
  const frozenPaths = motion ? motionReportInputPaths(motion.content) : undefined;
  const anchorsPath = options.anchors ?? frozenPaths?.anchors ?? `${KX_DATA}/anchors.json`;
  const recordingPaths = options.recordings ?? frozenPaths?.recordings ?? [...DEFAULT_RECORDINGS];
  if (recordingPaths.length < 2) throw new Error('supply both recording files with at least two --recording flags');
  const [anchorsText, anchorFingerprint, ...recordingFingerprints] = await Promise.all([
    readFile(resolve(WORKTREE, anchorsPath), 'utf8'),
    fingerprint(anchorsPath),
    ...recordingPaths.map(fingerprint),
  ]);
  const anchors = validAnchorMap(JSON.parse(anchorsText) as unknown);
  const recordings: RecordingFingerprint[] = recordingFingerprints as RecordingFingerprint[];
  const report = createAxis03Report({ anchors, anchorFingerprint, recordings, ...(motion ? { motion } : {}) });
  const out = await safeOutputDirectory(options.out);
  const jsonPath = resolve(out, 'axis03-evidence.json');
  const markdownPath = resolve(out, 'axis03-evidence.md');
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
    writeFile(markdownPath, renderAxis03Markdown(report), { mode: 0o600 }),
  ]);
  await Promise.all([chmod(jsonPath, 0o600), chmod(markdownPath, 0o600)]);
  console.log(JSON.stringify({ json: jsonPath, markdown: markdownPath, kinds: report.kinds.length, cars: report.kinds.reduce((n, kind) => n + kind.cars.length, 0), drawnKindsAvailable: report.drawnKinds.available }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
