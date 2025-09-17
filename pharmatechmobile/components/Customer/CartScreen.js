import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, Image, TouchableOpacity, TextInput, Platform, TouchableNativeFeedback } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis } from '../../configs/Apis';
import { MyUserContext } from '../../configs/MyContexts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

const CartScreen = ({ navigation, route }) => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  // Removed discountCode state as manual input is removed
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountList, setDiscountList] = useState([]);
  const [selectedDiscountCode, setSelectedDiscountCode] = useState('');
  const [orderId, setOrderId] = useState(null);
  const [showWebView, setShowWebView] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const user = useContext(MyUserContext);
  const productIdFromParams = route.params?.productId;

  useEffect(() => {
    // Add navigation focus listener to refresh cart when screen is focused
    const unsubscribe = navigation.addListener('focus', async () => {
      setLoading(true);
      setDiscountAmount(0);
      setSelectedDiscountCode('');
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
            navigation.setParams({ productId: undefined });
          }
        } else {
          const newCart = await authApi.post(endpoints.cartsCreate, {});
          setCart(newCart);
          if (productIdFromParams) {
            await handleAddItem(productIdFromParams, newCart, authApi);
            navigation.setParams({ productId: undefined });
          }
        }
      } catch (error) {
        console.error('Fetch cart error:', error.response?.data || error.message);
        Alert.alert('Lỗi', error.response?.data?.detail || 'Không thể tải giỏ hàng');
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [productIdFromParams, navigation]);

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
        quantity: delta,
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

  useEffect(() => {
    const fetchDiscounts = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(endpoints.discountsList);
        const discounts = response.results || response;
        console.log('Discounts fetched:', discounts);
        setDiscountList(discounts);
      } catch (error) {
        console.error('Fetch discounts error:', error.response?.data || error.message);
      }
    };
    fetchDiscounts();
  }, []);

  // Remove handleApplyDiscount function as manual apply button is removed

  // New function to apply discount immediately on dropdown change
  const handleApplyDiscountImmediate = async (discountCode) => {
    if (!cart || cart.items.length === 0) {
      Alert.alert('Lỗi', 'Giỏ hàng trống');
      setDiscountAmount(0);
      return;
    }
    if (!discountCode.trim()) {
      Alert.alert('Lỗi', 'Vui lòng chọn mã giảm giá');
      setDiscountAmount(0);
      return;
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const discountResponse = await authApi.post(endpoints.discountsApply, {
        discount_code: discountCode,
        cart_id: cart.id
      });
      setDiscountAmount(parseFloat(discountResponse.discount_amount));
      // Update cart with discount amount
      setCart(prevCart => ({
        ...prevCart,
        discount_amount: discountResponse.discount_amount
      }));
      // No alert needed on dropdown change
    } catch (discountError) {
      console.error('Discount error:', discountError);
      Alert.alert('Lỗi', 'Mã giảm giá không hợp lệ');
      setDiscountAmount(0);
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
      // Create order with discount code if selected
      const orderData = { cart_id: cart.id };
      if (selectedDiscountCode) {
        orderData.discount_code = selectedDiscountCode;
      }
      const orderResponse = await authApi.post(endpoints.ordersCreate, orderData);
      const order = orderResponse;
      setOrderId(order.id);

      // Create Stripe payment with correct amount after discount
      const paymentResponse = await authApi.post(endpoints.paymentsCreateStripePayment, {
        order_id: order.id,
        // Optionally, send discounted amount if API supports it
        // amount: discountedTotal,
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
          await new Promise(resolve => setTimeout(resolve, 2000));
          return attemptCallback();
        } else {
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
      <View style={styles.itemContent}>
        {item.product.image ? (
          <Image source={{ uri: item.product.image }} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>Chưa có hình ảnh</Text>
          </View>
        )}
        <View style={styles.itemInfo}>
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
        </View>
      </View>
      <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveItem(item.id)}>
        <Text style={styles.buttonText}>Xóa</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.statusBarBackground} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const total = cart ? cart.items.reduce((sum, item) => sum + item.quantity * parseFloat(item.product.price), 0) : 0;
  const discountedTotal = total - discountAmount;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.statusBarBackground} />
      <View style={styles.container}>
        <Text style={styles.header}>Giỏ hàng</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('home')}>
          <Text style={styles.buttonText}>Thêm từ danh sách</Text>
        </TouchableOpacity>
        {cart ? (
          <>
            <FlatList
              data={cart.items}
              renderItem={renderItem}
              keyExtractor={item => item.id.toString()}
              ListEmptyComponent={<Text style={styles.warning}>Giỏ hàng trống</Text>}
              contentContainerStyle={styles.listContent}
            />
            <View style={styles.discountSection}>
              <Text style={styles.discountTitle}>Mã giảm giá</Text>

              {/* Dropdown for discount codes - Full width */}
              <View style={styles.fullWidthDropdownContainer}>
                <Picker
                  selectedValue={selectedDiscountCode}
                  onValueChange={(itemValue) => {
                    console.log('Selected discount:', itemValue);
                    setSelectedDiscountCode(itemValue);
                    // Apply discount immediately on selection change
                    if (itemValue) {
                      handleApplyDiscountImmediate(itemValue);
                    } else {
                      setDiscountAmount(0);
                    }
                  }}
                  mode="dropdown"
                  style={styles.fullWidthPicker}
                  dropdownIconColor="#007AFF"
                  enabled={discountList && discountList.length > 0}
                >
                  <Picker.Item label="Chọn mã giảm giá" value="" />
                  {discountList && discountList.length > 0 ? (
                    discountList.map((discount) => (
                      <Picker.Item
                        key={discount.id}
                        label={`${discount.code} - ${discount.description || ''}`}
                        value={discount.code}
                      />
                    ))
                  ) : (
                    <Picker.Item label="Đang tải..." value="" enabled={false} />
                  )}
                </Picker>
              </View>

            </View>
            <Text style={styles.total}>Tổng giá trị: {total} VND</Text>
            {discountAmount > 0 && (
              <Text style={styles.discountText}>Giảm giá: {discountAmount} VND</Text>
            )}
            <Text style={styles.finalTotal}>Tổng thanh toán: {discountedTotal} VND</Text>
            <TouchableOpacity style={styles.checkoutButton} onPress={handleCheckout}>
              <Text style={styles.buttonText}>Thanh toán</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.warning}>Không có giỏ hàng</Text>
        )}

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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  statusBarBackground: {
    backgroundColor: '#007AFF',
    height: StatusBar.currentHeight || 0,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  listContent: {
    paddingBottom: 16,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 12,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 12,
  },
  imagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  imagePlaceholderText: {
    color: '#999',
    fontSize: 12,
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  itemInfo: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  detail: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  quantityButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginHorizontal: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  removeButton: {
    backgroundColor: '#FF6B35',
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
    minWidth: 60,
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  discountSection: {
    marginVertical: 16,
  },
  discountTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  discountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  discountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    backgroundColor: '#fff',
    marginRight: 8,
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginVertical: 8,
    backgroundColor: '#fff',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  fullWidthDropdownContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginVertical: 8,
    backgroundColor: '#fff',
    width: '100%',
  },
  fullWidthPicker: {
    height: 50,
    width: '100%',
  },
  applyDiscountButton: {
    backgroundColor: '#28A745',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 100,
  },
  total: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  discountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#28A745',
    textAlign: 'center',
    marginVertical: 4,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  finalTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
    textAlign: 'center',
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  checkoutButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  warning: {
    fontSize: 16,
    fontWeight: '500',
    color: '#F44336',
    textAlign: 'center',
    marginVertical: 20,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  webViewTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    flex: 1,
    textAlign: 'center',
  },
  fullScreenWebView: {
    flex: 1,
  },
});

export default CartScreen;