import React, { useState } from 'react';
import { Bike, Mail, Lock, Phone, Truck, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { registerUser } from '../services/api';

interface RiderRegistrationFormProps {
  onSuccess: () => void;
  onError?: (error: string) => void;
}

export default function RiderRegistrationForm({ onSuccess, onError }: RiderRegistrationFormProps) {
  const [registrationType, setRegistrationType] = useState<'phone' | 'email'>('phone');
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    password: '',
    passwordConfirm: '',
    fullName: '',
    vehicleType: 'motorcycle',
    licensePlate: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const vehicleTypes = [
    { value: 'motorcycle', label: 'มอเตอร์ไซค์' },
    { value: 'car', label: 'รถยนต์' },
    { value: 'bicycle', label: 'จักรยาน' },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (!formData.phone) {
      setError('เบอร์โทรจำเป็น');
      return false;
    }

    if (registrationType === 'email' && !formData.email) {
      setError('อีเมลจำเป็น');
      return false;
    }

    if (!formData.password || !formData.fullName || !formData.licensePlate) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return false;
    }

    if (formData.password !== formData.passwordConfirm) {
      setError('รหัสผ่านไม่ตรงกัน');
      return false;
    }

    if (formData.password.length < 6) {
      setError('รหัสผ่านต้องมี 6 ตัวอักษรขึ้นไป');
      return false;
    }

    if (formData.email && !formData.email.includes('@')) {
      setError('อีเมลไม่ถูกต้อง');
      return false;
    }

    if (formData.phone.length < 9) {
      setError('เบอร์โทรไม่ถูกต้อง');
      return false;
    }

    if (formData.licensePlate.length < 3) {
      setError('ทะเบียนรถไม่ถูกต้อง');
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
        email: formData.email || undefined,
        phone: formData.phone,
        password: formData.password,
        fullName: formData.fullName,
        role: 'rider',
        vehicleType: formData.vehicleType,
        licensePlate: formData.licensePlate,
      });

      setSuccess(true);
      setFormData({
        email: '',
        phone: '',
        password: '',
        passwordConfirm: '',
        fullName: '',
        vehicleType: 'motorcycle',
        licensePlate: '',
      });

      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'สมัครไม่สำเร็จ';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="flex items-center justify-center mb-6">
        <Bike className="text-green-600 mr-2" size={28} />
        <h2 className="text-2xl font-bold text-gray-800">สมัครไรเดอร์</h2>
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
        {/* Registration Type Selector */}
        <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setRegistrationType('phone');
              setFormData(prev => ({ ...prev, email: '' }));
            }}
            className={`flex-1 py-2 px-3 rounded font-semibold transition text-sm ${
              registrationType === 'phone'
                ? 'bg-green-600 text-white'
                : 'bg-transparent text-gray-700'
            }`}
          >
            เบอร์โทรอย่างเดียว ✓
          </button>
          <button
            type="button"
            onClick={() => setRegistrationType('email')}
            className={`flex-1 py-2 px-3 rounded font-semibold transition text-sm ${
              registrationType === 'email'
                ? 'bg-green-600 text-white'
                : 'bg-transparent text-gray-700'
            }`}
          >
            เบอร์ + อีเมล
          </button>
        </div>

        {/* Personal Info */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อเต็ม</label>
          <input
            type="text"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            placeholder="นาย/นาง..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Phone - Always shown */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            เบอร์โทร <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="0812345678"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Email - Optional or shown based on type */}
        {registrationType === 'email' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              อีเมล <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 text-gray-400" size={20} />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="rider@example.com"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        )}

        {/* Vehicle Info */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทยานพาหนะ</label>
          <div className="relative">
            <Truck className="absolute left-3 top-2.5 text-gray-400" size={20} />
            <select
              name="vehicleType"
              value={formData.vehicleType}
              onChange={handleChange}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {vehicleTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ทะเบียนรถ</label>
          <input
            type="text"
            name="licensePlate"
            value={formData.licensePlate}
            onChange={handleChange}
            placeholder="เช่น กก 1234"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
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
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
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
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition flex items-center justify-center"
        >
          {loading ? (
            <>
              <Loader className="animate-spin mr-2" size={20} />
              กำลังสมัคร...
            </>
          ) : (
            'สมัครไรเดอร์'
          )}
        </button>
      </form>

      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
        💡 <strong>เคล็ดลับ:</strong> คนต่างจังหวัดที่ไม่มีอีเมล สามารถสมัครด้วย "เบอร์โทรอย่างเดียว" ได้
      </div>
    </div>
  );
}
