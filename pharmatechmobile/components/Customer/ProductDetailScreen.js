import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TouchableNativeFeedback,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';

const ProductDetailScreen = () => {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();
  const route = useRoute();
  const { productId } = route.params;

  useEffect(() => {
    const fetchProduct = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(endpoints.productsRead(productId));
        setProduct(response);
      } catch (error) {
        Alert.alert('Lỗi', 'Không thể tải chi tiết sản phẩm');
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [productId]);

  useEffect(() => {
    const setNavBarColor = async () => {
      if (Platform.OS === 'android') {
        // Since setBackgroundColorAsync is not supported with edge-to-edge enabled,
        // we will not call it here to avoid warnings.
        // Instead, render a view under the status bar to change its background color.
        await NavigationBar.setButtonStyleAsync('dark');
      }
    };
    setNavBarColor();
  }, []);



  const handleAddToCart = async () => {
    if (!product.total_stock || product.total_stock <= 0) {
      Alert.alert('Lỗi', 'Sản phẩm hết hàng');
      return;
    }
    navigation.navigate('CartScreen', { productId: product.id });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.statusBarBackground} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.statusBarBackground} />
        <View style={styles.errorContainer}>
          <Text style={styles.warning}>Sản phẩm không tồn tại</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.buttonText}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.statusBarBackground} />
      <KeyboardAwareScrollView
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={100}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Quay lại</Text>
        </TouchableOpacity>

        <Text style={styles.header}>Chi tiết sản phẩm</Text>

        <View style={styles.imageSection}>
          {product.image ? (
            <Image source={{ uri: product.image }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.placeholderText}>Chưa có hình ảnh</Text>
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.title}>{product.name}</Text>
          <Text style={styles.price}>Giá: {product.price} VND</Text>
          <Text style={[styles.quantity, { color: product.total_stock > 0 ? '#333' : '#F44336' }]}>
            Số lượng: {product.total_stock || 'Hết hàng'}
          </Text>
          <Text style={styles.description}>{product.description}</Text>
        </View>

        <View style={styles.buttonGroup}>
          {Platform.select({
            ios: (
              <>
                <TouchableOpacity style={[styles.button, styles.addToCartButton]} onPress={handleAddToCart}>
                  <Text style={styles.buttonText}>Thêm vào giỏ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.reviewButton]}
                  onPress={() => navigation.navigate('ReviewScreen', { productId })}
                >
                  <Text style={styles.buttonText}>Xem đánh giá</Text>
                </TouchableOpacity>
              </>
            ),
            android: (
              <>
                <TouchableNativeFeedback onPress={handleAddToCart} background={TouchableNativeFeedback.Ripple('#007AFF', false)}>
                  <View style={[styles.button, styles.addToCartButton]}>
                    <Text style={styles.buttonText}>Thêm vào giỏ</Text>
                  </View>
                </TouchableNativeFeedback>
                <TouchableNativeFeedback onPress={() => navigation.navigate('ReviewScreen', { productId })} background={TouchableNativeFeedback.Ripple('#6c757d', false)}>
                  <View style={[styles.button, styles.reviewButton]}>
                    <Text style={styles.buttonText}>Xem đánh giá</Text>
                  </View>
                </TouchableNativeFeedback>
              </>
            ),
          })}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  statusBarBackground: {
    height: Platform.OS === 'ios' ? 0 : 24, // Adjust height for Android status bar
    backgroundColor: '#007AFF',
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  warning: {
    fontSize: 16,
    fontWeight: '500',
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 20,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  imagePlaceholder: {
    width: 200,
    height: 200,
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
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  infoSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  price: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  quantity: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  description: {
    fontSize: 16,
    fontWeight: '400',
    color: '#666',
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
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
  addToCartButton: {
    backgroundColor: '#007AFF',
  },
  reviewButton: {
    backgroundColor: '#6c757d',
  },
  backButton: {
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
});

export default ProductDetailScreen;