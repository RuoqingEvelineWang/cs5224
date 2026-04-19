// =============================================================
// MidMeet Performance Test - Cold Start Test
// Purpose: Measure Lambda cold start latency vs warm invocation latency.
//          The first request after a period of inactivity triggers a
//          cold start (container initialisation), which is typically
//          significantly slower than subsequent warm requests.
//
// Usage:
//   1. Wait at least 5 minutes after the last Lambda invocation
//      so the container has time to be recycled (cold state).
//   2. Run get_token.js first to generate token.txt
//   3. Mac/Linux: k6 run -e TOKEN=$(cat token.txt) cold_start_test.js
//      Windows:   k6 run -e TOKEN=<paste token> cold_start_test.js
//
// What to look for in the output:
//   - Iteration 1 response time is usually 500–2000ms higher (cold start)
//   - Iterations 2+ should stabilise at a lower latency (warm invocation)
// =============================================================

import http from 'k6/http';
import { check } from 'k6';

// ===== CONFIGURE THIS =====
// const BASE_URL = 'https://YOUR_API_URL'; // Replace with your ApiUrl (no trailing slash)
const BASE_URL = 'https://yc04wd2v98.execute-api.ap-southeast-1.amazonaws.com/prod';
// ==========================

const TOKEN = __ENV.TOKEN;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

export const options = {
  vus: 1,
  iterations: 15, // 15 sequential requests — first few may show cold start
};

let iterationCount = 0;

export default function () {
  iterationCount++;

  const start = Date.now();
  const r = http.get(`${BASE_URL}/events`, { headers });
  const elapsed = Date.now() - start;

  const label = iterationCount === 1 ? '(possible cold start)' : '(warm)';
  console.log(`[Iteration ${iterationCount}] Response time: ${elapsed}ms | Status: ${r.status} ${label}`);

  check(r, { 'status is 200': (res) => res.status === 200 });

  // No sleep between requests — we want to capture the transition
  // from cold to warm as quickly as possible
}