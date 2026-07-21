# Quick Start Guide - SportsHub Authentication Backend

## 🚀 Getting Started in 3 Steps

### Step 1: Install Dependencies

```bash
cd backend
npm install
```

### Step 2: Configure Environment

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` and set your MongoDB connection string:

```env
MONGO_URI=mongodb://localhost:27017/sportshub
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
```

### Step 3: Run the Server

```bash
npm run dev
```

The server will start on `http://localhost:4000`

## 📋 Test the API

### 1. Register a User

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "phone": "1234567890",
    "email": "john@example.com",
    "password": "password123",
    "confirmPassword": "password123",
    "city": "New York",
    "role": "Player",
    "gender": "Male",
    "favoriteSports": ["cricket", "football"]
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

Save the `token` from the response.

### 3. Get Profile (Protected Route)

```bash
curl -X GET http://localhost:4000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Forgot Password

```bash
curl -X POST http://localhost:4000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com"
  }'
```

Check the console for the OTP (4-digit code).

### 5. Verify OTP

```bash
curl -X POST http://localhost:4000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "otp": "1234"
  }'
```

### 6. Reset Password

```bash
curl -X POST http://localhost:4000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "otp": "1234",
    "newPassword": "newpassword123"
  }'
```

## 📁 Complete File Structure

```
backend/
├── src/
│   ├── config/
│   │   └── db.ts                      # MongoDB connection
│   ├── models/
│   │   ├── User.model.ts              # User schema
│   │   └── OTP.model.ts               # OTP schema
│   ├── routes/
│   │   └── auth.routes.ts             # Auth routes
│   ├── controllers/
│   │   └── auth.controller.ts         # Auth business logic
│   ├── middlewares/
│   │   ├── auth.middleware.ts         # JWT middleware
│   │   └── validateBody.middleware.ts  # Validation middleware
│   ├── validators/
│   │   └── auth.validator.ts          # Joi schemas
│   ├── utils/
│   │   ├── jwt.ts                     # JWT utilities
│   │   └── otp.ts                     # OTP utilities
│   └── server.ts                      # Express server
├── tsconfig.json                       # TypeScript config
├── package.json                        # Dependencies
├── .env.example                        # Environment template
└── README_AUTH.md                      # Full documentation
```

## ✅ Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server (after build)
- `npm test` - Run tests

## 🎯 API Endpoints Summary

| Method | Endpoint                    | Description                | Auth Required |
| ------ | --------------------------- | -------------------------- | ------------- |
| POST   | `/api/auth/register`        | Register new user          | No            |
| POST   | `/api/auth/login`           | Login user                 | No            |
| POST   | `/api/auth/forgot-password` | Request password reset OTP | No            |
| POST   | `/api/auth/verify-otp`      | Verify OTP                 | No            |
| POST   | `/api/auth/reset-password`  | Reset password with OTP    | No            |
| GET    | `/api/auth/profile`         | Get user profile           | Yes           |
| GET    | `/health`                   | Health check               | No            |

## 🔐 User Roles

- `Player`
- `Team Owner`
- `Ground Owner`
- `Umpire`
- `Tournament Organizer`

## 👤 Gender Options

- `Male`
- `Female`
- `Other`

## 📝 Notes

- OTP expires after 5 minutes
- OTP is logged to console (for development)
- JWT tokens expire based on `JWT_EXPIRES_IN` (default: 7 days)
- Passwords are hashed with bcrypt (12 salt rounds)
- Rate limiting: 100 requests per 15 minutes per IP

For detailed documentation, see `README_AUTH.md`
