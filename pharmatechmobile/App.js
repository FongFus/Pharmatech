import React, { useReducer, useEffect, useContext, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { Icon } from 'react-native-paper';
import { BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis } from './configs/Apis';

// Import context và reducer
import { MyUserContext, MyDispatchContext } from './configs/MyContexts';
import MyUserReducer from './reducers/MyUserReducer';

// Import các màn hình
import SplashScreen from './components/All/SplashScreen';
import LoginScreen from './components/All/LoginScreen';
import RegisterScreen from './components/All/RegisterScreen';
import ForgotPasswordScreen from './components/All/ForgotPasswordScreen';
import ResetPasswordScreen from './components/All/ResetPasswordScreen';
import ProfileScreen from './components/All/ProfileScreen';
import NotificationScreen from './components/All/NotificationScreen';
import HomeScreen from './components/Customer/HomeScreen';
import ProductDetailScreen from './components/Customer/ProductDetailScreen';
import CartScreen from './components/Customer/CartScreen';
import OrderScreen from './components/Customer/OrderScreen';
import OrderDetailScreen from './components/Customer/OrderDetailScreen';
import PaymentScreen from './components/Customer/PaymentScreen';
import ReviewScreen from './components/Customer/ReviewScreen';
import ChatScreen from './components/Customer/ChatScreen';
import EditProductScreen from './components/Distributor/EditProductScreen';
import InventoryManagementScreen from './components/Distributor/InventoryManagementScreen';
import AdminDashboardScreen from './components/Admin/AdminDashboardScreen';

// Tạo Stack và Tab Navigator
const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Stack Navigator cho người dùng chưa xác thực
const UnauthStackNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="SplashScreen" component={SplashScreen} />
    <Stack.Screen name="LoginScreen" component={LoginScreen} />
    <Stack.Screen name="RegisterScreen" component={RegisterScreen} />
    <Stack.Screen name="ForgotPasswordScreen" component={ForgotPasswordScreen} />
    <Stack.Screen name="ResetPasswordScreen" component={ResetPasswordScreen} />
    <Stack.Screen name="HomeScreen" component={HomeScreen} />
  </Stack.Navigator>
);

// Stack Navigator cho Customer
const CustomerStackNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="HomeScreen" component={HomeScreen} />
    <Stack.Screen name="ProductDetailScreen" component={ProductDetailScreen} />
    <Stack.Screen name="CartScreen" component={CartScreen} />
    <Stack.Screen name="PaymentScreen" component={PaymentScreen} />
    <Stack.Screen name="ReviewScreen" component={ReviewScreen} />
    <Stack.Screen name="ChatScreen" component={ChatScreen} />
    <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
    <Stack.Screen name="NotificationScreen" component={NotificationScreen} />
  </Stack.Navigator>
);

// Stack Navigator cho Orders
const OrderStackNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="OrderScreen" component={OrderScreen} />
    <Stack.Screen name="OrderDetailScreen" component={OrderDetailScreen} />
  </Stack.Navigator>
);

// Stack Navigator cho Distributor
const DistributorStackNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="EditProductScreen" component={EditProductScreen} />
    <Stack.Screen name="InventoryManagementScreen" component={InventoryManagementScreen} />
    <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
    <Stack.Screen name="NotificationScreen" component={NotificationScreen} />
  </Stack.Navigator>
);

// Stack Navigator cho Admin
const AdminStackNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AdminDashboardScreen" component={AdminDashboardScreen} />
    <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
    <Stack.Screen name="NotificationScreen" component={NotificationScreen} />
  </Stack.Navigator>
);

// Hàm tạo cấu hình tab chung
const createTabScreen = (name, component, title, icon) => (
  <Tab.Screen
    name={name}
    component={component}
    options={{
      title,
      tabBarIcon: ({ color }) => <Icon source={icon} size={30} color={color} />,
    }}
  />
);

// Tabs cho người dùng đã xác thực (Customer)
const CustomerTabs = () => (
  <Tab.Navigator screenOptions={{ headerShown: false }}>
    {createTabScreen("home", CustomerStackNavigator, "Home", "home")}
    {createTabScreen("cart", CartScreen, "Cart", "cart")}
    {createTabScreen("orders", OrderStackNavigator, "Orders", "clipboard-list")}
    {createTabScreen("chat", ChatScreen, "Chat", "chat")}
    {createTabScreen("profile", ProfileScreen, "Profile", "account")}
  </Tab.Navigator>
);

// Tabs cho Distributor
const DistributorTabs = () => (
  <Tab.Navigator screenOptions={{ headerShown: false }}>
    {createTabScreen("products", EditProductScreen, "Products", "package-variant")}
    {createTabScreen("inventory", InventoryManagementScreen, "Inventory", "warehouse")}
    {createTabScreen("profile", ProfileScreen, "Profile", "account")}
    {createTabScreen("notifications", NotificationScreen, "Notifications", "bell")}
  </Tab.Navigator>
);

// Tabs cho Admin
const AdminTabs = () => (
  <Tab.Navigator screenOptions={{ headerShown: false }}>
    {createTabScreen("dashboard", AdminStackNavigator, "Dashboard", "view-dashboard")}
    {createTabScreen("profile", ProfileScreen, "Profile", "account")}
    {createTabScreen("notifications", NotificationScreen, "Notifications", "bell")}
  </Tab.Navigator>
);

// Authenticated Navigator
const AuthenticatedNavigator = () => {
  const { user } = useContext(MyUserContext);
  const role = user?.role || "default";
  switch (role) {
    case "customer":
      return <CustomerTabs />;
    case "distributor":
      return <DistributorTabs />;
    case "admin":
      return <AdminTabs />;
    default:
      return <UnauthStackNavigator />;
  }
};

// Hàm kiểm tra tính hợp lệ của token
const validateToken = async (token) => {
  try {
    const response = await authApis(token).get(endpoints.usersMe);
    return { valid: true, user: response };
  } catch (error) {
    console.error('Token validation failed:', error.message);
    return { valid: false, user: null };
  }
};

// Root Stack Navigator chính
const RootStackNavigator = ({ user, token }) => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {(!user || !token) ? (
        <Stack.Screen name="Unauthenticated" component={UnauthStackNavigator} />
      ) : (
        <Stack.Screen name="Authenticated" component={AuthenticatedNavigator} />
      )}
    </Stack.Navigator>
  );
};

// App chính
const App = () => {
  const [state, dispatch] = useReducer(MyUserReducer, { user: null, token: null });

  // Khôi phục trạng thái người dùng từ AsyncStorage khi ứng dụng khởi động
  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        if (token) {
          const userData = await AsyncStorage.getItem("user");
          if (userData) {
            const parsedUser = JSON.parse(userData);
            // Kiểm tra tính hợp lệ của token
            const { valid, user } = await validateToken(token);
            if (valid) {
              dispatch({
                type: "login",
                payload: { user, token },
              });
            } else {
              // Token không hợp lệ, xóa dữ liệu và đặt lại trạng thái
              await AsyncStorage.multiRemove(["token", "user", "refresh_token"]);
              dispatch({ type: "logout" });
            }
          } else {
            // Không có userData, xóa token và đặt lại trạng thái
            await AsyncStorage.multiRemove(["token", "refresh_token"]);
            dispatch({ type: "logout" });
          }
        } else {
          // Không có token, đảm bảo trạng thái là logout
          await AsyncStorage.removeItem("user");
          dispatch({ type: "logout" });
        }
      } catch (error) {
        console.error("Lỗi khi khôi phục trạng thái người dùng:", error);
        // Xóa dữ liệu nếu có lỗi và đặt lại trạng thái
        await AsyncStorage.multiRemove(["token", "user", "refresh_token"]);
        dispatch({ type: "logout" });
      }
    };
    loadUser();
  }, []);

  return (
    <MyUserContext.Provider value={state}>
      <MyDispatchContext.Provider value={dispatch}>
        <PaperProvider>
          <NavigationContainer>
            <RootStackNavigator user={state.user} token={state.token} />
          </NavigationContainer>
        </PaperProvider>
      </MyDispatchContext.Provider>
    </MyUserContext.Provider>
  );
};

export default App;