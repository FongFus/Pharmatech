import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OrderDetailScreen = () => {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();
  const route = useRoute();
  const { orderId } = route.params;

  useEffect(() => {
    const fetchOrder = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(endpoints.ordersRead(orderId));
        setOrder(response.data);
      } catch (error) {
        Alert.alert('Lỗi', 'Không thể tải chi tiết đơn hàng');
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderId]);

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.productName}>{item.product.name}</Text>
      <Text style={styles.quantity}>Số lượng: {item.quantity}</Text>
      <Text style={styles.price}>Giá: {item.price} VND</Text>
      <Text style={styles.subtotal}>Tổng: {item.quantity * item.price} VND</Text>
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  if (!order) {
    return <Text style={styles.warning}>Đơn hàng không tồn tại</Text>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Chi tiết đơn hàng</Text>
      <Text style={styles.orderCode}>Mã đơn: {order.order_code}</Text>
      <Text style={styles.total}>Tổng tiền: {order.total_amount} VND</Text>
      <Text style={[styles.status, { color: order.status === 'completed' ? 'green' : order.status === 'cancelled' ? 'red' : '#007AFF' }]}>
        Trạng thái: {order.status}
      </Text>
      <Text style={styles.itemsHeader}>Sản phẩm:</Text>
      <FlatList
        data={order.items}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={<Text style={styles.warning}>Không có sản phẩm</Text>}
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
  header: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
  },
  orderCode: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: '700',
    marginBottom: 8,
  },
  total: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
    marginBottom: 8,
  },
  status: {
    fontSize: 16,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
    marginBottom: 16,
  },
  itemsHeader: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: '700',
    marginBottom: 8,
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'gray',
    marginBottom: 8,
  },
  productName: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '700',
  },
  quantity: {
    fontSize: 14,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  price: {
    fontSize: 14,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  subtotal: {
    fontSize: 14,
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

export default OrderDetailScreen;
