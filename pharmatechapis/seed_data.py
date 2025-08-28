import os
import django
from faker import Faker
import random
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta

# Thiết lập môi trường Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'pharmatech.settings')
django.setup()

from core.models import User, Category, Product, Inventory, Cart, CartItem, Order, OrderItem, Payment, DeviceToken

# Khởi tạo Faker với locale tiếng Việt
fake = Faker('vi_VN')

# Danh sách danh mục y tế/dược phẩm bằng tiếng Việt
MEDICAL_CATEGORIES = [
    "Thuốc kháng sinh", "Thuốc giảm đau", "Thuốc tim mạch",
    "Thuốc tiêu hóa", "Thuốc hô hấp", "Vitamin và khoáng chất",
    "Thuốc thần kinh", "Thuốc da liễu"
]

# Danh sách tên thuốc phổ biến bằng tiếng Việt
MEDICAL_PRODUCTS = [
    "Atorvastatin 20mg", "Dexamethasone 4mg", "Cetirizine 10mg",
    "Loratadine 10mg", "Paracetamol 500mg", "Ibuprofen 400mg",
    "Losartan 50mg", "Clarithromycin 250mg", "Vitamin C 1000mg",
    "Amlodipine 5mg", "Simvastatin 20mg", "Omeprazole 20mg",
    "Azithromycin 500mg", "Amoxicillin 250mg", "Aspirin 81mg",
    "Captopril 25mg", "Prednisolone 5mg", "Salbutamol 4mg",
    "Metformin 500mg", "Furosemide 40mg"
]

# Mô tả sản phẩm từ SQL query
PRODUCT_DESCRIPTIONS = {
    "Atorvastatin 20mg": "Atorvastatin giúp giảm cholesterol xấu, tăng cholesterol tốt, hỗ trợ sức khỏe tim mạch.",
    "Dexamethasone 4mg": "Dexamethasone là corticosteroid giúp giảm viêm, chống dị ứng và hỗ trợ điều trị nhiều bệnh lý.",
    "Cetirizine 10mg": "Cetirizine giúp giảm các triệu chứng dị ứng như hắt hơi, ngứa mắt, sổ mũi.",
    "Loratadine 10mg": "Loratadine giảm các triệu chứng dị ứng như chảy nước mũi, ngứa mắt, mẩn đỏ trên da.",
    "Paracetamol 500mg": "Paracetamol giúp hạ sốt, giảm đau đầu, đau cơ, và các cơn đau nhẹ đến vừa.",
    "Ibuprofen 400mg": "Ibuprofen giảm viêm, hạ sốt và giảm đau nhẹ đến vừa, hỗ trợ điều trị đau nhức cơ thể.",
    "Losartan 50mg": "Losartan giúp điều hòa huyết áp, bảo vệ tim mạch và phòng biến chứng thận.",
    "Clarithromycin 250mg": "Clarithromycin là kháng sinh điều trị các nhiễm khuẩn đường hô hấp, da và mô mềm.",
    "Vitamin C 1000mg": "Vitamin C giúp tăng cường miễn dịch, chống oxy hóa và hỗ trợ sức khỏe tổng thể.",
    "Amlodipine 5mg": "Amlodipine giúp hạ huyết áp, giảm nguy cơ biến chứng tim mạch và tai biến mạch máu não.",
    "Simvastatin 20mg": "Simvastatin giảm cholesterol xấu, hỗ trợ sức khỏe tim mạch và phòng ngừa bệnh tim.",
    "Omeprazole 20mg": "Omeprazole giảm axit dạ dày, hỗ trợ điều trị viêm loét dạ dày – tá tràng và trào ngược.",
    "Azithromycin 500mg": "Azithromycin là kháng sinh điều trị nhiễm khuẩn đường hô hấp, tai và da.",
    "Amoxicillin 250mg": "Amoxicillin kháng khuẩn phổ rộng, điều trị nhiễm khuẩn đường hô hấp, tai, mũi, họng.",
    "Aspirin 81mg": "Aspirin 81mg hỗ trợ phòng ngừa cục máu đông, đột quỵ và bệnh tim mạch.",
    "Captopril 25mg": "Captopril điều trị cao huyết áp, suy tim và bảo vệ thận ở bệnh nhân tiểu đường.",
    "Prednisolone 5mg": "Prednisolone giảm viêm, chống dị ứng và hỗ trợ điều trị nhiều bệnh tự miễn.",
    "Salbutamol 4mg": "Salbutamol giúp giãn phế quản, cải thiện triệu chứng hen suyễn và khó thở.",
    "Metformin 500mg": "Metformin giúp kiểm soát đường huyết ở bệnh nhân tiểu đường type 2.",
    "Furosemide 40mg": "Furosemide lợi tiểu, hỗ trợ điều trị phù, cao huyết áp và suy tim."
}

# Hàm tạo người dùng
def create_users(num_users):
    roles = ['customer', 'distributor', 'admin']
    users = []
    
    # Tạo superuser
    superuser = User.objects.create_superuser(
        username='admin',
        email='admin@pharmatech.com',
        password='admin123',
        full_name=fake.name(),
        role='admin',
        phone=fake.phone_number()[:15],
        address=fake.address(),
        avatar=None
    )
    users.append(superuser)
    
    # Tạo các người dùng khác
    for _ in range(num_users - 1):
        role = random.choice(roles)
        user = User.objects.create_user(
            username=fake.unique.user_name(),
            email=fake.unique.email(domain='pharmatech.com'),
            password='password123',
            full_name=fake.name(),
            phone=fake.phone_number()[:15],
            address=fake.address(),
            role=role,
            is_active=True,
            avatar=None
        )
        users.append(user)
    return users

# Hàm tạo danh mục
def create_categories():
    categories = []
    for name in MEDICAL_CATEGORIES:
        category = Category.objects.create(
            name=name,
            description=fake.text(max_nb_chars=200).replace('\n', ' ')
        )
        categories.append(category)
    return categories

# Hàm tạo sản phẩm
def create_products(num_products, distributors, categories):
    products = []
    for i, name in enumerate(MEDICAL_PRODUCTS[:num_products], 1):
        product = Product.objects.create(
            distributor=random.choice(distributors),
            name=name,
            description=PRODUCT_DESCRIPTIONS.get(name, fake.text(max_nb_chars=300).replace('\n', ' ')),
            category=random.choice(categories),
            price=Decimal(str(round(random.uniform(50000.0, 2000000.0), 0))),
            stock=random.randint(10, 500),
            image=None,
            is_approved=random.choice([True, False])
        )
        products.append(product)
    return products

# Hàm tạo kho
def create_inventories(products, distributors):
    for product in products:
        Inventory.objects.create(
            distributor=product.distributor,
            product=product,
            quantity=random.randint(5, 200)
        )

# Hàm tạo giỏ hàng
def create_carts(customers):
    carts = []
    for customer in customers:
        cart = Cart.objects.create(user=customer)
        carts.append(cart)
    return carts

# Hàm tạo mục trong giỏ hàng
def create_cart_items(carts, products):
    for cart in carts:
        num_items = random.randint(1, 5)
        selected_products = random.sample(products, min(num_items, len(products)))
        for product in selected_products:
            CartItem.objects.create(
                cart=cart,
                product=product,
                quantity=random.randint(1, 20)
            )

# Hàm tạo đơn hàng
def create_orders(customers, products):
    orders = []
    for customer in customers:
        num_orders = random.randint(1, 3)
        for _ in range(num_orders):
            order = Order.objects.create(
                user=customer,
                order_code=fake.unique.uuid4()[:20],
                total_amount=Decimal('0.00'),
                status=random.choice(['pending', 'processing', 'completed', 'cancelled'])
            )
            num_items = random.randint(1, 4)
            selected_products = random.sample(products, min(num_items, len(products)))
            total = Decimal('0.00')
            for product in selected_products:
                quantity = random.randint(1, 10)
                price = product.price
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    price=price
                )
                total += price * quantity
            order.total_amount = total
            order.save()
            orders.append(order)
    return orders

# Hàm tạo thanh toán
def create_payments(orders):
    for order in orders:
        Payment.objects.create(
            order=order,
            user=order.user,
            amount=order.total_amount,
            payment_method='stripe',
            status=random.choice(['pending', 'completed', 'refunded', 'failed']),
            transaction_id=f"pi_{fake.unique.uuid4()[:30]}",  # Định dạng transaction_id giống Stripe
            paid_at=timezone.now() - timedelta(days=random.randint(0, 30)) if random.choice([True, False]) else None,
            refunded_at=timezone.now() - timedelta(days=random.randint(0, 30)) if random.choice([True, False]) else None
        )

# Hàm tạo token thiết bị
def create_device_tokens(users):
    for user in users:
        DeviceToken.objects.create(
            user=user,
            token=fake.unique.uuid4(),
            device_type=random.choice(['ios', 'android'])
        )

# Hàm chính để chạy seeding
def main():
    # Xóa dữ liệu cũ nếu cần
    User.objects.all().delete()
    Category.objects.all().delete()
    Product.objects.all().delete()
    Inventory.objects.all().delete()
    Cart.objects.all().delete()
    CartItem.objects.all().delete()
    Order.objects.all().delete()
    Payment.objects.all().delete()
    DeviceToken.objects.all().delete()

    # Tạo dữ liệu
    users = create_users(10)  # Tạo 10 người dùng
    customers = [u for u in users if u.role == 'customer']
    distributors = [u for u in users if u.role == 'distributor']
    
    categories = create_categories()  # Tạo danh mục y tế
    products = create_products(20, distributors, categories)  # Tạo 20 sản phẩm
    create_inventories(products, distributors)  # Tạo kho
    carts = create_carts(customers)  # Tạo giỏ hàng
    create_cart_items(carts, products)  # Tạo mục trong giỏ hàng
    orders = create_orders(customers, products)  # Tạo đơn hàng
    create_payments(orders)  # Tạo thanh toán
    create_device_tokens(users)  # Tạo token thiết bị

    print("Dữ liệu giả y tế/dược phẩm đã được tạo thành công!")

if __name__ == "__main__":
    main()