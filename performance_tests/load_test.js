// =============================================================
// MidMeet Performance Test - Load & Elasticity Test
// Purpose: Simulate concurrent users ramping up to stress levels.
//          Verifies Lambda auto-scaling and DynamoDB throughput.
//
// Usage:
//   1. Run get_token.js first to generate token.txt
//   2. Mac/Linux: k6 run -e TOKEN=$(cat token.txt) --out json=load_results.json load_test.js
//      Windows:   k6 run -e TOKEN=<paste token> --out json=load_results.json load_test.js
//
// After the run, generate an HTML report:
//   npx k6-html-reporter --input load_results.json --output load_report.html
// =============================================================

import http from 'k6/http';
import { check, sleep } from 'k6';

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
  stages: [
    { duration: '1m', target: 5  }, // Ramp up to 5 concurrent users
    { duration: '2m', target: 5  }, // Hold at 5 — warm-up / steady state
    { duration: '1m', target: 20 }, // Ramp up to 20 concurrent users
    { duration: '2m', target: 20 }, // Hold at 20 — normal load
    { duration: '1m', target: 50 }, // Ramp up to 50 — stress peak
    { duration: '1m', target: 50 }, // Hold at 50 — observe Lambda scaling
    { duration: '1m', target: 0  }, // Ramp down — observe recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests must complete within 3s
    http_req_failed:   ['rate<0.05'],  // Error rate must stay below 5%
  },
};

export default function () {
  // Primary endpoint under test: GET /events
  const r = http.get(`${BASE_URL}/events`, { headers });
  check(r, { 'status is 200': (res) => res.status === 200 });
  sleep(1);
}