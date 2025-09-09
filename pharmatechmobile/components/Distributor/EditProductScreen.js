import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  Modal,
  TouchableOpacity,
  FlatList,
  StatusBar,
  TouchableNativeFeedback,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { MyUserContext } from '../../configs/MyContexts';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';

const EditProductScreen = () => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [productsModalVisible, setProductsModalVisible] = useState(false);
  const [myProducts, setMyProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [product, setProduct] = useState(null);
  const navigation = useNavigation();
  const route = useRoute();
  const { product_id } = route.params || {};
  const { user } = useContext(MyUserContext);

  const resetForm = () => {
    setName('');
    setPrice('');
    setDescription('');
    setImageUri(null);
    setCategory('');
    setProduct(null);
  };

  useEffect(() => {
    // Thiết lập thanh điều hướng và status bar
    setStatusBarStyle('light-content');

    if (user && user.role !== 'distributor') {
      Alert.alert('Lỗi', 'Chỉ nhà phân phối mới có thể truy cập màn hình này');
      navigation.goBack();
      return;
    }
    fetchCategories();
    if (product_id) {
      fetchProduct();
    } else {
      resetForm();
    }

    // Cleanup function
    return () => {
      setStatusBarStyle('dark-content');
    };
  }, [product_id, user]);

  const fetchCategories = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.categoriesList);
      setCategories(response.results || response);
    } catch (error) {
      console.error('Fetch categories error:', error);
      showModal('Lỗi khi tải danh mục sản phẩm.');
    }
  };

  const fetchProduct = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const productData = await authApi.get(endpoints.productsRead(product_id));
      setProduct(productData);
      setName(productData.name);
      setPrice(productData.price.toString());
      setDescription(productData.description);
      setImageUri(productData.image || null);
      setCategory(productData.category || '');
    } catch (error) {
      console.error('Fetch product error:', error);
      try {
        const errorData = JSON.parse(error.message);
        Alert.alert('Lỗi', errorData.detail || 'Không thể tải thông tin sản phẩm');
      } catch {
        Alert.alert('Lỗi', 'Không thể tải thông tin sản phẩm');
      }
      navigation.goBack();
    }
  };

  const fetchMyProducts = async () => {
    setLoadingProducts(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.productsMyProducts);
      setMyProducts(response.results || response);
    } catch (error) {
      console.error('Fetch my products error:', error);
      showModal('Lỗi khi tải danh sách sản phẩm.');
    } finally {
      setLoadingProducts(false);
    }
  };

  const validateInputs = () => {
    if (!name.trim() || !price || !description.trim()) {
      showModal('Vui lòng nhập đầy đủ tên, giá và mô tả sản phẩm');
      return false;
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      showModal('Giá sản phẩm phải là số dương');
      return false;
    }
    return true;
  };

  const showModal = (message) => {
    setModalMessage(message);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!validateInputs()) return;
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);

    try {
      let response;
      if (imageUri && imageUri.startsWith('file://')) {
        // Upload with image using multipart/form-data
        const formData = new FormData();
        formData.append('name', name.trim());
        formData.append('price', parseFloat(price));
        formData.append('description', description.trim());
        formData.append('category', category || '');
        formData.append('image', {
          uri: imageUri,
          type: 'image/jpeg',
          name: 'product.jpg',
        });

        const url = product_id ? endpoints.productsUpdate(product_id) : endpoints.productsCreate;
        const method = product_id ? 'PUT' : 'POST';

        response = await fetch(url, {
          method: method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          body: formData,
        });

        const text = await response.text();
        if (!response.ok) {
          let errorMessage = 'Lỗi khi lưu sản phẩm';
          try {
            const errorData = JSON.parse(text);
            if (errorData.detail) errorMessage = errorData.detail;
            else if (errorData.non_field_errors) errorMessage = errorData.non_field_errors.join(', ');
            else {
              const fieldErrors = Object.values(errorData).flat();
              if (fieldErrors.length > 0) errorMessage = fieldErrors.join(', ');
            }
          } catch {
            errorMessage = text;
          }
          throw new Error(errorMessage);
        }
      } else {
        // Upload without image or image is URL string
        const data = {
          name: name.trim(),
          price: parseFloat(price),
          description: description.trim(),
          category: category || null,
        };
        if (imageUri && typeof imageUri === 'string') {
          data.image = imageUri;
        }
        if (product_id) {
          response = await authApi.put(endpoints.productsUpdate(product_id), data);
        } else {
          response = await authApi.post(endpoints.productsCreate, data);
        }
      }

      Alert.alert('Thành công', product_id ? 'Cập nhật sản phẩm thành công' : 'Tạo sản phẩm thành công');
      resetForm();
      navigation.navigate('products', { screen: 'EditProductScreen' });
    } catch (error) {
      console.error('Save product error:', error);
      showModal(error.message || 'Lỗi khi lưu sản phẩm');
    } finally {
      setLoading(false);
    }
  };

  const handleUnapprove = async (id) => {
    Alert.alert('Xác nhận', 'Bạn có chắc muốn ngưng bán sản phẩm này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Ngưng bán',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const token = await AsyncStorage.getItem('token');
          const authApi = authApis(token);
          try {
            await authApi.post(endpoints.productsUnapprove(id), {});
            Alert.alert('Thành công', 'Sản phẩm đã được ngưng bán');
            resetForm();
            navigation.navigate('products', { screen: 'EditProductScreen' });
            if (id === product_id) {
              // Refresh product data
              fetchProduct();
            } else {
              // Refresh my products list
              fetchMyProducts();
            }
          } catch (error) {
            console.error('Unapprove product error:', error);
            try {
              const errorData = JSON.parse(error.message);
              Alert.alert('Lỗi', errorData.detail || errorData.non_field_errors || 'Ngưng bán thất bại');
            } catch {
              Alert.alert('Lỗi', 'Ngưng bán thất bại');
            }
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Lỗi', 'Cần quyền truy cập thư viện ảnh');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleCancel = () => {
    resetForm();
    navigation.navigate('products', { screen: 'EditProductScreen' });
  };

  const openProductsModal = () => {
    fetchMyProducts();
    setProductsModalVisible(true);
  };

  const handleEditProduct = (id) => {
    setProductsModalVisible(false);
    navigation.navigate('products', { screen: 'EditProductScreen', params: { product_id: id } });
  };

  const renderProductItem = ({ item }) => (
    <View style={styles.productItem}>
      {item.image && <Image source={{ uri: item.image }} style={styles.productImage} />}
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        <Text style={styles.productPrice}>{item.price} VND</Text>
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: item.is_approved ? '#4CAF50' : '#F44336' }]} />
          <Text style={styles.productStatus}>
            {item.is_approved ? 'Đang bán' : 'Ngưng bán'}
          </Text>
        </View>
      </View>
      {item.is_approved && (
        <View style={styles.productActions}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.editButton]} 
            onPress={() => handleEditProduct(item.id)}
          >
            <Text style={styles.actionButtonText}>Sửa</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.unapproveButton]} 
            onPress={() => handleUnapprove(item.id)}
          >
            <Text style={styles.actionButtonText}>Ngưng bán</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor="#007AFF" barStyle="light-content" />
      <KeyboardAwareScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={100}
      >
        <Text style={styles.header}>
          {product_id ? 'Chỉnh sửa sản phẩm' : 'Tạo sản phẩm mới'}
        </Text>
        
        <TouchableOpacity style={styles.myProductsButton} onPress={openProductsModal}>
          <Text style={styles.myProductsButtonText}>Sản phẩm của tôi</Text>
        </TouchableOpacity>
        
        <View style={styles.imageSection}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>Chưa có hình ảnh</Text>
            </View>
          )}
          <TouchableOpacity style={styles.imageButton} onPress={pickImage} disabled={loading}>
            <Text style={styles.imageButtonText}>Chọn ảnh</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Tên sản phẩm</Text>
          <TextInput
            style={styles.input}
            placeholder="Nhập tên sản phẩm"
            value={name}
            onChangeText={setName}
            editable={!loading}
          />
        </View>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Giá sản phẩm (VND)</Text>
          <TextInput
            style={styles.input}
            placeholder="Nhập giá sản phẩm"
            value={price}
            keyboardType="numeric"
            onChangeText={setPrice}
            editable={!loading}
          />
        </View>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Mô tả sản phẩm</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Nhập mô tả sản phẩm"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            editable={!loading}
          />
        </View>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Danh mục</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={category}
              onValueChange={(itemValue) => setCategory(itemValue)}
              enabled={!loading}
              style={styles.picker}
            >
              <Picker.Item label="Chọn danh mục" value="" />
              {categories.map((cat) => (
                <Picker.Item key={cat.id} label={cat.name} value={cat.id} />
              ))}
            </Picker>
          </View>
        </View>
        
        {product_id && product && (
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: product.is_approved ? '#4CAF50' : '#F44336' }]} />
            <Text style={styles.statusText}>
              {product.is_approved ? 'Đang bán' : 'Ngưng bán'}
            </Text>
          </View>
        )}
        
        {loading ? (
          <ActivityIndicator size="large" color="#007AFF" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.buttonGroup}>
            <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSave}>
              <Text style={styles.buttonText}>Lưu</Text>
            </TouchableOpacity>
            
            {product_id && product && product.is_approved && (
              <TouchableOpacity style={[styles.button, styles.unapproveButton]} onPress={() => handleUnapprove(product_id)}>
                <Text style={styles.buttonText}>Ngưng bán</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={handleCancel}>
              <Text style={styles.buttonText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAwareScrollView>

      {/* Error Modal */}
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
            <TouchableOpacity style={styles.modalButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalButtonText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* My Products Modal */}
      <Modal
        visible={productsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProductsModalVisible(false)}
      >
        <View style={styles.productsModalOverlay}>
          <View style={styles.productsModalContent}>
            <Text style={styles.modalHeader}>Sản phẩm của tôi</Text>
            {loadingProducts ? (
              <ActivityIndicator size="large" color="#007AFF" />
            ) : (
              <FlatList
                data={myProducts}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderProductItem}
                style={styles.productsList}
                contentContainerStyle={myProducts.length === 0 && styles.emptyListContainer}
                ListEmptyComponent={
                  <Text style={styles.emptyListText}>Bạn chưa có sản phẩm nào</Text>
                }
              />
            )}
            <TouchableOpacity 
              style={[styles.button, styles.closeButton]} 
              onPress={() => setProductsModalVisible(false)}
            >
              <Text style={styles.buttonText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  myProductsButton: {
    backgroundColor: '#28a745',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  myProductsButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  image: {
    width: 200,
    height: 200,
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  imagePlaceholder: {
    width: 200,
    height: 200,
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  placeholderText: {
    color: '#999',
    fontStyle: 'italic',
  },
  imageButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    width: 200,
    alignItems: 'center',
  },
  imageButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  input: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
    paddingBottom: 12,
  },
  pickerContainer: {
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  buttonGroup: {
    marginTop: 8,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  unapproveButton: {
    backgroundColor: '#FF6B35',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  closeButton: {
    backgroundColor: '#6c757d',
    marginTop: 16,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
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
  productsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productsModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
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
  productsList: {
    maxHeight: 400,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyListText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
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
  productPrice: {
    fontSize: 14,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    marginBottom: 4,
  },
  productStatus: {
    fontSize: 12,
    color: '#007AFF',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  productActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    borderRadius: 4,
    marginLeft: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#007AFF',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default EditProductScreen;