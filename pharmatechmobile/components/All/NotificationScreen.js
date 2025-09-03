import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, Button, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NotificationScreen = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextPageUrl, setNextPageUrl] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchNotifications = useCallback(async (url = endpoints.notificationsList, append = false) => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(url);
      // response assumed to have pagination: results, next
      const newNotifications = response.results || response.data || [];
      if (append) {
        setNotifications(prev => [...prev, ...newNotifications]);
      } else {
        setNotifications(newNotifications);
      }
      setNextPageUrl(response.next);
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể lấy thông báo');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id) => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.post(endpoints.notificationsMarkAsRead(id));
      // Sau khi mark as read thành công, refetch lại danh sách để đồng bộ
      fetchNotifications();
      Alert.alert('Thành công', 'Đã đánh dấu đã đọc');
    } catch (error) {
      Alert.alert('Lỗi', 'Lỗi khi cập nhật');
    }
  };

  const handleLoadMore = () => {
    if (nextPageUrl && !loadingMore) {
      setLoadingMore(true);
      fetchNotifications(nextPageUrl, true);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.message}>{item.message}</Text>
      <Text style={styles.time}>Thời gian: {new Date(item.created_at).toLocaleString()}</Text>
      {!item.is_read && (
        <Button title="Đánh dấu đã đọc" onPress={() => handleMarkAsRead(item.id)} color="#007AFF" />
      )}
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Thông báo</Text>
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
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
    marginBottom: 10,
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'gray',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: '700',
  },
  message: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  time: {
    fontSize: 14,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
  },
});

export default NotificationScreen;
