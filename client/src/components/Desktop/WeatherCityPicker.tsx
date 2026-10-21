// EX8.15: Settings → General → Weather: pick the city for the HomeHub weather
// card. Searches Open-Meteo's geocoder through GET /api/weather/geocode; only the
// chosen city's name and coordinates are stored (in preferences).
// @see docs/phases/phase-ex8.md

import { useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { geocodeCity, type GeoPlace } from '../../lib/api';
import { usePreferencesStore } from '../../store/preferences-store';

export function placeLabel(p: Pick<GeoPlace, 'name' | 'admin1' | 'country'>): string {
  return [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : null, p.country].filter(Boolean).join(', ');
}

export function WeatherCityPicker() {
  const location = usePreferencesStore((s) => s.weatherLocation);
  const setLocation = usePreferencesStore((s) => s.setWeatherLocation);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoPlace[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setBusy(true); setError(null);
    try {
      const r = await geocodeCity(q);
      if (!r.success) throw new Error(r.error ?? 'Search failed');
      setResults(r.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-2">
      {location && (
        <div className="flex h-9 items-center gap-2 rounded-full bg-fill pl-3.5 pr-1 text-[13px]">
          <MapPin className="size-4 shrink-0 text-accent-text" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate">{location.name}</span>
          <button
            type="button"
            onClick={() => setLocation(null)}
            aria-label="Clear weather city"
            className="grid size-7 place-items-center rounded-full text-label-2 hover:bg-fill-2 hover:text-foreground"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void search(); }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={location ? 'Change city' : 'Search a city'}
          aria-label="Search a city"
        />
        <Button type="submit" variant="secondary" disabled={busy || query.trim().length < 2}>
          <Search strokeWidth={1.75} />
          {busy ? 'Searching…' : 'Search'}
        </Button>
      </form>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {results && results.length === 0 && <p className="text-[13px] text-label-2">No places found</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-0.5 rounded-[14px] bg-fill p-1" aria-label="Places">
          {results.map((p) => (
            <li key={`${p.latitude},${p.longitude}`}>
              <button
                type="button"
                onClick={() => {
                  setLocation({ name: placeLabel(p), latitude: p.latitude, longitude: p.longitude });
                  setResults(null); setQuery('');
                }}
                className="flex h-9 w-full items-center gap-2 rounded-sm px-3 text-left text-[13px] hover:bg-fill-2"
              >
                <MapPin className="size-4 shrink-0 text-label-3" strokeWidth={1.75} />
                <span className="truncate">{placeLabel(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
