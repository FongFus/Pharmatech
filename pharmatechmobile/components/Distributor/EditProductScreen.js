import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EditProductScreen = () => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const { product_id } = route.params || {};

  useEffect(() => {
    if (product_id) {
      const fetchProduct = async () => {
        const token = await AsyncStorage.getItem('token');
        const authApi = authApis(token);
        try {
          const response = await authApi.get(endpoints.productsRead(product_id));
          const product = response;
          setName(product.name);
          setPrice(product.price.toString());
          setDescription(product.description);
          setImage(product.image);
        } catch (error) {
          console.error('Fetch product error:', error.response?.data || error.message);
          Alert.alert('Lỗi', error.response?.data?.detail || 'Không thể tải thông tin sản phẩm');
        }
      };
      fetchProduct();
    }
  }, [product_id]);

  const validateInputs = () => {
    if (!name || !price || !description) {
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
    const data = { name, price: parseFloat(price), description, image };
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
      console.error('Save product error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Cập nhật thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!product_id) return;
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.delete(endpoints.productsDelete(product_id));
      Alert.alert('Thành công', 'Xóa sản phẩm thành công');
      navigation.goBack();
    } catch (error) {
      console.error('Delete product error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Xóa thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Quản lý sản phẩm</Text>
      {image ? <Image source={{ uri: image }} style={styles.image} /> : null}
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
      />
      <TextInput
        style={styles.input}
        placeholder="Nhập URL hình ảnh"
        value={image}
        onChangeText={setImage}
      />
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Button title="Lưu" onPress={handleSave} color="#007AFF" />
          {product_id && <Button title="Xóa" onPress={handleDelete} color="#FF0000" />}
          <Button title="Hủy" onPress={handleCancel} color="#007AFF" />
        </>
      )}
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
});

export default EditProductScreen;