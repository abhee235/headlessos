// EX8.15: HomeHub glance routes — local host identity (greeting) and weather.
// @see docs/phases/phase-ex8.md
//
// GET /api/host                      → { username, hostname, platform } of the machine
//                                      HeadlessOS runs on (it is localhost-only)
// GET /api/weather/geocode?q=        → up to 5 places for a city name
// GET /api/weather?lat=&lon=&units=  → current conditions + the next 4 days
//
// The weather routes are HeadlessOS's only outbound calls to a third party: they
// go to Open-Meteo (free, no API key), server-side so the client keeps a strict
// CSP, and only the chosen city's coordinates leave the machine. Forecasts are
// cached for 30 minutes per (lat, lon, units).

import type { FastifyInstance } from 'fastify';
import { hostname, platform, userInfo } from 'os';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 8000;

export interface GeoPlace {
  name: string;
  admin1: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

export interface WeatherData {
  current: {
    temperature: number;
    humidity: number;
    windSpeed: number;
    /** WMO weather code */
    code: number;
    isDay: boolean;
  };
  /** Next 4 days (today excluded), oldest first */
  daily: Array<{ date: string; max: number; min: number; code: number }>;
  units: 'celsius' | 'fahrenheit';
  timezone: string;
  fetchedAt: string;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface GlanceRouteOpts {
  /** Injectable for tests; defaults to global fetch */
  fetchImpl?: FetchLike;
  /** Injectable clock for the cache */
  now?: () => number;
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Weather service returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Open-Meteo forecast JSON → WeatherData (pure, exported for tests) */
export function parseForecast(raw: unknown, units: 'celsius' | 'fahrenheit', fetchedAt: string): WeatherData {
  const r = raw as {
    timezone?: string;
    current?: { temperature_2m?: number; relative_humidity_2m?: number; wind_speed_10m?: number; weather_code?: number; is_day?: number };
    daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; weather_code?: number[] };
  };
  const c = r.current ?? {};
  const d = r.daily ?? {};
  const days = (d.time ?? []).map((date, i) => ({
    date,
    max: Math.round(d.temperature_2m_max?.[i] ?? NaN),
    min: Math.round(d.temperature_2m_min?.[i] ?? NaN),
    code: d.weather_code?.[i] ?? 0,
  }));
  return {
    current: {
      temperature: Math.round(c.temperature_2m ?? NaN),
      humidity: Math.round(c.relative_humidity_2m ?? NaN),
      windSpeed: Math.round(c.wind_speed_10m ?? NaN),
      code: c.weather_code ?? 0,
      isDay: c.is_day !== 0,
    },
    // index 0 is today; the card shows the following four days
    daily: days.slice(1, 5),
    units,
    timezone: r.timezone ?? 'UTC',
    fetchedAt,
  };
}

export async function glanceRoutes(fastify: FastifyInstance, opts: GlanceRouteOpts = {}): Promise<void> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; data: WeatherData }>();

  fastify.get('/api/host', async () => {
    let username = 'there';
    try { username = userInfo().username; } catch { /* no passwd entry (containers) */ }
    return { success: true, data: { username, hostname: hostname(), platform: platform() } };
  });

  fastify.get<{ Querystring: { q?: string } }>('/api/weather/geocode', async (req, reply) => {
    const q = (req.query.q ?? '').trim();
    if (q.length < 2 || q.length > 80) {
      reply.code(400);
      return { success: false, error: 'City name must be 2–80 characters' };
    }
    try {
      const raw = await getJson(fetchImpl, `${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=5&language=en&format=json`) as {
        results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string }>;
      };
      const places: GeoPlace[] = (raw.results ?? []).map((p) => ({
        name: p.name,
        admin1: p.admin1 ?? null,
        country: p.country ?? null,
        latitude: p.latitude,
        longitude: p.longitude,
        timezone: p.timezone ?? null,
      }));
      return { success: true, data: places };
    } catch (err) {
      reply.code(502);
      return { success: false, error: err instanceof Error ? err.message : 'Weather service unavailable' };
    }
  });

  fastify.get<{ Querystring: { lat?: string; lon?: string; units?: string } }>('/api/weather', async (req, reply) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const units = req.query.units === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      reply.code(400);
      return { success: false, error: 'lat and lon must be valid coordinates' };
    }
    const key = `${lat.toFixed(2)},${lon.toFixed(2)},${units}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return { success: true, data: hit.data };

    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      forecast_days: '5',
      timezone: 'auto',
      temperature_unit: units,
      wind_speed_unit: units === 'fahrenheit' ? 'mph' : 'kmh',
    });
    try {
      const raw = await getJson(fetchImpl, `${FORECAST_URL}?${params}`);
      const data = parseForecast(raw, units, new Date(now()).toISOString());
      cache.set(key, { at: now(), data });
      return { success: true, data };
    } catch (err) {
      // Serve a stale forecast rather than nothing
      if (hit) return { success: true, data: hit.data, stale: true };
      reply.code(502);
      return { success: false, error: err instanceof Error ? err.message : 'Weather service unavailable' };
    }
  });
}
