# SpendWise Pro 💰🤖

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js)
![Python](https://img.shields.io/badge/Python-Flask-3776AB?logo=python)

**AI-powered Personal Finance Management Platform** featuring intelligent expense tracking, self-learning smart categorization, recurring transactions, financial goals, budgeting, analytics, ML-powered forecasting, anomaly detection, AI insights, and secure cloud deployment.

---

## 🚀 Live Demo

- Frontend: https://spendwise-pro-nu.vercel.app/

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Screenshots](#screenshots)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [API Overview](#api-overview)
- [Deployment](#deployment)
- [Author](#author)

---

## Features

| Area                       | Capabilities                                                                |
| -------------------------- | --------------------------------------------------------------------------- |
| **Expense Tracking**       | Add, update, and delete expenses with categories, notes, and dates          |
| **Budget Management**      | Set overall and category budgets with real-time utilization tracking        |
| **Analytics Dashboard**    | Monthly trends, category breakdowns, top spending categories, and summaries |
| **AI Financial Assistant** | Natural-language queries about spending, budgets, forecasts, and profile    |
| **Spending Forecasting**   | ML-powered next-month spending predictions                                  |
| **Anomaly Detection**      | Detect unusual spending behavior using Isolation Forest                     |
| **Intelligent Insights**   | Auto-generated insights and savings recommendations                         |
| **Financial Health**       | Dynamic health score with personalized recommendations                      |
| **Notifications**          | In-app alerts for budget and spending events                                |
| **Authentication**         | JWT-based authentication with email verification and password reset         |
| **Profile & Avatar**       | Profile management with secure avatar upload                                |
| **Security**               | Helmet, rate limiting, input validation, and CORS hardening                 |
| **Deployment**             | Production-ready cloud deployment using Vercel and Railway                  |

---

## Tech Stack

### Frontend

- React 19 + TypeScript
- Vite
- Tailwind CSS
- React Router
- Axios
- Recharts

### Backend

- Node.js + Express.js
- MySQL 8
- JWT Authentication
- bcrypt
- Multer
- Nodemailer
- Helmet
- express-rate-limit
- express-validator

### Machine Learning

- Flask
- Scikit-learn
  - Linear Regression
  - Isolation Forest
- Pandas
- NumPy

---

## Architecture

```mermaid
flowchart TB
    subgraph Client
        FE["Frontend<br/>React + Vite"]
    end

    subgraph Server
        BE["Backend API<br/>Node.js + Express"]
        ML["ML Service<br/>Flask + Scikit-learn"]
    end

    subgraph Data
        DB[("Railway MySQL")]
    end

    FE -->|REST /api| BE
    BE --> DB
    BE -->|Forecast & Anomaly APIs| ML
```

| Service     | Platform         |
| ----------- | ---------------- |
| Frontend    | Vercel           |
| Backend API | Railway          |
| ML Service  | Railway / Render |
| Database    | Railway MySQL    |

---

## Project Structure

```text
SpendWise-Pro/
├── Backend/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── schema/
│   └── uploads/
├── Frontend/
│   └── src/
├── ML-Service/
│   ├── app.py
│   ├── model.py
│   └── anomaly.py
├── screenshots/
├   ├── home.png
├   ├── login.png
├   ├── dashboard.png
├   ├── transactions.png
├   ├── budgets.png
├   ├── analytics.png
├   ├── chatbot.png
├   └── profile.png
├── .env.example
└── README.md

```

## 📸 Screenshots

### 🏠 Landing Page
![Landing Page](screenshots/home.png)

### 🔐 Login
![Login](screenshots/login.png)

### 📊 Dashboard
![Dashboard](screenshots/dashboard.png)

### 💰 Expense Management
![Expense Management](screenshots/transactions.png)

### 🎯 Budget Management
![Budget Management](screenshots/budgets.png)

### 📈 Analytics Dashboard
![Analytics Dashboard](screenshots/analytics.png)

### 🤖 AI Financial Assistant
![AI Financial Assistant](screenshots/chatbot.png)

### 👤 User Profile
![User Profile](screenshots/profile.png)

---

## Local Development

### Database

```bash
mysql -u root -p -e "CREATE DATABASE spendwise;"
mysql -u root -p spendwise < Backend/schema/schema.sql
```

### Backend

```bash
cd Backend
npm install
npm start
```

Runs on: `http://localhost:5000`

### ML Service

```bash
cd ML-Service
pip install -r requirements.txt
python app.py
```

Runs on: `http://localhost:5001`

### Frontend

```bash
cd Frontend
npm install
npm run dev
```

Runs on: `http://localhost:5173`

---

## Environment Variables

```env
MYSQL_ROOT_PASSWORD=
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_HOST=
DB_PORT=

JWT_SECRET=

NODE_ENV=

BACKEND_URL=
FRONTEND_URL=
ML_SERVICE_URL=

CORS_ORIGIN=


GOOGLE_CLIENT_ID=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### Frontend

```env
VITE_API_BASE_URL=
VITE_GOOGLE_CLIENT_ID=
```

---

## API Overview

| Prefix               | Purpose             |
| -------------------- | ------------------- |
| `/api/auth`          | Authentication      |
| `/api/expenses`      | Expense CRUD        |
| `/api/categories`    | Category CRUD       |
| `/api/budgets`       | Budget CRUD         |
| `/api/analytics`     | Dashboard analytics |
| `/api/forecast`      | ML forecasting      |
| `/api/anomaly`       | Anomaly detection   |
| `/api/ai`            | AI assistant        |
| `/api/intelligence`  | Recommendations     |
| `/api/notifications` | Notifications       |
| `/api/user`          | Avatar management   |

### ML Service Endpoints

| Method | Endpoint    |
| ------ | ----------- |
| GET    | `/health`   |
| POST   | `/forecast` |
| POST   | `/anomaly`  |

---

## Deployment

The application is deployed using modern cloud infrastructure:

- **Frontend:** Vercel
- **Backend API:** Railway
- **ML Service:** Railway
- **Database:** Railway MySQL

---

## Author

**Ishaan Saxena**

- GitHub: https://github.com/IshaanSaxena2005
- Project: SpendWise Pro
- Full-stack AI-powered personal finance platform

---