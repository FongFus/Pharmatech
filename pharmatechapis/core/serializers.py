from rest_framework import serializers
from rest_framework.serializers import ModelSerializer
from django.utils import timezone
from decimal import Decimal
from cloudinary.utils import cloudinary_url
from .models import User, Product, Cart, CartItem, Order, OrderItem, Payment, DeviceToken, Category, Inventory
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_decode
from django.utils.encoding import force_str

# Serializer cho User
class UserSerializer(ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)
    avatar = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'role', 'full_name', 'phone', 'address', 'avatar', 'is_active', 'is_staff', 'is_superuser', 'created_at', 'updated_at']
        read_only_fields = ['id', 'is_staff', 'is_superuser', 'created_at', 'updated_at']

    def create(self, validated_data):
        password = validated_data.pop('password')
        avatar = validated_data.pop('avatar', None)
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=password,
            full_name=validated_data['full_name'],
            phone=validated_data.get('phone'),
            address=validated_data.get('address'),
            role=validated_data.get('role', 'customer'),
            avatar=avatar
        )
        from .utils import create_firebase_user
        firebase_user = create_firebase_user(user.email, password, str(user.id), user.role)
        if not firebase_user.get('success'):
            raise serializers.ValidationError(firebase_user['message'])
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        avatar = validated_data.pop('avatar', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        if avatar is not None:
            instance.avatar = avatar
        instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['avatar'] = cloudinary_url(instance.avatar.public_id)[0] if instance.avatar else ''
        return data

# Serializer chi tiết cho User (Profile)
class UserDetailSerializer(ModelSerializer):
    orders = serializers.SerializerMethodField()
    carts = serializers.SerializerMethodField()

    def get_orders(self, obj):
        orders = obj.orders.filter(status__in=['pending', 'processing', 'completed'])
        return OrderSerializer(orders, many=True).data

    def get_carts(self, obj):
        carts = obj.carts.all()
        return CartSerializer(carts, many=True).data

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'full_name', 'phone', 'address', 'avatar', 'is_active', 'created_at', 'updated_at', 'orders', 'carts']
        read_only_fields = ['id', 'created_at', 'updated_at', 'is_active']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['avatar'] = cloudinary_url(instance.avatar.public_id)[0] if instance.avatar else ''
        return data

# Serializer cho Product
class ProductSerializer(ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'distributor', 'name', 'description', 'category', 'price', 'stock', 'image', 'is_approved', 'created_at', 'updated_at']
        read_only_fields = ['id', 'distributor', 'created_at', 'updated_at', 'is_approved']

    def validate(self, data):
        user = self.context['request'].user
        if not user.is_authenticated or user.role != 'distributor':
            raise serializers.ValidationError("Chỉ nhà phân phối mới có thể tạo/cập nhật sản phẩm.")
        return data

    def create(self, validated_data):
        validated_data['distributor'] = self.context['request'].user
        return Product.objects.create(**validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['image'] = cloudinary_url(instance.image.public_id)[0] if instance.image else ''
        data['price'] = str(instance.price)
        return data

# Serializer cho Inventory
class InventorySerializer(ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), source='product', write_only=True)

    class Meta:
        model = Inventory
        fields = ['id', 'distributor', 'product', 'product_id', 'quantity', 'last_updated']
        read_only_fields = ['id', 'distributor', 'last_updated']

    def validate(self, data):
        user = self.context['request'].user
        if user.role != 'distributor':
            raise serializers.ValidationError("Chỉ nhà phân phối mới có thể quản lý kho.")
        if data['product'].distributor != user:
            raise serializers.ValidationError("Bạn chỉ có thể quản lý kho của sản phẩm do bạn sở hữu.")
        return data

    def create(self, validated_data):
        validated_data['distributor'] = self.context['request'].user
        return Inventory.objects.create(**validated_data)

# Serializer cho Cart
class CartSerializer(ModelSerializer):
    items = serializers.SerializerMethodField()

    class Meta:
        model = Cart
        fields = ['id', 'user', 'items', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def get_items(self, obj):
        items = obj.items.all()
        return CartItemSerializer(items, many=True).data

    def create(self, validated_data):
        user = self.context['request'].user
        if user.role != 'customer':
            raise serializers.ValidationError("Chỉ khách hàng mới có thể tạo giỏ hàng.")
        return Cart.objects.create(user=user, **validated_data)

# Serializer cho CartItem
class CartItemSerializer(ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_approved=True), source='product', write_only=True)

    class Meta:
        model = CartItem
        fields = ['id', 'cart', 'product', 'product_id', 'quantity']
        read_only_fields = ['id', 'cart']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Số lượng phải lớn hơn 0.")
        product = self.initial_data.get('product_id')
        if product:
            product_instance = Product.objects.get(id=product)
            if value > product_instance.stock:
                raise serializers.ValidationError(f"Số lượng vượt quá tồn kho ({product_instance.stock}).")
        return value

# Serializer cho Order
class OrderSerializer(ModelSerializer):
    items = serializers.SerializerMethodField()
    user = serializers.ReadOnlyField(source='user.username')

    class Meta:
        model = Order
        fields = ['id', 'user', 'order_code', 'total_amount', 'status', 'items', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'order_code', 'total_amount', 'created_at', 'updated_at']

    def get_items(self, obj):
        items = obj.items.all()
        return OrderItemSerializer(items, many=True).data

    def validate(self, data):
        user = self.context['request'].user
        if user.role != 'customer':
            raise serializers.ValidationError("Chỉ khách hàng mới có thể tạo đơn hàng.")
        return data

# Serializer cho OrderItem
class OrderItemSerializer(ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_approved=True), source='product', write_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'order', 'product', 'product_id', 'quantity', 'price']
        read_only_fields = ['id', 'order', 'price']

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Số lượng phải lớn hơn 0.")
        product = self.initial_data.get('product_id')
        if product:
            product_instance = Product.objects.get(id=product)
            if value > product_instance.stock:
                raise serializers.ValidationError(f"Số lượng vượt quá tồn kho ({product_instance.stock}).")
        return value

# Serializer cho Payment
class PaymentSerializer(ModelSerializer):
    order_code = serializers.ReadOnlyField(source='order.order_code')
    user = serializers.ReadOnlyField(source='user.username')

    class Meta:
        model = Payment
        fields = ['id', 'order', 'order_code', 'user', 'amount', 'payment_method', 'status', 'transaction_id', 'paid_at', 'created_at']
        read_only_fields = ['id', 'order', 'user', 'amount', 'status', 'transaction_id', 'paid_at', 'created_at']

    def validate(self, data):
        user = self.context['request'].user
        if user.role != 'customer':
            raise serializers.ValidationError("Chỉ khách hàng mới có thể thực hiện thanh toán.")
        if data['order'].user != user:
            raise serializers.ValidationError("Bạn chỉ có thể thanh toán cho đơn hàng của mình.")
        return data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['amount'] = str(instance.amount)
        return data

# Serializer cho AdminProductApproval
class AdminProductApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'is_approved']
        read_only_fields = ['id']

    def validate(self, data):
        user = self.context['request'].user
        if user.role != 'admin':
            raise serializers.ValidationError("Chỉ quản trị viên mới có thể duyệt sản phẩm.")
        return data

# Serializer cho DeviceToken
class DeviceTokenSerializer(ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = ['id', 'user', 'token', 'device_type', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

# Serializer cho Category
class CategorySerializer(ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'

# Serializer cho Password Reset
class PasswordResetSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True, required=True)

    def validate_new_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Mật khẩu phải có ít nhất 8 ký tự.")
        return value