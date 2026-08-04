use darwin_core::{
    disassemble, sandbox_trace, World, BUILD_ID, ENGINE_VERSION, GRID_STRIDE, ISA_VERSION,
    PHYSICS_VERSION, RNG_VERSION, SAVE_VERSION,
};
use wasm_bindgen::prelude::*;

fn js_error(message: impl ToString) -> JsValue {
    JsValue::from_str(&message.to_string())
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn build_id() -> String {
    BUILD_ID.to_string()
}

#[wasm_bindgen]
pub fn version_info_json() -> String {
    serde_json::json!({
        "buildId": BUILD_ID,
        "engineVersion": ENGINE_VERSION,
        "isaVersion": ISA_VERSION,
        "rngVersion": RNG_VERSION,
        "physicsVersion": PHYSICS_VERSION,
        "saveVersion": SAVE_VERSION,
        "gridStride": GRID_STRIDE,
    })
    .to_string()
}

#[wasm_bindgen]
pub struct DarwinWorld {
    inner: World,
}

#[wasm_bindgen]
impl DarwinWorld {
    #[wasm_bindgen(constructor)]
    pub fn new(preset: &str, seed: &str) -> Result<DarwinWorld, JsValue> {
        let seed = parse_seed(seed)?;
        let inner = World::from_preset(preset, seed).map_err(js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = fromCheckpoint)]
    pub fn from_checkpoint(bytes: &[u8]) -> Result<DarwinWorld, JsValue> {
        let inner = World::import_checkpoint(bytes).map_err(js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = runUpdates)]
    pub fn run_updates(&mut self, count: u32) {
        self.inner.run_updates(count.min(100_000));
    }

    #[wasm_bindgen(js_name = summaryJson)]
    pub fn summary_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.summary()).map_err(js_error)
    }

    #[wasm_bindgen(js_name = inspectJson)]
    pub fn inspect_json(&self, cell_index: u32) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.inspect_cell(cell_index as usize)).map_err(js_error)
    }

    #[wasm_bindgen(js_name = gridSnapshot)]
    pub fn grid_snapshot(&self) -> Vec<u8> {
        self.inner.grid_snapshot()
    }

    #[wasm_bindgen(js_name = applyIntervention)]
    pub fn apply_intervention(&mut self, kind: &str, value: u32) -> Result<(), JsValue> {
        self.inner.apply_intervention(kind, value).map_err(js_error)
    }

    #[wasm_bindgen(js_name = exportCheckpoint)]
    pub fn export_checkpoint(&self) -> Result<Vec<u8>, JsValue> {
        self.inner.export_checkpoint().map_err(js_error)
    }

    #[wasm_bindgen(js_name = checksumHex)]
    pub fn checksum_hex(&self) -> String {
        self.inner.checksum_hex()
    }

    #[wasm_bindgen(js_name = population)]
    pub fn population(&self) -> u32 {
        self.inner.population()
    }
}

#[wasm_bindgen(js_name = sandboxTraceJson)]
pub fn sandbox_trace_json(genome: &[u8], steps: u32) -> Result<String, JsValue> {
    let trace = sandbox_trace(genome, steps.min(20_000)).map_err(js_error)?;
    serde_json::to_string(&trace).map_err(js_error)
}

#[wasm_bindgen(js_name = disassembleJson)]
pub fn disassemble_json(genome: &[u8]) -> Result<String, JsValue> {
    serde_json::to_string(&disassemble(genome, 0, 0)).map_err(js_error)
}

fn parse_seed(seed: &str) -> Result<u64, JsValue> {
    let trimmed = seed.trim();
    if let Some(hex) = trimmed.strip_prefix("0x") {
        u64::from_str_radix(hex, 16).map_err(js_error)
    } else {
        trimmed.parse::<u64>().map_err(js_error)
    }
}
