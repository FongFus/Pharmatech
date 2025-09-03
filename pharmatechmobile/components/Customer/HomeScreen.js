import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Button, FlatList, Image, StyleSheet, ActivityIndicator, Alert, RefreshControl, Picker } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HomeScreen = () => {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const navigation = useNavigation();

  const fetchCategories = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.categoriesList);
      setCategories(response.data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchProducts = async (pageNumber = 1, refreshing = false) => {
    if (refreshing) {
      setRefreshing(true);
    } else if (pageNumber === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const params = {
        search,
        page: pageNumber,
        ...(selectedCategory && { category: selectedCategory }),
        ...(minPrice && { price__gte: minPrice }),
        ...(maxPrice && { price__lte: maxPrice }),
      };
      const response = await authApi.get(endpoints.productsList, { params });
      const newProducts = response.results || [];
      if (pageNumber === 1) {
        setProducts(newProducts);
      } else {
        setProducts(prevProducts => [...prevProducts, ...newProducts]);
      }
      setHasMore(!!response.next);
      setPage(pageNumber);
    } catch (error) {
      Alert.alert('Lỗi', 'Không tìm thấy sản phẩm');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchProducts(1);
  }, [search, selectedCategory, minPrice, maxPrice]);

  const handleLoadMore = () => {
    if (hasMore && !loading && !refreshing && !loadingMore) {
      fetchProducts(page + 1);
    }
  };

  const onRefresh = useCallback(() => {
    fetchProducts(1, true);
  }, [search]);

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>No Image</Text>
        </View>
      )}
      <Text style={styles.title}>{item.name}</Text>
      <Text style={styles.price}>{item.price} VND</Text>
      <View style={styles.buttonContainer}>
        <Button
          title="Xem chi tiết"
          onPress={() => navigation.navigate('ProductDetailScreen', { productId: item.id })}
          color="#007AFF"
        />
        <Button
          title="Thêm vào giỏ"
          onPress={() => navigation.navigate('CartScreen', { productId: item.id })}
          color="#28A745"
        />
      </View>
    </View>
  );

  if (loading && page === 1 && !refreshing) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Sản phẩm</Text>
      <TextInput
        style={styles.searchBar}
        placeholder="Nhập tên sản phẩm"
        value={search}
        onChangeText={setSearch}
      />
      <View style={styles.filters}>
        <Picker
          selectedValue={selectedCategory}
          onValueChange={(itemValue) => setSelectedCategory(itemValue)}
          style={styles.picker}
        >
          <Picker.Item label="Tất cả danh mục" value="" />
          {categories.map(cat => (
            <Picker.Item key={cat.id} label={cat.name} value={cat.id} />
          ))}
        </Picker>
        <TextInput
          style={styles.priceInput}
          placeholder="Giá tối thiểu"
          value={minPrice}
          onChangeText={setMinPrice}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.priceInput}
          placeholder="Giá tối đa"
          value={maxPrice}
          onChangeText={setMaxPrice}
          keyboardType="numeric"
        />
      </View>
      <FlatList
        data={products}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={<Text style={styles.warning}>Không tìm thấy sản phẩm</Text>}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color="#007AFF" /> : null}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  header: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 12,
  },
  searchBar: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 10,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'gray',
    marginBottom: 12,
  },
  image: {
    width: 100,
    height: 100,
    marginBottom: 8,
  },
  imagePlaceholder: {
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    color: '#666',
    fontSize: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: '700',
  },
  price: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  filters: {
    marginBottom: 12,
  },
  picker: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 8,
  },
  priceInput: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 10,
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
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});

export default HomeScreen;