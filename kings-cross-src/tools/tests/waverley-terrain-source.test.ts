import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLzw, sampleRaster } from '../waverley-terrain-source.ts';

test('TIFF LZW handles clear, literal, dictionary entry and stop', () => {
  const codes = [256, 65, 66, 258, 257];
  let bits = codes.map(c => c.toString(2).padStart(9, '0')).join('');
  bits = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
  const bytes = Uint8Array.from(bits.match(/.{8}/g)!.map(b => parseInt(b, 2)));
  assert.equal(new TextDecoder().decode(decodeLzw(bytes)), 'ABAB');
});

test('synthetic raster respects pixel centres, southward rows and nodata', () => {
  const raster = { width: 2, height: 2, affine: [100, 2, 0, 204, 0, -2] as [number,number,number,number,number,number], nodata: -9999, bands: [Float32Array.from([10,20,30,-9999])] };
  assert.equal(sampleRaster(raster, 101, 203), 10);
  assert.equal(sampleRaster(raster, 103, 203), 20);
  assert.equal(sampleRaster(raster, 101, 201), 30);
  assert.equal(sampleRaster(raster, 103, 201), null);
  assert.equal(sampleRaster(raster, 99, 203), null);
});
