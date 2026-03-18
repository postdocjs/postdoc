# Working with Static Assets

Managing static assets like images, stylesheets, and JavaScript files is an essential part of creating a dynamic and interactive documentation website. In PostDoc, these files are typically stored in the `static` directory at the root of your project. This section covers how you can add and use these assets in your PostDoc site.

## Adding Static Assets

To add a static asset to your project, you should place it in the `static` directory. You can organize these files into subdirectories if desired. For example, you might create separate `images`, `css`, and `js` directories within `static` to keep your assets organized.

Here's an example structure:

```bash
├── static/
│   ├── images/
│   │   ├── logo.png
│   ├── css/
│   │   ├── styles.css
│   ├── js/
│   │   ├── script.js
```

## Referencing Static Assets

Once your static assets are placed in the `static` directory, you can reference them in your markdown or EJS files using relative paths. The root of your site (`/`) corresponds to the `static` directory, so you don't include `static` in the file path.

Here's how to reference static assets:

In Markdown:

```markdown
![Logo](/images/logo.png)

[Link to script.js file](/js/script.js)
```

In EJS:

```html
<img src="/images/logo.png" alt="Logo">

<script src="/js/script.js"></script>
```

## Building with Static Assets

When you build your PostDoc site with the `postdoc build` command, all files and directories within the `static` folder are copied to the root of the `dist` (output) directory. This process maintains the organization of your static files and ensures they are accessible in the built site.

Remember, managing your static assets well is key to creating an engaging and user-friendly documentation website. Ensure that your images, stylesheets, and scripts are organized, up to date, and correctly referenced in your PostDoc site.