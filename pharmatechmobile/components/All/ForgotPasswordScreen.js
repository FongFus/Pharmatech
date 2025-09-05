import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { endpoints, nonAuthApis } from '../../configs/Apis';

const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert('Lỗi', 'Vui lòng nhập email');
      return;
    }
    setLoading(true);
    try {
      await nonAuthApis.post(endpoints.passwordResetRequest, { email });
      Alert.alert('Thành công', 'Mã xác nhận đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.');
      navigation.navigate('ResetPasswordScreen', { email });
    } catch (error) {
      console.error('Forgot password error:', error.message);
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.status === 404) {
          Alert.alert('Lỗi', 'Email không tồn tại trong hệ thống.');
        } else if (errorData.status === 400) {
          Alert.alert('Lỗi', 'Dữ liệu không hợp lệ. Vui lòng kiểm tra email.');
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
      <Text style={styles.header}>Quên mật khẩu</Text>
      <Text style={styles.instruction}>Nhập email của bạn để nhận mã xác nhận đặt lại mật khẩu.</Text>
      <TextInput
        style={styles.input}
        placeholder="Nhập email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Button title="Gửi mã xác nhận" onPress={handleForgotPassword} color="#007AFF" />
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

export default ForgotPasswordScreen;
