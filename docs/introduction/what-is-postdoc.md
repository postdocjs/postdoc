# 1. Introduction

## What is PostDoc?

PostDoc is a powerful, open-source static site generator that is designed with the needs of developers in mind. With its unique features such as seamless API documentation generation from JSDoc comments, PostDoc simplifies the process of building and maintaining comprehensive documentation for any project.

PostDoc combines the power of Markdown for writing content, the flexibility of EJS (or your templating language of choice) for HTML templates, and the ease of JavaScript for any additional functionality you might require. In addition, it provides built-in support for internationalization (i18n), front-matter, and even enabling Progressive Web App (PWA) support for your site.

In a nutshell, PostDoc is a flexible, feature-rich tool that enables developers to build robust, well-documented websites with ease.

## Getting Started with PostDoc

Starting with PostDoc is simple and straightforward. Here is a step-by-step guide to get you up and running:

### Step 1: Install PostDoc

PostDoc requires Node.js and npm, which come together in a single install. If you don't have them installed already, you can download Node.js and npm from [here](https://nodejs.org/en/download/). After installing Node.js and npm, you can install PostDoc by running the following command in your terminal:

```bash
npm install -g postdoc
```

This command installs PostDoc globally, making the `postdoc` command available throughout your system.

### Step 2: Create a New Project

To create a new PostDoc project, navigate to the directory where you want your project to reside and run:

```bash
postdoc init my-postdoc-project
```

Replace `my-postdoc-project` with your preferred project name. This command will create a new directory with your project name and automatically set up a basic PostDoc project structure inside it.

### Step 3: Start Your PostDoc Project

Navigate into your newly created project directory with:

```bash
cd my-postdoc-project
```

Then, start your PostDoc development server with:

```bash
postdoc run
```

Your PostDoc site should now be running at [http://localhost:3000](http://localhost:3000). Open this link in your browser to view your new PostDoc site.

Congratulations! You've just set up your first PostDoc project. Now, you're ready to explore the other powerful features that PostDoc offers, as we'll detail in the following sections.