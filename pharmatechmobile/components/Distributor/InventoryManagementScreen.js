import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, ActivityIndicator, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MyUserContext } from '../../configs/MyContexts';

const InventoryManagementScreen = () => {
  const { user } = useContext(MyUserContext);
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [page_size, setPageSize] = useState(10);
  const [total_count, setTotalCount] = useState(0);
  const [next_page, setNextPage] = useState(null);
  const [previous_page, setPreviousPage] = useState(null);
  const [search_query, setSearchQuery] = useState('');
  const navigation = useNavigation();

  // Role check
  if (!user || user.role !== 'distributor') {
    return (
      <View style={styles.container}>
        <Text style={styles.warning}>Bạn không có quyền truy cập trang này.</Text>
      </View>
    );
  }

  useEffect(() => {
    const fetchProducts = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(`${endpoints.productsList}?page_size=1000`); // Fetch all products for selection
        setProducts(response.results);
      } catch (error) {
        console.error('Fetch products error:', error.message);
        Alert.alert('Lỗi', 'Không thể tải danh sách sản phẩm');
      }
    };

    const fetchInventory = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        let url = `${endpoints.inventoryList}?page=${page}&page_size=${page_size}`;
        if (search_query) {
          url += `&search=${encodeURIComponent(search_query)}`;
        }
        const response = await authApi.get(url);
        setInventory(response.results);
        setTotalCount(response.count);
        setNextPage(response.next);
        setPreviousPage(response.previous);
      } catch (error) {
        console.error('Fetch inventory error:', error.message);
        const errorData = JSON.parse(error.message);
        Alert.alert('Lỗi', errorData.detail || errorData.non_field_errors || 'Không thể tải danh sách kho');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    fetchProducts();
    fetchInventory();
  }, [page, page_size, search_query]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    // The useEffect will trigger fetchInventory again
  };

  const validateInputs = () => {
    if (!selectedProduct || !quantity) {
      Alert.alert('Lỗi', 'Vui lòng chọn sản phẩm và nhập số lượng');
      return false;
    }
    if (isNaN(parseInt(quantity)) || parseInt(quantity) < 0) {
      Alert.alert('Lỗi', 'Số lượng phải là số không âm');
      return false;
    }
    return true;
  };

  const handleAdd = async () => {
    if (!validateInputs()) return;
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.post(endpoints.inventoryCreate, {
        product_id: selectedProduct,
        quantity: parseInt(quantity),
      });
      setInventory([...inventory, response]);
      setSelectedProduct('');
      setQuantity('');
      Alert.alert('Thành công', 'Đã thêm vào kho');
    } catch (error) {
      console.error('Add inventory error:', error.message);
      const errorData = JSON.parse(error.message);
      Alert.alert('Lỗi', errorData.detail || errorData.non_field_errors || 'Thêm thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id, new_quantity) => {
    if (isNaN(parseInt(new_quantity)) || parseInt(new_quantity) < 0) {
      Alert.alert('Lỗi', 'Số lượng phải là số không âm');
      return;
    }
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.put(endpoints.inventoryUpdate(id), {
        quantity: parseInt(new_quantity),
      });
      setInventory(inventory.map(item => (item.id === id ? response : item)));
      Alert.alert('Thành công', 'Đã cập nhật kho');
    } catch (error) {
      console.error('Update inventory error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Cập nhật thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.delete(endpoints.inventoryDelete(id));
      setInventory(inventory.filter(item => item.id !== id));
      Alert.alert('Thành công', 'Đã xóa khỏi kho');
    } catch (error) {
      console.error('Delete inventory error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Xóa thất bại');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.title}>{item.product_name}</Text>
      <Text style={[styles.quantity, { color: item.quantity < 10 ? '#FFD700' : '#000000' }]}>
        Số lượng: {item.quantity}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Nhập số lượng"
        keyboardType="numeric"
        onSubmitEditing={e => handleUpdate(item.id, e.nativeEvent.text)}
      />
      <Button title="Xóa" onPress={() => handleDelete(item.id)} color="#FF0000" />
    </View>
  );

  const totalPages = Math.ceil(total_count / page_size);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Quản lý kho</Text>
      <TextInput
        style={styles.input}
        placeholder="Tìm kiếm theo tên sản phẩm..."
        value={search_query}
        onChangeText={text => { setSearchQuery(text); setPage(1); }}
      />
      <Picker
        selectedValue={selectedProduct}
        style={styles.picker}
        onValueChange={(itemValue) => setSelectedProduct(itemValue)}
      >
        <Picker.Item label="Chọn sản phẩm" value="" />
        {products.map(product => (
          <Picker.Item key={product.id} label={product.name} value={product.id.toString()} />
        ))}
      </Picker>
      <TextInput
        style={styles.input}
        placeholder="Nhập số lượng"
        value={quantity}
        keyboardType="numeric"
        onChangeText={setQuantity}
      />
      <Button title="Thêm" onPress={handleAdd} color="#007AFF" />
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
      <FlatList
        data={inventory}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={<Text style={styles.warning}>Kho trống</Text>}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
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
          onPress={() => setPage(totalPages)}
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
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 10,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  picker: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
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
  quantity: {
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
});

export default InventoryManagementScreen;