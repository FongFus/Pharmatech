import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, RefreshControl, Platform, StatusBar, TouchableNativeFeedback, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, SegmentedButtons, Menu } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import moment from 'moment';
import 'moment/locale/vi';

moment.locale('vi');

// Utility functions
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount).replace('₫', '₫');
};

const formatDate = (dateString) => {
  const date = moment(dateString);
  const now = moment();
  const diffDays = now.diff(date, 'days');

  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays <= 7) return `${diffDays} ngày trước`;
  return date.format('DD/MM/YYYY, HH:mm');
};

// Components
const Tabs = ({ activeTab, onTabChange }) => {
  const tabs = [
    { value: 'all', label: 'Tất cả' },
    { value: 'processing', label: 'Đang xử lý' },
    { value: 'completed', label: 'Hoàn thành' },
    { value: 'cancelled', label: 'Đã hủy' },
  ];

  return (
    <SegmentedButtons
      value={activeTab}
      onValueChange={onTabChange}
      buttons={tabs}
      style={styles.tabs}
    />
  );
};

const SearchBar = ({ searchText, onSearchChange }) => (
  <TextInput
    style={styles.searchInput}
    placeholder="Tìm kiếm theo mã đơn hàng..."
    value={searchText}
    onChangeText={onSearchChange}
  />
);

const SortDropdown = ({ sortOption, onSortChange }) => {
  const [visible, setVisible] = useState(false);
  const sortOptions = [
    { label: 'Mới nhất → cũ nhất', value: 'newest' },
    { label: 'Cũ nhất → mới nhất', value: 'oldest' },
    { label: 'Giá cao → thấp', value: 'price_high' },
    { label: 'Giá thấp → cao', value: 'price_low' },
  ];

  const currentLabel = sortOptions.find(opt => opt.value === sortOption)?.label || 'Sắp xếp';

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <Button onPress={() => setVisible(true)} mode="outlined" style={styles.sortButton}>
          {currentLabel}
        </Button>
      }
    >
      {sortOptions.map(option => (
        <Menu.Item
          key={option.value}
          onPress={() => {
            onSortChange(option.value);
            setVisible(false);
          }}
          title={option.label}
        />
      ))}
    </Menu>
  );
};

const OrderSkeleton = () => (
  <View style={styles.skeletonItem}>
    <View style={styles.skeletonLine} />
    <View style={styles.skeletonLine} />
    <View style={styles.skeletonLine} />
    <View style={styles.skeletonLine} />
  </View>
);

const OrderItem = ({ item, navigation }) => {
  const ButtonWrapper = Platform.select({
    android: TouchableNativeFeedback,
    ios: TouchableOpacity,
  });

  const statusColors = {
    completed: '#4CAF50',
    cancelled: '#F44336',
    pending: '#FF9800',
    processing: '#FF9800',
  };

  const statusLabels = {
    completed: 'Hoàn thành',
    cancelled: 'Đã hủy',
    pending: 'Đang chờ',
    processing: 'Đang xử lý',
  };

  const totalAmount = parseFloat(item.total_amount);
  const discountAmount = parseFloat(item.discount_amount || 0);
  const originalAmount = totalAmount + discountAmount;
  const hasDiscount = discountAmount > 0;

  return (
    <View style={styles.item}>
      <Text style={styles.orderCode}>Mã đơn: {item.order_code}</Text>
      <Text style={styles.itemCount}>{item.items?.length || 0} sản phẩm</Text>
      <Text style={styles.date}>{formatDate(item.created_at)}</Text>
      <Text style={[styles.status, { color: statusColors[item.status] || '#007AFF' }]}>
        {statusLabels[item.status] || item.status}
      </Text>
      {hasDiscount && (
        <>
          <Text style={styles.originalPrice}>Giá gốc: {formatCurrency(originalAmount)}</Text>
          <Text style={styles.savings}>Tiết kiệm: {formatCurrency(discountAmount)}</Text>
        </>
      )}
      <Text style={styles.totalAmount}>Tổng thanh toán: {formatCurrency(totalAmount)}</Text>
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

const OrderScreen = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [nextPage, setNextPage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [sortOption, setSortOption] = useState('newest');
  const [searchText, setSearchText] = useState('');
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

  const filteredAndSortedOrders = useMemo(() => {
    let filtered = orders;

    // Filter by tab
    if (activeTab !== 'all') {
      if (activeTab === 'processing') {
        filtered = filtered.filter(order => order.status === 'pending' || order.status === 'processing');
      } else {
        filtered = filtered.filter(order => order.status === activeTab);
      }
    }

    // Filter by search
    if (searchText) {
      filtered = filtered.filter(order => order.order_code.toLowerCase().includes(searchText.toLowerCase()));
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'oldest':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'price_high':
          return parseFloat(b.total_amount) - parseFloat(a.total_amount);
        case 'price_low':
          return parseFloat(a.total_amount) - parseFloat(b.total_amount);
        default:
          return 0;
      }
    });

    return filtered;
  }, [orders, activeTab, sortOption, searchText]);

  const renderItem = ({ item }) => <OrderItem item={item} navigation={navigation} />;

  const renderSkeleton = () => <OrderSkeleton />;

  if (loading && page === 1) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
        <Text style={styles.header}>Đơn hàng</Text>
        <FlatList
          data={Array.from({ length: 5 })}
          renderItem={renderSkeleton}
          keyExtractor={(item, index) => index.toString()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <Text style={styles.header}>Đơn hàng</Text>
      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />
      <View style={styles.controls}>
        <SearchBar searchText={searchText} onSearchChange={setSearchText} />
        <SortDropdown sortOption={sortOption} onSortChange={setSortOption} />
      </View>
      <FlatList
        data={filteredAndSortedOrders}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={<Text style={styles.warning}>Không có đơn hàng</Text>}
        initialNumToRender={10}
        maxToRenderPerBatch={5}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  tabs: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  controls: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderColor: '#CCCCCC',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 12,
    fontFamily: 'Roboto',
  },
  sortButton: {
    height: 40,
    justifyContent: 'center',
  },
  item: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderCode: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#333333',
    marginBottom: 4,
  },
  itemCount: {
    fontSize: 14,
    fontFamily: 'Roboto',
    color: '#666666',
    marginBottom: 2,
  },
  date: {
    fontSize: 14,
    fontFamily: 'Roboto',
    color: '#666666',
    marginBottom: 4,
  },
  status: {
    fontSize: 14,
    fontFamily: 'Roboto',
    fontWeight: '500',
    marginBottom: 8,
  },
  originalPrice: {
    fontSize: 14,
    fontFamily: 'Roboto',
    color: '#999999',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  savings: {
    fontSize: 14,
    fontFamily: 'Roboto',
    color: '#4CAF50',
    fontWeight: '500',
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#007AFF',
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontFamily: 'Roboto',
    fontWeight: '500',
  },
  warning: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
    color: '#F44336',
    textAlign: 'center',
    marginTop: 20,
  },
  skeletonItem: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  skeletonLine: {
    height: 16,
    backgroundColor: '#E0E0E0',
    marginBottom: 8,
    borderRadius: 4,
  },
});

export default OrderScreen;
