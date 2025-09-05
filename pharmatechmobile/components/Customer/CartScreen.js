import React, { useState, useEffect, useContext } from 'react';
import { View, Text, Button, FlatList, StyleSheet, ActivityIndicator, Alert, Image, TouchableOpacity, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis } from '../../configs/Apis';
import { MyUserContext } from '../../configs/MyContexts';

const CartScreen = ({ navigation, route }) => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [discountCode, setDiscountCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [orderId, setOrderId] = useState(null);
  const [showWebView, setShowWebView] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const user = useContext(MyUserContext);
  const productIdFromParams = route.params?.productId;

  useEffect(() => {
    const fetchCart = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(endpoints.cartsList);
        let carts = response.results || response;
        if (Array.isArray(carts) && carts.length > 0) {
          carts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          setCart(carts[0]);
          if (productIdFromParams) {
            await handleAddItem(productIdFromParams, carts[0], authApi);
          }
        } else {
          const newCart = await authApi.post(endpoints.cartsCreate, {});
          setCart(newCart);
          if (productIdFromParams) {
            await handleAddItem(productIdFromParams, newCart, authApi);
          }
        }
      } catch (error) {
        console.error('Fetch cart error:', error.response?.data || error.message);
        Alert.alert('Lỗi', error.response?.data?.detail || 'Không thể tải giỏ hàng');
      } finally {
        setLoading(false);
      }
    };
    fetchCart();
  }, [productIdFromParams]);

  const handleAddItem = async (product_id, currentCart = cart, authApiInstance = null) => {
    if (!product_id) {
      Alert.alert('Lỗi', 'Vui lòng chọn sản phẩm');
      return;
    }
    if (!currentCart) {
      Alert.alert('Lỗi', 'Giỏ hàng chưa được tạo');
      return;
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApiInstance || authApis(token);
    try {
      const product = await authApi.get(endpoints.productsRead(product_id));
      if (product.total_stock < 1) {
        Alert.alert('Lỗi', 'Sản phẩm hết hàng');
        return;
      }
      const response = await authApi.post(endpoints.cartsAddItem(currentCart.id), {
        product_id,
        quantity: 1,
      });
      setCart(response);
      Alert.alert('Thành công', 'Đã thêm sản phẩm vào giỏ hàng');
    } catch (error) {
      console.error('Add item error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Thêm sản phẩm thất bại');
    }
  };

  const handleUpdateQuantity = async (item, delta) => {
    if (!cart) return;
    const newQuantity = item.quantity + delta;
    if (newQuantity < 1) {
      Alert.alert('Lỗi', 'Số lượng phải lớn hơn 0');
      return;
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.post(endpoints.cartsAddItem(cart.id), {
        product_id: item.product.id,
        quantity: newQuantity,
      });
      setCart(response);
    } catch (error) {
      console.error('Update quantity error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Cập nhật số lượng thất bại');
    }
  };

  const handleRemoveItem = async (item_id) => {
    if (!cart) return;
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.post(endpoints.cartsRemoveItem(cart.id), { item_id });
      setCart(response);
      Alert.alert('Thành công', 'Đã xóa sản phẩm khỏi giỏ hàng');
    } catch (error) {
      console.error('Remove item error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Xóa sản phẩm thất bại');
    }
  };

  const handleCheckout = async () => {
    if (!cart || cart.items.length === 0) {
      Alert.alert('Lỗi', 'Giỏ hàng trống');
      return;
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      // Create order
      const orderResponse = await authApi.post(endpoints.ordersCreate, { cart_id: cart.id });
      const order = orderResponse;
      setOrderId(order.id);

      // Apply discount if code provided
      if (discountCode) {
        try {
          const discountResponse = await authApi.post(endpoints.discountsApply, {
            discount_code: discountCode,
            order_id: order.id
          });
          setDiscountAmount(parseFloat(discountResponse.discount_amount));
          // Update order with discount
          await authApi.put(endpoints.ordersUpdate(order.id), {
            discount_amount: discountResponse.discount_amount
          });
        } catch (discountError) {
          console.error('Discount error:', discountError);
          Alert.alert('Lỗi', 'Mã giảm giá không hợp lệ');
          return;
        }
      }

      // Create Stripe payment
      const paymentResponse = await authApi.post(endpoints.paymentsCreateStripePayment, {
        order_id: order.id
      });
      setCheckoutUrl(paymentResponse.checkout_url);
      setShowWebView(true);
    } catch (error) {
      console.error('Checkout error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Thanh toán thất bại');
    }
  };

  const handlePaymentCallback = async (endpoint, sessionId, successMessage, isSuccess = true) => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    const maxRetries = 3;
    let retryCount = 0;

    const attemptCallback = async () => {
      try {
        const response = await authApi.get(`${endpoint}?session_id=${sessionId}`);
        // Success - close WebView and navigate
        setShowWebView(false);
        Alert.alert('Thành công', successMessage);
        if (isSuccess) {
          navigation.navigate('orders');
        }
        return true;
      } catch (error) {
        // Suppress logging of WinError 10061 and similar connection errors to avoid clutter
        const isConnectionError = error.message?.includes('WinError 10061') ||
                                 error.message?.includes('ECONNREFUSED') ||
                                 error.code === 'ECONNREFUSED' ||
                                 error.code === 'ENOTFOUND';

        if (!isConnectionError) {
          console.error(`Payment callback error (attempt ${retryCount + 1}):`, error);
        }

        if (isConnectionError && retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying payment callback in 2 seconds... (attempt ${retryCount + 1}/${maxRetries + 1})`);

          // Wait 2 seconds before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          return attemptCallback();
        } else {
          // Max retries reached or different error
          if (retryCount >= maxRetries) {
            Alert.alert(
              'Thông báo',
              'Hệ thống đang xử lý thanh toán. Vui lòng kiểm tra trạng thái đơn hàng sau ít phút.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    setShowWebView(false);
                    if (isSuccess) {
                      navigation.navigate('orders');
                    }
                  }
                }
              ]
            );
          } else {
            // Different error, show generic message
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi xử lý thanh toán. Vui lòng thử lại.');
            setShowWebView(false);
          }
          return false;
        }
      }
    };

    return attemptCallback();
  };

  const handleWebViewNavigation = async (navState) => {
    const { url } = navState;
    if (url.includes('/success/')) {
      const sessionId = url.split('session_id=')[1];
      if (sessionId) {
        await handlePaymentCallback(
          endpoints.paymentsSuccess,
          sessionId,
          'Thanh toán thành công',
          true
        );
      }
    } else if (url.includes('/cancel/')) {
      const sessionId = url.split('session_id=')[1];
      if (sessionId) {
        await handlePaymentCallback(
          endpoints.paymentsCancel,
          sessionId,
          'Thanh toán đã bị hủy',
          false
        );
      }
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      {item.product.image ? (
        <Image source={{ uri: item.product.image }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>No Image</Text>
        </View>
      )}
      <Text style={styles.title}>{item.product.name}</Text>
      <Text style={styles.detail}>Giá: {item.product.price} VND</Text>
      <View style={styles.quantityContainer}>
        <TouchableOpacity onPress={() => handleUpdateQuantity(item, -1)} style={styles.quantityButton}>
          <Text style={styles.quantityButtonText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.quantityText}>{item.quantity}</Text>
        <TouchableOpacity onPress={() => handleUpdateQuantity(item, 1)} style={styles.quantityButton}>
          <Text style={styles.quantityButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <Button title="Xóa" onPress={() => handleRemoveItem(item.id)} color="#FF0000" />
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  const total = cart ? cart.items.reduce((sum, item) => sum + item.quantity * parseFloat(item.product.price), 0) : 0;
  const discountedTotal = total - discountAmount;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Giỏ hàng</Text>
      <Button title="Thêm từ danh sách" onPress={() => navigation.navigate('home')} color="#007AFF" />
      {cart ? (
        <>
          <FlatList
            data={cart.items}
            renderItem={renderItem}
            keyExtractor={item => item.id.toString()}
            ListEmptyComponent={<Text style={styles.warning}>Giỏ hàng trống</Text>}
          />
          <View style={styles.discountContainer}>
            <TextInput
              style={styles.discountInput}
              placeholder="Nhập mã giảm giá"
              value={discountCode}
              onChangeText={setDiscountCode}
            />
            <Button title="Áp dụng" onPress={() => {}} color="#28A745" />
          </View>
          <Text style={styles.total}>Tổng giá trị: {total} VND</Text>
          {discountAmount > 0 && (
            <Text style={styles.discountText}>Giảm giá: {discountAmount} VND</Text>
          )}
          <Text style={styles.finalTotal}>Tổng thanh toán: {discountedTotal} VND</Text>
          <Button title="Thanh toán" onPress={handleCheckout} color="#007AFF" />
        </>
      ) : (
        <Text style={styles.warning}>Không có giỏ hàng</Text>
      )}

      {/* Full-screen WebView Modal */}
      {showWebView && (
        <View style={styles.fullScreenModal}>
          <View style={styles.webViewHeader}>
            <TouchableOpacity
              onPress={() => setShowWebView(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.webViewTitle}>Thanh toán</Text>
          </View>
          <WebView
            source={{ uri: checkoutUrl }}
            onNavigationStateChange={handleWebViewNavigation}
            style={styles.fullScreenWebView}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={true}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'gray',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: '700',
  },
  detail: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  total: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    textAlign: 'center',
    marginVertical: 16,
  },
  warning: {
    fontSize: 16,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
  image: {
    width: 80,
    height: 80,
    marginBottom: 8,
  },
  imagePlaceholder: {
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    color: '#666',
    fontSize: 14,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  quantityButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  quantityButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  quantityText: {
    marginHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  discountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  discountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginRight: 8,
    borderRadius: 4,
  },
  discountText: {
    fontSize: 16,
    color: '#28A745',
    textAlign: 'center',
    marginVertical: 4,
  },
  finalTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
    textAlign: 'center',
    marginVertical: 8,
  },
  webView: {
    flex: 1,
    marginTop: 16,
  },
  fullScreenModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 1000,
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  webViewTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Roboto',
  },
  fullScreenWebView: {
    flex: 1,
  },
});

export default CartScreen;
