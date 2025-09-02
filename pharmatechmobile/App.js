import React, { useReducer } from 'react';
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Import context và reducer
import { MyUserContext, MyDispatchContext } from './configs/MyContexts';
import MyUserReducer from './configs/MyUserReducer';

// Import các màn hình
import SplashScreen from './components/All/SplashScreen';
import LoginScreen from './components/All/LoginScreen';
import RegisterScreen from './components/All/RegisterScreen';
import ProfileScreen from './components/All/ProfileScreen';
import NotificationScreen from './components/All/NotificationScreen';
import HomeScreen from './components/Customer/HomeScreen';
import ProductDetailScreen from './components/Customer/ProductDetailScreen';
import CartScreen from './components/Customer/CartScreen';
import OrderScreen from './components/Customer/OrderScreen';
import PaymentScreen from './components/Customer/PaymentScreen';
import ReviewScreen from './components/Customer/ReviewScreen';
import ChatScreen from './components/Customer/ChatScreen';
import EditProductScreen from './components/Distributor/EditProductScreen';
import InventoryManagementScreen from './components/Distributor/InventoryManagementScreen';
import AdminDashboardScreen from './components/Admin/AdminDashboardScreen';

const Stack = createStackNavigator();

export default function App() {
  const [user, dispatch] = useReducer(MyUserReducer, null);

  return (
    <MyUserContext.Provider value={user}>
      <MyDispatchContext.Provider value={dispatch}>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="SplashScreen" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="SplashScreen" component={SplashScreen} />
            <Stack.Screen name="LoginScreen" component={LoginScreen} />
            <Stack.Screen name="RegisterScreen" component={RegisterScreen} />
            <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
            <Stack.Screen name="NotificationScreen" component={NotificationScreen} />
            <Stack.Screen name="HomeScreen" component={HomeScreen} />
            <Stack.Screen name="ProductDetailScreen" component={ProductDetailScreen} />
            <Stack.Screen name="CartScreen" component={CartScreen} />
            <Stack.Screen name="OrderScreen" component={OrderScreen} />
            <Stack.Screen name="PaymentScreen" component={PaymentScreen} />
            <Stack.Screen name="ReviewScreen" component={ReviewScreen} />
            <Stack.Screen name="ChatScreen" component={ChatScreen} />
            <Stack.Screen name="EditProductScreen" component={EditProductScreen} />
            <Stack.Screen name="InventoryManagementScreen" component={InventoryManagementScreen} />
            <Stack.Screen name="AdminDashboardScreen" component={AdminDashboardScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </MyDispatchContext.Provider>
    </MyUserContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});