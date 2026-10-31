import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import express from 'express';

// Test concurrency and atomic mutations using a completely isolated temporary server
async function run() {
  console.log('=== TEST AUTOSAVE CONCURRENCY (Isolated Server & Temp Directory) ===');
  
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-concurrency-'));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  
  // Seed initial jobs.json
  const initialJobs = [
    { id: 'job-1', source: 'test', externalId: 'ext-1', title: 'Job 1', status: 'nouveau', notes: '', favorite: false }
  ];
  fs.writeFileSync(path.join(dataDir, 'jobs.json'), JSON.stringify(initialJobs, null, 2));

  // Create isolated express app mirroring server.ts writeQueue and mutateTable
  const app = express();
  app.use(express.json());

  // Simple write queue
  let writeQueuePromise = Promise.resolve();
  function mutateTable(tableName: string, mutator: (data: any) => any): Promise<any> {
    const filePath = path.join(dataDir, `${tableName}.json`);
    const runMutation = async () => {
      let currentData: any = [];
      if (fs.existsSync(filePath)) {
        try {
          currentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch {
          currentData = [];
        }
      }
      const updatedData = mutator(currentData);
      fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));
      return updatedData;
    };
    writeQueuePromise = writeQueuePromise.then(runMutation, runMutation);
    return writeQueuePromise;
  }

  app.get('/api/jobs', (req, res) => {
    const filePath = path.join(dataDir, 'jobs.json');
    const data = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : [];
    res.json(data);
  });

  app.put('/api/jobs/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    let found = false;
    await mutateTable('jobs', (jobs) => {
      return jobs.map((j: any) => {
        if (j.id === id || j.externalId === id) {
          found = true;
          return { ...j, status };
        }
        return j;
      });
    });
    if (!found) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ success: true });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // Test concurrent status updates / mutations
    console.log('Sending concurrent status updates...');
    const p1 = fetch(`${baseUrl}/api/jobs/job-1/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'postule' })
    });
    const p2 = mutateTable('jobs', (jobs) => {
      return jobs.map((j: any) => j.id === 'job-1' ? { ...j, notes: 'concurrent note' } : j);
    });

    await Promise.all([p1, p2]);

    const finalJobs = JSON.parse(fs.readFileSync(path.join(dataDir, 'jobs.json'), 'utf-8'));
    console.log('Final jobs after concurrency:', finalJobs);
    assert.equal(finalJobs[0].status, 'postule');
    assert.equal(finalJobs[0].notes, 'concurrent note');
    console.log('Concurrency & atomic mutation test passed successfully.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
