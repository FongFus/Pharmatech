
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert, Image, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

const PaymentScreen = () => {
  const [loading, setLoading] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const navigation = useNavigation();
  const route = useRoute();
  const { orderId } = route.params || {};
  const total = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  // Fetch latest cart data from backend to avoid stale data
  useEffect(() => {
    const fetchCart = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(endpoints.cartsList);
        // Assuming response is an array of carts, take the first or user's cart
        if (response.length > 0) {
          setCartItems(response[0].items || []);
        }
      } catch (error) {
        Alert.alert('Lỗi', 'Không thể tải giỏ hàng');
      }
    };
    fetchCart();
  }, []);

  const handlePayment = async () => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      // Send full data including order_id if available
      const dataToSend = { amount: total };
      if (orderId) {
        dataToSend.order_id = orderId;
      }
      // Call correct endpoint
      const response = await authApi.post(endpoints.paymentsCreateStripePayment, dataToSend);
      // Expect response to contain url or session_id for Stripe checkout
      if (response.url) {
        setCheckoutUrl(response.url);
        setShowWebView(true);
      } else if (response.session_id) {
        // If only session_id, construct checkout url (assuming backend uses Stripe Checkout)
        const stripeCheckoutUrl = `https://checkout.stripe.com/pay/${response.session_id}`;
        setCheckoutUrl(stripeCheckoutUrl);
        setShowWebView(true);
      } else {
        Alert.alert('Lỗi', 'Không nhận được thông tin thanh toán từ server');
      }
    } catch (error) {
      Alert.alert('Lỗi', 'Thanh toán thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.get(endpoints.paymentsCancel);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Lỗi', 'Hủy thất bại');
    }
  };

  // Handle WebView navigation state changes to detect payment success or cancel
  const onWebViewNavigationStateChange = (navState) => {
    const { url } = navState;
    // Assuming backend redirects to specific URLs on success or cancel
    if (url.includes('/payments/success')) {
      setShowWebView(false);
      Alert.alert('Thành công', 'Thanh toán thành công');
      navigation.navigate('HomeScreen');
    } else if (url.includes('/payments/cancel')) {
      setShowWebView(false);
      Alert.alert('Hủy', 'Thanh toán đã bị hủy');
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} />
      <Text style={styles.header}>Thanh toán</Text>
      <Text style={styles.description}>Chọn phương thức</Text>
      <TextInput
        style={styles.input}
        value={`${total} VND`}
        editable={false}
      />
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Button title="Thanh toán" onPress={handlePayment} color="#007AFF" />
          <Button title="Hủy" onPress={handleCancel} color="#FF0000" />
        </>
      )}
      <Modal visible={showWebView} animationType="slide">
        <View style={{ flex: 1 }}>
          <Button title="Đóng" onPress={() => setShowWebView(false)} />
          {checkoutUrl && (
            <WebView
              source={{ uri: checkoutUrl }}
              onNavigationStateChange={onWebViewNavigationStateChange}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    padding: 16,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  header: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
    marginBottom: 16,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 10,
    width: '100%',
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
});

export default PaymentScreen;
