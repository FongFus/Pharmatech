import { BASE_URL, CLIENT_ID, CLIENT_SECRET } from '@env';

const endpoints = {
  // Authentication
  login: `${BASE_URL}o/token/`,
  register: `${BASE_URL}users/`,
  usersLogout: `${BASE_URL}users/logout/`,
  usersMe: `${BASE_URL}users/current-user/`,
  usersChangeActiveState: `${BASE_URL}users/change-user-active-state/`,
  passwordResetRequest: `${BASE_URL}users/password-reset-request/`,
  
  // Products
  productsList: `${BASE_URL}products/`,
  productsCreate: `${BASE_URL}products/`,
  productsRead: id => `${BASE_URL}products/${id}/`,
  productsUpdate: id => `${BASE_URL}products/${id}/`,
  productsDelete: id => `${BASE_URL}products/${id}/`,
  productsApprove: id => `${BASE_URL}products/${id}/approve/`,

  // Cart
  cartsList: `${BASE_URL}carts/`,
  cartsCreate: `${BASE_URL}carts/`,
  cartsRead: id => `${BASE_URL}carts/${id}/`,
  cartsAddItem: id => `${BASE_URL}carts/${id}/add_item/`,
  cartsRemoveItem: id => `${BASE_URL}carts/${id}/remove_item/`,
  cartsCheckout: id => `${BASE_URL}carts/${id}/checkout/`,

  // Orders
  ordersList: `${BASE_URL}orders/`,
  ordersCreate: `${BASE_URL}orders/`,
  ordersRead: id => `${BASE_URL}orders/${id}/`,
  ordersUpdate: id => `${BASE_URL}orders/${id}/`,
  ordersDelete: id => `${BASE_URL}orders/${id}/`,
  ordersCancel: id => `${BASE_URL}orders/${id}/cancel/`,

  // Payments
  paymentsCreate: `${BASE_URL}payments/`,
  paymentsCreateStripePayment: `${BASE_URL}payments/create-stripe-payment/`,
  paymentsSuccess: `${BASE_URL}payments/success/`,
  paymentsCancel: `${BASE_URL}payments/cancel/`,

  // Chat
  chatMessages: `${BASE_URL}chat-messages/`,
  chatMessagesHistory: `${BASE_URL}chat-messages/history/`,
  chatMessagesCreate: `${BASE_URL}chat-messages/`,
  chatMessagesRealtime: conversation_id => `${BASE_URL}chat-messages/realtime-messages/${conversation_id}/`,

  // Categories
  categoriesList: `${BASE_URL}categories/`,

  // Inventory
  inventoryList: `${BASE_URL}inventory/`,
  inventoryCreate: `${BASE_URL}inventory/`,
  inventoryUpdate: id => `${BASE_URL}inventory/${id}/`,
  inventoryDelete: id => `${BASE_URL}inventory/${id}/`,

  // Notifications
  notificationsList: `${BASE_URL}notifications/`,
  notificationsRead: id => `${BASE_URL}notifications/${id}/`,
  notificationsMarkAsRead: id => `${BASE_URL}notifications/${id}/mark-as-read/`,

  // Reviews
  reviewsList: `${BASE_URL}reviews/`,
  reviewsCreate: `${BASE_URL}reviews/`,
  reviewsUpdate: id => `${BASE_URL}reviews/${id}/`,
  reviewsDelete: id => `${BASE_URL}reviews/${id}/`,

  // Statistics
  statistics: `${BASE_URL}statistics/`,
};

const authApis = (token) => ({
  get: async (url) => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
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
  post: async (url, data) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
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
      const result = await response.json();
      if (!response.ok) {
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
      if (!response.ok && response.status !== 204) {
        const result = await response.json();
        throw new Error(JSON.stringify({
          status: response.status,
          detail: result.detail || result.non_field_errors || result || 'Lỗi không xác định',
        }));
      }
      return response.status === 204 ? {} : await response.json();
    } catch (error) {
      console.error('DELETE error:', error.message);
      throw error;
    }
  },
});

const nonAuthApis = {
  post: async (url, data) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
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
};

export { endpoints, authApis, nonAuthApis, CLIENT_ID, CLIENT_SECRET }