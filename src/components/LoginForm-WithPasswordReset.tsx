import React, { useState } from 'react';
import { Mail, Lock, AlertCircle, Loader, Phone, CheckCircle } from 'lucide-react';
import { loginUser } from '../services/api';

interface LoginFormProps {
  onSuccess: (user: any) => void;
  onForgotPassword?: () => void;
  onError?: (error: string) => void;
}

export default function LoginForm({ onSuccess, onForgotPassword, onError }: LoginFormProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isPhoneFormat = /^0[0-9]{9,10}$/.test(identifier);
  const isEmailFormat = identifier.includes('@');
  const isValidIdentifier = identifier.length > 0 && (isPhoneFormat || isEmailFormat);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!identifier) {
      setError('กรุณากรอกเบอร์โทรหรืออีเมล');
      return;
    }

    if (!isPhoneFormat && !isEmailFormat) {
      setError('เบอร์โทรหรืออีเมลไม่ถูกต้อง');
      return;
    }

    if (!password) {
      setError('กรุณากรอกรหัสผ่าน');
      return;
    }

    setLoading(true);

    try {
      const response = await loginUser(identifier, password);

      // Handle "Remember Me" - store refresh token for 30 days
      if (rememberMe && response.user) {
        // Extend token expiry to 30 days
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        localStorage.setItem('tokenExpiry', expiryDate.toISOString());
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.setItem('tokenExpiry', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
        localStorage.removeItem('rememberMe');
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess(response.user);
      }, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">เข้าสู่ระบบ</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
          <CheckCircle className="text-green-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-green-700 text-sm">✓ เข้าสู่ระบบสำเร็จ! โหลดแอปพลิเคชัน...</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Identifier Input (Phone or Email) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            เบอร์โทร หรือ อีเมล
          </label>
          <div className="relative">
            {isPhoneFormat ? (
              <Phone className="absolute left-3 top-3 text-green-500" size={20} />
            ) : isEmailFormat ? (
              <Mail className="absolute left-3 top-3 text-blue-500" size={20} />
            ) : (
              <div className="absolute left-3 top-3 text-gray-400" />
            )}
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="0812345678 หรือ your@email.com"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {identifier === '' && '💡 ใส่เบอร์โทรหรืออีเมลของคุณ'}
            {isPhoneFormat && '✓ เบอร์โทรถูกต้อง'}
            {isEmailFormat && '✓ อีเมลถูกต้อง'}
            {identifier !== '' && !isPhoneFormat && !isEmailFormat && '✗ รูปแบบไม่ถูกต้อง'}
          </p>
        </div>

        {/* Password Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 cursor-pointer"
            />
            <span className="ml-2 text-sm text-gray-700">จดจำฉันไว้ 30 วัน</span>
          </label>
          {onForgotPassword && (
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              ลืมรหัสผ่าน?
            </button>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !isValidIdentifier}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition flex items-center justify-center"
        >
          {loading ? (
            <>
              <Loader className="animate-spin mr-2" size={20} />
              กำลังเข้าสู่ระบบ...
            </>
          ) : (
            'เข้าสู่ระบบ'
          )}
        </button>
      </form>

      <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <p className="font-semibold mb-2">✓ ท่านสามารถเข้าสู่ระบบได้ 2 วิธี:</p>
        <ul className="space-y-1 text-xs">
          <li>📱 <strong>เบอร์โทร:</strong> 0812345678 + รหัสผ่าน</li>
          <li>📧 <strong>อีเมล:</strong> your@email.com + รหัสผ่าน</li>
        </ul>
      </div>

      <p className="mt-6 text-center text-gray-600 text-sm">
        ยังไม่มีบัญชี? <span className="text-blue-600 font-semibold">สมัครใหม่</span> จากหน้าแรก
      </p>
    </div>
  );
}
