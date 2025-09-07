import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, RefreshControl, Platform, StatusBar, TouchableNativeFeedback, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Button } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OrderScreen = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [nextPage, setNextPage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  const fetchOrders = async (pageNum = 1, isRefresh = false) => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.ordersList + '?page=' + pageNum);
      if (response && response.results) {
        if (isRefresh) {
          setOrders(response.results);
        } else {
          setOrders(prev => pageNum === 1 ? response.results : [...prev, ...response.results]);
        }
        setNextPage(response.next);
        setPage(pageNum);
      } else {
        Alert.alert('Lỗi', 'Dữ liệu không hợp lệ từ server');
      }
    } catch (error) {
      try {
        const errorData = JSON.parse(error.message);
        const detail = errorData.detail || 'Không thể tải đơn hàng';
        Alert.alert('Lỗi', detail);
      } catch {
        Alert.alert('Lỗi', 'Không thể tải đơn hàng');
      }
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const loadMore = () => {
    if (nextPage && !loading) {
      fetchOrders(page + 1);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setNextPage(null);
    fetchOrders(1, true);
  };

  const renderItem = ({ item }) => {
    const ButtonWrapper = Platform.select({
      android: TouchableNativeFeedback,
      ios: TouchableOpacity,
    });
    return (
      <View style={styles.item}>
        <Text style={styles.title}>Mã đơn: {item.order_code}</Text>
        <Text style={styles.total}>Tổng: {item.total_amount} VND</Text>
        <Text style={[styles.status, { color: item.status === 'completed' ? 'green' : item.status === 'cancelled' ? 'red' : '#007AFF' }]}>
          Trạng thái: {item.status}
        </Text>
        <ButtonWrapper>
          <Button
            mode="contained"
            onPress={() => navigation.navigate('OrderDetailScreen', { orderId: item.id })}
            style={styles.button}
            labelStyle={styles.buttonLabel}
          >
            Xem chi tiết
          </Button>
        </ButtonWrapper>
      </View>
    );
  };

  if (loading && page === 1) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <Text style={styles.header}>Đơn hàng</Text>
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContainer}>
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={<Text style={styles.warning}>Không có đơn hàng</Text>}
          getItemLayout={(data, index) => ({ length: 100, offset: 100 * index, index })}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          scrollEnabled={false}
        />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { paddingTop: 20 },
      android: { paddingTop: 10 },
    }),
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 12,
    paddingHorizontal: 12,
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
  button: {
    marginTop: 8,
    backgroundColor: '#007AFF',
  },
  buttonLabel: {
    color: '#FFFFFF',
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

export default OrderScreen;
