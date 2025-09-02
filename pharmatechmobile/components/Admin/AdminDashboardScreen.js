import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, Picker } from 'react-native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AdminDashboardScreen = () => {
  const [active_tab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({ visits: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [page_size, setPageSize] = useState(10);
  const [total_count, setTotalCount] = useState(0);
  const [next_page, setNextPage] = useState(null);
  const [previous_page, setPreviousPage] = useState(null);
  const [search_query, setSearchQuery] = useState('');
  const [ordering, setOrdering] = useState('created_at');

  useEffect(() => {
    const fetchData = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        let url = active_tab === 'users'
          ? `${endpoints.usersList}?page=${page}&page_size=${page_size}`
          : `${endpoints.productsList}?page=${page}&page_size=${page_size}`;
        
        if (search_query) {
          url += `&search=${encodeURIComponent(search_query)}`;
        }
        if (ordering) {
          url += `&ordering=${ordering}`;
        }

        const response = await authApi.get(url);
        if (active_tab === 'users') {
          setUsers(response.results);
        } else {
          setProducts(response.results);
        }
        setTotalCount(response.count);
        setNextPage(response.next);
        setPreviousPage(response.previous);
        setStats({ visits: 100 }); // Giả lập, thay bằng API thật
      } catch (error) {
        console.error('Fetch data error:', error.response?.data || error.message);
        Alert.alert('Lỗi', error.response?.data?.detail || 'Không thể tải dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [active_tab, page, page_size, search_query, ordering]);

  const handleApproveProduct = async (product_id) => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.post(endpoints.productsApprove(product_id));
      setProducts(products.map(product =>
        product.id === product_id ? { ...product, status: 'approved' } : product
      ));
      Alert.alert('Thành công', 'Đã duyệt sản phẩm');
    } catch (error) {
      console.error('Approve product error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Duyệt thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserActive = async (user_id, is_active) => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.post(endpoints.usersChangeActiveState, { user_id, is_active: !is_active });
      setUsers(users.map(user =>
        user.id === user_id ? { ...user, is_active: !is_active } : user
      ));
      Alert.alert('Thành công', `Đã ${is_active ? 'vô hiệu hóa' : 'kích hoạt'} người dùng`);
    } catch (error) {
      console.error('Toggle user active error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Cập nhật thất bại');
    } finally {
      setLoading(false);
    }
  };

  const renderUserItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.title}>{item.username}</Text>
      <Text style={styles.detail}>Email: {item.email}</Text>
      <Text style={[styles.status, { color: item.is_active ? 'green' : 'red' }]}>
        Trạng thái: {item.is_active ? 'Hoạt động' : 'Vô hiệu hóa'}
      </Text>
      <Button
        title={item.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
        onPress={() => handleToggleUserActive(item.id, item.is_active)}
        color={item.is_active ? '#FF0000' : '#007AFF'}
      />
    </View>
  );

  const renderProductItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.title}>{item.name}</Text>
      <Text style={styles.detail}>Giá: {item.price} VND</Text>
      <Text style={[styles.status, { color: item.status === 'approved' ? 'green' : '#FFD700' }]}>
        Trạng thái: {item.status === 'approved' ? 'Đã duyệt' : 'Chờ duyệt'}
      </Text>
      {item.status !== 'approved' && (
        <Button
          title="Duyệt"
          onPress={() => handleApproveProduct(item.id)}
          color="#007AFF"
        />
      )}
    </View>
  );

  const totalPages = Math.ceil(total_count / page_size);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Bảng điều khiển</Text>
      <Text style={styles.stats}>Tổng lượt truy cập: {stats.visits}</Text>
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, active_tab === 'users' && styles.activeTab]}
          onPress={() => { setActiveTab('users'); setPage(1); setSearchQuery(''); }}
        >
          <Text style={[styles.tabText, active_tab === 'users' && styles.activeTabText]}>
            Người dùng
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, active_tab === 'products' && styles.activeTab]}
          onPress={() => { setActiveTab('products'); setPage(1); setSearchQuery(''); }}
        >
          <Text style={[styles.tabText, active_tab === 'products' && styles.activeTabText]}>
            Sản phẩm
          </Text>
        </TouchableOpacity>
      </View>
      {active_tab === 'users' && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm kiếm theo tên, email, số điện thoại..."
            value={search_query}
            onChangeText={text => { setSearchQuery(text); setPage(1); }}
          />
          <Picker
            selectedValue={ordering}
            style={styles.orderingPicker}
            onValueChange={(value) => { setOrdering(value); setPage(1); }}
          >
            <Picker.Item label="Sắp xếp theo ngày tạo" value="created_at" />
            <Picker.Item label="Sắp xếp theo tên" value="username" />
            <Picker.Item label="Sắp xếp ngược ngày tạo" value="-created_at" />
            <Picker.Item label="Sắp xếp ngược tên" value="-username" />
          </Picker>
        </View>
      )}
      <View style={styles.pageSizeContainer}>
        <Text style={styles.pageSizeText}>Số bản ghi mỗi trang:</Text>
        <Picker
          selectedValue={page_size}
          style={styles.pageSizePicker}
          onValueChange={(value) => { setPageSize(value); setPage(1); }}
        >
          <Picker.Item label="10" value={10} />
          <Picker.Item label="20" value={20} />
          <Picker.Item label="50" value={50} />
          <Picker.Item label="100" value={100} />
        </Picker>
      </View>
      {active_tab === 'users' ? (
        <FlatList
          data={users}
          renderItem={renderUserItem}
          keyExtractor={item => item.id.toString()}
          ListEmptyComponent={<Text style={styles.warning}>Không có người dùng</Text>}
        />
      ) : (
        <FlatList
          data={products}
          renderItem={renderProductItem}
          keyExtractor={item => item.id.toString()}
          ListEmptyComponent={<Text style={styles.warning}>Không có sản phẩm</Text>}
        />
      )}
      <View style={styles.pagination}>
        <Button
          title="Trang trước"
          onPress={() => setPage(page > 1 ? page - 1 : 1)}
          disabled={!previous_page}
          color="#007AFF"
        />
        <View style={styles.pageNumbers}>
          {pageNumbers.map(num => (
            <TouchableOpacity
              key={num}
              style={[styles.pageNumber, page === num && styles.activePageNumber]}
              onPress={() => setPage(num)}
            >
              <Text style={[styles.pageNumberText, page === num && styles.activePageNumberText]}>
                {num}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Button
          title="Trang sau"
          onPress={() => setPage(page + 1)}
          disabled={!next_page}
          color="#007AFF"
        />
        <Button
          title="Cuối cùng"
          onPress={() => setPage('last')}
          disabled={!next_page}
          color="#007AFF"
        />
      </View>
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
  stats: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    padding: 10,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    borderRadius: 5,
    marginHorizontal: 5,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#000000',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  searchContainer: {
    marginBottom: 16,
  },
  searchInput: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 10,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  orderingPicker: {
    height: 40,
    width: '100%',
  },
  pageSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageSizeText: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
    marginRight: 8,
  },
  pageSizePicker: {
    height: 40,
    width: 100,
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
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  pageNumbers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pageNumber: {
    padding: 8,
    marginHorizontal: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
  },
  activePageNumber: {
    backgroundColor: '#007AFF',
  },
  pageNumberText: {
    fontSize: 14,
    fontFamily: 'Roboto',
    fontWeight: '400',
    color: '#000000',
  },
  activePageNumberText: {
    color: '#FFFFFF',
  },
});

export default AdminDashboardScreen;