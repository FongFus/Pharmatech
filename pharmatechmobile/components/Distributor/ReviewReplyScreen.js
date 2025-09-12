import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MyUserContext } from '../../configs/MyContexts';
import moment from 'moment';
import { Button as PaperButton, Card, TextInput as PaperTextInput, FAB, Searchbar } from 'react-native-paper';

const ReviewReplyScreen = () => {
  const { user } = useContext(MyUserContext);
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const navigation = useNavigation();

  useEffect(() => {
    if (!user || user.role !== 'distributor') {
      return;
    }
    fetchProducts();
  }, [user]);

  const fetchProducts = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const api = authApis(token);
      const response = await api.get(endpoints.productsMyProducts);
      setProducts(response.results);
    } catch (error) {
      console.error('Error fetching products:', error);
      Alert.alert('Lỗi', 'Không thể tải danh sách sản phẩm');
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async (productId) => {
    try {
      const token = await AsyncStorage.getItem('token');
      const api = authApis(token);
      const response = await api.get(endpoints.reviewsProduct(productId));
      // Sort reviews: unreplied first, then by creation date
      const sortedReviews = response.results.sort((a, b) => {
        const aReplied = a.replies && a.replies.length > 0;
        const bReplied = b.replies && b.replies.length > 0;
        if (aReplied !== bReplied) {
          return aReplied ? 1 : -1; // Unreplied first
        }
        return new Date(b.created_at) - new Date(a.created_at); // Newest first
      });
      setReviews(sortedReviews);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      Alert.alert('Lỗi', 'Không thể tải danh sách đánh giá');
    }
  };

  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    fetchReviews(product.id);
  };

  const handleReply = (review) => {
    setSelectedReview(review);
    setReplyText('');
    setReplyModalVisible(true);
  };

  const submitReply = async () => {
    if (!replyText.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập nội dung phản hồi');
      return;
    }
    Alert.alert(
      'Xác nhận gửi phản hồi',
      'Bạn có chắc muốn gửi phản hồi này? Phản hồi không thể chỉnh sửa sau khi gửi.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi',
          onPress: async () => {
            setSubmittingReply(true);
            try {
              const token = await AsyncStorage.getItem('token');
              const api = authApis(token);
              await api.post(endpoints.reviewReplies, {
                review: selectedReview.id,
                comment: replyText,
              });
              Alert.alert('Thành công', 'Đã gửi phản hồi');
              setReplyModalVisible(false);
              fetchReviews(selectedProduct.id); // Refresh reviews
            } catch (error) {
              console.error('Error submitting reply:', error);
              Alert.alert('Lỗi', 'Gửi phản hồi thất bại');
            } finally {
              setSubmittingReply(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderStars = (rating) => {
    return (
      <View style={{ flexDirection: 'row' }}>
        {Array.from({ length: 5 }, (_, i) => {
          const starNumber = i + 1;
          return (
            <Text
              key={`star-${starNumber}`}
              style={{
                fontSize: 16,
                color: starNumber <= rating ? '#FFD700' : '#ccc',
              }}
            >
              ★
            </Text>
          );
        })}
      </View>
    );
  };

  const renderProductItem = ({ item }) => (
    <TouchableOpacity onPress={() => handleProductSelect(item)} style={styles.productItem}>
      <Text style={styles.productName}>{item.name}</Text>
      <Text style={styles.productDescription}>{item.description}</Text>
    </TouchableOpacity>
  );

  const renderReviewItem = ({ item }) => {
    const hasReplies = item.replies && item.replies.length > 0;
    return (
      <Card style={[styles.reviewCard, hasReplies ? styles.repliedCard : styles.unrepliedCard]}>
        <Card.Content>
          <View style={styles.reviewHeader}>
            {renderStars(item.rating)}
            <Text style={styles.reviewUser}>{item.user_details.full_name} ({item.user_details.username})</Text>
            <View style={styles.statusContainer}>
              <Text style={[styles.statusText, hasReplies ? styles.repliedStatus : styles.unrepliedStatus]}>
                {hasReplies ? '✓ Đã phản hồi' : '⚠ Chưa phản hồi'}
              </Text>
              <Text style={styles.reviewDate}>{moment(item.created_at).fromNow()}</Text>
            </View>
          </View>
          {item.comment && <Text style={styles.reviewComment}>{item.comment}</Text>}
          {hasReplies ? (
            <View style={styles.repliesContainer}>
              {item.replies.map(reply => (
                <View key={reply.id} style={styles.reply}>
                  <Text style={styles.replyUser}>
                    {reply.user_details.full_name} ({reply.user_details.username})
                  </Text>
                  <Text style={styles.replyComment}>{reply.comment}</Text>
                  <Text style={styles.replyDate}>{moment(reply.created_at).fromNow()}</Text>
                </View>
              ))}
            </View>
          ) : (
            <PaperButton
              mode="outlined"
              onPress={() => handleReply(item)}
              style={styles.replyButton}
              buttonColor="#FF0000"
              textColor="#FFFFFF"
            >
              Phản hồi
            </PaperButton>
          )}
        </Card.Content>
      </Card>
    );
  };

  if (!user || user.role !== 'distributor') {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Bạn không có quyền truy cập trang này.</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#007AFF" />
      {!selectedProduct ? (
        <View style={styles.productListContainer}>
          <Text style={styles.header}>Chọn sản phẩm để xem đánh giá</Text>
          <FlatList
            data={products}
            renderItem={renderProductItem}
            keyExtractor={(item) => item.id.toString()}
            ListEmptyComponent={<Text style={styles.emptyText}>Không có sản phẩm nào</Text>}
          />
        </View>
      ) : (
        <View style={styles.reviewListContainer}>
          <View style={styles.headerContainer}>
            <TouchableOpacity onPress={() => setSelectedProduct(null)} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Quay lại</Text>
            </TouchableOpacity>
            <Text style={styles.header}>{selectedProduct.name}</Text>
          </View>
          <View style={styles.filterContainer}>
            <Searchbar
              placeholder="Tìm kiếm đánh giá..."
              onChangeText={setSearchQuery}
              value={searchQuery}
              style={styles.searchBar}
            />
            <View style={styles.filterButtons}>
              <TouchableOpacity onPress={() => setFilterStatus('all')} style={[styles.filterButton, filterStatus === 'all' && styles.activeFilter]}>
                <Text style={[styles.filterText, filterStatus === 'all' && styles.activeFilterText]}>Tất cả</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFilterStatus('unreplied')} style={[styles.filterButton, filterStatus === 'unreplied' && styles.activeFilter]}>
                <Text style={[styles.filterText, filterStatus === 'unreplied' && styles.activeFilterText]}>Chưa phản hồi</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFilterStatus('replied')} style={[styles.filterButton, filterStatus === 'replied' && styles.activeFilter]}>
                <Text style={[styles.filterText, filterStatus === 'replied' && styles.activeFilterText]}>Đã phản hồi</Text>
              </TouchableOpacity>
            </View>
          </View>
          <FlatList
            data={reviews.filter(review => {
              const matchesSearch = !searchQuery || (review.comment && review.comment.toLowerCase().includes(searchQuery.toLowerCase()));
              const matchesStatus = filterStatus === 'all' || (filterStatus === 'replied' && review.replies && review.replies.length > 0) || (filterStatus === 'unreplied' && (!review.replies || review.replies.length === 0));
              return matchesSearch && matchesStatus;
            })}
            renderItem={renderReviewItem}
            keyExtractor={(item) => item.id.toString()}
            ListEmptyComponent={<Text style={styles.emptyText}>Chưa có đánh giá nào</Text>}
          />
        </View>
      )}

      <Modal visible={replyModalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeader}>Phản hồi đánh giá</Text>
            <Text style={styles.reviewPreview}>
              "{selectedReview?.comment || 'Không có nội dung'}"
            </Text>
            <PaperTextInput
              label="Nội dung phản hồi"
              value={replyText}
              onChangeText={setReplyText}
              multiline
              numberOfLines={4}
              style={styles.replyInput}
              mode="outlined"
            />
            <View style={styles.modalButtons}>
              <PaperButton onPress={() => setReplyModalVisible(false)}>Hủy</PaperButton>
              <PaperButton mode="contained" onPress={submitReply}>Gửi</PaperButton>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  errorText: {
    fontSize: 18,
    color: '#FF0000',
    textAlign: 'center',
  },
  productListContainer: {
    flex: 1,
    padding: 16,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  productItem: {
    backgroundColor: '#F0F0F0',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  productName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  productDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 32,
  },
  reviewListContainer: {
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  reviewCard: {
    margin: 8,
    elevation: 2,
  },
  repliedCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  unrepliedCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF5722',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  repliedStatus: {
    color: '#4CAF50',
  },
  unrepliedStatus: {
    color: '#FF5722',
  },
  reviewUser: {
    fontSize: 14,
    color: '#666',
    fontWeight: 'bold',
  },
  reviewDate: {
    fontSize: 12,
    color: '#999',
  },
  reviewComment: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  repliesContainer: {
    marginTop: 8,
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: '#007AFF',
  },
  reply: {
    marginBottom: 8,
  },
  replyUser: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  replyComment: {
    fontSize: 14,
    color: '#333',
    marginVertical: 4,
  },
  replyDate: {
    fontSize: 12,
    color: '#999',
  },
  replyButton: {
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    margin: 20,
    borderRadius: 8,
    width: '90%',
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 16,
  },
  reviewPreview: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  replyInput: {
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  filterContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchBar: {
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  activeFilter: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    fontSize: 14,
    color: '#333',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
});

export default ReviewReplyScreen;
