import React, { useState } from 'react';
import ForgotPasswordForm from './ForgotPasswordForm';
import OTPVerificationForm from './OTPVerificationForm';
import NewPasswordForm from './NewPasswordForm';

interface PasswordResetFlowProps {
  onSuccess: (message: string) => void;
  onCancel: () => void;
}

type ResetStep = 'forgot' | 'otp' | 'newPassword';

export default function PasswordResetFlow({ onSuccess, onCancel }: PasswordResetFlowProps) {
  const [step, setStep] = useState<ResetStep>('forgot');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');

  const handleForgotPasswordSuccess = (capturedPhone: string) => {
    setPhone(capturedPhone);
    // Move to OTP verification
    setStep('otp');
  };

  const handleOTPSuccess = (enteredOtp: string) => {
    setOtp(enteredOtp);
    setStep('newPassword');
  };

  const handleNewPasswordSuccess = () => {
    onSuccess('รหัสผ่านเปลี่ยนสำเร็จ! กรุณาเข้าสู่ระบบใหม่');
  };

  const handlePhoneCapture = (capturedPhone: string) => {
    setPhone(capturedPhone);
  };

  const handleOTPCapture = (capturedOtp: string) => {
    setOtp(capturedOtp);
  };

  const handleBack = () => {
    if (step === 'otp') {
      setStep('forgot');
      setOtp('');
    } else if (step === 'newPassword') {
      setStep('otp');
    }
  };

  return (
    <div>
      {step === 'forgot' && (
        <ForgotPasswordForm
          onSuccess={handleForgotPasswordSuccess}
          onBack={onCancel}
          onError={setError}
        />
      )}

      {step === 'otp' && (
        <OTPVerificationForm
          phone={phone}
          onSuccess={handleOTPSuccess}
          onBack={handleBack}
          onError={setError}
        />
      )}

      {step === 'newPassword' && (
        <NewPasswordForm
          phone={phone}
          otp={otp}
          onSuccess={handleNewPasswordSuccess}
          onBack={handleBack}
          onError={setError}
        />
      )}
    </div>
  );
}
