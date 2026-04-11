// =============================================================
// MidMeet Performance Test - Venues Endpoint Baseline Test
// Purpose: Measure response latency for the computation-intensive
//          GET /events/{id}/venues endpoint, which calls Google
//          Places API and OneMap Routing API externally.
//
// Usage:
//   k6 run -e TOKEN=$(cat token.txt | tr -d '[:space:]') \
//          -e EVENT_ID=evt-8d7fda90-c97b-4fd1-9292-eb26fd9aa289 \
//          venues_baseline_test.js
// =============================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = 'https://yc04wd2v98.execute-api.ap-southeast-1.amazonaws.com/prod';
const TOKEN    = __ENV.TOKEN;
const EVENT_ID = __ENV.EVENT_ID;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

export const options = {
  vus: 1,
  duration: '3m',   // 3 minutes — venues is slow, fewer iterations is fine
  thresholds: {
    GET_venues_ms: ['p(95)<30000'], // 30s threshold — external APIs can be slow
  },
};

const getVenuesTrend = new Trend('GET_venues_ms', true);

export default function () {
  const r = http.get(`${BASE_URL}/events/${EVENT_ID}/venues`, {
    headers,
    timeout: '35s',   // allow up to 35s per request
  });
  getVenuesTrend.add(r.timings.duration);
  check(r, { 'GET /events/{id}/venues → 200': (res) => res.status === 200 });
  sleep(3);
}