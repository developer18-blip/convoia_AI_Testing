# Node.js Express Prisma Backend

This project is a backend application built with Node.js, Express, and Prisma. It provides a structured architecture for managing organizations, users, AI models, and token tracking.

## Project Structure

```
node-express-prisma-backend
├── src
│   ├── controllers          # Contains controllers for handling requests
│   │   ├── organizationController.ts
│   │   ├── userController.ts
│   │   ├── aiModelController.ts
│   │   └── tokenController.ts
│   ├── routes               # Contains route definitions
│   │   ├── organizationRoutes.ts
│   │   ├── userRoutes.ts
│   │   ├── aiModelRoutes.ts
│   │   └── tokenRoutes.ts
│   ├── services             # Contains business logic
│   │   ├── organizationService.ts
│   │   ├── userService.ts
│   │   ├── aiModelService.ts
│   │   └── tokenService.ts
│   ├── middleware           # Contains middleware functions
│   │   ├── authMiddleware.ts
│   │   ├── errorHandler.ts
│   │   └── loggingMiddleware.ts
│   ├── config               # Contains configuration files
│   │   ├── database.ts
│   │   ├── prisma.ts
│   │   └── index.ts
│   ├── prisma               # Contains Prisma schema
│   │   └── schema.prisma
│   ├── app.ts               # Main entry point of the application
│   └── server.ts            # Starts the server
├── package.json             # NPM configuration file
├── tsconfig.json            # TypeScript configuration file
└── README.md                # Project documentation
```

## Setup Instructions

1. **Clone the repository:**
   ```
   git clone <repository-url>
   cd node-express-prisma-backend
   ```

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Set up the database:**
   - Configure your database connection in `src/config/database.ts`.
   - Run the Prisma migrations to set up your database schema:
     ```
     npx prisma migrate dev --name init
     ```

4. **Start the application:**
   ```
   npm run start
   ```

## Usage

- The API provides endpoints for managing organizations, users, AI models, and tokens.
- Refer to the individual route files for specific endpoint details.

## API Documentation

- **Organizations**
  - Create, retrieve, update, and delete organizations.

- **Users**
  - Create, retrieve, update, and delete users.

- **AI Models**
  - Create, retrieve, update, and delete AI models.

- **Tokens**
  - Generate, validate, and revoke tokens.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.