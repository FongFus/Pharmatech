import React, { useState, useEffect, useContext } from 'react';
import { View, Text, Button, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis } from '../../configs/Apis';
import { MyUserContext } from '../../configs/MyContexts';

const CartScreen = ({ navigation }) => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = useContext(MyUserContext);

  useEffect(() => {
    const fetchCart = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(endpoints.cartsList);
        // Giả định backend trả về danh sách carts, lấy cart đầu tiên của người dùng
        setCart(response.results && response.results.length > 0 ? response.results[0] : null);
      } catch (error) {
        console.error('Fetch cart error:', error.response?.data || error.message);
        Alert.alert('Lỗi', error.response?.data?.detail || 'Không thể tải giỏ hàng');
      } finally {
        setLoading(false);
      }
    };
    fetchCart();
  }, []);

  const handleAddItem = async (product_id) => {
    if (!cart) {
      Alert.alert('Lỗi', 'Giỏ hàng chưa được tạo');
      return;
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.post(endpoints.cartsAddItem(cart.id), {
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
      <Text style={styles.title}>{item.product.name}</Text>
      <Text style={styles.detail}>Số lượng: {item.quantity}</Text>
      <Button title="Xóa" onPress={() => handleRemoveItem(item.id)} color="#FF0000" />
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Giỏ hàng</Text>
      {cart ? (
        <>
          <FlatList
            data={cart.items}
            renderItem={renderItem}
            keyExtractor={item => item.id.toString()}
            ListEmptyComponent={<Text style={styles.warning}>Giỏ hàng trống</Text>}
          />
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
  warning: {
    fontSize: 16,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default CartScreen;