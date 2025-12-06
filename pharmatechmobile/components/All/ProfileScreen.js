import React, { useContext, useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Alert,
  Modal,
  TouchableOpacity,
  Image,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Card, Title, TextInput, Button, Avatar } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { endpoints, authApis } from '../../configs/Apis';
import { MyUserContext, MyDispatchContext } from '../../configs/MyContexts';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';

// Định nghĩa màu sắc trực tiếp trong file
const colors = {
  primary: '#007AFF',
  accent: '#FF2D55',
  background: '#F5F5F5',
  text: '#333333',
  white: '#FFFFFF',
  gray: '#CCCCCC',
  navy: '#1F2A44',
};

const ProfileScreen = ({ navigation }) => {
  const user = useContext(MyUserContext);
  const dispatch = useContext(MyDispatchContext);
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [avatarModal, setAvatarModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [editFullName, setEditFullName] = useState(user?.user?.full_name || '');
  const [editEmail, setEditEmail] = useState(user?.user?.email || '');
  const [editPhone, setEditPhone] = useState(user?.user?.phone || '');
  const [editAddress, setEditAddress] = useState(user?.user?.address || '');
  const [selectedImage, setSelectedImage] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (user) {
      setEditFullName(user.user?.full_name || '');
      setEditEmail(user.user?.email || '');
      setEditPhone(user.user?.phone || '');
      setEditAddress(user.user?.address || '');
      fetchUserStats();
    }
  }, [user]);

  const fetchUserStats = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const notificationsRes = await authApi.get(endpoints.notificationsList);
      setUnreadNotifications(notificationsRes.data?.results?.filter(n => !n.is_read).length || 0);
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể tải số liệu');
    }
  };

  const handleLogout = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.post(endpoints.usersLogout);
      await AsyncStorage.removeItem('token');
      dispatch({ type: 'logout' });
      Alert.alert('Thành công', 'Đã đăng xuất');
    } catch (error) {
      Alert.alert('Lỗi', error.response?.data?.detail || 'Đăng xuất thất bại');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu mới không khớp');
      return;
    }
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      await authApi.post(endpoints.usersChangePassword, {
        old_password: oldPassword,
        new_password: newPassword,
      });
      Alert.alert('Thành công', 'Đổi mật khẩu thành công');
      setChangePasswordModal(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      Alert.alert('Lỗi', error.response?.data?.detail || 'Đổi mật khẩu thất bại');
    }
  };

  const handleEditProfile = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    try {
      const updatedUser = await authApi.put(endpoints.usersUpdate(user.user?.id), {
        full_name: editFullName,
        email: editEmail,
        phone: editPhone,
        address: editAddress,
      });
      dispatch({ type: 'update_user', payload: updatedUser });
      Alert.alert('Thành công', 'Cập nhật hồ sơ thành công');
      setEditProfileModal(false);
    } catch (error) {
      Alert.alert('Lỗi', error.response?.data?.detail || 'Cập nhật thất bại');
    }
  };

  const handleViewNotifications = () => {
    navigation.navigate('NotificationScreen');
  };

  const handleUploadAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Lỗi', 'Cần quyền truy cập thư viện ảnh');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
      setAvatarModal(true);
    }
  };

  const handleConfirmUploadAvatar = async () => {
    const token = await AsyncStorage.getItem('token');
    const authApi = authApis(token);
    const formData = new FormData();
    formData.append('avatar', {
      uri: selectedImage.uri,
      name: 'avatar.jpg',
      type: 'image/jpeg',
    });
    try {
      const updatedUser = await authApi.put(endpoints.usersUpdate(user.user?.id), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      dispatch({ type: 'update_user', payload: updatedUser });
      Alert.alert('Thành công', 'Cập nhật ảnh đại diện thành công');
      setAvatarModal(false);
      setSelectedImage(null);
    } catch (error) {
      Alert.alert('Lỗi', 'Cập nhật ảnh đại diện thất bại');
    }
  };

  const handleDeactivate = async () => {
    Alert.alert(
      'Xác nhận',
      'Bạn có chắc muốn vô hiệu hóa tài khoản?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            const token = await AsyncStorage.getItem('token');
            const authApi = authApis(token);
            try {
              await authApi.post(endpoints.usersDeactivate);
              await handleLogout();
            } catch (error) {
              Alert.alert('Lỗi', 'Vô hiệu hóa thất bại');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={handleViewNotifications} style={styles.iconContainer}>
            <MaterialIcons name="notifications" size={28} color={colors.primary} />
            {unreadNotifications > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadNotifications}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={handleUploadAvatar}>
            {user?.user?.avatar ? (
              <Image source={{ uri: user.user.avatar }} style={styles.avatar} />
            ) : (
              <Avatar.Text size={80} label={user?.user?.full_name?.[0]?.toUpperCase() || ''} />
            )}
            <View style={styles.editAvatarOverlay}>
              <MaterialIcons name="camera-alt" size={20} color={colors.white} />
            </View>
          </TouchableOpacity>
        </View>
        <Title style={styles.header}>Hồ sơ</Title>
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.detail}>Tên: {user.user?.full_name}</Text>
            <Text style={styles.detail}>Email: {user.user?.email}</Text>
            <Text style={styles.detail}>Vai trò: {user.user?.role}</Text>
            <Text style={styles.detail}>Thông báo chưa đọc: {unreadNotifications}</Text>
          </Card.Content>
        </Card>
        <Button mode="contained" style={styles.button} onPress={() => setEditProfileModal(true)}>
          <MaterialIcons name="edit" size={20} color={colors.white} /> Chỉnh sửa hồ sơ
        </Button>
        <Button mode="contained" style={styles.button} onPress={() => setChangePasswordModal(true)}>
          <MaterialIcons name="lock" size={20} color={colors.white} /> Đổi mật khẩu
        </Button>
        <Button mode="outlined" style={styles.deactivateButton} onPress={handleDeactivate}>
          <MaterialIcons name="block" size={20} color={colors.accent} /> Vô hiệu hóa tài khoản
        </Button>
        <Button mode="outlined" style={styles.logoutButton} onPress={handleLogout}>
          <MaterialIcons name="logout" size={20} color={colors.accent} /> Đăng xuất
        </Button>

        {/* Edit Profile Modal */}
        <Modal visible={editProfileModal} animationType="slide" transparent>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              <Title style={styles.modalHeader}>Chỉnh sửa hồ sơ</Title>
              <TextInput
                label="Tên đầy đủ"
                value={editFullName}
                onChangeText={setEditFullName}
                mode="outlined"
                style={styles.input}
                outlineColor={colors.gray}
                activeOutlineColor={colors.primary}
              />
              <TextInput
                label="Email"
                value={editEmail}
                onChangeText={setEditEmail}
                mode="outlined"
                style={styles.input}
                outlineColor={colors.gray}
                activeOutlineColor={colors.primary}
                keyboardType="email-address"
              />
              <TextInput
                label="Số điện thoại"
                value={editPhone}
                onChangeText={setEditPhone}
                mode="outlined"
                style={styles.input}
                outlineColor={colors.gray}
                activeOutlineColor={colors.primary}
                keyboardType="phone-pad"
              />
              <TextInput
                label="Địa chỉ"
                value={editAddress}
                onChangeText={setEditAddress}
                mode="outlined"
                style={styles.input}
                outlineColor={colors.gray}
                activeOutlineColor={colors.primary}
              />
              <View style={styles.modalButtons}>
                <Button mode="outlined" onPress={() => setEditProfileModal(false)} style={styles.cancelButton}>
                  Hủy
                </Button>
                <Button mode="contained" onPress={handleEditProfile} style={styles.confirmButton}>
                  Lưu
                </Button>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Change Password Modal */}
        <Modal visible={changePasswordModal} animationType="slide" transparent>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              <Title style={styles.modalHeader}>Đổi mật khẩu</Title>
              <TextInput
                label="Mật khẩu cũ"
                value={oldPassword}
                onChangeText={setOldPassword}
                mode="outlined"
                secureTextEntry
                style={styles.input}
                outlineColor={colors.gray}
                activeOutlineColor={colors.primary}
              />
              <TextInput
                label="Mật khẩu mới"
                value={newPassword}
                onChangeText={setNewPassword}
                mode="outlined"
                secureTextEntry
                style={styles.input}
                outlineColor={colors.gray}
                activeOutlineColor={colors.primary}
              />
              <TextInput
                label="Xác nhận mật khẩu mới"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                mode="outlined"
                secureTextEntry
                style={styles.input}
                outlineColor={colors.gray}
                activeOutlineColor={colors.primary}
              />
              <View style={styles.modalButtons}>
                <Button mode="outlined" onPress={() => setChangePasswordModal(false)} style={styles.cancelButton}>
                  Hủy
                </Button>
                <Button mode="contained" onPress={handleChangePassword} style={styles.confirmButton}>
                  Đổi
                </Button>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>



        {/* Avatar Modal */}
        <Modal visible={avatarModal} animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Title style={styles.modalHeader}>Xác nhận ảnh đại diện</Title>
              {selectedImage && <Image source={{ uri: selectedImage.uri }} style={styles.avatarPreview} />}
              <View style={styles.modalButtons}>
                <Button mode="outlined" onPress={() => setAvatarModal(false)} style={styles.cancelButton}>
                  Hủy
                </Button>
                <Button mode="contained" onPress={handleConfirmUploadAvatar} style={styles.confirmButton}>
                  Tải lên
                </Button>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 30,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  iconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  editAvatarOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 5,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.navy,
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    marginBottom: 20,
    elevation: Platform.OS === 'android' ? 4 : 2,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Platform.OS === 'ios' ? 0.1 : 0.2,
    shadowRadius: 4,
  },
  detail: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  button: {
    marginBottom: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  logoutButton: {
    borderColor: colors.accent,
    borderWidth: 1,
    marginBottom: 12,
  },
  deactivateButton: {
    borderColor: colors.accent,
    borderWidth: 1,
    marginBottom: 12,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: colors.white,
    padding: 20,
    borderRadius: 10,
    width: '80%',
    maxHeight: '80%',
  },
  modalHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.navy,
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
    backgroundColor: colors.white,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
  },
  confirmButton: {
    flex: 1,
    marginLeft: 8,
    backgroundColor: colors.primary,
  },

  avatarPreview: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    marginBottom: 16,
  },
});

export default ProfileScreen;