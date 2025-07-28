# 💊 Pharmatech

**Pharmatech** is a medical e-commerce platform integrated with the **Gemini 2.0 Flash AI chatbot**. It allows users to purchase pharmaceutical products, understand medical terminology, and receive basic health advice *(not a substitute for professional medical diagnosis)*.

The platform includes user role management, product browsing, cart and order processing, secure payments, and real-time AI chatbot support. It is built with **Django**, **React Native**, and **Firebase** for a responsive and intelligent healthcare experience.



## 🚀 Features

### 🧑‍⚕️ Customer Features
- **User Account**: Register, log in, and manage personal information.
- **Product Management**: Search, filter, and view detailed product info.
- **Cart & Orders**: Add items to cart, place orders, and make secure payments.
- **AI Chatbot**: Ask questions and receive preliminary health guidance.

### 🏬 Distributor Features
- **Account Management**: Register, log in, and update personal details.
- **Product Management**: Add, edit, and delete products.
- **Sales Tracking**: View revenue stats and best-selling products.

### 🔐 Admin Features
- **User Management**: Manage customers and distributors.
- **Product Approval**: Approve or reject new products submitted by distributors.
- **System Analytics**: View platform metrics like visits, orders, and chatbot usage.



## 🤖 AI Integration

- **Gemini 2.0 Flash**: Real-time explanations of medical terms and health guidance using a multimodal Transformer model with Chain-of-Thought reasoning.
- **Multimodal Support**: Accepts both text and images (e.g., prescription scans) to provide rich and contextual responses.



## 🧱 Technology Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Django (Python), Django REST Framework, MySQL (local), PostgreSQL (Onrender) |
| **Frontend** | React Native (Android & iOS) |
| **AI** | Gemini 2.0 Flash via Firebase AI Logic SDK |
| **Realtime** | Firebase Realtime Database |
| **Deployment** | Backend deployed via Docker on Onrender |



## 🧭 Architecture

Pharmatech follows a **3-tier architecture**:

1. **Presentation Layer**: React Native mobile app
2. **Application Layer**: Django REST APIs with business logic and AI integration
3. **Data Layer**: MySQL/PostgreSQL (structured data) + Firebase Realtime DB (real-time data)



## 📦 Usage Scenarios

### 👤 Customers
- Register and log in
- Browse and search products
- Add to cart and complete orders
- Ask AI chatbot:  
  _"What does 'antibiotic' mean?"_  
  _"Upload a prescription for analysis"_

### 🛒 Distributors
- Manage their product listings
- Track performance and revenue

### 🛡️ Admins
- Approve submitted products
- Manage all users
- View system reports and analytics



⚠️ **Disclaimer**: The AI chatbot in Pharmatech is intended for informational purposes only and does not replace professional medical consultation.
