import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ChatScreen = () => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChatHistory = async () => {
      const token = await AsyncStorage.getItem('token');
      const authApi = authApis(token);
      try {
        const response = await authApi.get(endpoints.chatMessagesHistory);
        setMessages(response.data);
      } catch (error) {
        Alert.alert('Lỗi', 'Không thể tải lịch sử chat');
      } finally {
        setLoading(false);
      }
    };
    fetchChatHistory();
  }, []);

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.post(endpoints.chatMessagesCreate, { message });
      setMessages([...messages, response.data]);
      setMessage('');
    } catch (error) {
      Alert.alert('Lỗi', 'Gửi tin nhắn thất bại');
    }
  };

  const renderItem = ({ item }) => (
    <View style={[styles.item, { backgroundColor: item.is_user ? '#007AFF' : '#E0E0E0' }]}>
      <Text style={[styles.message, { color: item.is_user ? '#FFFFFF' : '#000000' }]}>{item.message}</Text>
      <Text style={styles.time}>Thời gian: {new Date(item.created_at).toLocaleString()}</Text>
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="large" color="#007AFF" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Trò chuyện với AI</Text>
      <FlatList
        data={messages}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        ListEmptyComponent={<Text style={styles.warning}>Chưa có tin nhắn</Text>}
      />
      <TextInput
        style={styles.input}
        placeholder="Hỏi AI..."
        value={message}
        onChangeText={setMessage}
      />
      <Button title="Gửi" onPress={handleSendMessage} color="#007AFF" />
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
  item: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  message: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
  time: {
    fontSize: 12,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
    color: '#666666',
    marginTop: 4,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 12,
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
});

export default ChatScreen;