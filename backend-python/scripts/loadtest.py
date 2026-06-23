#!/usr/bin/env python3
"""Lightweight async load test for the Parvagas API (no extra deps — uses httpx).

Usage:
  python scripts/loadtest.py --base http://localhost:8000 --concurrency 50 --requests 2000

Hits read-only public endpoints (health, jobs list, ad placement, homepage) and
reports throughput + latency percentiles. Run before go-live to size the host.
"""
from __future__ import annotations

import argparse
import asyncio
import time

import httpx

ENDPOINTS = [
    "/health",
    "/api/v1/jobs?limit=12",
    "/api/v1/jobs?keyword=engenheiro&limit=12",
    "/api/v1/ads/placements/homepage_banner",
    "/api/v1/public/homepage",
]


async def worker(client: httpx.AsyncClient, base: str, n: int, idx: int, lat: list[float], errs: list[int]):
    for i in range(n):
        path = ENDPOINTS[(idx + i) % len(ENDPOINTS)]
        t0 = time.perf_counter()
        try:
            r = await client.get(base + path, timeout=20)
            lat.append((time.perf_counter() - t0) * 1000)
            if r.status_code >= 500:
                errs.append(1)
        except Exception:
            errs.append(1)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--concurrency", type=int, default=50)
    ap.add_argument("--requests", type=int, default=2000)
    args = ap.parse_args()

    per = max(1, args.requests // args.concurrency)
    lat: list[float] = []
    errs: list[int] = []
    start = time.perf_counter()
    async with httpx.AsyncClient() as client:
        await asyncio.gather(*[worker(client, args.base, per, i, lat, errs) for i in range(args.concurrency)])
    elapsed = time.perf_counter() - start

    total = len(lat) + len(errs)
    lat.sort()

    def pct(p: float) -> float:
        return lat[min(len(lat) - 1, int(len(lat) * p))] if lat else 0.0

    print(f"requests={total} ok={len(lat)} errors={len(errs)} in {elapsed:.1f}s")
    print(f"throughput={total / elapsed:.0f} req/s")
    if lat:
        print(f"latency ms: p50={pct(0.50):.0f} p90={pct(0.90):.0f} p99={pct(0.99):.0f} max={lat[-1]:.0f}")


if __name__ == "__main__":
    asyncio.run(main())
