import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OrderScreen = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    const fetchOrders = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(endpoints.ordersList);
        setOrders(response.data);
      } catch (error) {
        Alert.alert('Lỗi', 'Không thể tải đơn hàng');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const handleCancelOrder = async (orderId) => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.post(endpoints.ordersCancel(orderId));
      setOrders(orders.map(order =>
        order.id === orderId ? { ...order, status: 'cancelled' } : order
      ));
      Alert.alert('Thành công', 'Đã hủy đơn hàng');
    } catch (error) {
      Alert.alert('Lỗi', 'Hủy đơn hàng thất bại');
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.title}>Mã đơn: {item.id}</Text>
      <Text style={styles.total}>Tổng: {item.total} VND</Text>
      <Text style={[styles.status, { color: item.status === 'completed' ? 'green' : item.status === 'cancelled' ? 'red' : '#007AFF' }]}>
        Trạng thái: {item.status}
      </Text>
      <Button
        title="Xem chi tiết"
        onPress={() => navigation.navigate('OrderDetailScreen', { orderId: item.id })}
        color="#007AFF"
      />
      {item.status === 'pending' && (
        <Button title="Hủy đơn" onPress={() => handleCancelOrder(item.id)} color="#FF0000" />
      )}
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Đơn hàng</Text>
      <FlatList
        data={orders}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={<Text style={styles.warning}>Không có đơn hàng</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  header: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 12,
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
  total: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  status: {
    fontSize: 16,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
    marginVertical: 8,
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

export default OrderScreen;