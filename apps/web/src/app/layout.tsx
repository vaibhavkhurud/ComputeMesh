import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ComputeMesh',
  description: 'Distributed Compute Marketplace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-gray-50 flex flex-col">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <a href="/" className="font-bold text-xl text-blue-600">
              ComputeMesh
            </a>
            <nav className="space-x-4">
              <a href="/marketplace" className="text-gray-600 hover:text-gray-900 font-medium">Marketplace</a>
              <a href="/provider/machines" className="text-gray-600 hover:text-gray-900 font-medium">Provider Dashboard</a>
            </nav>
          </div>
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
