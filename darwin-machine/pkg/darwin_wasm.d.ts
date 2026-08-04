/* tslint:disable */
/* eslint-disable */

export class DarwinWorld {
    free(): void;
    [Symbol.dispose](): void;
    applyIntervention(kind: string, value: number): void;
    checksumHex(): string;
    exportCheckpoint(): Uint8Array;
    static fromCheckpoint(bytes: Uint8Array): DarwinWorld;
    gridSnapshot(): Uint8Array;
    inspectJson(cell_index: number): string;
    constructor(preset: string, seed: string);
    population(): number;
    runUpdates(count: number): void;
    summaryJson(): string;
}

export function build_id(): string;

export function disassembleJson(genome: Uint8Array): string;

export function sandboxTraceJson(genome: Uint8Array, steps: number): string;

export function start(): void;

export function version_info_json(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly build_id: (a: number) => void;
    readonly version_info_json: (a: number) => void;
    readonly __wbg_darwinworld_free: (a: number, b: number) => void;
    readonly darwinworld_new: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly darwinworld_fromCheckpoint: (a: number, b: number, c: number) => void;
    readonly darwinworld_runUpdates: (a: number, b: number) => void;
    readonly darwinworld_summaryJson: (a: number, b: number) => void;
    readonly darwinworld_inspectJson: (a: number, b: number, c: number) => void;
    readonly darwinworld_gridSnapshot: (a: number, b: number) => void;
    readonly darwinworld_applyIntervention: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly darwinworld_exportCheckpoint: (a: number, b: number) => void;
    readonly darwinworld_checksumHex: (a: number, b: number) => void;
    readonly darwinworld_population: (a: number) => number;
    readonly sandboxTraceJson: (a: number, b: number, c: number, d: number) => void;
    readonly disassembleJson: (a: number, b: number, c: number) => void;
    readonly start: () => void;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
