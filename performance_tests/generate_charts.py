"""
MidMeet Performance Test - Chart Generator
==========================================
Run this script from the performance_tests directory after completing all k6 tests.

Requirements:
    pip install matplotlib pandas

Usage:
    python3 generate_charts.py

Output:
    - chart_response_time_distribution.png
    - chart_throughput_over_time.png
    - chart_error_rate_over_time.png
    - chart_cold_start_comparison.png  (uses hardcoded cold start data)
"""

import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timezone, timedelta
import os

# ── helpers ──────────────────────────────────────────────────────────────────

def parse_load_results(filepath="load_results.json"):
    durations, timestamps, failed = [], [], []
    with open(filepath) as f:
        for line in f:
            try:
                d = json.loads(line)
                ts_str = d["data"]["time"]
                # normalise to naive UTC
                ts = datetime.fromisoformat(ts_str)
                if ts.tzinfo:
                    ts = ts.astimezone(timezone.utc).replace(tzinfo=None)

                if d["metric"] == "http_req_duration":
                    durations.append((ts, d["data"]["value"]))
                elif d["metric"] == "http_req_failed":
                    failed.append((ts, d["data"]["value"]))
            except Exception:
                pass
    return durations, failed

STYLE = {
    "figure.facecolor": "white",
    "axes.facecolor":   "#f8f9fa",
    "axes.grid":        True,
    "grid.color":       "#dee2e6",
    "grid.linestyle":   "--",
    "grid.linewidth":   0.6,
    "axes.spines.top":  False,
    "axes.spines.right":False,
    "font.family":      "sans-serif",
    "font.size":        11,
}

def apply_style():
    plt.rcParams.update(STYLE)

# ── Chart 1: Response Time Distribution (histogram) ──────────────────────────

def chart_response_time_distribution(durations):
    apply_style()
    values = [v for _, v in durations]

    fig, ax = plt.subplots(figsize=(9, 5))
    ax.hist(values, bins=60, color="#4C72B0", edgecolor="white", linewidth=0.4)

    p95 = sorted(values)[int(len(values) * 0.95)]
    ax.axvline(p95, color="#DD4444", linestyle="--", linewidth=1.5,
               label=f"p(95) = {p95:.0f} ms")

    ax.set_title("Response Time Distribution  –  Load Test (50 VUs)", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Response Time (ms)")
    ax.set_ylabel("Request Count")
    ax.legend()
    plt.tight_layout()
    plt.savefig("chart_response_time_distribution.png", dpi=150)
    plt.close()
    print("✅  chart_response_time_distribution.png")

# ── Chart 2: Throughput over time (req/s per 10-s bucket) ───────────────────

def chart_throughput_over_time(durations):
    apply_style()
    if not durations:
        return

    start = min(t for t, _ in durations)
    bucket_s = 10
    buckets: dict[int, int] = {}
    for ts, _ in durations:
        b = int((ts - start).total_seconds() // bucket_s)
        buckets[b] = buckets.get(b, 0) + 1

    xs = [b * bucket_s for b in sorted(buckets)]
    ys = [buckets[b] / bucket_s for b in sorted(buckets)]   # req/s

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.fill_between(xs, ys, alpha=0.25, color="#4C72B0")
    ax.plot(xs, ys, color="#4C72B0", linewidth=1.5)

    # annotate ramp stages (seconds from start)
    stages = [(0,"Ramp→5"),(60,"Hold 5"),(120,"Ramp→20"),
              (180,"Hold 20"),(240,"Ramp→50"),(300,"Hold 50"),(360,"Ramp↓")]
    for sec, label in stages:
        if sec <= max(xs):
            ax.axvline(sec, color="#999", linestyle=":", linewidth=1)
            ax.text(sec + 2, max(ys) * 0.92, label, fontsize=8, color="#555")

    ax.set_title("Throughput over Time  –  Load Test (50 VUs)", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Elapsed Time (s)")
    ax.set_ylabel("Requests / Second")
    plt.tight_layout()
    plt.savefig("chart_throughput_over_time.png", dpi=150)
    plt.close()
    print("✅  chart_throughput_over_time.png")

# ── Chart 3: Error rate over time (per 10-s bucket) ─────────────────────────

def chart_error_rate_over_time(durations, failed):
    apply_style()
    if not durations:
        return

    start = min(t for t, _ in durations)
    bucket_s = 10

    total_b:  dict[int, int] = {}
    failed_b: dict[int, int] = {}

    for ts, _ in durations:
        b = int((ts - start).total_seconds() // bucket_s)
        total_b[b] = total_b.get(b, 0) + 1

    for ts, val in failed:
        b = int((ts - start).total_seconds() // bucket_s)
        failed_b[b] = failed_b.get(b, 0) + int(val)

    xs, ys = [], []
    for b in sorted(total_b):
        xs.append(b * bucket_s)
        rate = failed_b.get(b, 0) / total_b[b] * 100 if total_b[b] else 0
        ys.append(rate)

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.fill_between(xs, ys, alpha=0.3, color="#DD4444")
    ax.plot(xs, ys, color="#DD4444", linewidth=1.5)
    ax.axhline(5, color="#FF8800", linestyle="--", linewidth=1.2, label="5 % threshold")

    ax.set_title("Error Rate over Time  –  Load Test (50 VUs)", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Elapsed Time (s)")
    ax.set_ylabel("Error Rate (%)")
    ax.legend()
    plt.tight_layout()
    plt.savefig("chart_error_rate_over_time.png", dpi=150)
    plt.close()
    print("✅  chart_error_rate_over_time.png")

# ── Chart 4: Cold start comparison (bar chart, hardcoded data) ───────────────

def chart_cold_start_comparison():
    apply_style()

    labels = [f"#{i}" for i in range(1, 16)]
    values = [2371,177,111,88,92,97,94,127,88,123,124,60,85,441,74]
    colors = ["#DD4444" if i == 0 else ("#FF8800" if v > 200 else "#4C72B0")
              for i, v in enumerate(values)]

    fig, ax = plt.subplots(figsize=(11, 5))
    bars = ax.bar(labels, values, color=colors, edgecolor="white", linewidth=0.5)

    ax.axhline(sum(values[1:]) / len(values[1:]), color="#4C72B0",
               linestyle="--", linewidth=1.3,
               label=f"Warm avg ({sum(values[1:])/len(values[1:]):.0f} ms)")
    ax.axhline(2371, color="#DD4444", linestyle=":", linewidth=1,
               label="Cold start (2371 ms)")

    ax.set_title("Cold Start vs Warm Invocation Latency", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Iteration")
    ax.set_ylabel("Response Time (ms)")
    ax.legend()

    # label the cold start bar
    ax.text(0, 2371 + 40, "Cold\nStart", ha="center", color="#DD4444",
            fontsize=9, fontweight="bold")

    plt.tight_layout()
    plt.savefig("chart_cold_start_comparison.png", dpi=150)
    plt.close()
    print("✅  chart_cold_start_comparison.png")

# ── Chart 5: Baseline endpoint comparison (bar chart) ────────────────────────

def chart_baseline_comparison():
    apply_style()

    endpoints = ["GET /events", "GET /friends", "GET /users/me"]
    avg_vals  = [136.37, 153.11, 152.75]
    p95_vals  = [248.48, 383.63, 290.50]
    x = range(len(endpoints))
    width = 0.35

    fig, ax = plt.subplots(figsize=(9, 5))
    b1 = ax.bar([i - width/2 for i in x], avg_vals, width, label="Average", color="#4C72B0")
    b2 = ax.bar([i + width/2 for i in x], p95_vals, width, label="p(95)",   color="#DD8844")

    ax.axhline(2000, color="#DD4444", linestyle="--", linewidth=1.2,
               label="p(95) threshold (2000 ms)")
    ax.set_title("Baseline Response Times by Endpoint  (1 VU, 60 s)", fontsize=13,
                 fontweight="bold", pad=12)
    ax.set_xticks(list(x))
    ax.set_xticklabels(endpoints)
    ax.set_ylabel("Response Time (ms)")
    ax.legend()

    for bar in list(b1) + list(b2):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 5,
                f"{bar.get_height():.0f}", ha="center", va="bottom", fontsize=9)

    plt.tight_layout()
    plt.savefig("chart_baseline_comparison.png", dpi=150)
    plt.close()
    print("✅  chart_baseline_comparison.png")

# ── main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Parsing load_results.json …")
    durations, failed = parse_load_results()
    print(f"  {len(durations)} duration samples, {sum(v for _,v in failed):.0f} failed requests\n")

    chart_response_time_distribution(durations)
    chart_throughput_over_time(durations)
    chart_error_rate_over_time(durations, failed)
    chart_cold_start_comparison()
    chart_baseline_comparison()

    print("\nAll charts saved. Now run Testing.md to view the full report.")