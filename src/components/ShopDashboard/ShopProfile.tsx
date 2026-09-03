import React, { useState } from 'react';
import {
  Save,
  AlertCircle,
  CheckCircle,
  Clock,
  MapPin,
  Tag,
} from 'lucide-react';

interface ShopProfileProps {
  shop: any;
}

export default function ShopProfile({ shop }: ShopProfileProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: shop?.name || '',
    category: shop?.category || '',
    address: shop?.address || '',
    phone: shop?.phone || '',
    email: shop?.email || '',
    description: shop?.description || '',
    opening_time: shop?.opening_time || '08:00',
    closing_time: shop?.closing_time || '22:00',
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'https://delivery-pwa-iota.vercel.app/api'}/shops/${shop.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save profile');
      }

      setEditing(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const categories = [
    'Japanese',
    'FastFood',
    'Thai',
    'Chinese',
    'Italian',
    'Pizza',
    'Dessert',
    'Coffee',
    'Other',
  ];

  return (
    <div className="max-w-3xl">
      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
          <CheckCircle className="text-green-600 mr-3 flex-shrink-0 mt-0.5" />
          <p className="text-green-700">Profile updated successfully!</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Shop Profile</h2>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition"
            >
              Edit Profile
            </button>
          ) : (
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-medium transition"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Shop Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shop Name
            </label>
            {editing ? (
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <p className="text-lg text-gray-800 font-semibold">
                {formData.name}
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            {editing ? (
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 text-gray-800">
                <Tag size={18} className="text-green-600" />
                {formData.category}
              </div>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            {editing ? (
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <p className="text-gray-800">{formData.phone}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            {editing ? (
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <p className="text-gray-800">{formData.email}</p>
            )}
          </div>

          {/* Opening Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opening Time
            </label>
            {editing ? (
              <input
                type="time"
                name="opening_time"
                value={formData.opening_time}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <div className="flex items-center gap-2 text-gray-800">
                <Clock size={18} className="text-green-600" />
                {formData.opening_time}
              </div>
            )}
          </div>

          {/* Closing Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Closing Time
            </label>
            {editing ? (
              <input
                type="time"
                name="closing_time"
                value={formData.closing_time}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <div className="flex items-center gap-2 text-gray-800">
                <Clock size={18} className="text-green-600" />
                {formData.closing_time}
              </div>
            )}
          </div>

          {/* Address - Full Width */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            {editing ? (
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <div className="flex items-start gap-2 text-gray-800">
                <MapPin size={18} className="text-green-600 flex-shrink-0 mt-1" />
                {formData.address}
              </div>
            )}
          </div>

          {/* Description - Full Width */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            {editing ? (
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                placeholder="Tell customers about your shop..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            ) : (
              <p className="text-gray-800 whitespace-pre-wrap">
                {formData.description || 'No description yet'}
              </p>
            )}
          </div>
        </div>

        {/* Save Button */}
        {editing && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition flex items-center justify-center"
            >
              <Save className="mr-2" size={20} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Additional Info */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stats */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Orders</p>
          <p className="text-3xl font-bold text-green-600">
            {shop?.total_orders || 0}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Menu Items</p>
          <p className="text-3xl font-bold text-blue-600">
            {shop?.product_count || 0}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Rating</p>
          <p className="text-3xl font-bold text-yellow-500">
            {shop?.rating ? shop.rating.toFixed(1) : 'N/A'} ⭐
          </p>
        </div>
      </div>

      {/* Status */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Shop Status</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p>
            ✓ <strong>Status:</strong> Active
          </p>
          <p>
            ✓ <strong>Verification:</strong> Auto-approved (Phone-based)
          </p>
          <p>
            ✓ <strong>Orders:</strong> Accepting orders 24/7
          </p>
          <p>
            ✓ <strong>Delivery:</strong> Within {shop?.delivery_radius || 5} km radius
          </p>
        </div>
      </div>
    </div>
  );
}
