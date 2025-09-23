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

  const hasReviewed = React.useMemo(() => {
    if (!user || !user.id) return false;
    return reviews.some(r => r.user_details && r.user_details.id === user.id);
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
          style={styles.starWrapper}
        >
          <Text
            style={{
              fontSize: interactive ? 28 : 20,
              color: i <= rating ? '#FFD700' : '#ccc',
            }}
          >
            ★
          </Text>
        </TouchableOpacity>
      );
    }
    return <View style={styles.starContainer}>{stars}</View>;
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.username}>{item.user_details.full_name} ({item.user_details.username})</Text>
      <View style={styles.starContainer}>
        {renderStars(item.rating)}
      </View>
      {item.comment ? <Text style={styles.comment}>{item.comment}</Text> : null}
      <Text style={styles.createdAt}>{moment(item.created_at).fromNow()}</Text>
      {item.replies && item.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {item.replies.map(reply => (
            <View key={reply.id} style={styles.reply}>
              <Text style={styles.replyUser}>{reply.user_details.full_name} ({reply.user_details.username})</Text>
              <Text style={styles.replyComment}>{reply.comment}</Text>
              <Text style={styles.replyCreatedAt}>{moment(reply.created_at).fromNow()}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoading}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  };

  const renderHeader = () => (
    <View>
      <Text style={styles.header}>Đánh giá sản phẩm</Text>
      {hasReviewed ? (
        <Text style={styles.warning}>Bạn đã đánh giá sản phẩm này</Text>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <View style={styles.form}>
            <View style={styles.starContainer}>
              {renderStars(rating, true, setRating)}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Viết nhận xét..."
              placeholderTextColor="#999"
              value={comment}
              onChangeText={setComment}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity style={styles.button} onPress={handleSubmitReview}>
              <Text style={styles.buttonText}>Gửi</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar backgroundColor="#007AFF" barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor="#007AFF" barStyle="light-content" />
      <FlatList
        data={reviews}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Chưa có đánh giá</Text>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        style={styles.list}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  list: {
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
  form: {
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  starContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  starWrapper: {
    marginRight: 8,
  },
  input: {
    height: 100,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
    backgroundColor: '#fff',
    marginBottom: 12,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 12,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  comment: {
    fontSize: 16,
    fontWeight: '400',
    color: '#333',
    marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  createdAt: {
    fontSize: 12,
    fontWeight: '400',
    color: '#999',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  repliesContainer: {
    marginTop: 8,
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#ccc',
  },
  reply: {
    marginBottom: 8,
  },
  replyUser: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  replyComment: {
    fontSize: 14,
    fontWeight: '400',
    color: '#333',
    marginVertical: 2,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  replyCreatedAt: {
    fontSize: 12,
    fontWeight: '400',
    color: '#999',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
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
  emptyText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  warning: {
    fontSize: 16,
    fontWeight: '500',
    color: '#F44336',
    textAlign: 'center',
    marginVertical: 20,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'Roboto',
  },
  footerLoading: {
    padding: 16,
    alignItems: 'center',
  },
});

export default ReviewScreen;