import React, { useState, useEffect, useContext } from 'react';
import { View, Text, Button, FlatList, StyleSheet, ActivityIndicator, Alert, Image, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis } from '../../configs/Apis';
import { MyUserContext } from '../../configs/MyContexts';

const CartScreen = ({ navigation, route }) => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
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
    if (!cart) return;
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.post(endpoints.cartsCheckout(cart.id));
      Alert.alert('Thành công', 'Đã tạo đơn hàng');
      navigation.navigate('OrderScreen');
    } catch (error) {
      console.error('Checkout error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Thanh toán thất bại');
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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Giỏ hàng</Text>
      <Button title="Thêm từ danh sách" onPress={() => navigation.navigate('HomeScreen')} color="#007AFF" />
      {cart ? (
        <>
          <FlatList
            data={cart.items}
            renderItem={renderItem}
            keyExtractor={item => item.id.toString()}
            ListEmptyComponent={<Text style={styles.warning}>Giỏ hàng trống</Text>}
          />
          <Text style={styles.total}>Tổng giá trị: {cart.items.reduce((sum, item) => sum + item.quantity * parseFloat(item.product.price), 0)} VND</Text>
          <Button title="Thanh toán" onPress={handleCheckout} color="#007AFF" />
        </>
      ) : (
        <Text style={styles.warning}>Không có giỏ hàng</Text>
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
});

export default CartScreen;
