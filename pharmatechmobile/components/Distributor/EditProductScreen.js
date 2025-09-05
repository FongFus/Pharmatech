import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TextInput, Button, Image, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { MyUserContext } from '../../configs/MyContexts';

const EditProductScreen = () => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const { product_id } = route.params || {};
  const { user } = useContext(MyUserContext);

  useEffect(() => {
    if (user && user.role !== 'distributor') {
      Alert.alert('Lỗi', 'Chỉ nhà phân phối mới có thể truy cập màn hình này');
      navigation.goBack();
      return;
    }
    fetchCategories();
    if (product_id) {
      fetchProduct();
    }
  }, [product_id, user]);

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

  const fetchProduct = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const product = await authApi.get(endpoints.productsRead(product_id));
      setName(product.name);
      setPrice(product.price.toString());
      setDescription(product.description);
      setImage(product.image);
      setCategory(product.category || '');
    } catch (error) {
      console.error('Fetch product error:', error);
      const errorData = JSON.parse(error.message);
      Alert.alert('Lỗi', errorData.detail || 'Không thể tải thông tin sản phẩm');
    }
  };

  const validateInputs = () => {
    if (!name.trim() || !price || !description.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ tên, giá và mô tả sản phẩm');
      return false;
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      Alert.alert('Lỗi', 'Giá sản phẩm phải là số dương');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateInputs()) return;
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    const data = { name: name.trim(), price: parseFloat(price), description: description.trim(), image, category: category || null };
    try {
      if (product_id) {
        await authApi.put(endpoints.productsUpdate(product_id), data);
        Alert.alert('Thành công', 'Cập nhật sản phẩm thành công');
      } else {
        await authApi.post(endpoints.productsCreate, data);
        Alert.alert('Thành công', 'Tạo sản phẩm thành công');
      }
      navigation.goBack();
    } catch (error) {
      console.error('Save product error:', error);
      const errorData = JSON.parse(error.message);
      let errorMessage = 'Cập nhật thất bại';
      if (errorData.non_field_errors) {
        errorMessage = errorData.non_field_errors.join(', ');
      } else if (errorData.detail) {
        errorMessage = errorData.detail;
      } else {
        const fieldErrors = Object.values(errorData).flat();
        if (fieldErrors.length > 0) {
          errorMessage = fieldErrors.join(', ');
        }
      }
      Alert.alert('Lỗi', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!product_id) return;
    Alert.alert('Xác nhận', 'Bạn có chắc muốn xóa sản phẩm này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const token = await AsyncStorage.getItem('token');
          const authApi = authApis(token);
          try {
            await authApi.delete(endpoints.productsDelete(product_id));
            Alert.alert('Thành công', 'Xóa sản phẩm thành công');
            navigation.goBack();
          } catch (error) {
            console.error('Delete product error:', error);
            const errorData = JSON.parse(error.message);
            Alert.alert('Lỗi', errorData.detail || 'Xóa thất bại');
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
      uploadImage(result.assets[0]);
    }
  };

  const uploadImage = async (asset) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      type: 'image/jpeg',
      name: 'image.jpg',
    });
    formData.append('upload_preset', 'your_upload_preset'); // Replace with your Cloudinary upload preset
    formData.append('cloud_name', 'your_cloud_name'); // Replace with your Cloudinary cloud name

    try {
      const response = await fetch('https://api.cloudinary.com/v1_1/your_cloud_name/image/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setImage(data.secure_url);
      } else {
        Alert.alert('Lỗi', 'Upload ảnh thất bại');
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Lỗi', 'Upload ảnh thất bại');
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>Quản lý sản phẩm</Text>
      {image ? <Image source={{ uri: image }} style={styles.image} /> : null}
      <Button title="Chọn ảnh" onPress={pickImage} color="#007AFF" disabled={uploading} />
      {uploading && <ActivityIndicator size="small" color="#007AFF" />}
      <TextInput
        style={styles.input}
        placeholder="Nhập tên sản phẩm"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Nhập giá sản phẩm"
        value={price}
        keyboardType="numeric"
        onChangeText={setPrice}
      />
      <TextInput
        style={styles.input}
        placeholder="Nhập mô tả sản phẩm"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
      />
      <TextInput
        style={styles.input}
        placeholder="Nhập URL hình ảnh (hoặc để trống nếu đã chọn ảnh)"
        value={image}
        onChangeText={setImage}
      />
      <Text style={styles.label}>Danh mục:</Text>
      <Picker
        selectedValue={category}
        onValueChange={(itemValue) => setCategory(itemValue)}
        style={styles.picker}
      >
        <Picker.Item label="Chọn danh mục" value="" />
        {categories.map((cat) => (
          <Picker.Item key={cat.id} label={cat.name} value={cat.id} />
        ))}
      </Picker>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Button title="Lưu" onPress={handleSave} color="#007AFF" />
          {product_id && <Button title="Xóa" onPress={handleDelete} color="#FF0000" />}
          <Button title="Hủy" onPress={handleCancel} color="#007AFF" />
        </>
      )}
    </ScrollView>
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
  image: {
    width: 200,
    height: 200,
    marginBottom: 16,
    alignSelf: 'center',
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
  label: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  picker: {
    height: 50,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
  },
});

export default EditProductScreen;
