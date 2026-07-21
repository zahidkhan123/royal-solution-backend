# Authentication API Routes Documentation

Complete documentation of all authentication endpoints with request examples.

## Base URL

```
http://localhost:4000/api/auth
```

---

## 1. Register User

**Endpoint:** `POST /api/auth/register`

**Description:** Register a new user account

**Request Body:**

```json
{
  "fullName": "John Doe",
  "phone": "1234567890",
  "email": "john.doe@example.com",
  "password": "password123",
  "confirmPassword": "password123",
  "city": "New York",
  "role": ["Player", "Team Owner"],
  "gender": "Male",
  "favoriteSports": ["cricket", "football", "basketball"]
}
```

**Field Descriptions:**

- `fullName` (string, required): User's full name (2-50 characters)
- `phone` (string, required): Phone number (10-15 digits)
- `email` (string, required): Valid email address (must be unique)
- `password` (string, required): Password (minimum 6 characters)
- `confirmPassword` (string, required): Must match password exactly
- `city` (string, required): User's city (minimum 2 characters)
- `role` (array, required): Array of roles - at least one role required. Valid values: `"Player"`, `"Team Owner"`, `"Ground Owner"`, `"Umpire"`, `"Tournament Organizer"`. Users can have multiple roles (e.g., `["Player", "Team Owner"]`)
- `gender` (string, required): One of: `"Male"`, `"Female"`, `"Other"`
- `favoriteSports` (array, optional): Array of sport names (default: `[]`)

**Success Response (201):**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "fullName": "John Doe",
      "phone": "1234567890",
      "email": "john.doe@example.com",
      "city": "New York",
      "role": ["Player", "Team Owner"],
      "gender": "Male",
      "favoriteSports": ["cricket", "football", "basketball"],
      "isVerified": false,
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (400):**

```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Full name must be at least 2 characters",
    "Passwords do not match"
  ]
}
```

---

## 2. Login User

**Endpoint:** `POST /api/auth/login`

**Description:** Authenticate user and receive JWT token

**Request Body:**

```json
{
  "email": "john.doe@example.com",
  "password": "password123"
}
```

**Field Descriptions:**

- `email` (string, required): User's email address
- `password` (string, required): User's password

**Success Response (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "fullName": "John Doe",
      "phone": "1234567890",
      "email": "john.doe@example.com",
      "city": "New York",
      "role": ["Player", "Team Owner"],
      "gender": "Male",
      "favoriteSports": ["cricket", "football"],
      "isVerified": false,
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (401):**

```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

## 3. Forgot Password

**Endpoint:** `POST /api/auth/forgot-password`

**Description:** Request a 4-digit OTP for password reset (OTP is logged to console)

**Request Body:**

```json
{
  "email": "john.doe@example.com"
}
```

**Field Descriptions:**

- `email` (string, required): User's email address

**Success Response (200):**

```json
{
  "success": true,
  "message": "OTP has been sent to your email (check console for now)",
  "data": {
    "email": "john.doe@example.com",
    "expiresIn": "5 minutes"
  }
}
```

**Note:** The OTP will be logged to the server console. In production, this should be sent via email/SMS.

**Error Response (404):**

```json
{
  "success": false,
  "message": "User not found with this email"
}
```

---

## 4. Verify OTP

**Endpoint:** `POST /api/auth/verify-otp`

**Description:** Verify the OTP sent for password reset

**Request Body:**

```json
{
  "email": "john.doe@example.com",
  "otp": "1234"
}
```

**Field Descriptions:**

- `email` (string, required): User's email address
- `otp` (string, required): 4-digit OTP code (numbers only)

**Success Response (200):**

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "email": "john.doe@example.com",
    "verified": true
  }
}
```

**Error Response (400):**

```json
{
  "success": false,
  "message": "Invalid OTP"
}
```

**Error Response (400) - Expired:**

```json
{
  "success": false,
  "message": "OTP has expired. Please request a new one."
}
```

---

## 5. Reset Password

**Endpoint:** `POST /api/auth/reset-password`

**Description:** Reset user password using verified OTP

**Request Body:**

```json
{
  "email": "john.doe@example.com",
  "otp": "1234",
  "newPassword": "newpassword123"
}
```

**Field Descriptions:**

- `email` (string, required): User's email address
- `otp` (string, required): 4-digit OTP code (must match the one sent)
- `newPassword` (string, required): New password (minimum 6 characters)

**Success Response (200):**

```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

**Error Response (400):**

```json
{
  "success": false,
  "message": "Invalid OTP"
}
```

**Error Response (400) - Expired:**

```json
{
  "success": false,
  "message": "OTP has expired. Please request a new one."
}
```

**Error Response (404):**

```json
{
  "success": false,
  "message": "User not found"
}
```

---

## 6. Get User Profile

**Endpoint:** `GET /api/auth/profile`

**Description:** Get authenticated user's profile information

**Authentication:** Required (Bearer Token)

**Headers:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Body:** None

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "fullName": "John Doe",
      "phone": "1234567890",
      "email": "john.doe@example.com",
      "city": "New York",
      "role": ["Player", "Team Owner"],
      "gender": "Male",
      "favoriteSports": ["cricket", "football", "basketball"],
      "profileImage": "https://example.com/profile.jpg",
      "bio": "Passionate cricket player",
      "isVerified": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Response (401):**

```json
{
  "success": false,
  "message": "Not authorized to access this route. Please provide a token."
}
```

**Error Response (401) - Invalid Token:**

```json
{
  "success": false,
  "message": "Not authorized to access this route. Invalid token."
}
```

---

## User Roles

The `role` field is an **array** that accepts one or more of the following values:

- `"Player"`
- `"Team Owner"`
- `"Ground Owner"`
- `"Umpire"`
- `"Tournament Organizer"`

**Examples:**

- Single role: `["Player"]`
- Multiple roles: `["Player", "Team Owner"]`
- Multiple roles: `["Player", "Team Owner", "Tournament Organizer"]`

**Note:** Users can have multiple roles simultaneously. For example, a user can be both a Player and a Team Owner, or a Player and a Tournament Organizer.

## Gender Options

Valid values for the `gender` field:

- `"Male"`
- `"Female"`
- `"Other"`

---

## cURL Examples

### Register User

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "John Doe",
    "phone": "1234567890",
    "email": "john.doe@example.com",
    "password": "password123",
    "confirmPassword": "password123",
    "city": "New York",
    "role": ["Player", "Team Owner"],
    "gender": "Male",
    "favoriteSports": ["cricket", "football"]
  }'
```

### Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "password123"
  }'
```

### Forgot Password

```bash
curl -X POST http://localhost:4000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com"
  }'
```

### Verify OTP

```bash
curl -X POST http://localhost:4000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "otp": "1234"
  }'
```

### Reset Password

```bash
curl -X POST http://localhost:4000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "otp": "1234",
    "newPassword": "newpassword123"
  }'
```

### Get Profile (Protected)

```bash
curl -X GET http://localhost:4000/api/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

---

## Response Status Codes

- `200` - Success
- `201` - Created (Registration)
- `400` - Bad Request (Validation errors, invalid OTP)
- `401` - Unauthorized (Invalid credentials, missing/invalid token)
- `404` - Not Found (User not found)
- `500` - Internal Server Error

---

## Notes

1. **JWT Token**: After successful registration or login, save the `token` from the response. Use it in the `Authorization` header for protected routes.\*\*

2. **OTP Expiry**: OTP codes expire after 5 minutes. Request a new OTP if expired.

3. **Password Requirements**:

   - Minimum 6 characters
   - Passwords are hashed using bcrypt (12 salt rounds)

4. **Email Uniqueness**: Email addresses must be unique across all users.

5. **Token Format**: Include the token in the Authorization header as: `Bearer <token>`

6. **Rate Limiting**: API is rate-limited to 100 requests per 15 minutes per IP address.

---

## Testing with Postman/Insomnia

### Collection Setup

1. Create a new collection named "SportsHub Auth API"
2. Set base URL variable: `{{baseUrl}}` = `http://localhost:4000`
3. Create environment variables:
   - `token` - Store JWT token after login/register

### Request Examples

**Register:**

- Method: `POST`
- URL: `{{baseUrl}}/api/auth/register`
- Body: JSON (use examples above)

**Login:**

- Method: `POST`
- URL: `{{baseUrl}}/api/auth/login`
- Body: JSON
- Tests: Save token to environment variable

**Get Profile:**

- Method: `GET`
- URL: `{{baseUrl}}/api/auth/profile`
- Headers: `Authorization: Bearer {{token}}`

---

## Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "message": "Error message here",
  "errors": ["Additional validation errors"] // Only for validation errors
}
```

In development mode, error responses may also include a `stack` field with the error stack trace.
