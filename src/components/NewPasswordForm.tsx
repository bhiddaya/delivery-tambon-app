import React, { useState } from 'react';
import { Lock, AlertCircle, CheckCircle, Loader, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { resetPassword } from '../services/password-reset';

interface NewPasswordFormProps {
  phone: string;
  otp: string;
  onSuccess: () => void;
  onBack: () => void;
  onError?: (error: string) => void;
}

export default function NewPasswordForm({ phone, otp, onSuccess, onBack, onError }: NewPasswordFormProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isPasswordValid = newPassword.length >= 6;
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
  const canSubmit = isPasswordValid && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!isPasswordValid) {
      setError('รหัสผ่านต้องมี 6 ตัวอักษรขึ้นไป');
      return;
    }

    if (!passwordsMatch) {
      setError('รหัสผ่านไม่ตรงกัน');
      return;
    }

    setLoading(true);

    try {
      const response = await resetPassword({
        phone,
        otp,
        newPassword,
      });

      setSuccess(true);

      setTimeout(() => {
        onSuccess();
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

      <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">ตั้งรหัสผ่านใหม่</h2>
      <p className="text-center text-gray-600 text-sm mb-6">
        สำหรับเบอร์ <strong>{phone}</strong>
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
          <p className="text-green-700 text-sm">✓ รหัสผ่านเปลี่ยนสำเร็จ! กำลังไปหน้าเข้าสู่ระบบ...</p>
        </div>
      )}

      {!success && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              รหัสผ่านใหม่ <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 text-gray-400" size={20} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {newPassword.length === 0 && '💡 ตั้งรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)'}
              {newPassword.length > 0 && newPassword.length < 6 && `${newPassword.length}/6 ตัวอักษร`}
              {isPasswordValid && '✓ รหัสผ่านถูกต้อง'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 text-gray-400" size={20} />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {confirmPassword.length === 0 && '💡 ยืนยันรหัสผ่านของคุณ'}
              {confirmPassword.length > 0 && !passwordsMatch && '✗ รหัสผ่านไม่ตรงกัน'}
              {passwordsMatch && '✓ รหัสผ่านตรงกัน'}
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <p className="font-semibold mb-1">🔒 เคล็ดลับปลอดภัย:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>ใช้รหัสผ่านที่ยาวอย่างน้อย 6 ตัวอักษร</li>
              <li>รวมตัวเลขและตัวอักษร</li>
              <li>อย่าบอกรหัสผ่านให้ใครฟัง</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader className="animate-spin mr-2" size={20} />
                กำลังตั้งรหัสผ่าน...
              </>
            ) : (
              'ตั้งรหัสผ่านใหม่'
            )}
          </button>
        </form>
      )}
    </div>
  );
}
