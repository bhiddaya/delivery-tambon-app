import React, { useState, useEffect } from 'react';
import {
  Settings,
  Package,
  Home,
  Clock,
  AlertCircle,
  Loader,
  LogOut,
} from 'lucide-react';
import ShopProfile from './ShopDashboard/ShopProfile';
import ShopOrders from './ShopDashboard/ShopOrders';
import ShopMenu from './ShopDashboard/ShopMenu';

interface ShopDashboardProps {
  user: any;
  shopId: string;
  onLogout: () => void;
}

type DashboardTab = 'profile' | 'orders' | 'menu';

export default function ShopDashboard({
  user,
  shopId,
  onLogout,
}: ShopDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('orders');
  const [shop, setShop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unreadOrders, setUnreadOrders] = useState(0);

  // Fetch shop data on mount
  useEffect(() => {
    const fetchShop = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('authToken');
        const response = await fetch(
          `${process.env.REACT_APP_API_URL || 'https://delivery-pwa-iota.vercel.app/api'}/shops/${shopId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch shop data');
        }

        const data = await response.json();
        setShop(data.shop);
        setUnreadOrders(data.shop.pending_orders_count || 0);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load shop dashboard'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchShop();
  }, [shopId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader className="animate-spin mx-auto mb-4 text-green-600" size={48} />
          <p className="text-gray-600">Loading shop dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
          <AlertCircle className="text-red-600 mx-auto mb-4" size={48} />
          <h2 className="text-lg font-bold text-gray-800 mb-2 text-center">
            Error Loading Dashboard
          </h2>
          <p className="text-gray-600 text-center text-sm mb-4">{error}</p>
          <button
            onClick={onLogout}
            className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-green-600 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{shop?.name || 'Shop Dashboard'}</h1>
            <p className="text-green-100 text-sm">
              Welcome back, {user?.full_name || 'Shop Owner'}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-800 rounded-lg transition"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4">
            {/* Orders Tab */}
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 px-4 py-4 font-medium border-b-2 transition ${
                activeTab === 'orders'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <Package size={20} />
              Orders
              {unreadOrders > 0 && (
                <span className="ml-2 px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                  {unreadOrders}
                </span>
              )}
            </button>

            {/* Menu Tab */}
            <button
              onClick={() => setActiveTab('menu')}
              className={`flex items-center gap-2 px-4 py-4 font-medium border-b-2 transition ${
                activeTab === 'menu'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <Home size={20} />
              Menu
            </button>

            {/* Profile Tab */}
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-4 py-4 font-medium border-b-2 transition ${
                activeTab === 'profile'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <Settings size={20} />
              Profile
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'orders' && (
          <ShopOrders shopId={shopId} onUnreadChange={setUnreadOrders} />
        )}
        {activeTab === 'menu' && <ShopMenu shopId={shopId} />}
        {activeTab === 'profile' && <ShopProfile shop={shop} />}
      </main>

      {/* Footer */}
      <footer className="bg-gray-100 border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-600 text-sm">
          <p>© 2026 Delivery Platform. All rights reserved.</p>
          <p className="mt-2">
            Shop ID: {shopId} | Status: Active
          </p>
        </div>
      </footer>
    </div>
  );
}
