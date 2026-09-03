import React, { useState } from 'react';
import { Phone, AlertCircle, CheckCircle, Loader, ArrowLeft } from 'lucide-react';
import { requestPasswordReset } from '../services/password-reset';

interface ForgotPasswordFormProps {
  onSuccess: (phone: string) => void;
  onBack: () => void;
  onError?: (error: string) => void;
}

export default function ForgotPasswordForm({ onSuccess, onBack, onError }: ForgotPasswordFormProps) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const isValidPhone = /^0[0-9]{9,10}$/.test(phone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!phone) {
      setError('กรุณากรอกเบอร์โทรของคุณ');
      return;
    }

    if (!isValidPhone) {
      setError('เบอร์โทรไม่ถูกต้อง');
      return;
    }

    setLoading(true);

    try {
      await requestPasswordReset(phone);
      setSuccess(true);
      setOtpSent(true);

      setTimeout(() => {
        onSuccess(phone);
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'ขออภัย เกิดข้อผิดพลาด';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <button
        onClick={onBack}
        className="flex items-center text-blue-600 hover:text-blue-700 mb-4 text-sm"
      >
        <ArrowLeft size={16} className="mr-1" />
        กลับ
      </button>

      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">ลืมรหัสผ่าน</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
          <CheckCircle className="text-green-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-green-700 text-sm">
            ✓ โค้ด OTP ถูกส่งไปยังเบอร์ {phone} แล้ว<br/>
            <span className="text-xs">พยายามโหลดหน้าต่อไป...</span>
          </p>
        </div>
      )}

      {!otpSent ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              เบอร์โทร <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 text-gray-400" size={20} />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812345678"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {phone === '' && '💡 ใส่เบอร์โทรที่คุณสมัครใช้'}
              {isValidPhone && '✓ เบอร์โทรถูกต้อง'}
              {phone !== '' && !isValidPhone && '✗ รูปแบบเบอร์โทรไม่ถูกต้อง'}
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <p className="font-semibold mb-1">📱 วิธีการ:</p>
            <ol className="space-y-1 list-decimal list-inside">
              <li>ใส่เบอร์โทรที่ลงทะเบียน</li>
              <li>เราจะส่ง OTP ไปยังเบอร์ของคุณ</li>
              <li>ใส่ OTP เพื่อตั้งรหัสผ่านใหม่</li>
            </ol>
          </div>

          <button
            type="submit"
            disabled={loading || !isValidPhone}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader className="animate-spin mr-2" size={20} />
                กำลังส่ง OTP...
              </>
            ) : (
              'ส่ง OTP ไปยังเบอร์โทร'
            )}
          </button>
        </form>
      ) : (
        <div className="text-center py-4">
          <p className="text-gray-600 mb-4">โปรดรอสักครู่ กำลังไปยังหน้าตรวจสอบ OTP...</p>
        </div>
      )}
    </div>
  );
}
