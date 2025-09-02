import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis, CLIENT_ID, CLIENT_SECRET } from '../../configs/Apis';
import { MyDispatchContext } from '../../configs/MyContexts';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useContext(MyDispatchContext);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('grant_type', 'password');
      formData.append('client_id', CLIENT_ID);
      formData.append('client_secret', CLIENT_SECRET);
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(endpoints.login, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = await response.json();

      if (data.access_token) {
        await AsyncStorage.setItem('token', data.access_token);
        const userResponse = await authApis(data.access_token).get(endpoints.usersMe);
        dispatch({ type: 'login', payload: userResponse });
        Alert.alert('Thành công', 'Đăng nhập thành công!');
        navigation.replace(userResponse.role === 'admin' ? 'AdminDashboardScreen' : 'HomeScreen');
      } else {
        Alert.alert('Lỗi', data.error_description || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
      }
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.error_description || 'Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Đăng nhập</Text>
      <TextInput
        style={styles.input}
        placeholder="Nhập email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Nhập mật khẩu"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Button title="Đăng nhập" onPress={handleLogin} color="#007AFF" />
          <Button
            title="Đăng ký"
            onPress={() => navigation.navigate('RegisterScreen')}
            color="#007AFF"
          />
        </>
      )}
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
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 10,
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
});

export default LoginScreen;