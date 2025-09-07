import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, ActivityIndicator, Alert, Platform, TouchableNativeFeedback, StatusBar, Modal } from 'react-native';
import { endpoints, authApis, BASE_URL, getWebSocketURL } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native';
import { FAB, List, Button, Card, Appbar } from 'react-native-paper';
import * as NavigationBar from 'expo-navigation-bar';
import { MyUserContext } from '../../configs/MyContexts';

const ChatScreen = () => {
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isChatMode, setIsChatMode] = useState(false);
  const [ws, setWs] = useState(null);
  const [currentConvId, setCurrentConvId] = useState(null);
  const flatListRef = useRef(null);
  const user = useContext(MyUserContext);

  useEffect(() => {
    NavigationBar.setBackgroundColorAsync('#007AFF');
    StatusBar.setBackgroundColor('#007AFF');
    StatusBar.setBarStyle('light-content');
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    const cached = await AsyncStorage.getItem('conversations');
    if (cached) {
      setConversations(JSON.parse(cached));
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.get(endpoints.chatMessagesHistory);
      const grouped = {};
      response.history.forEach(item => {
        if (!grouped[item.conversation_id]) {
          grouped[item.conversation_id] = { id: item.conversation_id, messages: [], lastMessage: '', lastTime: '' };
        }
        // Push user message
        grouped[item.conversation_id].messages.push({
          id: item.message_id + '_user',
          message: item.message,
          is_user: true,
          created_at: item.created_at
        });
        // Push AI response
        grouped[item.conversation_id].messages.push({
          id: item.message_id + '_ai',
          message: item.response,
          is_user: false,
          created_at: item.created_at
        });
        if (item.created_at > grouped[item.conversation_id].lastTime) {
          grouped[item.conversation_id].lastTime = item.created_at;
          grouped[item.conversation_id].lastMessage = item.response;
        }
      });
      const convs = Object.values(grouped).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
      setConversations(convs);
      await AsyncStorage.setItem('conversations', JSON.stringify(convs));
    } catch (error) {
      if (!cached) {
        Alert.alert('Lỗi', 'Không thể tải danh sách hội thoại');
      }
    } finally {
      setLoading(false);
    }
  };

  const connectWebSocket = async (convId) => {
    setCurrentConvId(convId);
    const token = await AsyncStorage.getItem('token');
    const wsUrl = getWebSocketURL(convId) + `?token=${token}`;
    const websocket = new WebSocket(wsUrl);
    websocket.onopen = () => {
      console.log('WebSocket connected');
    };
    websocket.onmessage = (e) => {
      let data;
      try {
        data = JSON.parse(e.data);
      } catch (err) {
        Alert.alert('Lỗi dữ liệu', 'Dữ liệu nhận được không hợp lệ.');
        return;
      }
      if (!data) {
        Alert.alert('Lỗi dữ liệu', 'Dữ liệu nhận được không hợp lệ.');
        return;
      }
      if (data.error) {
        if (data.error.includes('token') || data.error.includes('hết hạn')) {
          Alert.alert('Lỗi xác thực', 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.');
        } else if (data.error.includes('Firebase')) {
          Alert.alert('Lỗi lưu trữ', 'Không thể lưu tin nhắn, vui lòng thử lại.');
        } else {
          Alert.alert('Lỗi', data.error);
        }
        return;
      }
      if (data.conversation_id && !convId) {
        setCurrentConvId(data.conversation_id);
        setCurrentConversation({ id: data.conversation_id, messages: [] });
        setConversations(prev => {
          const exists = prev.find(conv => conv.id === data.conversation_id);
          if (!exists) {
            return [{ id: data.conversation_id, messages: [], lastMessage: data.message || '', lastTime: new Date().toISOString() }, ...prev];
          }
          return prev;
        });
      }
      if (data.previous_messages) {
        const historyMessages = data.previous_messages.flatMap(item => {
          // Extract main advice from response after "Lời khuyên:" if present
          let mainAdvice = item.response;
          const adviceIndex = item.response.indexOf('Lời khuyên:');
          if (adviceIndex !== -1) {
            mainAdvice = item.response.substring(adviceIndex + 'Lời khuyên:'.length).trim();
          }
          return [
            { id: item.timestamp + '_user', message: item.message, is_user: true, created_at: item.timestamp },
            { id: item.timestamp + '_ai', message: mainAdvice, is_user: false, created_at: item.timestamp }
          ];
        });
        setMessages(historyMessages);
        setCurrentConversation(prev => ({ ...prev, messages: historyMessages }));
        // Update conversations with last message (use main advice)
        if (data.previous_messages.length > 0) {
          const lastItem = data.previous_messages[data.previous_messages.length - 1];
          let lastAdvice = lastItem.response;
          const adviceIndex = lastItem.response.indexOf('Lời khuyên:');
          if (adviceIndex !== -1) {
            lastAdvice = lastItem.response.substring(adviceIndex + 'Lời khuyên:'.length).trim();
          }
          updateConversations(currentConvId || data.conversation_id, lastAdvice);
        }
        // Auto-scroll to latest message
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
      if (data.message && data.response) {
        // Extract main advice from response after "Lời khuyên:" if present
        let mainAdvice = data.response;
        const adviceIndex = data.response.indexOf('Lời khuyên:');
        if (adviceIndex !== -1) {
          mainAdvice = data.response.substring(adviceIndex + 'Lời khuyên:'.length).trim();
        }
        const newMessages = [
          { id: Date.now() + '_user', message: data.message, is_user: true, created_at: new Date().toISOString() },
          { id: Date.now() + '_ai', message: mainAdvice, is_user: false, created_at: new Date().toISOString() }
        ];
        setMessages(prev => [...prev, ...newMessages]);
        setCurrentConversation(prev => ({ ...prev, messages: [...prev.messages, ...newMessages], lastMessage: mainAdvice, lastTime: new Date().toISOString() }));
        updateConversations(data.conversation_id || currentConvId, mainAdvice);
        // Auto-scroll to latest message
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    };
    websocket.onerror = (e) => {
      console.error('WebSocket error:', e);
      Alert.alert('Lỗi', 'Không thể kết nối WebSocket');
    };
    websocket.onclose = (e) => {
      console.log('WebSocket closed', e.code);
      if (e.code === 4001) {
        Alert.alert('Lỗi xác thực', 'Kết nối bị đóng do lỗi xác thực.');
      } else if (e.code === 4002) {
        Alert.alert('Lỗi', 'ID hội thoại không hợp lệ.');
      }
    };
    setWs(websocket);
  };

  const updateConversations = (convId, lastMsg) => {
    setConversations(prev => prev.map(conv => 
      conv.id === convId ? { ...conv, lastMessage: lastMsg, lastTime: new Date().toISOString() } : conv
    ).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime)));
  };

  const handleSendMessage = () => {
    if (!message.trim() || !ws) return;
    ws.send(JSON.stringify({ message }));
    setMessage('');
  };

  const selectConversation = (conv) => {
    setCurrentConvId(conv.id);
    setCurrentConversation(conv);
    setMessages([]); // Will be loaded from WebSocket
    setIsChatMode(true);
    connectWebSocket(conv.id);
  };

  const createNewConversation = () => {
    setCurrentConvId(null);
    setCurrentConversation({ id: null, messages: [] });
    setMessages([]);
    setIsChatMode(true);
    connectWebSocket(null);
  };

  const backToList = () => {
    setIsChatMode(false);
    setCurrentConversation(null);
    setMessages([]);
    setCurrentConvId(null);
    if (ws) {
      ws.close();
      setWs(null);
    }
    fetchConversations();
  };

  const renderConversationItem = ({ item }) => (
    <TouchableNativeFeedback onPress={() => selectConversation(item)}>
      <List.Item
        title={item.lastMessage || 'Hội thoại mới'}
        description={item.lastTime ? new Date(item.lastTime).toLocaleString() : 'Chưa có tin nhắn'}
        left={props => <List.Icon {...props} icon="chat" />}
      />
    </TouchableNativeFeedback>
  );

  const renderMessageItem = ({ item }) => (
    <View style={[styles.messageItem, item.is_user ? styles.userMessage : styles.aiMessage]}>
      <Text style={styles.messageText}>{item.message}</Text>
      <Text style={styles.messageTime}>{new Date(item.created_at).toLocaleString()}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {!isChatMode ? (
        <>
          <Appbar.Header style={styles.appbar}>
            <Appbar.Content title="Hội thoại" />
            <Appbar.Action icon="plus" onPress={createNewConversation} />
          </Appbar.Header>
          <FlatList
            data={conversations}
            renderItem={renderConversationItem}
            keyExtractor={item => item.id}
            ListEmptyComponent={<Text style={styles.empty}>Chưa có hội thoại</Text>}
          />
        </>
      ) : (
        <>
          <Appbar.Header style={styles.appbar}>
            <Appbar.BackAction onPress={backToList} />
            <Appbar.Content title="Chat với AI" />
          </Appbar.Header>
          <KeyboardAvoidingView
            style={styles.chatContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
          >
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessageItem}
              keyExtractor={item => item.id.toString()}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              keyboardShouldPersistTaps="handled"
            />
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Nhập tin nhắn..."
                value={message}
                onChangeText={setMessage}
                multiline
              />
              <Button mode="contained" onPress={handleSendMessage} style={styles.sendButton}>
                Gửi
              </Button>
            </View>
          </KeyboardAvoidingView>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  appbar: {
    backgroundColor: '#007AFF',
  },
  empty: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  chatContainer: {
    flex: 1,
  },
  chatContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  messageItem: {
    padding: 10,
    margin: 5,
    borderRadius: 10,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0E0E0',
  },
  messageText: {
    fontSize: 16,
    color: '#000',
  },
  messageTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#CCC',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
  },
  sendButton: {
    borderRadius: 20,
  },
});

export default ChatScreen;
