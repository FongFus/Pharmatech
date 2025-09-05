import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MyUserContext } from '../../configs/MyContexts';

const ReviewScreen = () => {
  const [reviews, setReviews] = useState([]);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(4);
  const [loading, setLoading] = useState(true);
  const [hasReviewed, setHasReviewed] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const { productId } = route.params;
  const user = useContext(MyUserContext);

  const fetchReviews = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.reviewsList, {
        params: { product: productId },
      });
      setReviews(response.data.results);
      setHasReviewed(response.data.results.some(r => r.user?.id === user?.id));
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể tải đánh giá');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [productId]);

  const handleSubmitReview = async () => {
    if (rating < 1 || rating > 5) {
      Alert.alert('Lỗi', 'Đánh giá từ 1-5');
      return;
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.post(endpoints.reviewsCreate, {
        product_id: productId,
        comment,
        rating,
      });
      fetchReviews();
      setComment('');
      setRating(4);
      Alert.alert('Thành công', 'Đã gửi đánh giá');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        Alert.alert('Lỗi', 'Bạn đã đánh giá sản phẩm này');
      } else {
        Alert.alert('Lỗi', 'Gửi đánh giá thất bại');
      }
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.title}>Đánh giá: {item.rating} sao</Text>
      <Text style={styles.comment}>{item.comment}</Text>
      <Text style={styles.author}>Tác giả: {item.user.username}</Text>
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Đánh giá</Text>
      {hasReviewed ? (
        <Text style={styles.warning}>Bạn đã đánh giá sản phẩm này</Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Viết nhận xét..."
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <TextInput
            style={styles.input}
            placeholder="Đánh giá (1-5)"
            value={rating.toString()}
            keyboardType="numeric"
            onChangeText={text => setRating(parseInt(text) || 4)}
          />
          <Button title="Gửi" onPress={handleSubmitReview} color="#007AFF" />
        </>
      )}
      <FlatList
        data={reviews}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={<Text style={styles.warning}>Chưa có đánh giá</Text>}
      />
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
  input: {
    height: 60,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
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
  title: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#FFD700',
  },
  comment: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  author: {
    fontSize: 14,
    fontFamily: 'Roboto-Italic',
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
});

export default ReviewScreen;