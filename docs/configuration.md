# 5. Configuring PostDoc

PostDoc is configured using a mix of configuration files and environmental variables, giving developers maximum flexibility in tailoring the system to their specific needs. Here are the core configuration elements you should be aware of.

## 5.1 PostDoc Configuration Files

Your PostDoc project contains two main configuration files:

- `postdoc.config.js`: This is the main configuration file for PostDoc. It's a JavaScript file that exports a configuration object.
- `.env` files: These are files used for defining environment variables. They follow the naming convention `.env.[mode]` where mode can be 'development', 'production' or 'test'.

## 5.2 PostDoc Configuration Options

The `postdoc.config.js` file should export an object that specifies the configuration for your PostDoc project. Here's a basic overview of the configuration options:

```javascript
module.exports = {
  siteMetadata: {},  // Metadata for the site
  locales: [],  // List of supported locales
  layout: '',  // Default layout for pages
  notFoundPage: '',  // Path to custom 404 page
  plugins: [],  // Plugins to be used by PostDoc
  themeConfig: {},  // Configuration for the theme
  vite: {},  // Custom Vite configuration
  markdown: {},  // Custom markdown configuration
}
```

Let's dive into the details of each section:

### 5.2.1 `siteMetadata`

This is an object that can contain any data about your site that you want to access in your components or templates. It often includes things like the site title, description, author name, etc.

### 5.2.2 `locales`

This is an array that lists the locales supported by your site. Each locale is represented by a string.

### 5.2.3 `layout`

This is the path to the default layout component that will be used for pages that do not specify a layout.

### 5.2.4 `notFoundPage`

This is the path to a custom 404 page. If not provided, PostDoc will use its default 404 page.

### 5.2.5 `plugins`

This is an array where you can specify the plugins that should be used by PostDoc.

### 5.2.6 `themeConfig`

This is an object where you can define any custom configuration for your theme.

### 5.2.7 `vite`

This section allows you to provide custom configuration for Vite. Any configuration here will be merged with PostDoc's internal Vite configuration.

### 5.2.8 `markdown`

This is an object where you can define custom configuration for markdown processing.

## 5.3 Environment Variables

Environment variables can be set using `.env` files. You can have separate `.env` files for different modes (development, production, test) by appending the mode to the file name like `.env.[mode]`. These variables are available in your `postdoc.config.js` file as `process.env`.

This way, you can keep sensitive data like API keys out of your version-controlled code.

Please check the respective sections for more details on how to configure each part.

Remember that the flexibility of PostDoc configuration allows you to build a website that fits your needs, so don't be afraid to explore and experiment with different configurations.