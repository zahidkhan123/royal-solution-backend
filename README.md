# SportsConnect Backend

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your configuration:
```bash
cp .env.example .env
```

3. Make sure MongoDB is running locally or update `MONGODB_URI` in `.env`

4. Configure AWS S3 credentials in `.env` for file uploads

5. Run the server:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)
- `PUT /api/auth/profile` - Update profile (protected)

### Form Schemas
- `GET /api/form-schema?sport={sport}&type={listingType}` - Get form schema
- `GET /api/form-schema/all` - Get all form schemas
- `POST /api/form-schema` - Create form schema (protected, organizer only)
- `PUT /api/form-schema/:id` - Update form schema (protected, organizer only)

### Listings
- `GET /api/listings` - Get all listings (with filters)
- `GET /api/listings/my-listings` - Get user's listings (protected)
- `GET /api/listings/:id` - Get listing by ID
- `POST /api/listings` - Create listing (protected)
- `PUT /api/listings/:id` - Update listing (protected)
- `DELETE /api/listings/:id` - Delete listing (protected)

### Uploads
- `POST /api/upload/presigned-url` - Get S3 presigned URL (protected)
- `DELETE /api/upload/:key` - Delete file from S3 (protected)

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile (protected)

### Reviews
- `GET /api/reviews/listing/:listingId` - Get reviews for listing
- `POST /api/reviews` - Create review (protected)
- `PUT /api/reviews/:id` - Update review (protected)
- `DELETE /api/reviews/:id` - Delete review (protected)

### Favorites
- `GET /api/favorites` - Get user favorites (protected)
- `POST /api/favorites/:listingId` - Add favorite (protected)
- `DELETE /api/favorites/:listingId` - Remove favorite (protected)
