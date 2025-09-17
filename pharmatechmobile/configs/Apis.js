import {
  BASE_URL as ENV_BASE_URL,
  CLIENT_ID as ENV_CLIENT_ID,
  CLIENT_SECRET as ENV_CLIENT_SECRET,
} from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Fallback URL nếu không có biến môi trường
const BASE_URL = ENV_BASE_URL || 'http://10.0.2.2:8000/';
const CLIENT_ID = ENV_CLIENT_ID || '';
const CLIENT_SECRET = ENV_CLIENT_SECRET || '';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('CLIENT_ID or CLIENT_SECRET is missing. Please check your .env file.');
}

// Định nghĩa các endpoint API
const endpoints = {
  login: `${BASE_URL}o/token/`,
  register: `${BASE_URL}users/`,
  usersLogout: `${BASE_URL}users/logout/`,
  usersList: `${BASE_URL}users/`,
  usersMe: `${BASE_URL}users/current-user/`,
  usersUpdate: id => `${BASE_URL}users/${id}/`,
  usersChangePassword: `${BASE_URL}users/change-password/`,
  usersDeactivate: `${BASE_URL}users/deactivate/`,
  usersChangeActiveState: `${BASE_URL}users/change-user-active-state/`,
  passwordResetRequest: `${BASE_URL}users/password-reset-request/`,
  passwordResetConfirm: `${BASE_URL}users/password-reset-confirm/`,
  productsList: `${BASE_URL}products/`,
  productsMyProducts: `${BASE_URL}products/my-products/`,
  productsCreate: `${BASE_URL}products/`,
  productsRead: id => `${BASE_URL}products/${id}/`,
  productsUpdate: id => `${BASE_URL}products/${id}/`,
  productsDelete: id => `${BASE_URL}products/${id}/`,
  productsApprove: id => `${BASE_URL}products/${id}/approve/`,
  productsUnapprove: id => `${BASE_URL}products/${id}/unapprove/`,
  productsInventoryStatus: `${BASE_URL}products/inventory-status/`,
  cartsList: `${BASE_URL}carts/`,
  cartsCreate: `${BASE_URL}carts/`,
  cartsRead: id => `${BASE_URL}carts/${id}/`,
  cartsAddItem: id => `${BASE_URL}carts/${id}/add-item/`,
  cartsRemoveItem: id => `${BASE_URL}carts/${id}/remove-item/`,
  ordersList: `${BASE_URL}orders/`,
  ordersCreate: `${BASE_URL}orders/`,
  ordersRead: id => `${BASE_URL}orders/${id}/`,
  ordersUpdate: id => `${BASE_URL}orders/${id}/`,
  ordersDelete: id => `${BASE_URL}orders/${id}/`,
  ordersCancel: id => `${BASE_URL}orders/${id}/cancel/`,
  paymentsCreate: `${BASE_URL}payments/`,
  paymentsCreateStripePayment: `${BASE_URL}payments/create-stripe-payment/`,
  paymentsSuccess: `${BASE_URL}payments/success/`,
  paymentsCancel: `${BASE_URL}payments/cancel/`,
  chatMessages: `${BASE_URL}chat-messages/`,
  chatMessagesHistory: `${BASE_URL}chat-messages/history/`,
  chatMessagesCreate: `${BASE_URL}chat-messages/`,
  chatMessagesRealtime: conversation_id => `${BASE_URL}chat-messages/realtime-messages/${conversation_id}/`,
  categoriesList: `${BASE_URL}categories/`,
  inventoryList: `${BASE_URL}inventory/`,
  inventoryCreate: `${BASE_URL}inventory/`,
  inventoryRead: id => `${BASE_URL}inventory/${id}/`,
  inventoryUpdate: id => `${BASE_URL}inventory/${id}/`,
  inventoryDelete: id => `${BASE_URL}inventory/${id}/`,
  inventoryBulkCreate: `${BASE_URL}inventory/bulk-create/`,
  inventoryBulkDelete: `${BASE_URL}inventory/bulk-delete/`,
  inventoryLowStock: `${BASE_URL}inventory/low-stock/`,
  notificationsList: `${BASE_URL}notifications/`,
  notificationsRead: id => `${BASE_URL}notifications/${id}/`,
  notificationsMarkAsRead: id => `${BASE_URL}notifications/${id}/mark-as-read/`,
  reviewsList: `${BASE_URL}reviews/`,
  reviewsCreate: `${BASE_URL}reviews/`,
  reviewsUpdate: id => `${BASE_URL}reviews/${id}/`,
  reviewsDelete: id => `${BASE_URL}reviews/${id}/`,
  reviewsProduct: product_id => `${BASE_URL}reviews/product/${product_id}/reviews/`,
  reviewReplies: `${BASE_URL}review-replies/`,
  discountsList: `${BASE_URL}discounts/`,
  discountsApply: `${BASE_URL}discounts/apply/`,
  statistics: `${BASE_URL}statistics/`,
  distributorStatistics: `${BASE_URL}distributor-statistics/`,
};

// Hàm xóa dữ liệu cục bộ khi token không hợp lệ
const clearAuthData = async () => {
  await AsyncStorage.multiRemove(["token", "user", "refresh_token"]);
};

// Hàm làm mới token
const refreshToken = async () => {
  try {
    const refreshTokenValue = await AsyncStorage.getItem("refresh_token");
    if (!refreshTokenValue) {
      throw new Error("No refresh token available");
    }
    const response = await fetch(endpoints.login, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenValue,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const text = await response.text();
    console.log('Refresh token response:', text);
    const result = JSON.parse(text);
    if (!response.ok) {
      throw new Error(JSON.stringify({
        status: response.status,
        detail: result.error_description || result.error || 'Lỗi làm mới token',
      }));
    }
    await AsyncStorage.setItem("token", result.access_token);
    await AsyncStorage.setItem("refresh_token", result.refresh_token);
    return result.access_token;
  } catch (error) {
    console.error('Refresh token error:', error.message);
    await clearAuthData();
    throw error;
  }
};

// API cho các yêu cầu cần xác thực
const authApis = (token) => ({
  get: async (url, options = {}) => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      const text = await response.text();
      console.log('GET response:', text);
      const data = JSON.parse(text);
      if (!response.ok) {
        if (response.status === 401) {
          try {
            const newToken = await refreshToken();
            return await authApis(newToken).get(url, options);
          } catch (refreshError) {
            await clearAuthData();
            throw new Error(JSON.stringify({
              status: 401,
              detail: 'Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
            }));
          }
        }
        throw new Error(JSON.stringify({
          status: response.status,
          detail: data.detail || data.non_field_errors || data || 'Lỗi không xác định',
        }));
      }
      return data;
    } catch (error) {
      console.error('GET error:', error.message);
      throw error;
    }
  },
  post: async (url, data, options = {}) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: JSON.stringify(data),
      });
      const text = await response.text();
      console.log('POST response:', text);
      const result = JSON.parse(text);
      if (!response.ok) {
        if (response.status === 401) {
          try {
            const newToken = await refreshToken();
            return await authApis(newToken).post(url, data, options);
          } catch (refreshError) {
            await clearAuthData();
            throw new Error(JSON.stringify({
              status: 401,
              detail: 'Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
            }));
          }
        }
        throw new Error(JSON.stringify({
          status: response.status,
          detail: result.detail || result.non_field_errors || result || 'Lỗi không xác định',
        }));
      }
      return result;
    } catch (error) {
      console.error('POST error:', error.message);
      throw error;
    }
  },
  put: async (url, data) => {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      const text = await response.text();
      console.log('PUT response:', text);
      const result = JSON.parse(text);
      if (!response.ok) {
        if (response.status === 401) {
          try {
            const newToken = await refreshToken();
            return await authApis(newToken).put(url, data);
          } catch (refreshError) {
            await clearAuthData();
            throw new Error(JSON.stringify({
              status: 401,
              detail: 'Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
            }));
          }
        }
        throw new Error(JSON.stringify({
          status: response.status,
          detail: result.detail || result.non_field_errors || result || 'Lỗi không xác định',
        }));
      }
      return result;
    } catch (error) {
      console.error('PUT error:', error.message);
      throw error;
    }
  },
  delete: async (url) => {
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const text = await response.text();
      console.log('DELETE response:', text);
      if (!response.ok && response.status !== 204) {
        if (response.status === 401) {
          try {
            const newToken = await refreshToken();
            return await authApis(newToken).delete(url);
          } catch (refreshError) {
            await clearAuthData();
            throw new Error(JSON.stringify({
              status: 401,
              detail: 'Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
            }));
          }
        }
        const result = JSON.parse(text);
        throw new Error(JSON.stringify({
          status: response.status,
          detail: result.detail || result.non_field_errors || result || 'Lỗi không xác định',
        }));
      }
      return response.status === 204 ? {} : JSON.parse(text);
    } catch (error) {
      console.error('DELETE error:', error.message);
      throw error;
    }
  },
});

// API cho các yêu cầu không cần xác thực
const nonAuthApis = {
  get: async (url, options = {}) => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      const text = await response.text();
      console.log('GET response:', text);
      const data = JSON.parse(text);
      if (!response.ok) {
        throw new Error(JSON.stringify({
          status: response.status,
          detail: data.detail || data.non_field_errors || data || 'Lỗi không xác định',
        }));
      }
      return data;
    } catch (error) {
      console.error('GET error:', error.message);
      throw error;
    }
  },
  post: async (url, data, options = {}) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        body: JSON.stringify(data),
      });
      const text = await response.text();
      console.log('POST response:', text);
      try {
        const result = JSON.parse(text);
        if (!response.ok) {
          throw new Error(JSON.stringify({
            status: response.status,
            detail: result.detail || result.error || result.non_field_errors || result || 'Lỗi không xác định',
          }));
        }
        return result;
      } catch (parseError) {
        throw new Error(JSON.stringify({
          status: response.status,
          detail: 'Phản hồi không phải JSON: ' + text,
        }));
      }
    } catch (error) {
      console.error('POST error:', error.message);
      throw error;
    }
  },
};

export { endpoints, authApis, nonAuthApis, CLIENT_ID, CLIENT_SECRET, BASE_URL };

// Hàm tạo URL WebSocket dựa trên BASE_URL
export const getWebSocketURL = (conversationId) => {
  const protocol = BASE_URL.startsWith('https://') ? 'wss://' : 'ws://';
  const base = BASE_URL.replace(/^https?:\/\//, '');
  return `${protocol}${base}ws/chat/${conversationId || 'new'}/`;
};
