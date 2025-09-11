import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, RefreshControl, TouchableOpacity, StatusBar, Platform, Modal, ScrollView } from 'react-native';
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
  const [searchQueryTab0, setSearchQueryTab0] = useState('');
  const [searchQueryTab1, setSearchQueryTab1] = useState('');
  const [sortBy, setSortBy] = useState('product_name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [bulkModalVisible, setBulkModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [bulkQuantity, setBulkQuantity] = useState('');
  const [bulkProducts, setBulkProducts] = useState([]);
  const [tabIndex, setTabIndex] = useState(0);
  const navigation = useNavigation();

  // Thêm state cho tick chọn sản phẩm chưa có trong kho
  const [selectedNewProducts, setSelectedNewProducts] = useState([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addQuantities, setAddQuantities] = useState({});
  // Tab 1: state cho cập nhật/xóa nhiều sản phẩm
  const [selectedInventoryItems, setSelectedInventoryItems] = useState([]);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateQuantities, setUpdateQuantities] = useState({});

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
        const response = await authApi.get(`${endpoints.productsMyProducts}?page_size=1000`);
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
        if (searchQueryTab1) {
          url += `&search=${encodeURIComponent(searchQueryTab1)}`;
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
  }, [page, page_size, searchQueryTab1]);

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

  // Tính toán danh sách sản phẩm chưa có trong kho
  const productsNotInInventory = products.filter(product => !inventory.some(inv => inv.product_id === product.id));
  const filteredProductsNotInInventory = productsNotInInventory.filter(product =>
    product.name && product.name.toLowerCase().includes(searchQueryTab0.toLowerCase())
  );

  // Tick chọn sản phẩm chưa có trong kho
  const toggleNewProductSelection = (id) => {
    setSelectedNewProducts(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  // Tick chọn sản phẩm trong kho
  const toggleInventoryItemSelection = (id) => {
    setSelectedInventoryItems(prev =>
      prev.includes(id) ? prev.filter(itemId => itemId !== id) : [...prev, id]
    );
  };

  // Mở modal nhập số lượng cho sản phẩm mới
  const openAddModal = () => {
    if (!selectedNewProducts.length) {
      Alert.alert('Lỗi', 'Vui lòng chọn ít nhất một sản phẩm');
      return;
    }
    // Khởi tạo số lượng mặc định
    const initialQuantities = {};
    selectedNewProducts.forEach(id => { initialQuantities[id] = ''; });
    setAddQuantities(initialQuantities);
    setAddModalVisible(true);
  };

  // Thêm sản phẩm vào kho (1 hoặc nhiều)
  const handleAddToInventory = async () => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      // Kiểm tra số lượng
      for (const id of selectedNewProducts) {
        const qty = addQuantities[id];
        if (!qty || isNaN(parseInt(qty)) || parseInt(qty) < 0) {
          Alert.alert('Lỗi', 'Số lượng phải là số không âm cho tất cả sản phẩm');
          setLoading(false);
          return;
        }
      }
      if (selectedNewProducts.length === 1) {
        // Thêm 1 sản phẩm
        const productId = selectedNewProducts[0];
        const response = await authApi.post(endpoints.inventoryCreate, {
          product_id: productId,
          quantity: parseInt(addQuantities[productId]),
        });
        setInventory([...inventory, response]);
      } else {
        // Thêm nhiều sản phẩm
        const data = selectedNewProducts.map(id => ({
          product_id: id,
          quantity: parseInt(addQuantities[id]),
        }));
        await authApi.post(endpoints.inventoryBulkCreate, data);
        onRefresh();
      }
      setAddModalVisible(false);
      setSelectedNewProducts([]);
      setAddQuantities({});
      Alert.alert('Thành công', 'Đã thêm vào kho');
    } catch (error) {
      Alert.alert('Lỗi', 'Thêm vào kho thất bại');
    } finally {
      setLoading(false);
    }
  };

  // Mở modal cập nhật số lượng cho nhiều sản phẩm trong kho
  const openUpdateModal = () => {
    if (!selectedInventoryItems.length) {
      Alert.alert('Lỗi', 'Vui lòng chọn ít nhất một sản phẩm');
      return;
    }
    const initialQuantities = {};
    selectedInventoryItems.forEach(id => {
      const item = inventory.find(inv => inv.id === id);
      initialQuantities[id] = item ? item.quantity.toString() : '';
    });
    setUpdateQuantities(initialQuantities);
    setUpdateModalVisible(true);
  };

  // Cập nhật số lượng cho nhiều sản phẩm
  const handleUpdateInventory = async () => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      for (const id of selectedInventoryItems) {
        const qty = updateQuantities[id];
        if (!qty || isNaN(parseInt(qty)) || parseInt(qty) < 0) {
          Alert.alert('Lỗi', 'Số lượng phải là số không âm cho tất cả sản phẩm');
          setLoading(false);
          return;
        }
      }
      // Gọi API cập nhật từng sản phẩm
      for (const id of selectedInventoryItems) {
        await authApi.put(endpoints.inventoryUpdate(id), {
          quantity: parseInt(updateQuantities[id]),
        });
      }
      setUpdateModalVisible(false);
      setSelectedInventoryItems([]);
      setUpdateQuantities({});
      onRefresh();
      Alert.alert('Thành công', 'Đã cập nhật số lượng');
    } catch (error) {
      Alert.alert('Lỗi', 'Cập nhật số lượng thất bại');
    } finally {
      setLoading(false);
    }
  };

  // Xóa nhiều sản phẩm khỏi kho
  const handleBulkDeleteInventory = async () => {
    if (!selectedInventoryItems.length) {
      Alert.alert('Lỗi', 'Vui lòng chọn ít nhất một sản phẩm');
      return;
    }
    Alert.alert('Xác nhận', `Bạn có chắc muốn xóa ${selectedInventoryItems.length} sản phẩm khỏi kho?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const token = await AsyncStorage.getItem('token');
          const authApi = authApis(token);
          try {
            await authApi.delete(endpoints.inventoryBulkDelete, { ids: selectedInventoryItems });
            setSelectedInventoryItems([]);
            onRefresh();
            Alert.alert('Thành công', 'Đã xóa khỏi kho');
          } catch (error) {
            Alert.alert('Lỗi', 'Xóa khỏi kho thất bại');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
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

  const renderProductItem = ({ item }) => (
    <Card style={styles.card} elevation={3}>
      <Card.Content>
        <View style={styles.cardTitleContainer}>
          <Text style={styles.title}>{item.name}</Text>
          <Text style={styles.productDescription}>{item.description}</Text>
        </View>
        <View style={styles.cardActions}>
          <PaperButton
            mode="contained"
            onPress={() => {
              setSelectedProduct(item.id.toString());
              setQuantity('0');
            }}
            style={styles.addToInventoryButton}
            buttonColor="#0052CC"
            textColor="#FFFFFF"
            accessibilityLabel={`Thêm ${item.name} vào kho`}
          >
            Thêm vào kho
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

  // Tab điều khiển
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.header}>Quản lý kho</Text>
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, tabIndex === 0 && styles.activeTab]}
          onPress={() => setTabIndex(0)}
        >
          <Text style={[styles.tabText, tabIndex === 0 && styles.activeTabText]}>Sản phẩm chưa có kho</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, tabIndex === 1 && styles.activeTab]}
          onPress={() => setTabIndex(1)}
        >
          <Text style={[styles.tabText, tabIndex === 1 && styles.activeTabText]}>Kho hàng</Text>
        </TouchableOpacity>
      </View>
      {tabIndex === 0 && (
        <>
          <PaperTextInput
            label="Tìm kiếm theo tên sản phẩm"
            value={searchQueryTab0}
            onChangeText={setSearchQueryTab0}
            style={styles.input}
            mode="outlined"
            dense
            theme={{ colors: { primary: '#0052CC' } }}
            left={<PaperTextInput.Icon icon="magnify" color="#0052CC" />}
            accessibilityLabel="Tìm kiếm sản phẩm"
          />
          <View style={styles.bulkOperations}>
            <PaperButton
              mode="contained"
              onPress={openAddModal}
              style={styles.addButton}
              buttonColor="#0052CC"
              textColor="#FFFFFF"
              disabled={loading}
              accessibilityLabel="Thêm vào kho"
            >
              Thêm vào kho
            </PaperButton>
          </View>
        </>
      )}
      {tabIndex === 1 && (
        <>
          <PaperTextInput
            label="Tìm kiếm theo tên sản phẩm"
            value={searchQueryTab1}
            onChangeText={text => {
              setSearchQueryTab1(text);
              setPage(1);
            }}
            style={styles.input}
            mode="outlined"
            dense
            theme={{ colors: { primary: '#0052CC' } }}
            left={<PaperTextInput.Icon icon="magnify" color="#0052CC" />}
            accessibilityLabel="Tìm kiếm sản phẩm"
          />
          <View style={styles.bulkOperations}>
            <PaperButton
              mode="outlined"
              onPress={handleBulkDeleteInventory}
              style={styles.bulkButton}
              textColor="#FF6B35"
              accessibilityLabel="Xóa khỏi kho"
            >
              Xóa khỏi kho
            </PaperButton>
            <PaperButton
              mode="outlined"
              onPress={openUpdateModal}
              style={styles.bulkButton}
              textColor="#0052CC"
              accessibilityLabel="Cập nhật số lượng"
            >
              Cập nhật số lượng
            </PaperButton>
          </View>
        </>
      )}
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

  const currentData = tabIndex === 0 ? filteredProductsNotInInventory : sortedInventory;
  const currentRenderItem = tabIndex === 0 ? renderProductItem : renderItem;
  const currentEmptyText = tabIndex === 0 ? 'Không có sản phẩm chưa có kho' : 'Kho trống';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0052CC" />
      <FlatList
        data={currentData}
        renderItem={currentRenderItem}
        keyExtractor={item => item.id.toString()}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={<Text style={styles.emptyListText}>{currentEmptyText}</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        style={styles.container}
        contentContainerStyle={currentData.length === 0 && styles.emptyListContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
      {/* Modal nhập số lượng cho sản phẩm mới */}
      <Portal>
        <Dialog
          visible={addModalVisible}
          onDismiss={() => setAddModalVisible(false)}
          style={styles.modalContent}
        >
          <Dialog.Title style={styles.modalHeader}>Nhập số lượng cho sản phẩm</Dialog.Title>
          <Dialog.Content>
            <ScrollView>
              {selectedNewProducts.map(id => {
                const product = products.find(p => p.id === id);
                return (
                  <View key={id} style={{ marginBottom: 12 }}>
                    <Text style={styles.title}>{product?.name}</Text>
                    <PaperTextInput
                      label="Số lượng"
                      value={addQuantities[id]}
                      keyboardType="numeric"
                      onChangeText={text => setAddQuantities(q => ({ ...q, [id]: text }))}
                      style={styles.input}
                      mode="outlined"
                      dense
                      theme={{ colors: { primary: '#0052CC' } }}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <PaperButton
              onPress={() => setAddModalVisible(false)}
              textColor="#6c757d"
              accessibilityLabel="Hủy"
            >
              Hủy
            </PaperButton>
            <PaperButton
              onPress={handleAddToInventory}
              textColor="#0052CC"
              accessibilityLabel="Xác nhận thêm vào kho"
            >
              Xác nhận
            </PaperButton>
          </Dialog.Actions>
        </Dialog>
        {/* Modal cập nhật số lượng cho nhiều sản phẩm */}
        <Dialog
          visible={updateModalVisible}
          onDismiss={() => setUpdateModalVisible(false)}
          style={styles.modalContent}
        >
          <Dialog.Title style={styles.modalHeader}>Cập nhật số lượng</Dialog.Title>
          <Dialog.Content>
            <ScrollView>
              {selectedInventoryItems.map(id => {
                const item = inventory.find(inv => inv.id === id);
                return (
                  <View key={id} style={{ marginBottom: 12 }}>
                    <Text style={styles.title}>{item?.product_name}</Text>
                    <PaperTextInput
                      label="Số lượng"
                      value={updateQuantities[id]}
                      keyboardType="numeric"
                      onChangeText={text => setUpdateQuantities(q => ({ ...q, [id]: text }))}
                      style={styles.input}
                      mode="outlined"
                      dense
                      theme={{ colors: { primary: '#0052CC' } }}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <PaperButton
              onPress={() => setUpdateModalVisible(false)}
              textColor="#6c757d"
              accessibilityLabel="Hủy"
            >
              Hủy
            </PaperButton>
            <PaperButton
              onPress={handleUpdateInventory}
              textColor="#0052CC"
              accessibilityLabel="Xác nhận cập nhật"
            >
              Xác nhận
            </PaperButton>
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
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#0052CC',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  productDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    marginBottom: 8,
  },
  addToInventoryButton: {
    paddingVertical: 8,
    borderRadius: 8,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sortText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    marginRight: 12,
  },
  sortPicker: {
    height: 50,
    width: 150,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  sortOrderButton: {
    padding: 10,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    marginLeft: 8,
  },
  sortOrderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0052CC',
  },
});

export default InventoryManagementScreen;