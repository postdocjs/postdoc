# 4.2 Building a PostDoc Website for Production

While running your PostDoc website locally is great for development and testing, when it's time to share your website with the world, you'll need to build it for production. This process involves bundling, optimizing, and minifying your JavaScript, CSS, images, and other assets so that your website is as fast and efficient as possible.

Here's how to build your PostDoc website for production:

1. **Check your configuration:** Ensure your `postdoc.config.js` and environment variables are correctly set for production. For example, make sure the correct API endpoints are set, analytics tokens are added, and any feature toggles are correctly configured.

2. **Run the build command:** In your terminal, run the following command from the root of your PostDoc project:

```bash
npm run build
```

This command tells PostDoc to create a production-ready version of your website. It uses Vite under the hood, which handles the process of bundling and optimizing your code. PostDoc will create a `dist` directory in your project root, which contains all the files necessary to run your website.

3. **Inspect the output:** After the build process is complete, you'll see a `dist` folder in your project directory. This folder contains your built website, including all HTML, CSS, JavaScript, images, and other assets. Each file is optimized for the fastest possible load times. Open the `dist` directory and review its contents to ensure everything looks as expected.

4. **Deploy your website:** The `dist` directory is a standalone version of your website and can be deployed to any static file server. How you do this depends on your chosen hosting provider. Many providers offer simple command-line tools to publish your website, or you might prefer to use a continuous deployment (CD) pipeline that automatically builds and deploys your website whenever you push changes to your source code.

Remember, building for production should always be done before deploying. This ensures that your users get the fastest, most efficient version of your website. In addition, always check your site after deploying to ensure everything works as expected.
