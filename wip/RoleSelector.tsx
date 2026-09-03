import React, { useState } from 'react';
import { Users, Store, Bike, LogOut } from 'lucide-react';
import CustomerApp from './CustomerApp';
import ShopApp from './ShopApp';
import RiderApp from './RiderApp';
import ShopRegistrationForm from './ShopRegistrationForm';
import RiderRegistrationForm from './RiderRegistrationForm';
import LoginForm from './LoginForm';
import { getStoredUser, logout } from '../services/api';

type View = 'select' | 'login' | 'customer' | 'shop' | 'rider' | 'shop-register' | 'rider-register';

export default function RoleSelector() {
  const [view, setView] = useState<View>('select');
  const [user, setUser] = useState(getStoredUser());

  const handleLogout = () => {
    logout();
    setUser(null);
    setView('select');
  };

  const handleLoginSuccess = (loggedInUser: any) => {
    setUser(loggedInUser);
    if (loggedInUser.role === 'customer') {
      setView('customer');
    } else if (loggedInUser.role === 'shop_owner') {
      setView('shop');
    } else if (loggedInUser.role === 'rider') {
      setView('rider');
    }
  };

  const handleRegistrationSuccess = (role: 'shop_owner' | 'rider') => {
    if (role === 'shop_owner') {
      setView('shop');
    } else {
      setView('rider');
    }
  };

  // Main content
  if (view === 'customer' && user) {
    return (
      <div>
        <div className="flex justify-between items-center p-4 bg-blue-600 text-white">
          <h1 className="text-xl font-bold">ลูกค้า: {user.fullName}</h1>
          <button onClick={handleLogout} className="flex items-center gap-2 hover:bg-blue-700 px-3 py-2 rounded">
            <LogOut size={20} />
            ออกจากระบบ
          </button>
        </div>
        <CustomerApp />
      </div>
    );
  }

  if (view === 'shop' && user) {
    return (
      <div>
        <div className="flex justify-between items-center p-4 bg-green-600 text-white">
          <h1 className="text-xl font-bold">ร้านค้า: {user.fullName}</h1>
          <button onClick={handleLogout} className="flex items-center gap-2 hover:bg-green-700 px-3 py-2 rounded">
            <LogOut size={20} />
            ออกจากระบบ
          </button>
        </div>
        <ShopApp />
      </div>
    );
  }

  if (view === 'rider' && user) {
    return (
      <div>
        <div className="flex justify-between items-center p-4 bg-orange-600 text-white">
          <h1 className="text-xl font-bold">ไรเดอร์: {user.fullName}</h1>
          <button onClick={handleLogout} className="flex items-center gap-2 hover:bg-orange-700 px-3 py-2 rounded">
            <LogOut size={20} />
            ออกจากระบบ
          </button>
        </div>
        <RiderApp />
      </div>
    );
  }

  if (view === 'shop-register') {
    return (
      <div>
        <button
          onClick={() => setView('select')}
          className="m-4 px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
        >
          ← กลับ
        </button>
        <ShopRegistrationForm
          onSuccess={() => handleRegistrationSuccess('shop_owner')}
          onError={(error) => console.error('Registration error:', error)}
        />
      </div>
    );
  }

  if (view === 'rider-register') {
    return (
      <div>
        <button
          onClick={() => setView('select')}
          className="m-4 px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
        >
          ← กลับ
        </button>
        <RiderRegistrationForm
          onSuccess={() => handleRegistrationSuccess('rider')}
          onError={(error) => console.error('Registration error:', error)}
        />
      </div>
    );
  }

  if (view === 'login') {
    return (
      <div>
        <button
          onClick={() => setView('select')}
          className="m-4 px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
        >
          ← กลับ
        </button>
        <LoginForm
          onSuccess={handleLoginSuccess}
          onError={(error) => console.error('Login error:', error)}
        />
      </div>
    );
  }

  // Role Selector
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">🚀 Delivery System</h1>
        <p className="text-gray-600">เลือกบทบาทของคุณ</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {/* Customer */}
        <div className="bg-white rounded-lg shadow-lg p-8 text-center hover:shadow-xl transition">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-4 rounded-full">
              <Users className="text-blue-600" size={40} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ลูกค้า</h2>
          <p className="text-gray-600 text-sm mb-6">สั่งอาหารและติดตามการจัดส่ง</p>
          <button
            onClick={() => setView('login')}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
          >
            เข้าสู่ระบบ
          </button>
        </div>

        {/* Shop Owner */}
        <div className="bg-white rounded-lg shadow-lg p-8 text-center hover:shadow-xl transition">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 p-4 rounded-full">
              <Store className="text-green-600" size={40} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">เจ้าของร้านค้า</h2>
          <p className="text-gray-600 text-sm mb-6">จัดการคำสั่งซื้อและสินค้า</p>
          <div className="space-y-2">
            <button
              onClick={() => setView('login')}
              className="w-full px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition"
            >
              เข้าสู่ระบบ
            </button>
            <button
              onClick={() => setView('shop-register')}
              className="w-full px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition"
            >
              สมัครใหม่
            </button>
          </div>
        </div>

        {/* Rider */}
        <div className="bg-white rounded-lg shadow-lg p-8 text-center hover:shadow-xl transition">
          <div className="flex justify-center mb-4">
            <div className="bg-orange-100 p-4 rounded-full">
              <Bike className="text-orange-600" size={40} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ไรเดอร์</h2>
          <p className="text-gray-600 text-sm mb-6">รับงานและส่งพัสดุ</p>
          <div className="space-y-2">
            <button
              onClick={() => setView('login')}
              className="w-full px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition"
            >
              เข้าสู่ระบบ
            </button>
            <button
              onClick={() => setView('rider-register')}
              className="w-full px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition"
            >
              สมัครใหม่
            </button>
          </div>
        </div>
      </div>

      <div className="mt-12 text-center text-gray-600 text-sm max-w-md">
        <p>💡 <strong>Tip:</strong> คุณสามารถเข้าใช้งานได้หลายบทบาท ให้ลองสมัครบัญชีต่างๆ</p>
      </div>
    </div>
  );
}
