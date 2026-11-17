/** Capture-only input fixture. Call on the displayed scene's precipitation;
 * this does not change the application's clock, weather, lighting or camera. */
export function pinWeatherPhase(precip, timeS) {
  if (!precip || typeof precip.update !== 'function' || !Number.isFinite(timeS)) throw new Error('weather fixture needs precipitation and a finite phase');
  const update = precip.update.bind(precip);
  precip.update = frame => update({ ...frame, timeS });
  return { timeS };
}

/** A comparison must record the actual displayed phase and stationary fixtures,
 * rather than assuming that pinning the solar clock stopped wall-clock motion. */
export function weatherFixtureHonoured(scene, fixture, phaseSeconds = 12) {
  if (scene === 'kx') return fixture === null;
  if (!fixture || fixture.phaseSeconds !== phaseSeconds) return false;
  if (![fixture.rainTime, fixture.snowTime].every(t => t === null || t === phaseSeconds)) return false;
  return scene !== 'wv' || fixture.synthetic?.animated === false && fixture.synthetic?.travelledM === 0;
}
