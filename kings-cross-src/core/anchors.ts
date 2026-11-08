// Shared types for berth anchors: where on the OSM track graph a Train Describer berth is.
// Unit 5 (core/berths.ts) produces an AnchorMap; unit 6 (core/motion.ts) consumes one.
// Types only, no logic, so both sides can be built and tested against the same contract.
import type { Pt } from './geo.ts';

/** How an anchor was placed, strongest evidence first. */
export type AnchorKind =
  | 'platform' // berth 1000+N or its partner: platform N's track, at the buffer-stop end
  | 'signal' // an OSM signal whose ref carries the berth number (berth 1004 <-> signal "YA 1004")
  | 'smart' // a SMART row for a location inside the modelled network
  | 'inferred'; // placed from observed step chains between anchored neighbours

/**
 * The stop point of a berth: where the leading end of a train stands while it holds in that
 * berth (at the berth's exit signal, or at the buffer stop on a terminating platform).
 * It lies on the graph edge between OSM nodes `from` and `to`, a fraction `t` from `from`
 * (0..1), and a train holding there is heading toward `to`.
 */
export interface BerthAnchor {
  /** TD berth id exactly as on the wire, e.g. "1004", "B004", "2034". */
  berth: string;
  kind: AnchorKind;
  from: number;
  to: number;
  t: number;
  /** The same point in the local metric frame (x east, z south). */
  point: Pt;
  /** Estimated position error, metres: about 5 for a signal match, more for an inference. */
  errorM: number;
  /** Platform ref ("0".."10") when the berth is a platform berth. */
  platform?: string;
  /** Human-readable evidence, e.g. 'OSM signal "YA 1004" (node 123), snapped 1.2 m'. */
  evidence: string;
}

export type UnmappedReason =
  | 'outside-network' // the berth is on track the model does not cover (Moorgate branch, Hornsey...)
  | 'no-evidence' // seen, but nothing places it on the graph
  | 'conflict'; // evidence disagrees beyond tolerance; detail says how

export interface UnmappedBerth {
  berth: string;
  reason: UnmappedReason;
  detail: string;
  /** Step events in the recording(s) that touched this berth. */
  seen: number;
}

export interface AnchorMap {
  /** TD area, "Y9" for King's Cross. */
  area: string;
  /** What it was built from: recording file names, SMART file date, OSM data attribution. */
  sources: string[];
  anchors: BerthAnchor[];
  unmapped: UnmappedBerth[];
}

/** A train description that is never a train: it hops between platform berths (seen in Y9). */
export const NOT_A_TRAIN = '****';
