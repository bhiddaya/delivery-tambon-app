import React, { useState } from 'react';
import { Store, Mail, Lock, Phone, MapPin, Tag, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { registerUser } from '../services/api';

interface ShopRegistrationFormProps {
  onSuccess: () => void;
  onError?: (error: string) => void;
}

export default function ShopRegistrationForm({ onSuccess, onError }: ShopRegistrationFormProps) {
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    password: '',
    passwordConfirm: '',
    fullName: '',
    shopName: '',
    shopCategory: 'Japanese',
    address: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (!formData.email || !formData.phone || !formData.password || !formData.fullName || !formData.shopName || !formData.address) {
      setError('All fields are required');
      return false;
    }

    if (formData.password !== formData.passwordConfirm) {
      setError('Passwords do not match');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    if (!formData.email.includes('@')) {
      setError('Invalid email format');
      return false;
    }

    if (formData.phone.length < 9) {
      setError('Invalid phone number');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      await registerUser({
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        fullName: formData.fullName,
        role: 'shop_owner',
        shopName: formData.shopName,
        shopCategory: formData.shopCategory,
        address: formData.address,
      });

      setSuccess(true);
      setFormData({
        email: '',
        phone: '',
        password: '',
        passwordConfirm: '',
        fullName: '',
        shopName: '',
        shopCategory: 'Japanese',
        address: '',
      });

      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="flex items-center justify-center mb-6">
        <Store className="text-blue-600 mr-2" size={28} />
        <h2 className="text-2xl font-bold text-gray-800">สมัครร้านค้า</h2>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
          <CheckCircle className="text-green-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-green-700 text-sm">สมัครสำเร็จ! ไปยังส่วนอื่น...</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Personal Info */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อเต็ม</label>
          <input
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            placeholder="นาย/นาง..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="shop@example.com"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทร</label>
          <div className="relative">
            <Phone className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="0812345678"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Shop Info */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อร้านค้า</label>
          <div className="relative">
            <Store className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <input
              type="text"
              name="shopName"
              value={formData.shopName}
              onChange={handleChange}
              placeholder="ชื่อร้านของคุณ"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทร้านค้า</label>
          <div className="relative">
            <Tag className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <select
              name="shopCategory"
              value={formData.shopCategory}
              onChange={handleChange}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="123 ถนน... ตำบล... อำเภอ... จังหวัด"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ยืนยันรหัสผ่าน</label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <input
              type="password"
              name="passwordConfirm"
              value={formData.passwordConfirm}
              onChange={handleChange}
              placeholder="••••••••"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition flex items-center justify-center"
        >
          {loading ? (
            <>
              <Loader className="animate-spin mr-2" size={20} />
              กำลังสมัคร...
            </>
          ) : (
            'สมัครร้านค้า'
          )}
        </button>
      </form>
    </div>
  );
}
