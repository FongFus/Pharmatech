import React, { useContext } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis } from '../../configs/Apis';
import { MyUserContext, MyDispatchContext } from '../../configs/MyContexts';

const ProfileScreen = ({ navigation }) => {
  const user = useContext(MyUserContext);
  const dispatch = useContext(MyDispatchContext);

  const handleLogout = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.post(endpoints.usersLogout); // Giả định backend có endpoint này
      await AsyncStorage.removeItem('token');
      dispatch({ type: 'logout' });
      Alert.alert('Thành công', 'Đã đăng xuất');
      navigation.replace('LoginScreen');
    } catch (error) {
      console.error('Logout error:', error.response?.data || error.message);
      Alert.alert('Lỗi', error.response?.data?.detail || 'Đăng xuất thất bại');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Hồ sơ</Text>
      <Text style={styles.detail}>Tên: {user.full_name}</Text>
      <Text style={styles.detail}>Email: {user.email}</Text>
      <Text style={styles.detail}>Vai trò: {user.role}</Text>
      <Button title="Đăng xuất" onPress={handleLogout} color="#FF0000" />
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
  detail: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
    marginBottom: 8,
  },
});

export default ProfileScreen;