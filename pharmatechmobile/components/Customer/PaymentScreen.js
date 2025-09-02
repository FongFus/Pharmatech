import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ActivityIndicator, Alert, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { endpoints, authApis } from '../../configs/Apis';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PaymentScreen = () => {
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const { cartItems } = route.params;
  const total = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const handlePayment = async () => {
    setLoading(true);
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const response = await authApi.post(endpoints.paymentsCreateStripePayment, { amount: total });
      Alert.alert('Thành công', 'Thanh toán thành công');
      navigation.navigate('HomeScreen');
    } catch (error) {
      Alert.alert('Lỗi', 'Thanh toán thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.get(endpoints.paymentsCancel);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Lỗi', 'Hủy thất bại');
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} />
      <Text style={styles.header}>Thanh toán</Text>
      <Text style={styles.description}>Chọn phương thức</Text>
      <TextInput
        style={styles.input}
        value={`${total} VND`}
        editable={false}
      />
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : (
        <>
          <Button title="Thanh toán" onPress={handlePayment} color="#007AFF" />
          <Button title="Hủy" onPress={handleCancel} color="#FF0000" />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    padding: 16,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  header: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Roboto-Italic',
    fontWeight: '400',
    marginBottom: 16,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 10,
    width: '100%',
    fontFamily: 'Roboto',
    fontWeight: '400',
  },
});

export default PaymentScreen;