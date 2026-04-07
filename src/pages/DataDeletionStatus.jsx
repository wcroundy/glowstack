import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function DataDeletionStatus() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }
    fetch(`/api/meta/data-deletion-status?code=${code}`)
      .then(r => r.json())
      .then(data => setStatus(data))
      .catch(() => setStatus({ status: 'error' }))
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Data Deletion Status</h1>

        {!code && (
          <p className="text-gray-600 dark:text-gray-400">No confirmation code provided.</p>
        )}

        {loading && (
          <p className="text-gray-600 dark:text-gray-400">Checking status...</p>
        )}

        {status?.status === 'completed' && (
          <div className="bg-green-50 dark:bg-green-900/30 p-6 rounded-lg">
            <p className="text-green-700 dark:text-green-300 font-medium">Data deletion completed</p>
            <p className="text-sm text-green-600 dark:text-green-400 mt-2">
              Your data was deleted on {new Date(status.deleted_at).toLocaleDateString()}.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">Confirmation code: {code}</p>
          </div>
        )}

        {status?.status === 'pending' && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 p-6 rounded-lg">
            <p className="text-yellow-700 dark:text-yellow-300 font-medium">Deletion in progress</p>
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
              Your data deletion request is being processed.
            </p>
          </div>
        )}

        {status?.status === 'error' && (
          <div className="bg-red-50 dark:bg-red-900/30 p-6 rounded-lg">
            <p className="text-red-700 dark:text-red-300 font-medium">Unable to check status</p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-2">
              Please contact support at privacy@glowstack.net.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
