// EX8.15: HomeHub glance routes — host identity and Open-Meteo weather proxy
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { glanceRoutes, parseForecast } from '../../src/routes/glance.js';

const FORECAST = {
  timezone: 'Asia/Kolkata',
  current: { temperature_2m: 23.4, relative_humidity_2m: 56, wind_speed_10m: 24.6, weather_code: 2, is_day: 1 },
  daily: {
    time: ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'],
    temperature_2m_max: [31, 30.4, 28, 31.2, 29],
    temperature_2m_min: [22, 21.6, 20, 23, 19],
    weather_code: [2, 3, 61, 2, 63],
  },
};

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

async function build(fetchImpl = vi.fn(async () => ok(FORECAST)), now = () => 1_000_000) {
  const app = Fastify();
  await app.register(glanceRoutes, { fetchImpl, now });
  return { app, fetchImpl };
}

describe('parseForecast', () => {
  it('rounds values and returns the 4 days after today', () => {
    const w = parseForecast(FORECAST, 'celsius', 'x');
    expect(w.current).toEqual({ temperature: 23, humidity: 56, windSpeed: 25, code: 2, isDay: true });
    expect(w.daily.map((d) => d.date)).toEqual(['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(w.daily[0]).toEqual({ date: '2026-10-22', max: 30, min: 22, code: 3 });
    expect(w.timezone).toBe('Asia/Kolkata');
  });
});

describe('glance routes', () => {
  it('GET /api/host returns the local user and hostname', async () => {
    const { app } = await build();
    const res = await app.inject({ url: '/api/host' });
    const body = res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.username).toBe('string');
    expect(typeof body.data.hostname).toBe('string');
  });

  it('validates coordinates and caches forecasts for 30 minutes', async () => {
    let t = 1_000_000;
    const { app, fetchImpl } = await build(vi.fn(async () => ok(FORECAST)), () => t);
    expect((await app.inject({ url: '/api/weather?lat=abc&lon=1' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/weather?lat=95&lon=1' })).statusCode).toBe(400);

    const first = await app.inject({ url: '/api/weather?lat=28.61&lon=77.21' });
    expect(first.json().data.current.temperature).toBe(23);
    await app.inject({ url: '/api/weather?lat=28.61&lon=77.21' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('api.open-meteo.com/v1/forecast');
    expect(url).toContain('temperature_unit=celsius');

    t += 31 * 60 * 1000;
    await app.inject({ url: '/api/weather?lat=28.61&lon=77.21' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('serves the stale forecast when Open-Meteo fails, 502 when there is none', async () => {
    let t = 0;
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok(FORECAST)).mockRejectedValue(new Error('offline'));
    const { app } = await build(fetchImpl, () => t);
    await app.inject({ url: '/api/weather?lat=1&lon=2' });
    t += 31 * 60 * 1000;
    const stale = await app.inject({ url: '/api/weather?lat=1&lon=2' });
    expect(stale.json()).toMatchObject({ success: true, stale: true });
    const none = await app.inject({ url: '/api/weather?lat=3&lon=4' });
    expect(none.statusCode).toBe(502);
  });

  it('geocodes a city name and rejects bad queries', async () => {
    const fetchImpl = vi.fn(async () => ok({ results: [{ name: 'Delhi', admin1: 'Delhi', country: 'India', latitude: 28.65, longitude: 77.23, timezone: 'Asia/Kolkata' }] }));
    const { app } = await build(fetchImpl);
    expect((await app.inject({ url: '/api/weather/geocode?q=a' })).statusCode).toBe(400);
    const res = await app.inject({ url: '/api/weather/geocode?q=Delhi' });
    expect(res.json().data[0]).toEqual({ name: 'Delhi', admin1: 'Delhi', country: 'India', latitude: 28.65, longitude: 77.23, timezone: 'Asia/Kolkata' });
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain('geocoding-api.open-meteo.com');
  });
});
