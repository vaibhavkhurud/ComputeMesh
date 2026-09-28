export default function Page() {
  const env = process.env.NEXT_PUBLIC_APP_ENV || 'development';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 relative">
      {env !== 'production' && (
        <div className="absolute top-0 left-0 right-0 bg-primary-500 text-white text-center py-2 text-sm font-semibold">
          Development Environment
        </div>
      )}
      
      <div className="text-center space-y-6 max-w-2xl">
        <h1 className="text-5xl font-extrabold tracking-tight text-primary-900 dark:text-primary-100 sm:text-7xl">
          ComputeMesh
        </h1>
        <p className="text-2xl font-medium text-gray-600 dark:text-gray-300">
          Distributed Compute Marketplace
        </p>
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Join our decentralized network to securely share and utilize compute resources across the globe. Powered by seamless integration and robust architecture.
        </p>
        
        <div className="mt-10 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">System Status</h2>
          <div className="grid grid-cols-2 gap-4 text-sm text-left">
            <div className="flex flex-col">
              <span className="text-gray-500 dark:text-gray-400">Environment</span>
              <span className="font-mono font-medium text-primary-600 dark:text-primary-400">{env}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500 dark:text-gray-400">API Gateway</span>
              <span className="font-mono font-medium text-primary-600 dark:text-primary-400">{apiUrl}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
