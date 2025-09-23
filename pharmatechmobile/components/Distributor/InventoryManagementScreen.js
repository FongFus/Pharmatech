import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, RefreshControl, TouchableOpacity, TouchableNativeFeedback, StatusBar, Platform, Modal, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import * as NavigationBar from 'expo-navigation-bar';
import { Button as PaperButton, TextInput as PaperTextInput, Card, Checkbox, FAB, Portal, Dialog, Paragraph, Chip } from 'react-native-paper';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MyUserContext } from '../../configs/MyContexts';
import Toast from 'react-native-toast-message';

const InventoryManagementScreen = () => {
  const { user } = useContext(MyUserContext);
  const [tab0Data, setTab0Data] = useState([]);
  const [tab1Data, setTab1Data] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab0Page, setTab0Page] = useState(1);
  const [tab1Page, setTab1Page] = useState(1);
  const [hasMoreTab0, setHasMoreTab0] = useState(true);
  const [hasMoreTab1, setHasMoreTab1] = useState(true);
  const [page_size] = useState(10);
  const [searchQueryTab0, setSearchQueryTab0] = useState('');
  const [searchQueryTab1, setSearchQueryTab1] = useState('');
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
  // New state to hold inline quantity inputs for each product in tab 1
  const [inlineQuantities, setInlineQuantities] = useState({});
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedInventoryIds, setSelectedInventoryIds] = useState([]);
  const [total_count, setTotal_count] = useState(0);
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [lowStockThreshold] = useState(10);
  const [filterStatus, setFilterStatus] = useState('all');

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

  const fetchInventoryStatus = async (tab, page) => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      let url;
      if (tab === 0) {
        url = `${endpoints.productsInventoryStatus}?page=${page}&page_size=${page_size}&has_inventory=false`;
        if (searchQueryTab0) url += `&search=${encodeURIComponent(searchQueryTab0)}`;
        if (selectedCategory) url += `&category=${selectedCategory}`;
      } else {
        url = `${endpoints.inventoryList}?page=${page}&page_size=${page_size}`;
        if (searchQueryTab1) url += `&search=${encodeURIComponent(searchQueryTab1)}`;
        // Note: inventory list doesn't have category filter directly, but search on product name
      }
      const response = await authApi.get(url);
      const newData = response.results;
      setTotal_count(response.count || 0);
      if (tab === 0) {
        setTab0Data(prev => page === 1 ? newData : [...prev, ...newData]);
        setHasMoreTab0(response.next !== null);
      } else {
        setTab1Data(prev => page === 1 ? newData : [...prev, ...newData]);
        setHasMoreTab1(response.next !== null);
      }
    } catch (error) {
      console.error('Fetch inventory status error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Không thể tải danh sách sản phẩm tồn kho');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const setNavBarColor = async () => {
      if (Platform.OS === 'android') {
        await NavigationBar.setBackgroundColorAsync('#0052CC');
      }
    };
    setNavBarColor();

    fetchCategories();
    fetchInventoryStatus(0, 1);
    fetchInventoryStatus(1, 1);
  }, []);

  useEffect(() => {
    if (tabIndex === 0) {
      fetchInventoryStatus(0, 1);
    }
  }, [searchQueryTab0, selectedCategory]);

  useEffect(() => {
    if (tabIndex === 1) {
      fetchInventoryStatus(1, 1);
    }
  }, [searchQueryTab1, selectedCategory]);

  // Initialize inlineQuantities when tab1Data changes
  useEffect(() => {
    const initialQuantities = {};
    tab1Data.forEach(item => {
      initialQuantities[item.id] = item.quantity !== undefined ? item.quantity.toString() : '0';
    });
    setInlineQuantities(initialQuantities);
  }, [tab1Data]);

  const fetchCategories = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.categoriesList);
      setCategories(response.results || response);
    } catch (error) {
      console.error('Fetch categories error:', error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchInventoryStatus(tabIndex, 1);
  };

  const handleUpdate = async (id, new_quantity, item) => {
    if (isNaN(parseInt(new_quantity)) || parseInt(new_quantity) < 0) {
      Alert.alert('Lỗi', 'Số lượng phải là số không âm');
      return;
    }
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.put(endpoints.inventoryUpdate(id), {
        quantity: parseInt(new_quantity),
        product_id: item.product.id,
      });
      // Refetch both tabs to ensure data consistency
      fetchInventoryStatus(0, 1);
      fetchInventoryStatus(1, 1);
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: 'Đã cập nhật kho',
        position: 'bottom',
      });
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
            // Refetch both tabs to ensure data consistency
            fetchInventoryStatus(0, 1);
            fetchInventoryStatus(1, 1);
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
        // Refresh both tabs to ensure data consistency
        fetchInventoryStatus(0, 1);
        fetchInventoryStatus(1, 1);
      } else {
        // Thêm nhiều sản phẩm
        const data = selectedNewProducts.map(id => ({
          product_id: id,
          quantity: parseInt(addQuantities[id]),
        }));
        await authApi.post(endpoints.inventoryBulkCreate, data);
        // Refresh both tabs
        fetchInventoryStatus(0, 1);
        fetchInventoryStatus(1, 1);
      }
      setAddModalVisible(false);
      setSelectedNewProducts([]);
      setAddQuantities({});
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: 'Đã thêm vào kho',
        position: 'bottom',
      });
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
      const item = tab1Data.find(inv => inv.id === id);
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
      // Refetch both tabs to ensure data consistency
      fetchInventoryStatus(0, 1);
      fetchInventoryStatus(1, 1);
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: 'Đã cập nhật số lượng',
        position: 'bottom',
      });
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
            // Refetch both tabs to ensure data consistency
            fetchInventoryStatus(0, 1);
            fetchInventoryStatus(1, 1);
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

  const renderItem = ({ item }) => {
    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('vi-VN'); // DD/MM/YYYY
    };

    const formatPrice = (price) => {
      return parseFloat(price).toLocaleString('vi-VN') + ' VND';
    };

    const getStockStatus = (quantity) => {
      if (quantity === 0) return { text: 'Hết hàng', color: '#DC2626' };
      if (quantity > 0 && quantity < 10) return { text: `Tồn kho thấp (${quantity})`, color: '#FF6B35' };
      return { text: 'Kho có hàng', color: '#00A86B' };
    };

    const stockStatus = getStockStatus(item.quantity);

    return (
      <Card style={styles.card} elevation={3}>
        <Card.Content>
          <View style={styles.cardTouchable}>
            <Text style={styles.title}>{item.product.name}</Text>
            <Text style={styles.description}>{item.product.description}</Text>
            <Text style={styles.infoText}>Giá: {formatPrice(item.product.price)}</Text>
            <Text style={styles.infoText}>Danh mục: {item.product.category_name}</Text>
            <Text style={styles.infoText}>Nhà phân phối: {item.product.distributor_name}</Text>
            {item.product.created_at && <Text style={styles.infoText}>Ngày tạo: {formatDate(item.product.created_at)}</Text>}
            <View style={[styles.statusBadge, { backgroundColor: stockStatus.color }]}>
              <Text style={styles.statusText}>{stockStatus.text}</Text>
            </View>
          </View>
          <Text style={styles.infoText}>Số lượng hiện tại: {item.quantity}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <PaperTextInput
              label="Số lượng mới"
              keyboardType="numeric"
              value={inlineQuantities[item.id]}
              onChangeText={text => setInlineQuantities(prev => ({ ...prev, [item.id]: text }))}
              style={[styles.input, { flex: 1, marginRight: 8 }]}
              mode="outlined"
              dense
              theme={{ colors: { primary: '#0052CC' } }}
              accessibilityLabel={`Nhập số lượng mới cho ${item.product.name}`}
            />
          </View>
          <Card.Actions style={styles.cardActions}>
            <PaperButton
              mode="contained"
              onPress={() => handleUpdate(item.id, inlineQuantities[item.id], item)}
              icon="content-save"
              style={styles.actionButton}
              buttonColor="#0052CC"
              textColor="#FFFFFF"
              accessibilityLabel={`Lưu số lượng cho ${item.product.name}`}
            >
              Lưu
            </PaperButton>
            <PaperButton
              mode="contained"
              onPress={() => handleDelete(item.id)}
              icon="delete"
              style={styles.actionButton}
              buttonColor="#FF6B35"
              textColor="#FFFFFF"
              accessibilityLabel={`Xóa ${item.product.name}`}
            >
              Xóa
            </PaperButton>
          </Card.Actions>
        </Card.Content>
      </Card>
    );
  };

  const renderProductItem = ({ item }) => {
    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('vi-VN'); // DD/MM/YYYY
    };

    const formatPrice = (price) => {
      return parseFloat(price).toLocaleString('vi-VN') + ' VND';
    };

    return (
      <Card style={styles.card} elevation={3}>
        <Card.Content>
          <TouchableOpacity onPress={() => toggleNewProductSelection(item.id)} activeOpacity={0.7}>
            <View style={styles.cardTouchable}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.infoText}>Giá: {formatPrice(item.price)}</Text>
              <Text style={styles.infoText}>Danh mục: {item.category_name}</Text>
              <Text style={styles.infoText}>Nhà phân phối: {item.distributor_name}</Text>
              <Text style={styles.infoText}>Ngày tạo: {formatDate(item.created_at)}</Text>
            </View>
            <Checkbox
              status={selectedNewProducts.includes(item.id) ? 'checked' : 'unchecked'}
              onPress={() => toggleNewProductSelection(item.id)}
              color="#0052CC"
              accessibilityLabel={`Chọn sản phẩm ${item.name}`}
            />
          </TouchableOpacity>
        </Card.Content>
      </Card>
    );
  };



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
          <View style={styles.filterChipsContainer}>
            <Chip
              mode={filterLowStock ? 'flat' : 'outlined'}
              selected={filterLowStock}
              onPress={() => setFilterLowStock(!filterLowStock)}
              style={styles.filterChip}
            >
              Tồn kho thấp ({'<'}{lowStockThreshold})
            </Chip>
            <Chip
              mode={filterStatus === 'all' ? 'flat' : 'outlined'}
              selected={filterStatus === 'all'}
              onPress={() => setFilterStatus('all')}
              style={styles.filterChip}
            >
              Tất cả
            </Chip>
            <Chip
              mode={filterStatus === 'added' ? 'flat' : 'outlined'}
              selected={filterStatus === 'added'}
              onPress={() => setFilterStatus('added')}
              style={styles.filterChip}
            >
              Đã thêm vào kho
            </Chip>
            <Chip
              mode={filterStatus === 'not_added' ? 'flat' : 'outlined'}
              selected={filterStatus === 'not_added'}
              onPress={() => setFilterStatus('not_added')}
              style={styles.filterChip}
            >
              Chưa thêm vào kho
            </Chip>
          </View>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedCategory}
              onValueChange={(itemValue) => setSelectedCategory(itemValue)}
              style={styles.picker}
            >
              <Picker.Item label="Tất cả danh mục" value="" />
              {categories.map(category => (
                <Picker.Item key={category.id} label={category.name} value={category.id} />
              ))}
            </Picker>
          </View>
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
              setTab1Page(1);
            }}
            style={styles.input}
            mode="outlined"
            dense
            theme={{ colors: { primary: '#0052CC' } }}
            left={<PaperTextInput.Icon icon="magnify" color="#0052CC" />}
            accessibilityLabel="Tìm kiếm sản phẩm"
          />
          <View style={styles.filterChipsContainer}>
            <Chip
              mode={filterLowStock ? 'flat' : 'outlined'}
              selected={filterLowStock}
              onPress={() => setFilterLowStock(!filterLowStock)}
              style={styles.filterChip}
            >
              Tồn kho thấp ({'<'}{lowStockThreshold})
            </Chip>
            <Chip
              mode={filterStatus === 'all' ? 'flat' : 'outlined'}
              selected={filterStatus === 'all'}
              onPress={() => setFilterStatus('all')}
              style={styles.filterChip}
            >
              Tất cả
            </Chip>
            <Chip
              mode={filterStatus === 'added' ? 'flat' : 'outlined'}
              selected={filterStatus === 'added'}
              onPress={() => setFilterStatus('added')}
              style={styles.filterChip}
            >
              Đã thêm vào kho
            </Chip>
            <Chip
              mode={filterStatus === 'not_added' ? 'flat' : 'outlined'}
              selected={filterStatus === 'not_added'}
              onPress={() => setFilterStatus('not_added')}
              style={styles.filterChip}
            >
              Chưa thêm vào kho
            </Chip>
          </View>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedCategory}
              onValueChange={(itemValue) => setSelectedCategory(itemValue)}
              style={styles.picker}
            >
              <Picker.Item label="Tất cả danh mục" value="" />
              {categories.map(category => (
                <Picker.Item key={category.id} label={category.name} value={category.id} />
              ))}
            </Picker>
          </View>
        </>
      )}
    </View>
  );

  const loadMore = () => {
    if (tabIndex === 0 && hasMoreTab0 && !loading) {
      const nextPage = tab0Page + 1;
      setTab0Page(nextPage);
      fetchInventoryStatus(0, nextPage);
    } else if (tabIndex === 1 && hasMoreTab1 && !loading) {
      const nextPage = tab1Page + 1;
      setTab1Page(nextPage);
      fetchInventoryStatus(1, nextPage);
    }
  };

  const renderFooter = () => {
    if (loading) {
      return (
        <View style={styles.footerContainer}>
          <ActivityIndicator size="small" color="#0052CC" />
        </View>
      );
    }
    return null;
  };

  const currentData = tabIndex === 0 ? tab0Data : tab1Data;
  // Apply advanced filters client-side
  let filteredData = currentData.filter(item => {
    // Filter by low stock if enabled
    if (filterLowStock && item.quantity >= lowStockThreshold) {
      return false;
    }
    // Filter by status
    if (filterStatus === 'added' && tabIndex === 0) {
      // tab 0 is products not in inventory, so no items should be shown if filter is 'added'
      return false;
    }
    if (filterStatus === 'not_added' && tabIndex === 1) {
      // tab 1 is products in inventory, so no items should be shown if filter is 'not_added'
      return false;
    }
    return true;
  });
  const currentRenderItem = tabIndex === 0 ? renderProductItem : renderItem;
  const currentEmptyText = tabIndex === 0 ? 'Không có sản phẩm chưa có kho' : 'Kho trống';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0052CC" />
      {renderHeader()}
      <FlatList
        data={filteredData}
        renderItem={currentRenderItem}
        keyExtractor={item => item.id ? item.id.toString() : item.product_name || item.name || Math.random().toString()}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={<Text style={styles.emptyListText}>{currentEmptyText}</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        style={styles.container}
        contentContainerStyle={filteredData.length === 0 && styles.emptyListContainer}
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
            <KeyboardAwareScrollView>
              {selectedNewProducts.map(id => {
                const product = tab0Data.find(p => p.id === id);
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
            </KeyboardAwareScrollView>
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
              accessibilityLabel="Thêm"
            >
              Thêm
            </PaperButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      {/* Modal cập nhật số lượng cho nhiều sản phẩm */}
      <Portal>
        <Dialog
          visible={updateModalVisible}
          onDismiss={() => setUpdateModalVisible(false)}
          style={styles.modalContent}
        >
          <Dialog.Title style={styles.modalHeader}>Cập nhật số lượng</Dialog.Title>
          <Dialog.Content>
            <KeyboardAwareScrollView>
              {selectedInventoryItems.map(id => {
                const item = tab1Data.find(inv => inv.id === id);
                return (
                  <View key={id} style={{ marginBottom: 12 }}>
                    <Text style={styles.title}>{item?.product.name}</Text>
                    <PaperTextInput
                      label="Số lượng mới"
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
            </KeyboardAwareScrollView>
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
              accessibilityLabel="Cập nhật"
            >
              Cập nhật
            </PaperButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Toast />
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
  actionButton: {
    marginLeft: 8,
    paddingVertical: 6,
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
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  statusTextInInventory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  statusTextNotInInventory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  filterChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  filterChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  filterChipText: {
    color: '#6B7280',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },
  infoText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  description: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    marginBottom: 8,
  },
});

export default InventoryManagementScreen;
