import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { nonAuthApis, endpoints } from '../../configs/Apis';

const ResetPasswordScreen = () => {
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const { email } = route.params || {};

  const handleResetPassword = async () => {
    if (!code || !newPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập mã xác nhận và mật khẩu mới');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Lỗi', 'Mật khẩu phải có ít nhất 8 ký tự');
      return;
    }
    setLoading(true);
    try {
      await nonAuthApis.post(endpoints.passwordResetConfirm, { code, new_password: newPassword });
      Alert.alert('Thành công', 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập với mật khẩu mới.');
      navigation.navigate('LoginScreen');
    } catch (error) {
      console.error('Reset password error:', error.message);
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.status === 400) {
          Alert.alert('Lỗi', 'Mã xác nhận không hợp lệ hoặc đã hết hạn.');
        } else {
          Alert.alert('Lỗi', errorData.detail || 'Đã có lỗi xảy ra. Vui lòng thử lại.');
        }
      } catch (parseError) {
        Alert.alert('Lỗi', 'Đã có lỗi xảy ra. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Đặt lại mật khẩu</Text>
      <Text style={styles.instruction}>
        Nhập mã xác nhận đã được gửi đến email {email || 'của bạn'} và mật khẩu mới.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Nhập mã xác nhận (6 ký tự)"
        value={code}
        onChangeText={setCode}
        keyboardType="default"
        maxLength={6}
      />
      <TextInput
        style={styles.input}
        placeholder="Nhập mật khẩu mới"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
      />
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Button title="Đặt lại mật khẩu" onPress={handleResetPassword} color="#007AFF" />
          <Button title="Quay lại" onPress={() => navigation.goBack()} color="#007AFF" />
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
  instruction: {
    fontSize: 16,
    fontFamily: 'Roboto',
    fontWeight: '400',
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

export default ResetPasswordScreen;
