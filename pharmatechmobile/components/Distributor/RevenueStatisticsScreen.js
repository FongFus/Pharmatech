import React, { useContext, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, ScrollView, RefreshControl, Alert } from 'react-native';
import { Text, ActivityIndicator, useTheme } from 'react-native-paper';
import { BarChart } from 'react-native-chart-kit';
import { MyUserContext } from '../../configs/MyContexts';
import { authApis, endpoints } from '../../configs/Apis';

const screenWidth = Dimensions.get('window').width;

const formatNumber = (num) => {
  return parseFloat(num).toLocaleString('vi-VN');
};

const RevenueStatisticsScreen = () => {
  const { token } = useContext(MyUserContext);
  const [loading, setLoading] = useState(false);
  const [totalRevenue, setTotalRevenue] = useState('0');
  const [totalOrders, setTotalOrders] = useState(0);
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const theme = useTheme();

  const fetchStatistics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authApis(token).get(endpoints.distributorStatistics);
      setTotalRevenue(data.total_revenue);
      setTotalOrders(data.total_orders);
      setTrendingProducts(data.trending_products);
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể tải dữ liệu thống kê doanh thu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStatistics();
  };

  // Prepare data for chart
  const chartData = {
    labels: trendingProducts.map(p => p.product__name),
    datasets: [
      {
        data: trendingProducts.map(p => p.total_sold),
        color: (opacity = 1) => theme.colors.primary, // optional
        strokeWidth: 2,
      },
    ],
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Thống Kê Doanh Thu</Text>
      {loading ? (
        <ActivityIndicator animating={true} size="large" style={styles.loading} />
      ) : (
        <>
          <View style={styles.summaryContainer}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Tổng doanh thu</Text>
              <Text style={styles.summaryValue}>{formatNumber(totalRevenue)} VND</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Tổng số đơn hàng</Text>
              <Text style={styles.summaryValue}>{totalOrders}</Text>
            </View>
          </View>
          {trendingProducts.length > 0 ? (
            <>
              <Text style={styles.chartTitle}>Sản phẩm bán chạy</Text>
              <BarChart
                data={chartData}
                width={screenWidth - 32}
                height={220}
                fromZero={true}
                chartConfig={{
                  backgroundColor: '#ffffff',
                  backgroundGradientFrom: '#ffffff',
                  backgroundGradientTo: '#ffffff',
                  decimalPlaces: 0,
                  color: (opacity = 1) => theme.colors.primary,
                  labelColor: (opacity = 1) => '#666',
                  style: {
                    borderRadius: 16,
                  },
                }}
                style={styles.chart}
              />
              <View style={styles.listContainer}>
                {trendingProducts.map((product, index) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={styles.productName}>{product.product__name}</Text>
                    <Text style={styles.productSold}>Đã bán: {product.total_sold}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>Không có dữ liệu sản phẩm bán chạy.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 24,
    marginBottom: 16,
    color: '#2e7d32', // green color
    textAlign: 'center',
  },
  loading: {
    marginTop: 50,
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 16,
    color: '#555',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginTop: 4,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1565c0', // blue color
    textAlign: 'center',
  },
  chart: {
    borderRadius: 16,
    marginBottom: 24,
  },
  listContainer: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productName: {
    fontSize: 16,
    color: '#333',
  },
  productSold: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  noDataText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
  },
});

export default RevenueStatisticsScreen;
