import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useScanStatus, useFailedCitizens, useScans } from '../api/hooks';
import { startScan, stopScan, retryFailedCitizens, retryAllFailedCitizens } from '../api/client';
import { formatNumber, formatDateTime, formatEta } from '../utils/formatters';
import Pagination from '../components/Pagination';

function ScanManagement() {
  const queryClient = useQueryClient();
  const { data: status, isLoading: statusLoading } = useScanStatus();
  const { data: scans } = useScans();
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(10);
  const { data: failed } = useFailedCitizens(undefined, limit, offset);

  const [startId, setStartId] = useState('');
  const [endId, setEndId] = useState('');
  const [scanType, setScanType] = useState<'full' | 'alive'>('full');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['scanStatus'] });
    queryClient.invalidateQueries({ queryKey: ['failedCitizens'] });
  };

  const startMutation = useMutation({
    mutationFn: () => startScan(parseInt(startId, 10), parseInt(endId, 10), scanType),
    onSuccess: invalidate,
  });

  const stopMutation = useMutation({
    mutationFn: stopScan,
    onSuccess: invalidate,
  });

  const retrySelectedMutation = useMutation({
    mutationFn: () => retryFailedCitizens(Array.from(selected)),
    onSuccess: () => { setSelected(new Set()); invalidate(); },
  });

  const retryAllMutation = useMutation({
    mutationFn: retryAllFailedCitizens,
    onSuccess: invalidate,
  });

  const isRunning = status?.state === 'running';
  const canStart = !isRunning && (
    scanType === 'alive' ||
    (!!startId && !!endId && parseInt(startId, 10) < parseInt(endId, 10))
  );

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allIds = (failed?.results || []).map((f) => f.id);
    setSelected(selected.size === allIds.length ? new Set() : new Set(allIds));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Scan Management</h1>

      {/* Status Card */}
      <div className="bg-surface rounded-lg border shadow-card p-4 mb-6">
        <h2 className="text-lg font-semibold text-primary mb-3">Scanner Status</h2>
        {statusLoading ? (
          <div className="text-secondary">Loading...</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="font-medium text-primary">{isRunning ? 'Running' : 'Idle'}</span>
              {status?.scan_id && <span className="text-secondary text-sm">Scan #{status.scan_id}</span>}
            </div>

            {isRunning && status?.start_id !== undefined && (
              <>
                <div className="text-sm text-secondary">
                  Range: {formatNumber(status.start_id)} – {formatNumber(status.end_id!)}
                  {status.current_id !== undefined && (
                    <> · At ID: <span className="text-primary font-medium">{formatNumber(status.current_id)}</span></>
                  )}
                </div>

                {status.progress_pct !== undefined && (
                  <div>
                    <div className="flex justify-between text-xs text-secondary mb-1">
                      <span>{status.progress_pct.toFixed(3)}%</span>
                      <span>
                        {status.rate_per_min !== undefined && <>{formatNumber(status.rate_per_min)} IDs/min · </>}
                        {status.eta_seconds != null
                          ? `ETA ~${formatEta(status.eta_seconds)}`
                          : 'Calculating...'}
                      </span>
                    </div>
                    <div className="w-full bg-surface-secondary rounded-full h-2">
                      <div
                        className="bg-accent h-2 rounded-full transition-all"
                        style={{ width: `${status.progress_pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {status.stats && (
                  <div className="flex gap-4 text-sm flex-wrap">
                    <span className="text-semantic-green">Alive: {formatNumber(status.stats.alive)}</span>
                    <span className="text-secondary">Dead: {formatNumber(status.stats.dead)}</span>
                    <span className="text-semantic-gold">Banned: {formatNumber(status.stats.banned)}</span>
                    <span className="text-secondary">Not found: {formatNumber(status.stats.not_found)}</span>
                    <span className="text-semantic-red">Errors: {formatNumber(status.stats.errors)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-surface rounded-lg border shadow-card p-4 mb-6">
        <h2 className="text-lg font-semibold text-primary mb-3">Start New Scan</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-secondary mb-1">Start ID</label>
            <input
              type="number"
              value={startId}
              onChange={(e) => setStartId(e.target.value)}
              disabled={isRunning || scanType === 'alive'}
              placeholder="e.g. 9730001"
              className="w-36 px-3 py-1.5 text-sm bg-surface-secondary border rounded-md focus:outline-none focus:ring-1 focus:ring-accent text-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1">End ID</label>
            <input
              type="number"
              value={endId}
              onChange={(e) => setEndId(e.target.value)}
              disabled={isRunning || scanType === 'alive'}
              placeholder="e.g. 9740000"
              className="w-36 px-3 py-1.5 text-sm bg-surface-secondary border rounded-md focus:outline-none focus:ring-1 focus:ring-accent text-primary disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-secondary mb-1">Type</label>
            <div className="flex gap-2">
              {(['full', 'alive'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setScanType(t)}
                  disabled={isRunning}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors disabled:opacity-50 ${
                    scanType === t ? 'bg-accent text-white' : 'bg-surface-secondary text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => startMutation.mutate()}
              disabled={!canStart || startMutation.isPending}
              className="px-4 py-1.5 text-sm bg-accent text-white rounded-md font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              Start Scan
            </button>
            <button
              onClick={() => stopMutation.mutate()}
              disabled={!isRunning || stopMutation.isPending}
              className="px-4 py-1.5 text-sm bg-semantic-red text-white rounded-md font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              Stop Scan
            </button>
          </div>
        </div>
        {(startMutation.error || stopMutation.error) && (
          <p className="mt-2 text-sm text-semantic-red">
            {((startMutation.error || stopMutation.error) as Error)?.message}
          </p>
        )}
      </div>

      {/* Scan History */}
      {scans && scans.length > 0 && (
        <div className="bg-surface rounded-lg border shadow-card p-4 mb-6">
          <h2 className="text-lg font-semibold text-primary mb-3">Scan History</h2>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b text-left text-secondary">
                <th className="pb-2 font-medium">ID</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium whitespace-nowrap">Range</th>
                <th className="pb-2 font-medium">Started</th>
                <th className="pb-2 font-medium">Finished</th>
                <th className="pb-2 font-medium text-right">Scanned</th>
                <th className="pb-2 font-medium text-right">Found</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => (
                <tr key={scan.id} className="border-b border-surface-secondary">
                  <td className="py-2 text-primary">{scan.id}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${scan.scan_type === 'full' ? 'bg-accent-light text-accent' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {scan.scan_type}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      scan.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      scan.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      scan.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      scan.status === 'cancelled' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {scan.status}
                    </span>
                  </td>
                  <td className="py-2 text-secondary">{formatNumber(scan.start_id)} – {formatNumber(scan.end_id)}</td>
                  <td className="py-2 text-secondary">{formatDateTime(scan.started_at)}</td>
                  <td className="py-2 text-secondary">{formatDateTime(scan.finished_at)}</td>
                  <td className="py-2 text-primary text-right">{formatNumber(scan.total_scanned)}</td>
                  <td className="py-2 text-primary text-right">{formatNumber(scan.total_found)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Failed Citizens */}
      <div className="bg-surface rounded-lg border shadow-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
          <h2 className="text-lg font-semibold text-primary">
            Failed Citizens {failed?.total !== undefined && <span className="text-secondary text-sm font-normal ml-1">({formatNumber(failed.total)} total)</span>}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => retrySelectedMutation.mutate()}
              disabled={selected.size === 0 || retrySelectedMutation.isPending || isRunning}
              className="px-3 py-1 text-xs bg-accent text-white rounded-md font-medium disabled:opacity-50 hover:bg-accent-hover transition-colors"
            >
              Retry Selected ({selected.size})
            </button>
            <button
              onClick={() => retryAllMutation.mutate()}
              disabled={(failed?.total ?? 0) === 0 || retryAllMutation.isPending || isRunning}
              className="px-3 py-1 text-xs bg-surface-secondary text-secondary rounded-md font-medium disabled:opacity-50 hover:bg-surface-hover transition-colors"
            >
              Retry All
            </button>
          </div>
        </div>

        {!failed?.results?.length ? (
          <div className="text-secondary text-sm py-4">No failed citizens.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b text-left text-secondary">
                  <th className="pb-2">
                    <input type="checkbox" checked={selected.size === failed.results.length} onChange={toggleAll} />
                  </th>
                  <th className="pb-2 font-medium whitespace-nowrap">Citizen ID</th>
                  <th className="pb-2 font-medium">Error</th>
                  <th className="pb-2 font-medium text-right">Status</th>
                  <th className="pb-2 font-medium text-right">Retries</th>
                  <th className="pb-2 font-medium whitespace-nowrap">Failed At</th>
                  <th className="pb-2 font-medium whitespace-nowrap">Retried At</th>
                </tr>
              </thead>
              <tbody>
                {failed.results.map((f) => (
                  <tr key={f.id} className="border-b border-surface-secondary hover:bg-surface-hover">
                    <td className="py-2">
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} />
                    </td>
                    <td className="py-2 font-medium whitespace-nowrap">
                      <a
                        href={`https://www.erepublik.com/en/citizen/profile/${f.citizen_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        {f.citizen_id}
                      </a>
                    </td>
                    <td className="py-2 text-secondary truncate max-w-xs">{f.error_message}</td>
                    <td className="py-2 text-right">
                      {f.status_code ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          {f.status_code}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2 text-right text-secondary">{f.retry_count}</td>
                    <td className="py-2 text-secondary whitespace-nowrap">{formatDateTime(f.failed_at)}</td>
                    <td className="py-2 text-secondary whitespace-nowrap">{f.retried_at ? formatDateTime(f.retried_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {failed && (
              <Pagination
                total={failed.total}
                limit={limit}
                offset={offset}
                onPageChange={setOffset}
                limitOptions={[10, 25, 50, 100]}
                onLimitChange={(n) => { setLimit(n); setOffset(0); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ScanManagement;
