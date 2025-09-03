import React, { useState, useEffect } from 'react';
import { View, Text, Image, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ProductDetailScreen = () => {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();
  const route = useRoute();
  const { productId } = route.params;

  useEffect(() => {
    const fetchProduct = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(endpoints.productsRead(productId));
        setProduct(response.data);
      } catch (error) {
        Alert.alert('Lỗi', 'Không thể tải chi tiết sản phẩm');
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [productId]);

  const getCartId = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.cartsList);
      const carts = response.data || [];
      if (carts.length > 0) {
        return carts[0].id; // Assume the first cart is the active one
      } else {
        // Create a new cart
        const createResponse = await authApi.post(endpoints.cartsList, {});
        return createResponse.data.id;
      }
    } catch (error) {
      throw new Error('Không thể lấy giỏ hàng');
    }
  };

  const handleAddToCart = async () => {
    if (!product.quantity || product.quantity <= 0) {
      Alert.alert('Lỗi', 'Sản phẩm hết hàng');
      return;
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const cartId = await getCartId();
      await authApi.post(endpoints.cartsAddItem(cartId), { product_id: productId, quantity: 1 });
      Alert.alert('Thành công', 'Đã thêm vào giỏ hàng');
      navigation.navigate('CartScreen', { productId });
    } catch (error) {
      let errorMessage = 'Không thể thêm vào giỏ hàng';
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.status === 400) {
          errorMessage = errorData.detail || 'Sản phẩm hết hàng hoặc không khả dụng';
        } else if (errorData.status === 404) {
          errorMessage = 'Giỏ hàng không tồn tại';
        }
      } catch (parseError) {
        // If not JSON, use default
      }
      Alert.alert('Lỗi', errorMessage);
    }
  };

  const handleBuyNow = async () => {
    if (!product.quantity || product.quantity <= 0) {
      Alert.alert('Lỗi', 'Sản phẩm hết hàng');
      return;
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const orderResponse = await authApi.post(endpoints.ordersCreate, {
        items: [{ product_id: productId, quantity: 1 }]
      });
      Alert.alert('Thành công', 'Đã tạo đơn hàng');
      navigation.navigate('PaymentScreen', { orderId: orderResponse.id });
    } catch (error) {
      let errorMessage = 'Không thể tạo đơn hàng';
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.status === 400) {
          errorMessage = errorData.detail || 'Sản phẩm hết hàng hoặc không khả dụng';
        }
      } catch (parseError) {
        // If not JSON, use default
      }
      Alert.alert('Lỗi', errorMessage);
    }
  };

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  if (!product) {
    return <Text style={styles.warning}>Sản phẩm không tồn tại</Text>;
  }

  return (
    <View style={styles.container}>
      <Image source={{ uri: product.image }} style={styles.image} />
      <Text style={styles.header}>Chi tiết sản phẩm</Text>
      <Text style={styles.title}>{product.name}</Text>
      <Text style={styles.price}>Giá: {product.price} VND</Text>
      <Text style={styles.quantity}>Số lượng: {product.quantity || 'Hết hàng'}</Text>
      <Text style={styles.description}>{product.description}</Text>
      <Button title="Thêm vào giỏ" onPress={handleAddToCart} color="#007AFF" />
      <Button
        title="Mua ngay"
        onPress={handleBuyNow}
        color="#007AFF"
      />
      <Button
        title="Xem đánh giá"
        onPress={() => navigation.navigate('ReviewScreen', { productId })}
        color="#007AFF"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  image: {
    width: 200,
    height: 200,
    marginBottom: 16,
    alignSelf: 'center',
  },
  header: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Roboto',
    fontWeight: '700',
    marginBottom: 8,
  },
  price: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  quantity: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  description: {
    fontSize: 16,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
    marginBottom: 16,
  },
  warning: {
    fontSize: 16,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default ProductDetailScreen;