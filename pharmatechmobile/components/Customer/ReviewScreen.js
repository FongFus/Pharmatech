import React, { useState, useEffect, useContext } from 'react';
import {
  Platform,
  StatusBar,
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  TouchableNativeFeedback,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { endpoints, nonAuthApis, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MyUserContext } from '../../configs/MyContexts';
import moment from 'moment';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

const ReviewScreen = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(null);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(4);
  const route = useRoute();
  const { productId } = route.params;
  const user = useContext(MyUserContext);

  useEffect(() => {
    // Navigation bar color setting removed due to edge-to-edge compatibility
    fetchReviews();
  }, [productId]);

  const fetchReviews = async (url = null, append = false) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const apiUrl = url || endpoints.reviewsProduct(productId);
      let response;
      if (token) {
        const api = authApis(token);
        response = await api.get(apiUrl);
      } else {
        response = await nonAuthApis.get(apiUrl);
      }
      if (append) {
        setReviews(prev => [...prev, ...response.results]);
      } else {
        setReviews(response.results);
      }
      setNextPage(response.next);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchReviews();
  };

  const onEndReached = () => {
    if (nextPage && !loadingMore) {
      setLoadingMore(true);
      fetchReviews(nextPage, true);
    }
  };

  // Fix for hasReviewed logic: ensure user and user.id exist and compare correctly
  const hasReviewed = React.useMemo(() => {
    if (!user || !user.id) return false;
    return reviews.some(r => r.user && r.user.id === user.id);
  }, [reviews, user]);

  const handleSubmitReview = async () => {
    if (rating < 1 || rating > 5) {
      Alert.alert('Lỗi', 'Đánh giá phải từ 1 đến 5');
      return;
    }
    Alert.alert(
      'Xác nhận',
      'Bạn có chắc muốn gửi đánh giá này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              const api = authApis(token);
              await api.post(endpoints.reviewsProduct(productId), {
                product: productId,
                order: null,
                rating,
                comment,
              });
              Alert.alert('Thành công', 'Đã gửi đánh giá');
              setComment('');
              setRating(4);
              fetchReviews();
            } catch (error) {
              let errorMessage = 'Gửi đánh giá thất bại';
              try {
                const errObj = JSON.parse(error.message);
                if (errObj.status === 400) {
                  if (errObj.detail?.includes('đã đánh giá')) {
                    errorMessage = 'Bạn đã đánh giá sản phẩm này';
                  } else if (errObj.detail?.includes('chưa mua')) {
                    errorMessage = 'Bạn chưa mua sản phẩm này';
                  } else if (errObj.rating) {
                    errorMessage = errObj.rating[0];
                  }
                }
              } catch {
                // Use default message
              }
              Alert.alert('Lỗi', errorMessage);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderStars = (rating, interactive = false, onStarPress = null) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          disabled={!interactive}
          onPress={() => onStarPress && onStarPress(i)}
        >
          <Text
            style={{
              fontSize: interactive ? 30 : 20,
              color: i <= rating ? '#FFD700' : '#ccc',
            }}
          >
            ★
          </Text>
        </TouchableOpacity>
      );
    }
    return <View style={{ flexDirection: 'row' }}>{stars}</View>;
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      {renderStars(item.rating)}
      {item.comment ? <Text style={styles.comment}>{item.comment}</Text> : null}
      <Text style={styles.username}>{item.user.username}</Text>
      <Text style={styles.createdAt}>{moment(item.created_at).fromNow()}</Text>
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return <ActivityIndicator size="small" color="#007AFF" />;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={Platform.OS === 'ios' ? 'dark-content' : 'light-content'}
        backgroundColor={Platform.OS === 'ios' ? '#FFFFFF' : '#007AFF'}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.header}>Đánh giá sản phẩm</Text>
          {hasReviewed ? (
            <Text style={styles.warning}>Bạn đã đánh giá sản phẩm này</Text>
          ) : (
            <View style={styles.form}>
              <View style={styles.starContainer}>
                {renderStars(rating, true, setRating)}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Viết nhận xét..."
                value={comment}
                onChangeText={setComment}
                multiline
                textAlignVertical="top"
              />
              {Platform.select({
                android: (
                  <TouchableNativeFeedback
                    onPress={handleSubmitReview}
                    background={TouchableNativeFeedback.SelectableBackground()}
                  >
                    <View style={styles.button}>
                      <Text style={styles.buttonText}>Gửi</Text>
                    </View>
                  </TouchableNativeFeedback>
                ),
                ios: (
                  <TouchableOpacity onPress={handleSubmitReview}>
                    <View style={styles.button}>
                      <Text style={styles.buttonText}>Gửi</Text>
                    </View>
                  </TouchableOpacity>
                ),
              })}
            </View>
          )}
          <FlatList
            data={reviews}
            renderItem={renderItem}
            keyExtractor={(item) => item.id.toString()}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Chưa có đánh giá</Text>
            }
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
          />
        </View>
      </KeyboardAvoidingView>
      {/* TODO: Test on real Android device to ensure UI consistency and navigation bar color. */}
    </SafeAreaView>
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
    fontFamily: Platform.select({ ios: 'Helvetica', android: 'Roboto' }),
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
  },
  form: {
    marginBottom: 16,
  },
  starContainer: {
    marginBottom: 16,
  },
  input: {
    height: 80,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 10,
    fontFamily: Platform.select({ ios: 'Helvetica', android: 'Roboto' }),
    fontWeight: '400',
    textAlignVertical: 'top',
    width: '100%',
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'gray',
    marginBottom: 12,
  },
  comment: {
    fontSize: 16,
    fontFamily: Platform.select({ ios: 'Helvetica', android: 'Roboto' }),
    fontWeight: '400',
    marginVertical: 4,
  },
  username: {
    fontSize: 14,
    fontFamily: Platform.select({ ios: 'Helvetica-Oblique', android: 'Roboto-Italic' }),
    fontWeight: '400',
    color: '#666',
  },
  createdAt: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Helvetica', android: 'Roboto' }),
    fontWeight: '400',
    color: '#999',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Platform.select({ ios: 'Helvetica-Oblique', android: 'Roboto-Italic' }),
    fontWeight: '400',
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
  },
  warning: {
    fontSize: 16,
    fontFamily: Platform.select({ ios: 'Helvetica-Oblique', android: 'Roboto-Italic' }),
    fontWeight: '400',
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    width: '100%',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default ReviewScreen;
