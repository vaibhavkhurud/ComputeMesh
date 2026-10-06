'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { fetchWithAuth, ApiError } from '@/lib/api';

// ---------- Types ----------
interface MachineDiscovery {
  cpuLogicalCores: number;
  memoryMb: number;
  gpuCount: number;
  gpuModel: string | null;
  gpuMemoryMb: number | null;
  cudaVersion: string | null;
  operatingSystem: string;
  cpuArchitecture: string;
}

interface MachinePricing {
  flatCentsPerHour: number;
  cpuCentsPerHour: number;
  memoryGbCentsPerHour: number;
  gpuCentsPerHour: number;
  currency: string;
  minBillingMinutes: number;
}

interface Machine {
  id: string;
  name: string;
  status: string;
  region: string;
  discovery: MachineDiscovery;
  pricing: MachinePricing;
  provider: { displayName: string };
  availableNow: boolean;
}

// ---------- Filter state ----------
interface Filters {
  cpuMin: string;
  ramMin: string;
  gpuRequired: boolean;
  gpuModel: string;
  gpuVramMin: string;
  cudaVersion: string;
  architecture: string;
  operatingSystem: string;
  region: string;
  maxPriceCentsPerHour: string;
  availableNow: boolean;
}

const DEFAULT_FILTERS: Filters = {
  cpuMin: '',
  ramMin: '',
  gpuRequired: false,
  gpuModel: '',
  gpuVramMin: '',
  cudaVersion: '',
  architecture: '',
  operatingSystem: '',
  region: '',
  maxPriceCentsPerHour: '',
  availableNow: false,
};

// ---------- Error banner ----------
function ErrorBanner({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const is403 = error.toLowerCase().includes('insufficient') || error.toLowerCase().includes('forbidden');
  return (
    <div className={`p-4 rounded border ${is403 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
      <strong>{is403 ? '403 Access Denied: ' : 'Error: '}</strong>{error}
      {onRetry && (
        <button onClick={onRetry} className="ml-4 underline text-sm">Retry</button>
      )}
    </div>
  );
}

// ---------- Status badge ----------
function StatusBadge({ available }: { available: boolean }) {
  return (
    <span className={`px-2 py-1 text-xs font-bold rounded ${available ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
      {available ? 'AVAILABLE' : 'BUSY'}
    </span>
  );
}

// ---------- Machine card ----------
function MachineCard({ m }: { m: Machine }) {
  const totalCentsPerHour =
    m.pricing.flatCentsPerHour +
    m.pricing.cpuCentsPerHour * m.discovery.cpuLogicalCores +
    m.pricing.memoryGbCentsPerHour * Math.ceil(m.discovery.memoryMb / 1024) +
    m.pricing.gpuCentsPerHour * m.discovery.gpuCount;

  return (
    <div className="bg-white p-6 rounded-lg shadow border flex flex-col">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{m.name}</h3>
          <p className="text-sm text-gray-500">{m.provider.displayName}</p>
        </div>
        <StatusBadge available={m.availableNow} />
      </div>

      <div className="mt-4 space-y-1 text-sm text-gray-700 flex-1">
        <p><strong>CPU:</strong> {m.discovery.cpuLogicalCores} cores · {m.discovery.cpuArchitecture}</p>
        <p><strong>RAM:</strong> {m.discovery.memoryMb >= 1024 ? `${(m.discovery.memoryMb / 1024).toFixed(0)} GB` : `${m.discovery.memoryMb} MB`}</p>
        <p><strong>OS:</strong> {m.discovery.operatingSystem}</p>
        <p><strong>Region:</strong> {m.region}</p>

        {m.discovery.gpuCount > 0 && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs space-y-1">
            <p><strong>GPU:</strong> {m.discovery.gpuCount}× {m.discovery.gpuModel}</p>
            <p><strong>VRAM:</strong> {m.discovery.gpuMemoryMb != null ? `${m.discovery.gpuMemoryMb} MB` : 'N/A'}</p>
            <p><strong>CUDA:</strong> {m.discovery.cudaVersion ?? 'N/A'}</p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t">
        <p className="text-sm font-medium text-gray-900">
          Est. ~{(totalCentsPerHour / 100).toFixed(2)} {m.pricing.currency}/hr
        </p>
        <p className="text-xs text-gray-500">Min. billing: {m.pricing.minBillingMinutes} min</p>
      </div>

      <div className="mt-3">
        <Link
          href={`/marketplace/${m.id}`}
          className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm"
        >
          View & Provision
        </Link>
      </div>
    </div>
  );
}

// ---------- Main page ----------
export default function MarketplacePage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Use a ref to track in-flight request to prevent duplicates
  const loadingRef = useRef(false);

  const buildQuery = useCallback(
    (cursor: string | null): string => {
      const q = new URLSearchParams();
      // API parameter → backend field mapping:
      if (filters.cpuMin)               q.set('cpuMin', filters.cpuMin);           // → discovery.cpuLogicalCores ≥ cpuMin
      if (filters.ramMin)               q.set('ramMin', filters.ramMin);           // → discovery.memoryMb ≥ ramMin
      if (filters.gpuRequired)          q.set('gpuRequired', 'true');              // → discovery.gpuCount > 0 && gpuDiscoveryStatus=SUCCESS
      if (filters.gpuModel)             q.set('gpuModel', filters.gpuModel);       // → discovery.gpuModel contains gpuModel
      if (filters.gpuVramMin)           q.set('gpuVramMin', filters.gpuVramMin);   // → discovery.gpuMemoryMb ≥ gpuVramMin
      if (filters.cudaVersion)          q.set('cudaVersion', filters.cudaVersion); // → discovery.cudaVersion
      if (filters.architecture)         q.set('architecture', filters.architecture); // → discovery.cpuArchitecture
      if (filters.operatingSystem)      q.set('operatingSystem', filters.operatingSystem); // → discovery.operatingSystem
      if (filters.region)               q.set('region', filters.region);           // → machine.region
      if (filters.maxPriceCentsPerHour) q.set('maxPriceCentsPerHour', filters.maxPriceCentsPerHour); // → pricing filter
      if (filters.availableNow)         q.set('availableNow', 'true');             // → status=AVAILABLE only
      if (cursor)                       q.set('cursor', cursor);
      return q.toString();
    },
    [filters],
  );

  const load = useCallback(
    async (append: boolean, cursor: string | null) => {
      if (loadingRef.current) return; // prevent duplicate requests
      loadingRef.current = true;
      setLoading(true);
      setError('');
      try {
        const qs = buildQuery(cursor);
        const data = await fetchWithAuth(`/marketplace/machines?${qs}`);
        setMachines(prev => (append ? [...prev, ...data.data] : data.data));
        setNextCursor(data.nextCursor ?? null);
      } catch (err: unknown) {
        const msg = err instanceof ApiError ? err.message : 'Failed to load machines';
        setError(msg);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [buildQuery],
  );

  // Filter changes → reset cursor, fresh load
  useEffect(() => {
    const timer = setTimeout(() => {
      setNextCursor(null);
      setMachines([]);
      load(false, null);
    }, 400);
    return () => clearTimeout(timer);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMore = () => {
    if (nextCursor && !loading) load(true, nextCursor);
  };

  const handleFilterChange = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Compute Marketplace</h1>

      {/* ---- Filter panel ---- */}
      <details open className="bg-white rounded-lg shadow border">
        <summary className="px-4 py-3 font-semibold cursor-pointer">Filters</summary>
        <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">

          <div>
            <label className="label">Min CPU Cores</label>
            <input type="number" min={1} className="input" value={filters.cpuMin}
              onChange={e => handleFilterChange('cpuMin', e.target.value)} />
          </div>

          <div>
            <label className="label">Min RAM (MB)</label>
            <input type="number" min={1} className="input" value={filters.ramMin}
              onChange={e => handleFilterChange('ramMin', e.target.value)} />
          </div>

          <div>
            <label className="label">GPU Model</label>
            <input type="text" className="input" placeholder="e.g. A100" value={filters.gpuModel}
              onChange={e => handleFilterChange('gpuModel', e.target.value)} />
          </div>

          <div>
            <label className="label">Min GPU VRAM (MB)</label>
            <input type="number" min={0} className="input" value={filters.gpuVramMin}
              onChange={e => handleFilterChange('gpuVramMin', e.target.value)} />
          </div>

          <div>
            <label className="label">CUDA Version</label>
            <input type="text" className="input" placeholder="e.g. 12.0" value={filters.cudaVersion}
              onChange={e => handleFilterChange('cudaVersion', e.target.value)} />
          </div>

          <div>
            <label className="label">Architecture</label>
            <input type="text" className="input" placeholder="e.g. x86_64" value={filters.architecture}
              onChange={e => handleFilterChange('architecture', e.target.value)} />
          </div>

          <div>
            <label className="label">Operating System</label>
            <input type="text" className="input" placeholder="e.g. Ubuntu 22.04" value={filters.operatingSystem}
              onChange={e => handleFilterChange('operatingSystem', e.target.value)} />
          </div>

          <div>
            <label className="label">Region</label>
            <input type="text" className="input" placeholder="e.g. us-east-1" value={filters.region}
              onChange={e => handleFilterChange('region', e.target.value)} />
          </div>

          <div>
            <label className="label">Max Price (cents/hr)</label>
            <input type="number" min={0} className="input" value={filters.maxPriceCentsPerHour}
              onChange={e => handleFilterChange('maxPriceCentsPerHour', e.target.value)} />
          </div>

          <div className="flex flex-col gap-2 pt-5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" className="h-4 w-4 rounded text-blue-600"
                checked={filters.gpuRequired}
                onChange={e => handleFilterChange('gpuRequired', e.target.checked)} />
              GPU Required
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" className="h-4 w-4 rounded text-blue-600"
                checked={filters.availableNow}
                onChange={e => handleFilterChange('availableNow', e.target.checked)} />
              Available Now
            </label>
          </div>

          <div className="flex items-end">
            <button onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-sm text-gray-500 hover:text-gray-900 underline">
              Clear filters
            </button>
          </div>
        </div>
      </details>

      {/* ---- Error ---- */}
      {error && <ErrorBanner error={error} onRetry={() => load(false, null)} />}

      {/* ---- Machine grid ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map(m => <MachineCard key={m.id} m={m} />)}
      </div>

      {/* ---- Loading ---- */}
      {loading && (
        <div className="text-center py-6 text-gray-500">Loading machines…</div>
      )}

      {/* ---- Empty ---- */}
      {!loading && machines.length === 0 && !error && (
        <div className="text-center py-10 text-gray-500 bg-white rounded-lg shadow border">
          No machines match your criteria.
        </div>
      )}

      {/* ---- Load more ---- */}
      {nextCursor && !loading && (
        <div className="text-center pt-2">
          <button onClick={handleLoadMore}
            className="px-6 py-2 bg-white border shadow-sm rounded hover:bg-gray-50 font-medium text-sm">
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
