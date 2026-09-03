import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle,
  AlertCircle,
  Loader,
  Eye,
  Package,
  Truck,
  X,
} from 'lucide-react';

interface ShopOrdersProps {
  shopId: string;
  onUnreadChange: (count: number) => void;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  total_price: number;
  status: 'pending' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled';
  items: OrderItem[];
  created_at: string;
  estimated_delivery_time?: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
}

export default function ShopOrders({
  shopId,
  onUnreadChange,
}: ShopOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready'>(
    'pending'
  );

  // Fetch orders
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('authToken');
        const response = await fetch(
          `${process.env.REACT_APP_API_URL || 'https://delivery-pwa-iota.vercel.app/api'}/shops/${shopId}/orders`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch orders');
        }

        const data = await response.json();
        setOrders(data.orders || []);

        // Count unread orders
        const unread = (data.orders || []).filter(
          (o: Order) => o.status === 'pending'
        ).length;
        onUnreadChange(unread);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load orders'
        );
      } finally {
        setLoading(false);
      }
    };

    const interval = setInterval(fetchOrders, 5000); // Refresh every 5 seconds
    fetchOrders();

    return () => clearInterval(interval);
  }, [shopId, onUnreadChange]);

  const handleStatusUpdate = async (
    orderId: string,
    newStatus: string
  ) => {
    try {
      setUpdating(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'https://delivery-pwa-iota.vercel.app/api'}/shops/${shopId}/orders/${orderId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update order');
      }

      // Update local state
      setOrders(
        orders.map((order) =>
          order.id === orderId ? { ...order, status: newStatus as any } : order
        )
      );

      if (selectedOrder?.id === orderId) {
        setSelectedOrder({
          ...selectedOrder,
          status: newStatus as any,
        });
      }

      // Refresh unread count
      const unread = orders.filter((o) => o.status === 'pending').length;
      onUnreadChange(unread);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : 'Failed to update order status'
      );
    } finally {
      setUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'preparing':
        return 'bg-blue-100 text-blue-800';
      case 'ready':
        return 'bg-purple-100 text-purple-800';
      case 'picked_up':
        return 'bg-orange-100 text-orange-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock size={16} />;
      case 'preparing':
        return <Loader className="animate-spin" size={16} />;
      case 'ready':
        return <CheckCircle size={16} />;
      case 'picked_up':
        return <Truck size={16} />;
      case 'delivered':
        return <CheckCircle size={16} />;
      default:
        return <AlertCircle size={16} />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'preparing':
        return 'Preparing';
      case 'ready':
        return 'Ready for Pickup';
      case 'picked_up':
        return 'Picked Up';
      case 'delivered':
        return 'Delivered';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const filteredOrders = orders.filter(
    (order) => filter === 'all' || order.status === filter
  );

  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="animate-spin text-green-600 mr-2" size={32} />
        <p className="text-gray-600">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Orders List */}
      <div className="lg:col-span-2">
        {/* Filters */}
        <div className="mb-6 flex gap-2">
          {(['all', 'pending', 'preparing', 'ready'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                filter === status
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <Clock className="mx-auto text-gray-400 mb-3" size={48} />
            <p className="text-gray-600">No {filter} orders</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                  selectedOrder?.id === order.id
                    ? 'border-green-600 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-green-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-gray-800">
                        Order #{order.order_number}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${getStatusColor(
                          order.status
                        )}`}
                      >
                        {getStatusIcon(order.status)}
                        {getStatusLabel(order.status)}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 mb-1">
                      👤 {order.customer_name}
                    </p>
                    <p className="text-sm text-gray-600 mb-1">
                      📱 {order.customer_phone}
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      📦 {order.items.length} item(s)
                    </p>

                    <p className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="text-right ml-4">
                    <p className="text-lg font-bold text-green-600">
                      ฿{order.total_price.toFixed(2)}
                    </p>
                    <Eye className="text-green-600 mt-2" size={20} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Details */}
      <div className="lg:col-span-1">
        {selectedOrder ? (
          <div className="sticky top-20 bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Package size={24} className="text-green-600" />
              Order #{selectedOrder.order_number}
            </h2>

            {/* Customer Info */}
            <div className="mb-6">
              <h3 className="font-bold text-gray-700 mb-2">Customer</h3>
              <p className="text-sm text-gray-600 mb-1">
                {selectedOrder.customer_name}
              </p>
              <p className="text-sm text-blue-600 hover:underline cursor-pointer">
                {selectedOrder.customer_phone}
              </p>
            </div>

            {/* Delivery Info */}
            <div className="mb-6">
              <h3 className="font-bold text-gray-700 mb-2">Delivery Address</h3>
              <p className="text-sm text-gray-600 mb-2">
                {selectedOrder.delivery_address}
              </p>
              {selectedOrder.estimated_delivery_time && (
                <p className="text-xs text-gray-500">
                  ETA: {selectedOrder.estimated_delivery_time}
                </p>
              )}
            </div>

            {/* Items */}
            <div className="mb-6">
              <h3 className="font-bold text-gray-700 mb-3">Items</h3>
              <div className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div>
                      <p className="text-gray-700">{item.product_name}</p>
                      <p className="text-xs text-gray-500">× {item.quantity}</p>
                    </div>
                    <p className="text-gray-700 font-medium">
                      ฿{(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 mt-3 pt-3">
                <div className="flex justify-between font-bold">
                  <span>Total:</span>
                  <span className="text-green-600">
                    ฿{selectedOrder.total_price.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Update */}
            {selectedOrder.status !== 'delivered' &&
              selectedOrder.status !== 'cancelled' && (
                <div className="space-y-2">
                  <h3 className="font-bold text-gray-700 mb-2">Update Status</h3>
                  {selectedOrder.status === 'pending' && (
                    <button
                      onClick={() =>
                        handleStatusUpdate(selectedOrder.id, 'preparing')
                      }
                      disabled={updating}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                    >
                      {updating ? 'Updating...' : 'Start Preparing'}
                    </button>
                  )}
                  {selectedOrder.status === 'preparing' && (
                    <button
                      onClick={() =>
                        handleStatusUpdate(selectedOrder.id, 'ready')
                      }
                      disabled={updating}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                    >
                      {updating ? 'Updating...' : 'Mark Ready for Pickup'}
                    </button>
                  )}
                  {selectedOrder.status === 'ready' && (
                    <button
                      onClick={() =>
                        handleStatusUpdate(selectedOrder.id, 'picked_up')
                      }
                      disabled={updating}
                      className="w-full py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                    >
                      {updating ? 'Updating...' : 'Mark Picked Up'}
                    </button>
                  )}

                  <button
                    onClick={() =>
                      handleStatusUpdate(selectedOrder.id, 'cancelled')
                    }
                    disabled={updating}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                  >
                    <X className="inline mr-2" size={16} />
                    Cancel Order
                  </button>
                </div>
              )}

            {(selectedOrder.status === 'delivered' ||
              selectedOrder.status === 'cancelled') && (
              <div className="p-4 bg-gray-100 rounded-lg text-center">
                <p className="text-gray-600 font-medium">
                  Order {getStatusLabel(selectedOrder.status)}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 text-center">
            <Package className="mx-auto text-gray-400 mb-3" size={48} />
            <p className="text-gray-600">Select an order to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
