import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';
import { Button } from 'react-native-paper';
import { StatusBar, setStatusBarStyle } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis } from '../../configs/Apis';
import { MyUserContext } from '../../configs/MyContexts';

const AdminDashboardScreen = () => {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const { user } = useContext(MyUserContext);

  useEffect(() => {
    // Set status bar style
    setStatusBarStyle('light-content');

    // Check user role
    if (user && user.role !== 'admin') {
      showModal('Chỉ quản trị viên mới có thể truy cập màn hình này');
      return;
    }

    fetchProducts();

    // Cleanup function
    return () => {
      setStatusBarStyle('dark-content');
    };
  }, [user]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const api = authApis(token);
      const response = await api.get(endpoints.productsList);
      setProducts(response.results || []); // Extract results array
    } catch (error) {
      console.error('Fetch products error:', error);
      showModal('Không thể tải danh sách sản phẩm');
    } finally {
      setLoading(false);
    }
  };

  const fetchProductDetail = async (id) => {
    setDetailLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const api = authApis(token);
      const data = await api.get(endpoints.productsRead(id));
      setSelectedProduct(data);
    } catch (error) {
      console.error('Fetch product detail error:', error);
      try {
        const errorData = JSON.parse(error.message);
        showModal(errorData.detail || 'Không thể tải chi tiết sản phẩm');
      } catch {
        showModal('Không thể tải chi tiết sản phẩm');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const api = authApis(token);
      await api.post(endpoints.productsApprove(id));
      Alert.alert('Thành công', 'Sản phẩm đã được duyệt');
      if (selectedProduct && selectedProduct.id === id) {
        setSelectedProduct({ ...selectedProduct, is_approved: true });
      }
      fetchProducts();
    } catch (error) {
      console.error('Approve product error:', error);
      try {
        const errorData = JSON.parse(error.message);
        showModal(errorData.detail || 'Không thể duyệt sản phẩm');
      } catch {
        showModal('Không thể duyệt sản phẩm');
      }
    }
  };

  const handleUnapprove = async (id) => {
    Alert.alert('Xác nhận', 'Bạn có chắc muốn gỡ duyệt sản phẩm này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Gỡ duyệt',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('token');
            const api = authApis(token);
            await api.post(endpoints.productsUnapprove(id));
            Alert.alert('Thành công', 'Sản phẩm đã bị gỡ duyệt');
            if (selectedProduct && selectedProduct.id === id) {
              setSelectedProduct({ ...selectedProduct, is_approved: false });
            }
            fetchProducts();
          } catch (error) {
            console.error('Unapprove product error:', error);
            try {
              const errorData = JSON.parse(error.message);
              showModal(errorData.detail || 'Không thể gỡ duyệt sản phẩm');
            } catch {
              showModal('Không thể gỡ duyệt sản phẩm');
            }
          }
        },
      },
    ]);
  };

  const showModal = (message) => {
    setModalMessage(message);
    setModalVisible(true);
  };

  const renderProductItem = ({ item }) => (
    <TouchableOpacity
      style={styles.productItem}
      onPress={() => fetchProductDetail(item.id)}
    >
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: item.is_approved ? '#4CAF50' : '#F44336' },
            ]}
          />
          <Text style={styles.productStatus}>
            {item.is_approved ? 'Đang bán' : 'Chưa duyệt'}
          </Text>
        </View>
      </View>
      <View style={styles.actionButtons}>
        {!item.is_approved ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => handleApprove(item.id)}
          >
            <Text style={styles.actionButtonText}>Duyệt</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.unapproveButton]}
            onPress={() => handleUnapprove(item.id)}
          >
            <Text style={styles.actionButtonText}>Gỡ duyệt</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ backgroundColor: '#007AFF', flex: 1 }}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <StatusBar barStyle="light-content" />
      <KeyboardAwareFlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderProductItem}
        ListHeaderComponent={
          <Text style={styles.header}>Danh sách sản phẩm</Text>
        }
        ListEmptyComponent={
          <Text style={styles.emptyListText}>
            {loading ? 'Đang tải...' : 'Không có sản phẩm nào'}
          </Text>
        }
        contentContainerStyle={styles.listContainer}
        enableOnAndroid={true}
        extraScrollHeight={100}
      />
      {selectedProduct && (
        <Modal
          visible={!!selectedProduct}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedProduct(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPressOut={() => setSelectedProduct(null)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalHeader}>Chi tiết sản phẩm</Text>
              {detailLoading ? (
                <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
              ) : (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.detailLabel}>Tên sản phẩm</Text>
                    <Text style={styles.detailValue}>{selectedProduct.name}</Text>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.detailLabel}>Mô tả</Text>
                    <Text style={styles.detailValue}>{selectedProduct.description}</Text>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.detailLabel}>Giá</Text>
                    <Text style={styles.detailValue}>
                      {parseFloat(selectedProduct.price).toLocaleString('vi-VN')} VND
                    </Text>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.detailLabel}>Nhà cung cấp</Text>
                    <Text style={styles.detailValue}>
                      {selectedProduct.distributor?.full_name || 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.detailLabel}>Phân loại</Text>
                    <Text style={styles.detailValue}>
                      {selectedProduct.category?.name || 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.detailLabel}>Tình trạng</Text>
                    <View style={styles.statusContainer}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: selectedProduct.is_approved ? '#4CAF50' : '#F44336' },
                        ]}
                      />
                      <Text style={styles.statusText}>
                        {selectedProduct.is_approved ? 'Đang bán' : 'Chưa duyệt'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.detailActions}>
                    {!selectedProduct.is_approved ? (
                      <TouchableOpacity
                        style={[styles.button, styles.approveButton]}
                        onPress={() => handleApprove(selectedProduct.id)}
                      >
                        <Text style={styles.buttonText}>Duyệt</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.button, styles.unapproveButton]}
                        onPress={() => handleUnapprove(selectedProduct.id)}
                      >
                        <Text style={styles.buttonText}>Gỡ duyệt</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.button, styles.closeButton]}
                      onPress={() => setSelectedProduct(null)}
                    >
                      <Text style={styles.buttonText}>Đóng</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPressOut={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalText}>{modalMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
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
  productStatus: {
    fontSize: 12,
    color: '#007AFF',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    borderRadius: 4,
    minWidth: 70,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#007AFF',
  },
  unapproveButton: {
    backgroundColor: '#FF6B35',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  detailActions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 100,
  },
  closeButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  emptyListText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    padding: 20,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  loader: {
    marginVertical: 20,
  },
});

export default AdminDashboardScreen;