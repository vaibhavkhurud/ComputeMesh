'use client';

import { useState, useEffect } from 'react';
import { fetchWithAuth, ApiError } from '@/lib/api';

interface Machine {
  id: string;
  name: string;
  status: string; // AVAILABLE | BUSY | OFFLINE — read-only, set by backend agent
  marketplaceStatus: string; // LISTED | UNLISTED | PAUSED — provider-controlled
  region: string;
  discovery: {
    cpuLogicalCores?: number;
    memoryMb?: number;
    gpuCount?: number;
    gpuModel?: string | null;
  } | null;
  pricing: {
    flatCentsPerHour: number;
    cpuCentsPerHour: number;
    memoryGbCentsPerHour: number;
    gpuCentsPerHour: number;
    currency: string;
    minBillingMinutes: number;
  } | null;
}

// Pricing form uses integer cents — displayed as human-readable decimals for UX only
interface PricingForm {
  flatCentsPerHour: string;
  cpuCentsPerHour: string;
  memoryGbCentsPerHour: string;
  gpuCentsPerHour: string;
  currency: string;
  minBillingMinutes: string;
}

function RuntimeBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    AVAILABLE: 'bg-green-100 text-green-800',
    BUSY: 'bg-yellow-100 text-yellow-800',
    OFFLINE: 'bg-gray-100 text-gray-600',
    FAILED: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function ListingBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    LISTED: 'bg-blue-100 text-blue-800',
    PAUSED: 'bg-orange-100 text-orange-800',
    UNLISTED: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

export default function ProviderMachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceForm, setPriceForm] = useState<PricingForm>({
    flatCentsPerHour: '0',
    cpuCentsPerHour: '0',
    memoryGbCentsPerHour: '0',
    gpuCentsPerHour: '0',
    currency: 'USD',
    minBillingMinutes: '60',
  });
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadMachines = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWithAuth('/providers/me/machines');
      setMachines(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.status === 403) {
        setError('Access denied: this page requires a PROVIDER role. Please log in with a provider account.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to load machines');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMachines(); }, []);

  const handleUpdateListing = async (id: string, status: string) => {
    try {
      await fetchWithAuth(`/providers/me/machines/${id}/listing`, {
        method: 'PATCH',
        body: JSON.stringify({ marketplaceStatus: status }),
      });
      await loadMachines();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Failed to update listing');
    }
  };

  const openPricingEditor = (m: Machine) => {
    setEditingPriceId(m.id);
    setSaveError('');
    setPriceForm({
      flatCentsPerHour: String(m.pricing?.flatCentsPerHour ?? 0),
      cpuCentsPerHour: String(m.pricing?.cpuCentsPerHour ?? 0),
      memoryGbCentsPerHour: String(m.pricing?.memoryGbCentsPerHour ?? 0),
      gpuCentsPerHour: String(m.pricing?.gpuCentsPerHour ?? 0),
      currency: m.pricing?.currency ?? 'USD',
      minBillingMinutes: String(m.pricing?.minBillingMinutes ?? 60),
    });
  };

  const handleSavePrice = async (id: string) => {
    setSaving(true);
    setSaveError('');
    try {
      // All values sent as integers — no floating-point currency math
      const body = {
        flatCentsPerHour: parseInt(priceForm.flatCentsPerHour, 10) || 0,
        cpuCentsPerHour: parseInt(priceForm.cpuCentsPerHour, 10) || 0,
        memoryGbCentsPerHour: parseInt(priceForm.memoryGbCentsPerHour, 10) || 0,
        gpuCentsPerHour: parseInt(priceForm.gpuCentsPerHour, 10) || 0,
        currency: priceForm.currency,
        minBillingMinutes: parseInt(priceForm.minBillingMinutes, 10) || 60,
      };
      await fetchWithAuth(`/providers/me/machines/${id}/pricing`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setEditingPriceId(null);
      await loadMachines();
    } catch (err: unknown) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save pricing');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading your machines…</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Provider Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Runtime status (AVAILABLE, BUSY, OFFLINE, FAILED) is set by the backend agent and is read-only here.
          </p>
        </div>
        <button onClick={loadMachines} className="text-sm text-blue-600 hover:underline">Refresh</button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded">
          {error}
        </div>
      )}

      {!error && machines.length === 0 && (
        <div className="text-center py-10 text-gray-500 bg-white rounded-lg shadow border">
          No machines registered. Use the Provider API to enroll a machine first.
        </div>
      )}

      {machines.length > 0 && (
        <div className="bg-white rounded-lg shadow border overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase text-xs">Machine</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase text-xs">Runtime Status<br/><span className="font-normal normal-case text-gray-400">(read-only)</span></th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase text-xs">Marketplace Listing</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase text-xs">Pricing (cents/hr)</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {machines.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {m.region}
                      {m.discovery && (
                        <> · {m.discovery.cpuLogicalCores ?? '?'} cores · {m.discovery.memoryMb ?? '?'} MB</>
                      )}
                    </div>
                  </td>

                  {/* Runtime status — READ ONLY */}
                  <td className="px-4 py-4">
                    <RuntimeBadge status={m.status} />
                    <p className="text-xs text-gray-400 mt-1">Agent-controlled</p>
                  </td>

                  {/* Marketplace listing — provider-controlled */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <ListingBadge status={m.marketplaceStatus} />
                    </div>
                    <select
                      className="mt-2 text-xs border-gray-300 rounded px-2 py-1 border"
                      value={m.marketplaceStatus}
                      onChange={e => handleUpdateListing(m.id, e.target.value)}
                    >
                      <option value="LISTED">List on Marketplace</option>
                      <option value="PAUSED">Pause Listing</option>
                      <option value="UNLISTED">Unlist</option>
                    </select>
                  </td>

                  {/* Pricing */}
                  <td className="px-4 py-4">
                    {editingPriceId === m.id ? (
                      <div className="space-y-2 min-w-[220px]">
                        {[
                          { label: 'Base flat (¢/hr)', key: 'flatCentsPerHour' },
                          { label: 'CPU (¢/core/hr)', key: 'cpuCentsPerHour' },
                          { label: 'Memory (¢/GB/hr)', key: 'memoryGbCentsPerHour' },
                          { label: 'GPU (¢/GPU/hr)', key: 'gpuCentsPerHour' },
                          { label: 'Min billing (min)', key: 'minBillingMinutes' },
                        ].map(({ label, key }) => (
                          <div key={key} className="flex items-center gap-2 text-xs">
                            <label className="w-36 text-gray-500 shrink-0">{label}</label>
                            <input
                              type="number" min={0}
                              className="border rounded px-2 py-0.5 w-24 text-right font-mono"
                              value={priceForm[key as keyof PricingForm]}
                              onChange={e => setPriceForm(p => ({ ...p, [key]: e.target.value }))}
                            />
                          </div>
                        ))}
                        <div className="flex items-center gap-2 text-xs">
                          <label className="w-36 text-gray-500 shrink-0">Currency</label>
                          <input className="border rounded px-2 py-0.5 w-24 uppercase"
                            type="text" maxLength={5}
                            value={priceForm.currency}
                            onChange={e => setPriceForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))} />
                        </div>
                        <p className="text-xs text-gray-400">
                          Display: ~{((parseInt(priceForm.flatCentsPerHour)||0) / 100).toFixed(2)} {priceForm.currency}/hr base
                        </p>
                        {saveError && <p className="text-red-600 text-xs">{saveError}</p>}
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => { setEditingPriceId(null); setSaveError(''); }}
                            className="text-xs text-gray-500 hover:text-gray-800 underline">Cancel</button>
                          <button onClick={() => handleSavePrice(m.id)} disabled={saving}
                            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="font-mono text-xs space-y-0.5 text-gray-700">
                        <p>Base: {m.pricing?.flatCentsPerHour ?? '-'} ¢ ({((m.pricing?.flatCentsPerHour ?? 0)/100).toFixed(2)} {m.pricing?.currency ?? ''})</p>
                        <p>CPU: {m.pricing?.cpuCentsPerHour ?? '-'} ¢/core/hr</p>
                        <p>Mem: {m.pricing?.memoryGbCentsPerHour ?? '-'} ¢/GB/hr</p>
                        <p>GPU: {m.pricing?.gpuCentsPerHour ?? '-'} ¢/GPU/hr</p>
                        <p className="text-gray-400">Min: {m.pricing?.minBillingMinutes ?? '-'} min</p>
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-4 text-right">
                    {editingPriceId !== m.id && (
                      <button onClick={() => openPricingEditor(m)}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium">
                        Edit Pricing
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
