// =============================================================
// MidMeet Performance Test - Baseline Test
// Purpose: Measure single-user response latency for each endpoint.
//          Run this first to establish a performance baseline.
//
// Usage:
//   1. Run get_token.js first to generate token.txt
//   2. Mac/Linux: k6 run -e TOKEN=$(cat token.txt) baseline_test.js
//      Windows:   k6 run -e TOKEN=<paste token here> baseline_test.js
// =============================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// ===== CONFIGURE THIS =====
// const BASE_URL = 'https://YOUR_API_URL'; // Replace with your ApiUrl (no trailing slash)
const BASE_URL = 'https://yc04wd2v98.execute-api.ap-southeast-1.amazonaws.com/prod';
// ==========================

const TOKEN = __ENV.TOKEN; // Injected via -e TOKEN=... at runtime

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

export const options = {
  vus: 1,         // Single virtual user — baseline measurement only
  duration: '60s',
  thresholds: {
    GET_events_ms:   ['p(95)<2000'],
    GET_users_me_ms: ['p(95)<2000'],
    GET_friends_ms:  ['p(95)<2000'],
  },
};

// Custom per-endpoint response time metrics
const getEventsTrend  = new Trend('GET_events_ms',   true);
const getUserMeTrend  = new Trend('GET_users_me_ms', true);
const getFriendsTrend = new Trend('GET_friends_ms',  true);

export default function () {
  let r;

  // --- GET /events ---
  r = http.get(`${BASE_URL}/events`, { headers });
  getEventsTrend.add(r.timings.duration);
  check(r, { 'GET /events → 200': (res) => res.status === 200 });
  sleep(0.5);

  // --- GET /users/me ---
  r = http.get(`${BASE_URL}/users/me`, { headers });
  getUserMeTrend.add(r.timings.duration);
  check(r, { 'GET /users/me → 200': (res) => res.status === 200 });
  sleep(0.5);

  // --- GET /friends ---
  r = http.get(`${BASE_URL}/friends`, { headers });
  getFriendsTrend.add(r.timings.duration);
  check(r, { 'GET /friends → 200': (res) => res.status === 200 });
  sleep(1);
}