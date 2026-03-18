# Tutorial: Creating a Node.js REST API with Nest.js and TypeScript

This tutorial will guide you on how to create a Node.js REST API with the Nest.js framework and TypeScript, and generate a Swagger JSON API specification.

## Prerequisites

Before we begin, make sure you have the following installed on your machine:

- Node.js and npm
- TypeScript

You can install TypeScript globally with the following command:

```bash
npm install -g typescript
```

## Step 1: Installing Nest.js CLI

Nest.js provides a command-line interface (CLI) to easily create and manage your Nest.js projects. Install it globally using npm:

```bash
npm install -g @nestjs/cli
```

## Step 2: Creating a New Nest.js Project

Create a new Nest.js project by using the following command:

```bash
nest new my-api
```

The `nest new` command will create a new directory `my-api` with all the necessary files to start building your Nest.js application.

## Step 3: Installing Required Dependencies

You'll need to install the `@nestjs/swagger` and `swagger-ui-express` packages. Navigate to the root of your project and install these dependencies:

```bash
cd my-api
npm install @nestjs/swagger swagger-ui-express
```

## Step 4: Creating a Sample API Endpoint

Now, let's create a simple API endpoint. For this example, we'll create a simple CRUD for managing `books`.

### 4.1 Create the Books Module

Generate a new module, controller and service for `books` using Nest.js CLI:

```bash
nest generate module books
nest generate controller books
nest generate service books
```

This will generate necessary files and also update the app.module.ts file to include the BooksModule.

### 4.2 Define the Book Entity

In `books` directory, create a file named `book.entity.ts` and define your Book entity:

```typescript
export class Book {
  id: number;
  title: string;
  author: string;
  publishedDate: string;
}
```

### 4.3 Define the Books Service

Update `books.service.ts` to manage an array of books:

```typescript
import { Injectable } from '@nestjs/common';
import { Book } from './book.entity';

@Injectable()
export class BooksService {
  private books: Book[] = [];

  create(book: Book) {
    this.books.push(book);
    return book;
  }

  findAll() {
    return this.books;
  }
}
```

### 4.4 Define the Books Controller

Update `books.controller.ts` to handle the HTTP requests:

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { BooksService } from './books.service';
import { Book } from './book.entity';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  create(@Body() book: Book): Book {
    return this.booksService.create(book);
  }

  @Get()
  findAll(): Book[] {
    return this.booksService.findAll();
  }
}
```

## Step 5: Setting Up Swagger

Now, let's generate a Swagger documentation for our API.

### 5.1 Import SwaggerModule and DocumentBuilder

In `main.ts`, import the `SwaggerModule` and `DocumentBuilder`:

```typescript
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Swagger setup will go here
  await app.listen(3000);
}


bootstrap();
```

### 5.2 Configure Swagger

Set up Swagger with your project's details:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const options = new DocumentBuilder()
    .setTitle('My API')
    .setDescription('My API description')
    .setVersion('1.0')
    .addTag('my-api')
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
}
bootstrap();
```

### 5.3 Annotate the Book Entity

To correctly document your API, annotate the `Book` entity:

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class Book {
  @ApiProperty()
  id: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  author: string;

  @ApiProperty()
  publishedDate: string;
}
```

### 5.4 Annotate the Controller

Add Swagger decorators to your controller methods:

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BooksService } from './books.service';
import { Book } from './book.entity';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  @ApiBody({ type: Book })
  @ApiResponse({ status: 201, description: 'The book has been successfully created.', type: Book })
  create(@Body() book: Book): Book {
    return this.booksService.create(book);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Return all books.', type: [Book] })
  findAll(): Book[] {
    return this.booksService.findAll();
  }
}
```

## Step 6: Generating Swagger JSON API Specification

Once your application is running, you can navigate to `http://localhost:3000/api-json` in your browser to download the Swagger JSON API specification. This file can be used to generate API documentation with tools like PostDoc.
