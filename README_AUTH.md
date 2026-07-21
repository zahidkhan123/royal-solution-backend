# SportsHub Authentication Backend

A production-ready authentication backend for SportsHub built with Node.js, Express, TypeScript, MongoDB, and Mongoose.

## 🚀 Features

- **User Registration** with comprehensive validation
- **User Login** with JWT authentication
- **Password Reset Flow** with OTP verification
- **Protected Routes** with JWT middleware
- **Input Validation** using Joi
- **Password Hashing** using bcrypt
- **TypeScript** for type safety
- **Clean Architecture** with modular folder structure

## 📁 Folder Structure

```
backend/
├── src/
│   ├── config/
│   │   └── db.ts                 # MongoDB connection
│   ├── models/
│   │   ├── User.model.ts         # User schema and model
│   │   └── OTP.model.ts          # OTP schema for password reset
│   ├── routes/
│   │   └── auth.routes.ts        # Authentication routes
│   ├── controllers/
│   │   └── auth.controller.ts    # Authentication business logic
│   ├── middlewares/
│   │   ├── auth.middleware.ts    # JWT authentication middleware
│   │   └── validateBody.middleware.ts  # Request validation middleware
│   ├── validators/
│   │   └── auth.validator.ts     # Joi validation schemas
│   ├── utils/
│   │   ├── jwt.ts                # JWT token generation/verification
│   │   └── otp.ts                # OTP generation utilities
│   └── server.ts                 # Express server setup
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies and scripts
└── .env.example                  # Environment variables template
```

## 🛠️ Installation

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory:

   ```env
   PORT=4000
   NODE_ENV=development
   MONGO_URI=mongodb://localhost:27017/sportshub
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=7d
   ```

3. **Run the development server:**

   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

## 📡 API Endpoints

### 1. Register User

**POST** `/api/auth/register`

**Request Body:**

```json
{
  "fullName": "John Doe",
  "phone": "1234567890",
  "email": "john@example.com",
  "password": "password123",
  "confirmPassword": "password123",
  "city": "New York",
  "role": "Player",
  "gender": "Male",
  "favoriteSports": ["cricket", "football"]
}
```

**Response:**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "...",
      "fullName": "John Doe",
      "email": "john@example.com",
      ...
    },
    "token": "jwt_token_here"
  }
}
```

### 2. Login

**POST** `/api/auth/login`

**Request Body:**

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { ... },
    "token": "jwt_token_here"
  }
}
```

### 3. Forgot Password

**POST** `/api/auth/forgot-password`

**Request Body:**

```json
{
  "email": "john@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "message": "OTP has been sent to your email (check console for now)",
  "data": {
    "email": "john@example.com",
    "expiresIn": "5 minutes"
  }
}
```

**Note:** OTP is logged to console. In production, send via email/SMS.

### 4. Verify OTP

**POST** `/api/auth/verify-otp`

**Request Body:**

```json
{
  "email": "john@example.com",
  "otp": "1234"
}
```

**Response:**

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "email": "john@example.com",
    "verified": true
  }
}
```

### 5. Reset Password

**POST** `/api/auth/reset-password`

**Request Body:**

```json
{
  "email": "john@example.com",
  "otp": "1234",
  "newPassword": "newpassword123"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

### 6. Get Profile (Protected)

**GET** `/api/auth/profile`

**Headers:**

```
Authorization: Bearer <jwt_token>
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "fullName": "John Doe",
      ...
    }
  }
}
```

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

## 🔒 Security Features

- Password hashing with bcrypt (12 salt rounds)
- JWT token-based authentication
- Input validation with Joi
- Rate limiting (100 requests per 15 minutes)
- Helmet.js for security headers
- CORS enabled
- Password excluded from responses

## 📝 Validation Rules

### Registration:

- `fullName`: 2-50 characters, required
- `phone`: 10-15 digits, required
- `email`: Valid email format, required, unique
- `password`: Minimum 6 characters, required
- `confirmPassword`: Must match password, required
- `city`: Minimum 2 characters, required
- `role`: Must be one of the valid roles, required
- `gender`: Must be one of the valid genders, required
- `favoriteSports`: Array of strings, optional

### Login:

- `email`: Valid email format, required
- `password`: Required

### OTP:

- `otp`: 4 digits, numbers only
- Expires after 5 minutes

## 🧪 Testing

Use tools like Postman, Insomnia, or curl to test the endpoints.

**Example curl commands:**

```bash
# Register
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
    "favoriteSports": ["cricket"]
  }'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'

# Get Profile (replace TOKEN with actual JWT)
curl -X GET http://localhost:4000/api/auth/profile \
  -H "Authorization: Bearer TOKEN"
```

## 🚨 Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error message here",
  "errors": ["Validation error details"] // Only for validation errors
}
```

## 📦 Dependencies

- **express**: Web framework
- **mongoose**: MongoDB ODM
- **typescript**: Type safety
- **ts-node-dev**: Development server with hot reload
- **dotenv**: Environment variables
- **bcrypt**: Password hashing
- **jsonwebtoken**: JWT tokens
- **joi**: Input validation
- **cors**: Cross-origin resource sharing
- **helmet**: Security headers
- **express-rate-limit**: Rate limiting

## 🎯 Next Steps

1. Add email service for OTP delivery
2. Add SMS service for OTP delivery
3. Implement email verification
4. Add refresh token mechanism
5. Add password strength requirements
6. Implement account lockout after failed attempts
7. Add logging service
8. Add unit and integration tests

## 📄 License

ISC
