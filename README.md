# 💊 PharmaTech – AI-Powered E-Health Commerce Platform

**PharmaTech** is an intelligent backend platform for pharmaceutical e-commerce, augmented by a **contextual health guidance chatbot** powered by **Gemini 2.0 Flash** and the **Retrieval-Augmented Generation (RAG)** mechanism.

PharmaTech bridges healthcare and AI by enabling customers to explore medical products, get real-time contextual answers, and make informed purchasing decisions — all while maintaining a strong ethical stance: _AI is advisory, not diagnostic_.



##  Academic Summary

> **PharmaTech** (Django 5.2, Oct 2025) is a multi-role backend system embedding a **Retrieval-Augmented Generation (RAG)** chatbot into a pharmaceutical marketplace. Designed to enhance **accessibility**, **trust**, and **user-centric health guidance**, the system integrates:
>
> - A **Gemini 2.0 Flash** LLM for multimodal health queries (text, prescription images).
> - A hybrid **RAG pipeline** with **ChromaDB**, **web scraping**, and **context-aware prompt engineering**.
> - A layered architecture with role-specific access: customers, distributors, and admins.
> - Real-time interaction via **WebSocket + Firebase Realtime DB**.
>
> The RAG pipeline follows a 3-stage methodology:
>
> 1. **Ingestion**: Asynchronous web scraping from trusted sources (e.g., WHO), Markdown parsing, and vector indexing (10,000 char cap).
> 2. **Retrieval**: Top-K semantic search (k=2) using LlamaIndex + Gemini embedding, constrained to 4,000 chars with up to 4-turn memory.
> 3. **Generation**: Prompting Gemini under ethical guardrails, no-diagnosis instruction, and fallback logic for out-of-domain queries.
>
>  All chatbot responses are strictly informational and adhere to ethical LLM boundaries.



##  Core Features

###  Customers
-  Register, log in, manage profile
-  Browse and search approved products
-  Add to cart, place orders, apply discounts
-  Real-time AI chatbot for medical guidance via WebSocket or REST
-  Ask things like:
  - _"What is paracetamol used for?"_
  - _"Is it safe to take vitamin C with antibiotics?"_

###  Distributors
-  Manage their own products and inventory
-  Track sales performance and top-selling items
-  Handle bulk inventory operations

###  Admins
-  Manage all users and their roles
-  Approve submitted products
-  Access system-wide analytics and chatbot usage


##  AI & RAG Architecture

| Layer         | Component                              |
|--------------|------------------------------------------|
| **LLM**       | Gemini 2.0 Flash (text + image capable) |
| **RAG Flow**  | LlamaIndex + ChromaDB Vector Store      |
| **Context**   | Web-scraped medical sources (Markdown)  |
| **Embedding** | Gemini Embedding 001                    |
| **Prompting** | Context-aware, instruction-guarded      |
| **Heuristics**| Extracts top-3 sentences for clarity    |
| **Storage**   | Firebase Realtime DB + Redis Channels   |
| **Security**  | Role-based access, OAuth2, atomic DB ops|


##  Tech Stack

| Layer              | Technology                                      |
|-------------------|--------------------------------------------------|
| **Backend**        | Django 5.2, Django REST Framework               |
| **AI / Vector DB** | Gemini API, ChromaDB, LlamaIndex                |
| **Database**       | MySQL (dev) / PostgreSQL (prod), Firebase       |
| **Realtime**       | Django Channels, Firebase Realtime DB          |
| **Notifications**  | Firebase Cloud Messaging (FCM)                 |
| **Payment**        | Stripe Checkout                                 |
| **Frontend**       | React Native (Android/iOS)                      |
| **DevOps**         | Docker, Render.com                              |



##  Realtime Chatbot API

-  **WebSocket**: `ws/chat/<conversation_id>/`
-  Supports:
  - Contextual recall of past 4 messages
  - Chat history stored per-user in Firebase
-  Prompts are enriched with vector-retrieved medical content before Gemini generation


##  System Analytics (Admin)

- Total users, revenue, order count
- Product approval queue
- Chatbot interaction volume
- Trending products & categories


##  Sample User Flows

### Ask about a drug  
_User_: “What is ibuprofen?”  
 AI: _“Ibuprofen is a non-steroidal anti-inflammatory drug used to reduce fever and relieve pain...”_


##  System Architecture

```text
 Mobile App (React Native)
        │
        ▼
 OAuth2 Auth Layer
        │
        ▼
 Django Backend — REST + WebSocket (Channels)
        │
        ├─  Gemini Chatbot (LLM API)
        ├─  Vector Retrieval (ChromaDB, LlamaIndex)
        ├─  Notifications (FCM)
        ├─  Payment (Stripe)
        └─  Database (PostgreSQL + Firebase)
```


##  Deployment

- **Backend**: Dockerized + Deployed on Render.com
- **Frontend**: React Native Expo (iOS & Android)
- **Realtime**: Firebase Realtime DB, Redis (Channels Layer)
- **Tasks**: Celery for background scraping & email jobs


##  Ethical Disclaimer

PharmaTech is **not a diagnostic tool**. All AI chatbot responses are informational and should **never** replace professional medical advice or clinical consultation.


##  Future Directions

- Federated learning for personalized embeddings
- Enhanced multimodal input (prescription OCR)
- Expansion to other medical verticals (teleconsultation)

---
  
_Developed by Nguyen Phong Phu._
