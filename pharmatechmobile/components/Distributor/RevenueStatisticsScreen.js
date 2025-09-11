import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const RevenueStatisticsScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Revenue Statistics Screen - Coming Soon</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 18,
    color: '#333',
  },
});

export default RevenueStatisticsScreen;
