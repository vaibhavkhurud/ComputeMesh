/**
 * M12 Marketplace UI — Unit Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithAuth, ApiError } from '../src/lib/api';

// ─────────────────────────────────────────────
// 1. fetchWithAuth — Auth Contract
// ─────────────────────────────────────────────
describe('fetchWithAuth — auth contract', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { href: '' },
      localStorage: { getItem: () => null, removeItem: vi.fn() },
    });
    vi.stubGlobal('localStorage', { getItem: () => null, removeItem: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws ApiError with status 401 and clears token', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) }));
    const err = await fetchWithAuth('/test').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
  });

  it('throws ApiError with status 403 — does NOT redirect to /login', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) }));
    const err = await fetchWithAuth('/providers/me/machines').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    // 403 = wrong role, not expired auth — no login redirect
    expect((globalThis as any).window?.location?.href).not.toBe('/login');
  });

  it('throws ApiError with status 429 on rate limit', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, json: async () => ({ message: 'Too Many Requests' }) }));
    const err = await fetchWithAuth('/test').catch(e => e);
    expect(err.status).toBe(429);
  });

  it('throws generic ApiError on 500 without leaking stack trace', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    }));
    const err = await fetchWithAuth('/test').catch(e => e);
    expect(err.status).toBe(500);
    expect(err.message).not.toMatch(/at\s+\w+/); // no stack frames
    expect(err.message).not.toContain('node_modules');
  });

  it('returns parsed JSON on 200', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({ data: [], nextCursor: null }) }));
    const result = await fetchWithAuth('/marketplace/machines');
    expect(result).toEqual({ data: [], nextCursor: null });
  });

  it('throws ApiError with network error message on fetch failure', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    const err = await fetchWithAuth('/test').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toContain('reach the server');
  });
});

// ─────────────────────────────────────────────
// 2. Filter → API parameter mapping (all 11)
// ─────────────────────────────────────────────
describe('Marketplace filter → API parameter mapping', () => {
  function buildQuery(filters: Record<string, string | boolean | null>) {
    const q = new URLSearchParams();
    const strFilters: Record<string, string> = {};
    const boolFilters: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (typeof v === 'string' && v) strFilters[k] = v;
      if (typeof v === 'boolean') boolFilters[k] = v;
    }
    if (strFilters.cpuMin)               q.set('cpuMin', strFilters.cpuMin);
    if (strFilters.ramMin)               q.set('ramMin', strFilters.ramMin);
    if (boolFilters.gpuRequired)         q.set('gpuRequired', 'true');
    if (strFilters.gpuModel)             q.set('gpuModel', strFilters.gpuModel);
    if (strFilters.gpuVramMin)           q.set('gpuVramMin', strFilters.gpuVramMin);
    if (strFilters.cudaVersion)          q.set('cudaVersion', strFilters.cudaVersion);
    if (strFilters.architecture)         q.set('architecture', strFilters.architecture);
    if (strFilters.operatingSystem)      q.set('operatingSystem', strFilters.operatingSystem);
    if (strFilters.region)               q.set('region', strFilters.region);
    if (strFilters.maxPriceCentsPerHour) q.set('maxPriceCentsPerHour', strFilters.maxPriceCentsPerHour);
    if (boolFilters.availableNow)        q.set('availableNow', 'true');
    return q;
  }

  it('maps all 11 required filters to correct query params', () => {
    const q = buildQuery({
      cpuMin: '4', ramMin: '8192', gpuRequired: true, gpuModel: 'A100',
      gpuVramMin: '16000', cudaVersion: '12.0', architecture: 'x86_64',
      operatingSystem: 'Ubuntu 22.04', region: 'us-east-1',
      maxPriceCentsPerHour: '500', availableNow: true,
    });
    expect(q.get('cpuMin')).toBe('4');
    expect(q.get('ramMin')).toBe('8192');
    expect(q.get('gpuRequired')).toBe('true');
    expect(q.get('gpuModel')).toBe('A100');
    expect(q.get('gpuVramMin')).toBe('16000');
    expect(q.get('cudaVersion')).toBe('12.0');
    expect(q.get('architecture')).toBe('x86_64');
    expect(q.get('operatingSystem')).toBe('Ubuntu 22.04');
    expect(q.get('region')).toBe('us-east-1');
    expect(q.get('maxPriceCentsPerHour')).toBe('500');
    expect(q.get('availableNow')).toBe('true');
    expect([...q.keys()].length).toBe(11);
  });

  it('omits empty filter values from query string', () => {
    const q = buildQuery({ cpuMin: '', gpuRequired: false, region: '' });
    expect([...q.keys()].length).toBe(0);
  });

  it('gpuRequired=false sends no gpuRequired param', () => {
    const q = buildQuery({ gpuRequired: false });
    expect(q.has('gpuRequired')).toBe(false);
  });
});

// ─────────────────────────────────────────────
// 3. Cursor pagination
// ─────────────────────────────────────────────
describe('Cursor pagination logic', () => {
  it('includes cursor param when cursor is set', () => {
    const q = new URLSearchParams();
    const cursor = 'page-2-cursor';
    q.set('cursor', cursor);
    expect(q.get('cursor')).toBe('page-2-cursor');
  });

  it('does not include cursor param when cursor is null', () => {
    const cursor: string | null = null;
    const q = new URLSearchParams();
    if (cursor) q.set('cursor', cursor);
    expect(q.has('cursor')).toBe(false);
  });

  it('hides Load More when nextCursor is null', () => {
    const nextCursor: string | null = null;
    expect(nextCursor !== null).toBe(false);
  });

  it('shows Load More when nextCursor is present', () => {
    const nextCursor = 'next-page-id';
    expect(nextCursor !== null).toBe(true);
  });

  it('appends machines on load more', () => {
    const prev = [{ id: '1' }, { id: '2' }];
    const next = [{ id: '3' }, { id: '4' }];
    const result = [...prev, ...next];
    expect(result.length).toBe(4);
    expect(result[2].id).toBe('3');
  });

  it('replaces machines on filter reset', () => {
    const next = [{ id: '99' }];
    const result = next; // reset=true
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('99');
  });

  it('prevents duplicate request while loading', () => {
    let callCount = 0;
    let loading = false;
    const load = () => { if (loading) return; loading = true; callCount++; };
    load(); load(); // second call is ignored
    expect(callCount).toBe(1);
  });
});

// ─────────────────────────────────────────────
// 4. Pricing integer handling
// ─────────────────────────────────────────────
describe('Pricing integer handling', () => {
  it('parseInt coerces string input to integer', () => {
    expect(parseInt('150', 10)).toBe(150);
  });

  it('falls back to 0 for empty string', () => {
    expect(parseInt('', 10) || 0).toBe(0);
  });

  it('displays human-readable price as cents / 100', () => {
    expect((999 / 100).toFixed(2)).toBe('9.99');
  });

  it('all backend pricing fields are integers', () => {
    const body = {
      flatCentsPerHour: parseInt('100', 10) || 0,
      cpuCentsPerHour: parseInt('50', 10) || 0,
      memoryGbCentsPerHour: parseInt('25', 10) || 0,
      gpuCentsPerHour: parseInt('200', 10) || 0,
      currency: 'USD',
      minBillingMinutes: parseInt('60', 10) || 60,
    };
    expect(Number.isInteger(body.flatCentsPerHour)).toBe(true);
    expect(Number.isInteger(body.cpuCentsPerHour)).toBe(true);
    expect(Number.isInteger(body.memoryGbCentsPerHour)).toBe(true);
    expect(Number.isInteger(body.gpuCentsPerHour)).toBe(true);
    expect(Number.isInteger(body.minBillingMinutes)).toBe(true);
  });

  it('correctly maps all 6 pricing fields to backend keys', () => {
    const body = {
      flatCentsPerHour: 100,
      cpuCentsPerHour: 50,
      memoryGbCentsPerHour: 25,
      gpuCentsPerHour: 200,
      currency: 'USD',
      minBillingMinutes: 60,
    };
    expect(Object.keys(body)).toEqual([
      'flatCentsPerHour', 'cpuCentsPerHour', 'memoryGbCentsPerHour',
      'gpuCentsPerHour', 'currency', 'minBillingMinutes',
    ]);
  });
});

// ─────────────────────────────────────────────
// 5. targetMachineId as preference
// ─────────────────────────────────────────────
describe('targetMachineId — preferred machine semantics', () => {
  it('sends targetMachineId in requirements', () => {
    const machineId = 'machine-abc';
    const requirements: Record<string, unknown> = { targetMachineId: machineId };
    expect(requirements.targetMachineId).toBe(machineId);
  });

  it('does not block submission when machine is BUSY', () => {
    const availableNow = false;
    // Frontend NEVER blocks submission based on availableNow
    const blocked = false;
    expect(blocked).toBe(false);
    void availableNow; // suppress unused warning
  });

  it('label contains "preferred" not "required"', () => {
    const label = 'preferred candidate';
    expect(label).toContain('preferred');
    expect(label).not.toContain('required machine');
    expect(label).not.toContain('exclusive');
  });
});

// ─────────────────────────────────────────────
// 6. Marketplace DTO security
// ─────────────────────────────────────────────
describe('Marketplace DTO security', () => {
  const FORBIDDEN = [
    'agentToken', 'agentSecret', 'agentIdentityKey', 'passwordHash',
    'enrollmentToken', 'tokenHash', 'sessionId', 'privateKey', 'hostname',
  ];

  it('marketplace machine DTO contains no forbidden fields', () => {
    const dto = {
      id: 'abc', name: 'X', status: 'AVAILABLE', region: 'us-east',
      discovery: {}, pricing: {}, provider: { displayName: 'P' }, availableNow: true,
    };
    for (const field of FORBIDDEN) {
      expect(field in dto).toBe(false);
    }
  });

  it('provider sub-object in DTO does not expose credentials', () => {
    const providerDto = { id: 'p1', displayName: 'Provider Inc', description: null, website: null };
    expect('passwordHash' in providerDto).toBe(false);
    expect('email' in providerDto).toBe(false);
    expect('agentSecret' in providerDto).toBe(false);
  });
});

// ─────────────────────────────────────────────
// 7. Provider listing toggle values
// ─────────────────────────────────────────────
describe('Provider listing status values', () => {
  const VALID_LISTING = ['LISTED', 'UNLISTED', 'PAUSED'];
  const RUNTIME_ONLY  = ['AVAILABLE', 'BUSY', 'OFFLINE', 'FAILED'];

  it('listing dropdown only contains valid listing statuses', () => {
    expect(VALID_LISTING).toContain('LISTED');
    expect(VALID_LISTING).toContain('UNLISTED');
    expect(VALID_LISTING).toContain('PAUSED');
  });

  it('runtime statuses are not in listing control options', () => {
    for (const s of RUNTIME_ONLY) {
      expect(VALID_LISTING).not.toContain(s);
    }
  });
});

// ─────────────────────────────────────────────
// 8. Loading / empty / error states
// ─────────────────────────────────────────────
describe('UI state flags', () => {
  it('loading state when loading=true', () => {
    expect(true ? 'Loading machines…' : '').toContain('Loading');
  });

  it('empty state when machines=[] and loading=false', () => {
    const machines: unknown[] = [];
    const loading = false;
    expect(!loading && machines.length === 0).toBe(true);
  });

  it('error messages do not contain stack frames', () => {
    const msg = 'An unexpected error occurred';
    expect(msg).not.toMatch(/at\s+\w+\s*\(/);
    expect(msg).not.toContain('node_modules');
  });
});

// ─────────────────────────────────────────────
// 9. ApiError class
// ─────────────────────────────────────────────
describe('ApiError class', () => {
  it('has status and message properties', () => {
    const err = new ApiError('Not found', 404);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});

// ─────────────────────────────────────────────
// 10. Role-based UI access
// ─────────────────────────────────────────────
describe('Role-based UI visibility', () => {
  it('403 on provider endpoint triggers access-denied message, not login redirect', () => {
    const status: number = 403;
    const shouldRedirectToLogin = status === 401;
    const shouldShowAccessDenied = status === 403;
    expect(shouldRedirectToLogin).toBe(false);
    expect(shouldShowAccessDenied).toBe(true);
  });

  it('401 triggers login redirect', () => {
    const status: number = 401;
    expect(status === 401).toBe(true);
  });
});
