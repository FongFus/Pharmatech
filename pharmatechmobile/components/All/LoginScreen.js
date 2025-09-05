import React, { useState, useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput, Button, HelperText, Title } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis, nonAuthApis, CLIENT_ID, CLIENT_SECRET } from '../../configs/Apis';
import { MyDispatchContext } from '../../configs/MyContexts';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useContext(MyDispatchContext);

  const handleLogin = async () => {
    if (!email || !password) {
      setMsg('Vui lòng nhập đầy đủ email và mật khẩu');
      return;
    }
    setLoading(true);
    setMsg(null);

    try {
      // Chuẩn bị dữ liệu JSON cho yêu cầu đăng nhập OAuth2
      const data = {
        grant_type: 'password',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        username: email,
        password: password,
      };

      console.log('Sending login request:', data);

      const response = await nonAuthApis.post(endpoints.login, data);

      console.log('Login response:', response);

      if (response.access_token) {
        await AsyncStorage.setItem('token', response.access_token);
        await AsyncStorage.setItem('refresh_token', response.refresh_token);
        const userResponse = await authApis(response.access_token).get(endpoints.usersMe);
        await AsyncStorage.setItem('user', JSON.stringify(userResponse));
        dispatch({ type: 'login', payload: { user: userResponse, token: response.access_token } });

        setMsg('Đăng nhập thành công!');
      } else {
        setMsg('Không nhận được token từ server. Vui lòng thử lại.');
      }
    } catch (error) {
      console.error('Login error:', error.message);
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.status === 400) {
          if (errorData.detail?.error === 'unsupported_grant_type') {
            setMsg('Lỗi cấu hình OAuth2: grant_type không được hỗ trợ.');
          } else {
            setMsg('Dữ liệu không hợp lệ. Vui lòng kiểm tra thông tin nhập.');
          }
        } else if (errorData.status === 401) {
          setMsg('Sai thông tin đăng nhập. Vui lòng kiểm tra email và mật khẩu.');
        } else if (errorData.status === 403) {
          setMsg('Tài khoản của bạn đã bị vô hiệu hóa.');
        } else if (errorData.status === 404) {
          setMsg('Không tìm thấy endpoint. Vui lòng kiểm tra cấu hình API.');
        } else {
          setMsg(errorData.detail || 'Đã có lỗi xảy ra. Vui lòng thử lại.');
        }
      } catch (parseError) {
        setMsg('Lỗi kết nối server. Vui lòng kiểm tra mạng hoặc cấu hình API.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Title style={styles.header}>Đăng nhập</Title>
      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        style={styles.input}
        mode="outlined"
        outlineColor="#007AFF"
        activeOutlineColor="#005BB5"
      />
      <TextInput
        label="Mật khẩu"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        style={styles.input}
        mode="outlined"
        outlineColor="#007AFF"
        activeOutlineColor="#005BB5"
        right={
          <TextInput.Icon
            icon={showPassword ? 'eye' : 'eye-off'}
            color="#000"
            onPress={() => setShowPassword(!showPassword)}
          />
        }
      />
      {msg && (
        <HelperText
          type={msg.includes('thành công') ? 'info' : 'error'}
          visible={true}
          style={styles.msg}
        >
          {msg}
        </HelperText>
      )}
      <Button
        mode="contained"
        onPress={handleLogin}
        loading={loading}
        disabled={loading}
        style={styles.button}
        buttonColor="#007AFF"
      >
        Đăng nhập
      </Button>
      <Button
        mode="text"
        onPress={() => navigation.navigate('ForgotPasswordScreen')}
        style={styles.button}
        textColor="#007AFF"
      >
        Quên mật khẩu?
      </Button>
      <Button
        mode="outlined"
        onPress={() => navigation.navigate('RegisterScreen')}
        style={styles.button}
        textColor="#007AFF"
      >
        Đăng ký
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 24,
    fontWeight: '700',
    color: '#007AFF',
  },
  input: {
    marginBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  msg: {
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    marginVertical: 10,
    borderRadius: 8,
  },
});

export default LoginScreen;