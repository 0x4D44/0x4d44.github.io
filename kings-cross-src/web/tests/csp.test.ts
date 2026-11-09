import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { archiveUrl, liveUrl, WEATHER_ORIGINS } from '../src/weather.ts';

test('page CSP denies arbitrary scripts frames and forms while allowing app assets and loopback dev sockets',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const policy=/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
  assert.ok(policy,'CSP meta precedes all resources');
  const rules=new Map(policy.split(';').map(r=>{const [key,...values]=r.trim().split(/\s+/);return [key,values];}));
  assert.deepEqual(rules.get('default-src'),["'none'"]);assert.deepEqual(rules.get('script-src'),["'self'"]);
  for(const key of ['base-uri','object-src','form-action'])assert.deepEqual(rules.get(key),["'none'"]);
  assert.deepEqual(rules.get('worker-src'),["'self'",'blob:']);
  assert.deepEqual(rules.get('img-src'),["'self'",'data:','blob:']);
  // its own origin, the loopback dev sockets, and exactly the two Open-Meteo origins the weather module fetches: nothing wider
  assert.deepEqual(rules.get('connect-src'),["'self'",'ws://127.0.0.1:*','ws://localhost:*','https://api.open-meteo.com','https://archive-api.open-meteo.com']);
  assert.ok(!policy.includes('ws://[::1]:*'),'IPv6 wildcard socket source is invalid in CSP');
  assert.ok(!policy.includes('unsafe-eval'));assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<style>'));
});

test('page CSP connect-src allows the weather origins the weather module requests, and the attribution credits Open-Meteo',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const policy=/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1]??'';
  const connect=policy.split(';').map(r=>r.trim().split(/\s+/)).find(([key])=>key==='connect-src')?.slice(1)??[];
  assert.deepEqual(connect.filter(s=>s.startsWith('https:')||s.startsWith('http:')),[...WEATHER_ORIGINS],'the https origins are the weather origins, in the module\'s order');
  assert.ok(connect.every(s=>s==="'self'"||s.startsWith('ws://127.0.0.1:')||s.startsWith('ws://localhost:')||(WEATHER_ORIGINS as readonly string[]).includes(s)),'no other source');
  const requests=[liveUrl(),archiveUrl('2026-11-06','2026-11-08')];
  assert.deepEqual(requests.map(u=>new URL(u).origin),[...WEATHER_ORIGINS],'a live and an archive request, to those origins');
  for(const u of requests)assert.ok(connect.includes(new URL(u).origin),`${u} is within connect-src`);
  assert.match(html,/Weather: <a [^>]*href="https:\/\/open-meteo\.com\/"[^>]*>Open-Meteo\.com<\/a> \(<a [^>]*href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"[^>]*>CC BY 4\.0<\/a>\)/,'the required attribution is in the page');
});
