'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth, ApiError } from '@/lib/api';

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

// ---------- Job form state ----------
interface JobForm {
  name: string;
  cpuCoresMin: string;
  memoryMbMin: string;
  gpuRequired: boolean;
  gpuCount: string;
  gpuModel: string;
  gpuMemoryMbMin: string;
  cudaVersion: string;
  architecture: string;
  operatingSystem: string;
  region: string;
  maxPriceCentsPerHour: string;
}

function statusBadge(available: boolean) {
  return (
    <span className={`px-3 py-1 text-sm font-bold rounded ${available ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
      {available ? 'AVAILABLE' : 'BUSY — not immediately assignable'}
    </span>
  );
}

export default function MachineDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobError, setJobError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const [form, setForm] = useState<JobForm>({
    name: '',
    cpuCoresMin: '',
    memoryMbMin: '',
    gpuRequired: false,
    gpuCount: '',
    gpuModel: '',
    gpuMemoryMbMin: '',
    cudaVersion: '',
    architecture: '',
    operatingSystem: '',
    region: '',
    maxPriceCentsPerHour: '',
  });

  useEffect(() => {
    const fetchMachine = async () => {
      setLoading(true);
      setError('');
      try {
        // No single-machine GET endpoint in M12 marketplace; load the first page and find by ID.
        // In production this should be a dedicated GET /marketplace/machines/:id endpoint.
        const allRes = await fetchWithAuth('/marketplace/machines?limit=100');
        const m = allRes.data.find((x: Machine) => x.id === params.id);
        if (!m) throw new ApiError('Machine not found or no longer available on marketplace', 404);
        setMachine(m);
        // Pre-fill job form with machine's defaults
        setForm(prev => ({
          ...prev,
          region: m.region,
          operatingSystem: m.discovery.operatingSystem,
          architecture: m.discovery.cpuArchitecture,
          gpuRequired: m.discovery.gpuCount > 0,
          gpuModel: m.discovery.gpuModel ?? '',
          cudaVersion: m.discovery.cudaVersion ?? '',
        }));
      } catch (err: unknown) {
        setError(err instanceof ApiError ? err.message : 'Failed to load machine');
      } finally {
        setLoading(false);
      }
    };
    fetchMachine();
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machine) return;
    setJobError('');
    setSubmitting(true);
    try {
      // Build requirements from form; targetMachineId is a PREFERENCE — backend scheduler may choose another
      const requirements: Record<string, unknown> = {
        targetMachineId: machine.id, // preferred machine, not required
      };
      if (form.cpuCoresMin)       requirements.cpuCoresMin = parseInt(form.cpuCoresMin, 10);
      if (form.memoryMbMin)       requirements.memoryMbMin = parseInt(form.memoryMbMin, 10);
      if (form.gpuRequired)       requirements.gpuRequired = true;
      if (form.gpuCount)          requirements.gpuCount = parseInt(form.gpuCount, 10);
      if (form.gpuModel)          requirements.gpuModel = form.gpuModel;
      if (form.gpuMemoryMbMin)    requirements.gpuMemoryMbMin = parseInt(form.gpuMemoryMbMin, 10);
      if (form.cudaVersion)       requirements.cudaVersion = form.cudaVersion;
      if (form.architecture)      requirements.architecture = form.architecture;
      if (form.operatingSystem)   requirements.operatingSystem = form.operatingSystem;
      if (form.region)            requirements.region = form.region;
      if (form.maxPriceCentsPerHour) requirements.maxPriceCentsPerHour = parseInt(form.maxPriceCentsPerHour, 10);

      const payload = {
        name: form.name.trim() || `Job for ${machine.name}`,
        requirements,
      };

      const res = await fetchWithAuth('/jobs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSubmitted(res.id);
    } catch (err: unknown) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.status === 403) {
        setJobError('Access denied: you must be logged in as a CUSTOMER to create jobs.');
      } else if (apiErr?.status === 409) {
        setJobError('Conflict: a duplicate or incompatible job already exists.');
      } else if (apiErr?.status === 429) {
        setJobError('Rate limited. Please wait a moment and try again.');
      } else {
        setJobError(err instanceof ApiError ? err.message : 'Failed to create job');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading machine details…</div>;
  if (error)   return (
    <div className="p-8 text-center">
      <p className="text-red-600 mb-4">{error}</p>
      <button onClick={() => router.push('/marketplace')} className="text-blue-600 underline">← Back to Marketplace</button>
    </div>
  );
  if (!machine) return null;

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 space-y-4">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-bold text-green-700">Job Created Successfully</h1>
        <p className="text-gray-600">Job ID: <code className="font-mono">{submitted}</code></p>
        <p className="text-sm text-gray-500">
          The scheduler will assign this job to your <strong>preferred machine</strong> ({machine.name}) if it is eligible,
          or another eligible machine if the preferred one is unavailable.
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <button onClick={() => router.push('/marketplace')} className="px-4 py-2 border rounded hover:bg-gray-50">← Marketplace</button>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Go to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <div>
          <button onClick={() => router.push('/marketplace')} className="text-sm text-blue-600 hover:underline mb-1 block">← Back to Marketplace</button>
          <h1 className="text-3xl font-bold text-gray-900">{machine.name}</h1>
          <p className="text-gray-500">{machine.provider.displayName} · {machine.region}</p>
        </div>
        {statusBadge(machine.availableNow)}
      </div>

      {/* Machine specs + pricing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-lg font-bold border-b pb-2 mb-4">Verified Specifications</h2>
          <div className="space-y-2 text-sm text-gray-700">
            <p><strong>CPU:</strong> {machine.discovery.cpuLogicalCores} cores · {machine.discovery.cpuArchitecture}</p>
            <p><strong>RAM:</strong> {machine.discovery.memoryMb >= 1024 ? `${(machine.discovery.memoryMb/1024).toFixed(0)} GB` : `${machine.discovery.memoryMb} MB`}</p>
            <p><strong>OS:</strong> {machine.discovery.operatingSystem}</p>
            <p><strong>Region:</strong> {machine.region}</p>
            {machine.discovery.gpuCount > 0 && (
              <div className="mt-3 p-3 bg-gray-50 rounded space-y-1">
                <p className="font-semibold">GPU Acceleration</p>
                <p>{machine.discovery.gpuCount}× {machine.discovery.gpuModel}</p>
                <p>VRAM: {machine.discovery.gpuMemoryMb != null ? `${machine.discovery.gpuMemoryMb} MB` : 'N/A'}</p>
                <p>CUDA: {machine.discovery.cudaVersion ?? 'N/A'}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-lg font-bold border-b pb-2 mb-4">Pricing</h2>
          <div className="space-y-2 text-sm font-mono">
            <p>Base flat: {machine.pricing.flatCentsPerHour} ¢/hr ({(machine.pricing.flatCentsPerHour/100).toFixed(2)} {machine.pricing.currency})</p>
            <p>CPU: {machine.pricing.cpuCentsPerHour} ¢/core/hr</p>
            <p>Memory: {machine.pricing.memoryGbCentsPerHour} ¢/GB/hr</p>
            {machine.discovery.gpuCount > 0 && <p>GPU: {machine.pricing.gpuCentsPerHour} ¢/GPU/hr</p>}
          </div>
          <p className="text-xs text-gray-500 mt-3 border-t pt-2">
            Minimum billing period: {machine.pricing.minBillingMinutes} minutes.
            Displayed pricing is an estimate — backend quote is authoritative at job creation.
          </p>
        </div>
      </div>

      {/* Job creation form */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-xl font-bold text-blue-900 mb-1">Create Job</h2>
        <p className="text-sm text-blue-700 mb-4">
          <strong>{machine.name}</strong> will be set as your <strong>preferred machine</strong> (not a hard requirement).
          If it is unavailable or ineligible at scheduling time, the backend scheduler may select another eligible machine.
        </p>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Job Name <span className="text-red-500">*</span></label>
            <input required className="input" type="text" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. LLM Fine-tuning" />
          </div>

          <div>
            <label className="label">Min CPU Cores</label>
            <input className="input" type="number" min={1} value={form.cpuCoresMin}
              onChange={e => setForm(p => ({ ...p, cpuCoresMin: e.target.value }))} />
          </div>

          <div>
            <label className="label">Min RAM (MB)</label>
            <input className="input" type="number" min={1} value={form.memoryMbMin}
              onChange={e => setForm(p => ({ ...p, memoryMbMin: e.target.value }))} />
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" id="gpuRequired" className="h-4 w-4"
              checked={form.gpuRequired}
              onChange={e => setForm(p => ({ ...p, gpuRequired: e.target.checked }))} />
            <label htmlFor="gpuRequired" className="text-sm font-medium">GPU Required</label>
          </div>

          {form.gpuRequired && (
            <>
              <div>
                <label className="label">GPU Count</label>
                <input className="input" type="number" min={1} value={form.gpuCount}
                  onChange={e => setForm(p => ({ ...p, gpuCount: e.target.value }))} />
              </div>
              <div>
                <label className="label">GPU Model</label>
                <input className="input" type="text" value={form.gpuModel}
                  onChange={e => setForm(p => ({ ...p, gpuModel: e.target.value }))} />
              </div>
              <div>
                <label className="label">Min GPU VRAM (MB)</label>
                <input className="input" type="number" min={0} value={form.gpuMemoryMbMin}
                  onChange={e => setForm(p => ({ ...p, gpuMemoryMbMin: e.target.value }))} />
              </div>
              <div>
                <label className="label">CUDA Version</label>
                <input className="input" type="text" value={form.cudaVersion}
                  onChange={e => setForm(p => ({ ...p, cudaVersion: e.target.value }))} />
              </div>
            </>
          )}

          <div>
            <label className="label">Architecture</label>
            <input className="input" type="text" value={form.architecture}
              onChange={e => setForm(p => ({ ...p, architecture: e.target.value }))} />
          </div>

          <div>
            <label className="label">Operating System</label>
            <input className="input" type="text" value={form.operatingSystem}
              onChange={e => setForm(p => ({ ...p, operatingSystem: e.target.value }))} />
          </div>

          <div>
            <label className="label">Region</label>
            <input className="input" type="text" value={form.region}
              onChange={e => setForm(p => ({ ...p, region: e.target.value }))} />
          </div>

          <div>
            <label className="label">Max Price (cents/hr) — backend enforces this ceiling</label>
            <input className="input" type="number" min={0} value={form.maxPriceCentsPerHour}
              onChange={e => setForm(p => ({ ...p, maxPriceCentsPerHour: e.target.value }))} />
          </div>

          <div className="sm:col-span-2 p-3 bg-white rounded border text-xs text-gray-500 font-mono">
            Preferred machine: <strong>{machine.name}</strong> ({machine.id})<br/>
            targetMachineId will be sent as a scheduling preference. Backend may select another eligible machine.
          </div>

          {jobError && (
            <div className="sm:col-span-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
              {jobError}
            </div>
          )}

          <div className="sm:col-span-2">
            <button type="submit" disabled={submitting}
              className="w-full sm:w-auto px-8 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
