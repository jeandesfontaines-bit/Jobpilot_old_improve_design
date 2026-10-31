import assert from 'node:assert/strict';
import http from 'node:http';
import { scrapeJobRoom, extractJobRoomAd } from '../src/services/jobRoomConnector';

// Isolated tests: no production API, profile, applications or filesystem writes.
let scenario = '';
const item = (id: string) => ({ jobAdvertisement: { id, title: 'Test', jobContent: { location: { city: 'Genève', cantonCode: 'GE' } } } });
const server = http.createServer((req, res) => {
  const page = Number(new URL(req.url || '/', 'http://localhost').searchParams.get('page'));
  const send = (data: unknown, total?: string, next = false, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    if (total !== undefined) res.setHeader('x-total-count', total);
    if (next) res.setHeader('Link', '</search?page=1>; rel="next"');
    res.end(JSON.stringify(data));
  };
  if (scenario === 'full_missing_next') return send([item('a'), item('b')], '5000');
  if (scenario === 'bad_container') return send({ content: { message: 'unexpected' } });
  if (scenario === 'bad_total') return send([item('a')], 'NaN');
  if (scenario === 'empty_missing') return send(page ? [] : [item('a'), item('b')], '5', page === 0);
  if (scenario === '412_missing') return send(page ? {} : [item('a'), item('b')], '5', page === 0, page ? 412 : 200);
  if (scenario === '412_first') return send({}, undefined, false, 412);
  if (scenario === 'short_next') return send([item(page ? 'b' : 'a')], '2', page === 0);
  if (scenario === 'overlap') return send(page ? [item('b'), item('c')] : [item('a'), item('b')], '3', page === 0);
  if (scenario === 'repeated') return send([item('a'), item('b')], '5', true);
  if (scenario === 'network_error') return send(page ? {} : [item('a'), item('b')], '5', page === 0, page ? 500 : 200);
  return send([], '0');
});

async function main() {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const run = (name: string, extra = {}) => {
    scenario = name;
    return scrapeJobRoom({ testUrl: `http://127.0.0.1:${address.port}/search`, pageSize: 2, delayMinMs: 0, delayMaxMs: 0, ...extra });
  };
  try {
    let r = await run('full_missing_next');
    assert.equal(r.status, 'inconsistent'); assert.equal(r.pagesFetched, 1);
    r = await run('bad_container'); assert.equal(r.status, 'error'); assert.ok(r.error);
    r = await run('bad_total'); assert.equal(r.status, 'error');
    r = await run('empty_missing'); assert.equal(r.status, 'inconsistent'); assert.equal(r.jobs.length, 2);
    r = await run('412_missing'); assert.equal(r.status, 'inconsistent'); assert.equal(r.jobs.length, 2);
    r = await run('412_first'); assert.equal(r.status, 'error');
    r = await run('short_next'); assert.equal(r.status, 'completed'); assert.equal(r.pagesFetched, 2); assert.equal(r.jobs.length, 2);
    r = await run('overlap'); assert.equal(r.status, 'completed'); assert.equal(r.detected, 4); assert.equal(r.uniqueDetected, 3); assert.equal(r.jobs.length, 3);
    r = await run('repeated'); assert.equal(r.status, 'page_repeated'); assert.equal(r.jobs.length, 2);
    r = await run('network_error'); assert.equal(r.status, 'partial'); assert.equal(r.jobs.length, 2);
    r = await run('repeated', { maxPages: 1 }); assert.equal(r.status, 'max_pages_reached'); assert.equal(r.pagesFetched, 1);
    const raw = { id: 'multi', jobContent: { locations: [{ city: 'Zurich', cantonCode: 'ZH' }, { city: 'Lausanne', cantonCode: 'CH-VD' }], jobDescriptions: [{ title: 'Test', description: 'Siège à Genève' }] } };
    assert.equal(extractJobRoomAd(raw).canton, 'VD');
    assert.equal(extractJobRoomAd({ id: 'z', jobContent: { location: { city: 'Zurich', cantonCode: 'ZH' }, jobDescriptions: [{ title: 'Test', description: 'Bureau à Genève' }] } }).canton, 'ZH');
    console.log('Job-Room isolated regression checks passed. No live collection or persistence was tested.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
