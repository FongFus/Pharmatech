import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const SplashScreen = () => {
  const navigation = useNavigation();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.navigate('LoginScreen');
    }, 3000); // Chuyển hướng sau 3 giây

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} />
      <Text style={styles.title}>PharmaTech</Text>
      <Text style={styles.description}>Ứng dụng chăm sóc sức khỏe thông minh - Phiên bản 1.0</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Roboto',
    fontWeight: '700', // Bold
    color: '#007AFF',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Roboto-Italic', // Italic
    fontWeight: '400',
    color: '#000000',
  },
});

export default SplashScreen;