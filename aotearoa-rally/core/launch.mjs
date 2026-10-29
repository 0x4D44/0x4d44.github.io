// URL launch parameters and weather overrides. Pure: no DOM, so node can test it.

export const QUALITIES = ["auto", "low", "medium", "high", "ultra"];
export const WEATHERS = ["clear", "cloud", "mist", "fog", "rain", "storm", "snow"];
export const CAMERAS = ["chase", "far", "bumper", "bonnet", "cinematic", "replay"];

/**
 * Validate ?stage= ?car= ?weather= ?quality= ?camera=. A bad value is dropped and a warning is
 * returned (the caller console.warns), so a typo falls back to a working default, never a blank screen.
 * @param {{get:(k:string)=>string|null}} params
 */
export function parseLaunch(params, { stageIds, carIds, cameras = CAMERAS }) {
  const warnings = [];
  const pick = (key, allowed) => {
    const v = params.get(key);
    if (v == null || v === "") return undefined;
    if (allowed.includes(v)) return v;
    warnings.push(`ignoring ?${key}=${v} (expected one of: ${allowed.join(", ")})`);
    return undefined;
  };
  return {
    stageId: pick("stage", stageIds),
    carId: pick("car", carIds),
    weather: pick("weather", WEATHERS),
    quality: pick("quality", QUALITIES),
    camera: pick("camera", cameras),
    warnings,
  };
}

const OVERRIDE = {
  clear: { intensity: 0, wetness: 0 },
  cloud: { intensity: 0.5, wetness: 0.3 },
  mist: { intensity: 0.55, wetness: 0.3 },
  fog: { intensity: 0.9, wetness: 0.3 },
  rain: { intensity: 0.8, wetness: 0.9 },
  storm: { intensity: 0.8, wetness: 0.9 },
  snow: { intensity: 0.7, wetness: 0.3 },
};

/** The weather object a ?weather= override hands the renderer; no override keeps the stage default. */
export function weatherOverride(defWeather, type) {
  if (!type || !Object.hasOwn(OVERRIDE, type)) return { ...defWeather };
  return { ...defWeather, type, ...OVERRIDE[type] };
}
