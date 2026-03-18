# Understanding PostDoc

## How Routing Works in a PostDoc Website

PostDoc utilizes a straightforward and intuitive routing system. This system is primarily based on the structure of your project's directories and files. Each Markdown or HTML file within your `src` directory is transformed into a page on your website, and the directory structure defines the routes to these pages.

Here's a detailed look at how routing works in PostDoc:

### File and Directory Naming

The routing of your PostDoc site follows the structure and naming convention of your `src` directory. For example, if you have a file named `introduction.md` in the root of your `src` directory, it will be accessible at `yourwebsite.com/introduction`.

Nested directories also follow this principle. If you have a file `getting-started.md` inside a directory named `guide` (`src/guide/getting-started.md`), the route to this page will be `yourwebsite.com/guide/getting-started`.

### Index Files

Index files have a special role in the routing system. An `index.md` or `index.html` file in any directory becomes the "default" or "home" page for that directory. For example, if you have an `index.md` file in the `guide` directory, it will be accessible at `yourwebsite.com/guide`.

### Dynamic Routing

PostDoc supports dynamic routes as well. These are defined using square brackets (`[]`). For example, you might have a file named `[slug].md` in your `src/posts` directory. This file acts as a template for all the pages that fall under `yourwebsite.com/posts/`. The `[slug]` part of the URL will correspond to the specific page being accessed.

### API Routes

Routes for API documentation generated from JSDoc comments are automatically created by PostDoc. If you have a `api.js` file in the root of your `src` directory, and this file contains JSDoc comments, PostDoc will create corresponding API documentation pages that are accessible under the `api` route (i.e., `yourwebsite.com/api/...`).

It's important to note that the routes are case-sensitive, and the use of dashes (`-`) and underscores (`_`) in file names will also reflect in the URLs.

In the next sections, we will dive deeper into building, running, deploying, and testing a PostDoc website, and more exciting features that PostDoc offers.