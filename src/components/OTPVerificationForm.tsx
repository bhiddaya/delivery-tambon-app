import React, { useState, useEffect } from 'react';
import { Lock, AlertCircle, CheckCircle, Loader, ArrowLeft } from 'lucide-react';
import { verifyOTP } from '../services/password-reset';

interface OTPVerificationFormProps {
  phone: string;
  onSuccess: (otp: string) => void;
  onBack: () => void;
  onError?: (error: string) => void;
}

export default function OTPVerificationForm({ phone, onSuccess, onBack, onError }: OTPVerificationFormProps) {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes

  useEffect(() => {
    if (timeLeft <= 0) {
      setError('หมดเวลา OTP แล้ว กรุณาขอ OTP ใหม่');
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(t => t - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!otp || otp.length !== 6) {
      setError('กรุณากรอก OTP 6 หลัก');
      return;
    }

    setLoading(true);

    try {
      const result = verifyOTP(phone, otp);

      if (!result.valid) {
        setError(result.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess(otp);
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'ขออภัย เกิดข้อผิดพลาด';
      setError(errorMessage);
      onError?.(errorMessage);
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

      <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">ตรวจสอบ OTP</h2>
      <p className="text-center text-gray-600 text-sm mb-6">
        เราส่ง OTP 6 หลักไปยังเบอร์ <strong>{phone}</strong>
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="text-red-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start">
          <CheckCircle className="text-green-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
          <p className="text-green-700 text-sm">✓ OTP ถูกต้อง เปิดหน้าตั้งรหัสผ่านใหม่...</p>
        </div>
      )}

      {!success && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              OTP <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 text-gray-400" size={20} />
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full pl-10 pr-4 py-3 text-center text-2xl border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest"
              />
            </div>
            <p className="mt-2 text-xs text-gray-500 text-center">
              {otp.length === 0 && '🔐 กรุณาใส่ OTP 6 หลัก'}
              {otp.length > 0 && otp.length < 6 && `${otp.length}/6 หลัก`}
              {otp.length === 6 && '✓ พร้อมส่ง'}
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
            <p className="font-semibold mb-1">⏱️ เวลาเหลือ: <span className="text-lg font-mono">{formatTime(timeLeft)}</span></p>
            <p className="text-xs">OTP จะหมดอายุใน 10 นาที</p>
          </div>

          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader className="animate-spin mr-2" size={20} />
                กำลังตรวจสอบ...
              </>
            ) : (
              'ยืนยัน OTP'
            )}
          </button>
        </form>
      )}

      <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
        <p className="font-semibold mb-2">💡 ทดสอบ:</p>
        <p>หากคุณไม่ได้รับ OTP ให้ตรวจดูคอนโซล (dev tools) เพื่อดูรหัส OTP</p>
      </div>
    </div>
  );
}
