// Child and teen garment libraries deliberately share GLB node names. The asset
// registry adds their age to the lookup key; the named node inside each GLB stays unchanged.
export function manifestAssetKey(manifest, key) {
  const age = manifest?.ageGroup;
  return (age === 'child' || age === 'teen') && manifest.set === `garments_${age}` && key.startsWith('garment_')
    ? `garment_${age}_${key.slice('garment_'.length)}` : key;
}
