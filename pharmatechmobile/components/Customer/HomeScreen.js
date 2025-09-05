import React, { useState, useEffect, useContext } from 'react';
import { 
  View, Text, TextInput, FlatList, Image, StyleSheet, 
  TouchableOpacity, ActivityIndicator, Alert, RefreshControl, ScrollView
} from 'react-native';
import Modal from 'react-native-modal';
import MultiSlider from '@ptomasroos/react-native-multi-slider';
import { useNavigation } from '@react-navigation/native';
import { endpoints, authApis, nonAuthApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MyDispatchContext } from '../../configs/MyContexts';

const HomeScreen = () => {
  const navigation = useNavigation();
  const dispatch = useContext(MyDispatchContext);

  const [allProducts, setAllProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filter modal state
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [priceRange, setPriceRange] = useState([0, 2000000]); // min, max

  // Lưu tạm giá và category khi đang chỉnh modal
  const [tempCategory, setTempCategory] = useState('');
  const [tempPriceRange, setTempPriceRange] = useState([0, 2000000]);

  // Fetch categories
  const fetchCategories = async (token) => {
    try {
      const api = token ? authApis(token) : nonAuthApis;
      const response = await api.get(endpoints.categoriesList);
      console.log('API categories response:', response);

      if (response && response.results) {
        setCategories(response.results);
      } else if (Array.isArray(response)) {
        setCategories(response);
      } else {
        console.warn('Categories API trả về không phải mảng');
        setCategories([]);
      }
    } catch (error) {
      console.error('Error fetching categories:', error.message);
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.status === 401 && token) {
          await AsyncStorage.multiRemove(["token", "user", "refresh_token"]);
          dispatch({ type: "logout" });
          navigation.navigate("LoginScreen");
          Alert.alert("Phiên đăng nhập hết hạn", "Vui lòng đăng nhập lại.");
        } else {
          Alert.alert("Lỗi", "Không tải được danh mục sản phẩm.");
        }
      } catch (parseError) {
        Alert.alert("Lỗi", "Không tải được danh mục sản phẩm.");
      }
    }
  };

  // Fetch all products
  const fetchAllProducts = async (token) => {
    try {
      const api = token ? authApis(token) : nonAuthApis;
      setLoading(true);
      const response = await api.get(endpoints.productsList, { params: { page: 1, page_size: 1000 } });
      const all = response.results || [];
      setAllProducts(all);
      setProducts(all);
    } catch (error) {
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.status === 401 && token) {
          await AsyncStorage.multiRemove(["token", "user", "refresh_token"]);
          dispatch({ type: "logout" });
          navigation.navigate("LoginScreen");
          Alert.alert("Phiên đăng nhập hết hạn", "Vui lòng đăng nhập lại.");
        } else {
          Alert.alert("Lỗi", "Không tải được sản phẩm.");
        }
      } catch (parseError) {
        Alert.alert("Lỗi", "Không tải được sản phẩm.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const token = await AsyncStorage.getItem('token');
      await Promise.all([fetchCategories(token), fetchAllProducts(token)]);
    };
    loadData();
  }, [dispatch, navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    const refreshData = async () => {
      const token = await AsyncStorage.getItem('token');
      await fetchAllProducts(token);
    };
    refreshData();
  };

  // Áp dụng filter & search
  const applyFilters = (search, category, price) => {
    let filtered = [...allProducts];

    // Search theo tên
    if (search.trim() !== '') {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    }

    // Lọc danh mục
    if (category !== '') {
      filtered = filtered.filter(p => p.category === parseInt(category));
    }

    // Lọc giá
    filtered = filtered.filter(p => parseFloat(p.price) >= price[0] && parseFloat(p.price) <= price[1]);

    setProducts(filtered);
  };

  const handleSearch = () => {
    applyFilters(searchText, selectedCategory, priceRange);
  };

  const openFilterModal = () => {
    setTempCategory(selectedCategory);
    setTempPriceRange(priceRange);
    setFilterModalVisible(true);
  };

  const handleApplyFilter = () => {
    setSelectedCategory(tempCategory);
    setPriceRange(tempPriceRange);
    setFilterModalVisible(false);
    applyFilters(searchText, tempCategory, tempPriceRange);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>No Image</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardPrice}>{Number(item.price).toLocaleString()} ₫</Text>
        <View style={styles.cardButtons}>
          <TouchableOpacity style={styles.detailBtn} onPress={() => navigation.navigate('ProductDetailScreen', { productId: item.id })}>
            <Text style={styles.btnText}>Xem chi tiết</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.cartBtn, { opacity: AsyncStorage.getItem('token') ? 1 : 0.5 }]} 
            onPress={() => {
              if (!AsyncStorage.getItem('token')) {
                Alert.alert("Yêu cầu đăng nhập", "Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng.");
                navigation.navigate("LoginScreen");
              } else {
                navigation.navigate('CartScreen', { productId: item.id });
              }
            }}
            disabled={!AsyncStorage.getItem('token')}
          >
            <Text style={styles.btnText}>Thêm vào giỏ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" style={{ flex:1, justifyContent:'center', alignItems:'center' }} />;
  }

  return (
    <View style={{ flex:1 }}>
      {/* Search + Filter Button */}
      <View style={styles.searchFilterContainer}>
        <TextInput
          style={styles.searchBar}
          placeholder="Nhập tên sản phẩm"
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity style={styles.filterBtn} onPress={openFilterModal}>
          <Text style={styles.btnText}>Bộ lọc</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.btnText}>Tìm kiếm</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={products}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Text style={styles.warning}>Không tìm thấy sản phẩm</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      {/* Filter Modal */}
      <Modal isVisible={isFilterModalVisible} onBackdropPress={() => setFilterModalVisible(false)}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Bộ lọc sản phẩm</Text>

          {/* Slider giá */}
          <Text style={styles.filterLabel}>Giá: {tempPriceRange[0].toLocaleString()} - {tempPriceRange[1].toLocaleString()} VND</Text>
          <MultiSlider
            values={[tempPriceRange[0], tempPriceRange[1]]}
            min={0}
            max={2000000}
            step={10000}
            onValuesChange={values => setTempPriceRange(values)}
            selectedStyle={{ backgroundColor:'#007AFF' }}
            markerStyle={{ backgroundColor:'#007AFF' }}
          />

          {/* Danh mục */}
          <Text style={[styles.filterLabel,{marginTop:16}]}>Danh mục</Text>
          <ScrollView style={{ maxHeight:150 }}>
            {categories.map(cat => (
              <TouchableOpacity 
                key={cat.id} 
                style={styles.categoryItem} 
                onPress={() => setTempCategory(tempCategory===cat.id.toString()?'':cat.id.toString())}
              >
                <Text style={{ color: tempCategory===cat.id.toString()?'#007AFF':'#333' }}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.applyFilterBtn} onPress={handleApplyFilter}>
            <Text style={styles.btnText}>Hoàn tất</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  searchFilterContainer: { flexDirection:'row', padding:12, alignItems:'center' },
  searchBar: { flex:1, height:40, borderWidth:1, borderColor:'#ccc', borderRadius:8, paddingHorizontal:10, backgroundColor:'#fff' },
  searchBtn: { backgroundColor:'#007AFF', padding:10, borderRadius:8, marginLeft:8 },
  filterBtn: { backgroundColor:'#28A745', padding:10, borderRadius:8, marginLeft:8 },
  card: { backgroundColor:'#fff', borderRadius:12, marginBottom:12, shadowColor:'#000', shadowOffset:{width:0,height:2}, shadowOpacity:0.1, shadowRadius:4, elevation:3 },
  cardImage: { width:'100%', height:150, resizeMode:'cover', backgroundColor:'#ccc', justifyContent:'center', alignItems:'center' },
  imagePlaceholder: { backgroundColor:'#ccc', justifyContent:'center', alignItems:'center' },
  imagePlaceholderText: { color:'#666', fontSize:14 },
  cardBody: { padding:12 },
  cardTitle: { fontSize:18, fontWeight:'700', color:'#333' },
  cardPrice: { fontSize:16, fontWeight:'500', color:'#28A745', marginVertical:6 },
  cardButtons: { flexDirection:'row', justifyContent:'space-between', marginTop:8 },
  detailBtn: { backgroundColor:'#007AFF', padding:8, borderRadius:8, flex:1, marginRight:6 },
  cartBtn: { backgroundColor:'#28A745', padding:8, borderRadius:8, flex:1, marginLeft:6 },
  btnText: { color:'#fff', fontWeight:'600', textAlign:'center' },
  warning: { fontSize:16, color:'red', textAlign:'center', marginTop:20 },
  modalContainer: { backgroundColor:'#fff', borderRadius:12, padding:16 },
  modalTitle: { fontSize:20, fontWeight:'700', marginBottom:12 },
  filterLabel: { fontWeight:'600', marginBottom:4 },
  categoryItem: { paddingVertical:6, paddingHorizontal:4 },
  applyFilterBtn: { backgroundColor:'#28A745', padding:12, borderRadius:8, marginTop:16 }
});

export default HomeScreen;