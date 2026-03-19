# Convoia AI Backend

A production-ready backend for an AI SaaS platform that connects multiple LLM models with enterprise-grade architecture.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ LTS
- PostgreSQL 14+
- npm or yarn

### Installation & Setup

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Environment Variables**
```bash
cp .env.example .env
```

Then edit `.env` with your credentials:
```env
PORT=5000
DATABASE_URL="postgresql://user:password@localhost:5432/convoia_ai"
JWT_SECRET="your-secret-key-change-in-production"
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="..."
```

3. **Set Up Database**
```bash
# Run migrations
npm run db:push

# Seed AI models and data
npm run db:seed
```

4. **Start Development Server**
```bash
npm run dev
```

Server will start at `http://localhost:5000`

## 📋 Available Scripts

```bash
# Development
npm run dev              # Start with hot reload

# Database
npm run db:push         # Push schema to database
npm run db:migrate      # Create new migration
npm run db:seed         # Seed with AI models
npm run db:setup        # db:push + db:seed

# Production
npm run build           # Compile TypeScript
npm run start           # Run compiled version

# Tools
npm run prisma:studio   # Open Prisma Studio (DB viewer)
npm run lint            # Run ESLint
npm run format          # Format code with Prettier
```

## 🏗️ Project Structure

```
src/
├── config/          # Configuration files
│   ├── env.ts       # Environment variables
│   ├── db.ts        # Prisma client
│   └── logger.ts    # Winston logger
├── middleware/      # Express middleware
│   ├── authMiddleware.ts      # JWT authentication
│   ├── errorHandler.ts        # Error handling
│   ├── rateLimiter.ts         # Rate limiting
│   └── loggingMiddleware.ts   # Request logging
├── controllers/     # Request handlers
│   ├── authController.ts      # Auth endpoints
│   ├── aiController.ts        # AI query endpoints
│   ├── usageController.ts     # Usage statistics
│   └── adminController.ts     # Admin dashboard
├── services/        # Business logic
│   ├── authService.ts         # User authentication
│   └── aiGatewayService.ts    # AI model routing
├── routes/          # Route definitions
│   ├── authRoutes.ts
│   ├── aiRoutes.ts
│   ├── usageRoutes.ts
│   └── adminRoutes.ts
├── utils/           # Utility functions
│   ├── validators.ts          # Input validation
│   ├── token.ts               # JWT utilities
│   └── tokenCost.ts           # Cost calculation
├── types/           # TypeScript interfaces
│   └── index.ts
└── server.ts        # Main application

prisma/
└── schema.prisma    # Database schema

scripts/
└── seed.ts          # Database seeding

```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication.

### Register
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "organizationName": "My Company" (optional)
}
```

### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

Response includes JWT token for subsequent requests:
```bash
Authorization: Bearer <token>
```

## 🤖 AI Model Routes

### Query Single Model
```bash
POST /api/ai/query
Authorization: Bearer <token>

{
  "model": "gpt-4-turbo",
  "prompt": "Explain quantum computing",
  "temperature": 0.7,
  "maxTokens": 2000
}
```

### Compare Multiple Models
```bash
POST /api/ai/compare
Authorization: Bearer <token>

{
  "models": ["gpt-4-turbo", "claude-3-opus", "gemini-pro"],
  "prompt": "What is AI?",
  "temperature": 0.7
}
```

## 📊 Usage & Analytics

### Get User Usage Stats
```bash
GET /api/usage/user
Authorization: Bearer <token>

Query params:
- startDate: ISO date string
- endDate: ISO date string
```

### Daily Usage
```bash
GET /api/usage/daily?days=30
Authorization: Bearer <token>
```

### Organization Usage
```bash
GET /api/usage/organization
Authorization: Bearer <token>
```

## 👨‍💼 Admin Dashboard

```bash
GET /api/admin/stats
Authorization: Bearer <admin-token>

GET /api/admin/users?page=1&limit=20
Authorization: Bearer <admin-token>

GET /api/admin/organizations?page=1&limit=20
Authorization: Bearer <admin-token>

GET /api/admin/health
Authorization: Bearer <admin-token>
```

## 🗄️ Supported AI Models

### OpenAI
- GPT-4 Turbo
- GPT-4
- GPT-3.5 Turbo

### Anthropic
- Claude 3 Opus
- Claude 3 Sonnet
- Claude 3 Haiku

### Google
- Gemini Pro
- Gemini Pro Vision

### Mistral
- Mistral Large
- Mistral Medium

### DeepSeek
- DeepSeek Coder

## 💰 Pricing & Billing

The system tracks token usage and calculates costs based on model-specific pricing:

```typescript
// Cost calculation (automatic)
const inputCost = (inputTokens / 1000) * modelInputPrice;
const outputCost = (outputTokens / 1000) * modelOutputPrice;
const totalCost = inputCost + outputCost;
```

## 🔄 Rate Limiting

- **General API**: 100 requests per 15 minutes
- **Auth Endpoints**: 5 requests per 15 minutes
- **AI Query**: 30 requests per minute

## 🗂️ Database Schema

Key models:
- **User**: Individual user accounts
- **Organization**: Company/team account
- **AIModel**: Supported AI models with pricing
- **UsageLog**: Every API query logged
- **Subscription**: Billing plans
- **BillingRecord**: Payment tracking
- **APIKey**: Programmatic access

## 🔧 Configuration

### Environment Variables
```env
# Server
NODE_ENV=development
PORT=5000

# Database
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRE=7d

# API Keys
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
MISTRAL_API_KEY=...

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN=http://localhost:3000
```

## 🐛 Error Handling

All errors follow a consistent format:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

HTTP Status Codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `429`: Too Many Requests
- `500`: Server Error

## 📝 Logging

All requests are logged to:
- **Console**: Real-time in development
- **logs/app.log**: General application logs
- **logs/error.log**: Error-only logs

Log levels: `error`, `warn`, `info`, `debug`

## 🚀 Deployment

### Build
```bash
npm run build
```

### Start Production Server
```bash
NODE_ENV=production npm start
```

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/server.js"]
```

## 🧪 Testing

```bash
npm test
```

## 📚 API Documentation

Visit `/api` endpoints after starting the server for detailed documentation.

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run linting: `npm run lint`
4. Format code: `npm run format`
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file

## 🆘 Support

For issues and questions, please create an issue on GitHub.

---

**Built with ❤️ for AI SaaS platforms**
