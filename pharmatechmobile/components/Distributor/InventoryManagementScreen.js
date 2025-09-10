import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, RefreshControl, TouchableOpacity, StatusBar, Platform, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as NavigationBar from 'expo-navigation-bar';
import { Button as PaperButton, TextInput as PaperTextInput, Card, Checkbox, FAB, Portal, Dialog, Paragraph } from 'react-native-paper';
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
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [bulkQuantity, setBulkQuantity] = useState('');
  const [bulkProducts, setBulkProducts] = useState([]);
  const navigation = useNavigation();

  if (!user || user.role !== 'distributor') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0052CC" />
        <View style={styles.warningContainer}>
          <Text style={styles.warningText}>Bạn không có quyền truy cập trang này.</Text>
        </View>
      </SafeAreaView>
    );
  }

  useEffect(() => {
    const setNavBarColor = async () => {
      if (Platform.OS === 'android') {
        await NavigationBar.setBackgroundColorAsync('#0052CC');
      }
    };
    setNavBarColor();

    const fetchProducts = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(`${endpoints.productsList}?page_size=1000`);
        setProducts(response.results);
      } catch (error) {
        console.error('Fetch products error:', error.response?.data || error.message);
        Alert.alert('Lỗi', error.response?.data?.detail || 'Không thể tải danh sách sản phẩm');
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
        console.error('Fetch inventory error:', error.response?.data || error.message);
        Alert.alert('Lỗi', error.response?.data?.detail || 'Không thể tải danh sách kho');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    fetchProducts();
    fetchInventory();
    fetchLowStock();
  }, [page, page_size, search_query]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
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
      console.error('Add inventory error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Thêm thất bại');
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
    Alert.alert('Xác nhận', 'Bạn có chắc muốn xóa mục này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
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
        },
      },
    ]);
  };

  const fetchInventoryDetail = async (id) => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.inventoryRead(id));
      setSelectedItem(response);
      setDetailModalVisible(true);
    } catch (error) {
      console.error('Fetch inventory detail error:', error.response?.data || error.message);
      Alert.alert('Lỗi', 'Không thể tải chi tiết kho');
    } finally {
      setLoading(false);
    }
  };

  const fetchLowStock = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.inventoryLowStock);
      setLowStockItems(response.results || []);
    } catch (error) {
      console.error('Fetch low stock error:', error.response?.data || error.message);
      const mockLowStock = inventory.filter(item => item.quantity < 10);
      setLowStockItems(mockLowStock);
    }
  };

  const handleBulkCreate = async () => {
    if (!bulkProducts.length || !bulkQuantity) {
      Alert.alert('Lỗi', 'Vui lòng chọn sản phẩm và nhập số lượng');
      return;
    }
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const data = bulkProducts.map(productId => ({
        product_id: productId,
        quantity: parseInt(bulkQuantity),
      }));
      await authApi.post(endpoints.inventoryBulkCreate, data);
      Alert.alert('Thành công', 'Đã thêm hàng loạt vào kho');
      setBulkModalVisible(false);
      setBulkProducts([]);
      setBulkQuantity('');
      onRefresh();
    } catch (error) {
      console.error('Bulk create error:', error.response?.data || error.message);
      Alert.alert('Lỗi', 'Thêm hàng loạt thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedItems.length) {
      Alert.alert('Lỗi', 'Vui lòng chọn ít nhất một mục');
      return;
    }
    Alert.alert('Xác nhận', `Bạn có chắc muốn xóa ${selectedItems.length} mục?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const token = await AsyncStorage.getItem('token');
          const authApi = authApis(token);
          try {
            await authApi.delete(endpoints.inventoryBulkDelete, { ids: selectedItems });
            setInventory(inventory.filter(item => !selectedItems.includes(item.id)));
            Alert.alert('Thành công', 'Đã xóa hàng loạt');
            setSelectedItems([]);
          } catch (error) {
            console.error('Bulk delete error:', error.response?.data || error.message);
            Alert.alert('Lỗi', 'Xóa hàng loạt thất bại');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const toggleItemSelection = (id) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  const toggleBulkProductSelection = (id) => {
    setBulkProducts(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  const openBulkModal = (action) => {
    setBulkAction(action);
    setBulkModalVisible(true);
  };

  const renderItem = ({ item }) => (
    <Card style={styles.card} elevation={3}>
      <Card.Content>
        <TouchableOpacity onPress={() => fetchInventoryDetail(item.id)} style={styles.cardTouchable}>
          <View style={styles.cardHeader}>
            <Checkbox
              status={selectedItems.includes(item.id) ? 'checked' : 'unchecked'}
              onPress={() => toggleItemSelection(item.id)}
              color="#0052CC"
            />
            <View style={styles.cardTitleContainer}>
              <Text style={styles.title}>{item.product_name}</Text>
              <View style={styles.statusContainer}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: item.quantity < 10 ? '#FF6B35' : '#00A86B' },
                  ]}
                />
                <Text style={[styles.quantity, { color: item.quantity < 10 ? '#FF6B35' : '#333' }]}>
                  Số lượng: {item.quantity}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
        <PaperTextInput
          label="Cập nhật số lượng"
          keyboardType="numeric"
          onSubmitEditing={e => handleUpdate(item.id, e.nativeEvent.text)}
          style={styles.input}
          mode="outlined"
          dense
          theme={{ colors: { primary: '#0052CC' } }}
          accessibilityLabel={`Cập nhật số lượng cho ${item.product_name}`}
        />
        <View style={styles.cardActions}>
          <PaperButton
            mode="contained"
            onPress={() => handleDelete(item.id)}
            style={styles.deleteButton}
            buttonColor="#FF6B35"
            textColor="#FFFFFF"
            accessibilityLabel={`Xóa ${item.product_name}`}
          >
            Xóa
          </PaperButton>
        </View>
      </Card.Content>
    </Card>
  );

  const renderBulkProductItem = ({ item }) => (
    <View style={styles.bulkProductItem}>
      <Checkbox
        status={bulkProducts.includes(item.id.toString()) ? 'checked' : 'unchecked'}
        onPress={() => toggleBulkProductSelection(item.id.toString())}
        color="#0052CC"
      />
      <Text style={styles.bulkProductText}>{item.name}</Text>
    </View>
  );

  const totalPages = Math.ceil(total_count / page_size);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0052CC" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0052CC" />
        </View>
      </SafeAreaView>
    );
  }

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.header}>Quản lý kho</Text>

      <PaperTextInput
        label="Tìm kiếm theo tên sản phẩm"
        value={search_query}
        onChangeText={text => {
          setSearchQuery(text);
          setPage(1);
        }}
        style={styles.input}
        mode="outlined"
        dense
        theme={{ colors: { primary: '#0052CC' } }}
        left={<PaperTextInput.Icon icon="magnify" color="#0052CC" />}
        accessibilityLabel="Tìm kiếm sản phẩm"
      />

      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedProduct}
          onValueChange={(itemValue) => setSelectedProduct(itemValue)}
          style={styles.picker}
          enabled={!loading}
        >
          <Picker.Item label="Chọn sản phẩm" value="" />
          {products.map(product => (
            <Picker.Item
              key={product.id}
              label={product.name}
              value={product.id.toString()}
            />
          ))}
        </Picker>
      </View>

      <PaperTextInput
        label="Nhập số lượng"
        value={quantity}
        keyboardType="numeric"
        onChangeText={setQuantity}
        style={styles.input}
        mode="outlined"
        dense
        theme={{ colors: { primary: '#0052CC' } }}
        accessibilityLabel="Nhập số lượng sản phẩm"
      />

      <PaperButton
        mode="contained"
        onPress={handleAdd}
        style={styles.addButton}
        buttonColor="#0052CC"
        textColor="#FFFFFF"
        disabled={loading}
        loading={loading}
        accessibilityLabel="Thêm sản phẩm vào kho"
      >
        Thêm vào kho
      </PaperButton>

      {lowStockItems.length > 0 && (
        <Card style={styles.lowStockBanner} elevation={2}>
          <Card.Content>
            <View style={styles.lowStockContent}>
              <Text style={styles.lowStockText}>
                ⚠️ Có {lowStockItems.length} sản phẩm sắp hết hàng
              </Text>
              <TouchableOpacity onPress={fetchLowStock}>
                <Text style={styles.lowStockLink}>Xem chi tiết</Text>
              </TouchableOpacity>
            </View>
          </Card.Content>
        </Card>
      )}

      <View style={styles.bulkOperations}>
        <PaperButton
          mode="outlined"
          onPress={() => openBulkModal('create')}
          style={styles.bulkButton}
          textColor="#0052CC"
          accessibilityLabel="Thêm hàng loạt"
        >
          Thêm hàng loạt
        </PaperButton>
        {selectedItems.length > 0 && (
          <PaperButton
            mode="outlined"
            onPress={handleBulkDelete}
            style={styles.bulkButton}
            textColor="#FF6B35"
            accessibilityLabel={`Xóa ${selectedItems.length} mục đã chọn`}
          >
            Xóa đã chọn ({selectedItems.length})
          </PaperButton>
        )}
      </View>

      <View style={styles.pageSizeContainer}>
        <Text style={styles.pageSizeText}>Số bản ghi mỗi trang:</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={page_size}
            onValueChange={(value) => {
              setPageSize(value);
              setPage(1);
            }}
            style={styles.pageSizePicker}
          >
            <Picker.Item label="10" value={10} />
            <Picker.Item label="20" value={20} />
            <Picker.Item label="50" value={50} />
            <Picker.Item label="100" value={100} />
          </Picker>
        </View>
      </View>
    </View>
  );

  const renderFooter = () => (
    <View style={styles.footerContainer}>
      <View style={styles.pagination}>
        <PaperButton
          mode="contained"
          onPress={() => setPage(page > 1 ? page - 1 : 1)}
          disabled={!previous_page}
          style={styles.paginationButton}
          buttonColor={previous_page ? '#0052CC' : '#CCCCCC'}
          textColor="#FFFFFF"
        >
          Trang trước
        </PaperButton>
        <View style={styles.pageNumbers}>
          {pageNumbers.map(num => (
            <TouchableOpacity
              key={num}
              onPress={() => setPage(num)}
              style={[styles.pageNumber, page === num && styles.activePageNumber]}
            >
              <Text style={[styles.pageNumberText, page === num && styles.activePageNumberText]}>
                {num}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <PaperButton
          mode="contained"
          onPress={() => setPage(page + 1)}
          disabled={!next_page}
          style={styles.paginationButton}
          buttonColor={next_page ? '#0052CC' : '#CCCCCC'}
          textColor="#FFFFFF"
        >
          Trang sau
        </PaperButton>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0052CC" />
      <FlatList
        data={inventory}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={<Text style={styles.emptyListText}>Kho trống</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        style={styles.container}
        contentContainerStyle={inventory.length === 0 && styles.emptyListContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      <Portal>
        <Dialog
          visible={detailModalVisible}
          onDismiss={() => setDetailModalVisible(false)}
          style={styles.modalContent}
        >
          <Dialog.Title style={styles.modalHeader}>Chi tiết kho</Dialog.Title>
          <Dialog.Content>
            {selectedItem && (
              <>
                <Paragraph style={styles.modalText}>Tên sản phẩm: {selectedItem.product_name}</Paragraph>
                <Paragraph style={styles.modalText}>Số lượng: {selectedItem.quantity}</Paragraph>
                <Paragraph style={styles.modalText}>
                  Trạng thái: {selectedItem.quantity < 10 ? 'Sắp hết hàng' : 'Còn hàng'}
                </Paragraph>
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <PaperButton
              onPress={() => setDetailModalVisible(false)}
              textColor="#0052CC"
              accessibilityLabel="Đóng chi tiết kho"
            >
              Đóng
            </PaperButton>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={bulkModalVisible}
          onDismiss={() => setBulkModalVisible(false)}
          style={styles.modalContent}
        >
          <Dialog.Title style={styles.modalHeader}>
            {bulkAction === 'create' ? 'Thêm hàng loạt' : 'Xóa hàng loạt'}
          </Dialog.Title>
          <Dialog.Content>
            {bulkAction === 'create' && (
              <>
                <FlatList
                  data={products}
                  renderItem={renderBulkProductItem}
                  keyExtractor={item => item.id.toString()}
                  style={styles.bulkProductList}
                />
                <PaperTextInput
                  label="Nhập số lượng"
                  value={bulkQuantity}
                  keyboardType="numeric"
                  onChangeText={setBulkQuantity}
                  style={styles.input}
                  mode="outlined"
                  dense
                  theme={{ colors: { primary: '#0052CC' } }}
                  accessibilityLabel="Nhập số lượng cho thêm hàng loạt"
                />
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <PaperButton
              onPress={() => setBulkModalVisible(false)}
              textColor="#6c757d"
              accessibilityLabel="Hủy thao tác hàng loạt"
            >
              Hủy
            </PaperButton>
            {bulkAction === 'create' && (
              <PaperButton
                onPress={handleBulkCreate}
                textColor="#0052CC"
                accessibilityLabel="Xác nhận thêm hàng loạt"
              >
                Thêm
              </PaperButton>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => openBulkModal('create')}
        color="#FFFFFF"
        theme={{ colors: { accent: '#0052CC' } }}
        accessibilityLabel="Thêm hàng loạt nhanh"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0052CC',
    marginBottom: 20,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  input: {
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  addButton: {
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTouchable: {
    paddingVertical: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    marginBottom: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  quantity: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  deleteButton: {
    paddingVertical: 8,
    borderRadius: 8,
  },
  lowStockBanner: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F97316',
  },
  lowStockContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lowStockText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F97316',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  lowStockLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0052CC',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  bulkOperations: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  bulkButton: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 8,
    borderColor: '#D1D5DB',
  },
  pageSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  pageSizeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    marginRight: 12,
  },
  pageSizePicker: {
    height: 50,
    width: 100,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  inventoryList: {
    marginBottom: 20,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyListText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  paginationButton: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 8,
    paddingVertical: 12,
  },
  pageNumbers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pageNumber: {
    padding: 10,
    marginHorizontal: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  activePageNumber: {
    backgroundColor: '#0052CC',
  },
  pageNumberText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  activePageNumberText: {
    color: '#FFFFFF',
  },
  warningContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  warningText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#DC2626',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0052CC',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  modalText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  bulkProductList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  bulkProductItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  bulkProductText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  headerContainer: {
    paddingBottom: 16,
  },
  footerContainer: {
    paddingTop: 16,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

export default InventoryManagementScreen;