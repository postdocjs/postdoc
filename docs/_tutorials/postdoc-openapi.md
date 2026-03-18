# Tutorial: Generating API Documentation with Postdoc and Swagger

This tutorial provides a comprehensive guide on how to generate API documentation from a Swagger JSON file using Postdoc's `openapi` command.

## Prerequisites

Before we proceed, it's important to have these set up:

- A Nest.js project with Swagger set up, and the Swagger JSON file generated.
- Postdoc installed and set up in your project.

If you haven't done so, please refer back to our previous tutorial on setting up a Nest.js project with Swagger and generating the Swagger JSON file.

## Step 1: Preparation

Begin by ensuring that your Swagger JSON file has been properly generated from your Nest.js project. Typically, this is located at the `/dist` directory of your Nest.js project. Let's say our JSON file is named `swagger.json`.

Once you have your `swagger.json` file ready, you need to copy this file into your Postdoc project directory. We assume that you have an `api` directory in your Postdoc project. You can copy your file using the command:

```bash
cp /path-to-your-nestjs-project/dist/swagger.json /path-to-your-postdoc-project/api/
```

## Step 2: Using the OpenAPI Feature in Postdoc

Postdoc has a built-in command, `postdoc openapi`, designed for generating API documentation from OpenAPI/Swagger specification files.

Create a new markdown file in the `api` directory named `api-docs.md`. This file will be used to import and display the API documentation from the Swagger JSON file.

The `openapi` command accepts an input file (your Swagger JSON file) and an output file (the markdown file where you want to generate the API documentation). Here is the command:

```bash
postdoc openapi --input api/swagger.json --output api/api-docs.md
```

This command reads your `swagger.json` file, extracts all the API documentation details, and generates corresponding markdown content in `api-docs.md`.

Here's an example of how your `api-docs.md` might look after the command is executed:

```markdown
# API Documentation

This is the generated API documentation for our project.

## Get User

GET /user/{id}

### Request Parameters

- `id` (path, required) - The ID of the user.

### Responses

- 200: Successful Operation
  - `id` (string) - The ID of the user.
  - `name` (string) - The name of the user.
  - `email` (string) - The email of the user.

- 404: User Not Found
  - `message` (string) - Error message.
```

## Step 3: Building Your Postdoc Site

With the API documentation markdown generated, we can now build our Postdoc site. Use the `build` command:

```bash
postdoc build
```

This command compiles all markdown files, including your API documentation, into a static site. You can open the generated `index.html` file in your browser and navigate to the `api` section to view your API documentation.

## Wrapping Up

In this tutorial, we have walked through the process of generating API documentation with Postdoc using a Swagger JSON file. The OpenAPI feature in Postdoc streamlines the process, making it easy to integrate detailed API documentation directly into your Postdoc project.