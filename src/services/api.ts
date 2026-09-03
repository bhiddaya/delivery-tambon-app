// API Client for delivery-pwa
// Handles all backend communication

const API_URL = process.env.REACT_APP_API_URL || 'https://delivery-pwa-iota.vercel.app/api';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  [key: string]: any;
}

interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'customer' | 'shop_owner' | 'rider';
  phone?: string;
  avatarUrl?: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

interface Shop {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  description?: string;
  phone?: string;
  rating: number;
  image_url?: string;
  address: string;
  products?: Product[];
  status: string;
  created_at: string;
}

interface Product {
  id: string;
  shop_id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  image_url?: string;
  available: boolean;
}

interface Order {
  id: string;
  customer_id: string;
  shop_id: string;
  rider_id?: string;
  total_price: number;
  delivery_fee: number;
  status: string;
  delivery_address: string;
  created_at: string;
  items?: OrderItem[];
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price_at_time: number;
  product?: Product;
}

// Storage helpers
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const user = localStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

export function setAuthData(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthData() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Helper: Make API request
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API Error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ==================== AUTH API ====================

export async function registerUser(userData: {
  email?: string;
  phone: string;
  password: string;
  fullName: string;
  role: 'customer' | 'shop_owner' | 'rider';
  shopName?: string;
  shopCategory?: string;
  address?: string;
  vehicleType?: string;
  licensePlate?: string;
}): Promise<AuthResponse> {
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

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (response.user && response.token) {
    setAuthData(response.token, response.user);
  }

  return {
    user: response.user,
    token: response.token,
  };
}

export async function loginUserByPhone(phone: string, password: string): Promise<AuthResponse> {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });

  if (response.user && response.token) {
    setAuthData(response.token, response.user);
  }

  return {
    user: response.user,
    token: response.token,
  };
}

export async function verifyToken(): Promise<User> {
  const response = await apiRequest('/auth/verify', {
    method: 'GET',
  });
  return response.user;
}

export function logout() {
  clearAuthData();
}

// ==================== SHOPS API ====================

export async function getAllShops(): Promise<Shop[]> {
  const response = await apiRequest<{ shops: Shop[] }>('/shops', {
    method: 'GET',
  });
  return response.shops || [];
}

export async function getShopDetails(shopId: string): Promise<Shop> {
  const response = await apiRequest<{ shop: Shop }>(`/shops/${shopId}`, {
    method: 'GET',
  });
  return response.shop;
}

// ==================== ORDERS API ====================

export async function createOrder(orderData: {
  shopId: string;
  deliveryAddress: string;
  deliveryLocation?: { lat: number; lng: number };
  items: { productId: string; quantity: number; price: number }[];
  totalPrice: number;
}): Promise<Order> {
  const response = await apiRequest<{ order: Order }>('/orders', {
    method: 'POST',
    body: JSON.stringify(orderData),
  });
  return response.order;
}

export async function getOrderDetails(orderId: string): Promise<Order> {
  const response = await apiRequest<{ order: Order }>(`/orders/${orderId}`, {
    method: 'GET',
  });
  return response.order;
}

export default {
  // Auth
  registerUser,
  loginUser,
  loginUserByPhone,
  verifyToken,
  logout,
  getStoredToken,
  getStoredUser,
  // Shops
  getAllShops,
  getShopDetails,
  // Orders
  createOrder,
  getOrderDetails,
};
