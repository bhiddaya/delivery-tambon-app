// Updated API Client - Support phone-only registration

const API_URL = process.env.REACT_APP_API_URL || 'https://delivery-pwa-iota.vercel.app/api';

// ... (keep existing code same)

/**
 * Updated: registerUser - Now supports email OR phone (not both required)
 */
export async function registerUser(userData: {
  email?: string;  // Optional
  phone: string;   // Required
  password: string;
  fullName: string;
  role: 'customer' | 'shop_owner' | 'rider';
  shopName?: string;
  shopCategory?: string;
  address?: string;
  vehicleType?: string;
  licensePlate?: string;
}): Promise<AuthResponse> {
  // Validation: Must have either email or phone
  if (!userData.email && !userData.phone) {
    throw new Error('Email or phone is required');
  }

  const response = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });

  if (response.user && response.token) {
    setAuthData(response.token, response.user);
  }

  return {
    user: response.user,
    token: response.token,
  };
}

/**
 * Updated: loginUser - Support login by phone only
 */
export async function loginUser(identifier: string, password: string): Promise<AuthResponse> {
  // Auto-detect email vs phone
  const isEmail = identifier.includes('@');
  const isPhone = /^0[0-9]{9,10}$/.test(identifier);

  if (!isEmail && !isPhone) {
    throw new Error('Invalid email or phone format');
  }

  const body = isEmail
    ? { email: identifier, password }
    : { phone: identifier, password };

  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (response.user && response.token) {
    setAuthData(response.token, response.user);
  }

  return {
    user: response.user,
    token: response.token,
  };
}

// Remove separate loginUserByPhone - use unified loginUser instead
