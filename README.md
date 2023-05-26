# An Obsidian plugin for reading rss feeds

This plugin is mostly built for my own use.  Online services are good, but it is also good to be able to save important rss messages in the local machine.  At present it may still look rudimentary, but its functions already quite satisfies me.  It differs from the existing plugin `RSS Reader` in a few aspects, some of which are described in the [issues](https://github.com/joethei/obsidian-rss/issues/112) I raised for that plugin some time ago.

## How it works

- It creates an icon in the left sidebar (for the mobile version the icon is located in the bottom right pop-up menu).
- The first time you use it, you need to manually add RSS feed sources.
- It creates nested folders `feeds-reader/feeds-store/` in the current vault.  All the saved items (`.md` files) are stored in `feeds-reader`, and all the feeds data (`.json.frag.gzip` files, i.e. gzipped json fragments.) are saved in `feeds-reader/feeds-store/`.
- The top-left `>` is for toggling the navigation bar.  This is useful when reading on a small screen.
- `Search` is for searching for one or more keywords (separated by space) in the current selected feed.
- `Unread only`/`Show all` is for toggling displaying only unread items or all items (Note: all those marked as "read" or "deleted" are considered "read").
- `Title only`/`Show content` is for toggling whether to show the content of each item.  My own experience is that most of the time a glancing over the title is enough to decide whether to read an article in detail.
- `New to old` is for toggling of display orders.  It cycles from `New to old`, `Old to new`, to `Random`.
- `Save data` is for saving the feed data (after you have marking some items as `read/deleted`), so that your reading progress would not be accidentally lost.
- `Update all` is for fetching new items for all the subscribed feeds.
- `Undo` is for undoing recent `mark as read` and `mark as deleted` actions for the **selected feed**.
- `Add feed` is for adding new feed subscriptions.  The first time you use this plugin, you will need to add subscriptions with this `Add`.  **Shorter feed names are preferred, and they must be unique.**
   - *Be careful with the feed provider!  While sanitization is performed for the feed contents using the `sanitizeHTMLToDom` api, malicious content may still cause data loss!*
   - While it is true that meticulously crafted contents may sabotage your data, normal feed providers have no intention to do this (unless they are hacked).  So please only subscribe from legitimate websites.  I choose not to only show plain text for the contents, because that would ruin the reading experience (we need the outgoing links, images, etc.).  Thanks to the reviewer for letting me know of the `sanitizeHTMLToDom` api!
- `Manage` is for managing your feeds, where you can mark all as read, purge those that are marked as deleted, and purge all (i.e. to permanently remove all items of a feed).  **Be cautious that these actions cannot be undone.**
- All the subscribed sources are listed under their respective folders.
- The number of unread and total items are displayed after the feed name.
- To retrieve new items, click on the `unread/total` number.
- For each displayed item, you can click `Jot` to write a short note to it (to be saved in the `.md` file or the snippet file), `Read` to mark it as read, `Save` to create a standalone `.md` note for it, `Snippet` to append the content to a `snippets` file, `Math` to render the LaTeX equations, `GPT` to ask `ChatGPT` to summarize the content, and `Delete` to mark it as deleted.  All these must be done manually (instead of automatically by the plugin itself).  Click on the title to show the item content (if `Title only` is set), or to open the link (if `Show content` is set).
  - For summarizing with ChatGPT, you need to provide your own ChatGPT API Key and prompt words in the `settings` tab.
  - Click on `Embed` to embed the page pointed to by the item URL as an `iframe` element.
  - Click on `Fetch` to fetch the URL and display it.  This is for pages that cannot be embedded.  Better than nothing.
- The items are paginated with 20 items per page, which can be changed in the settings.
- The feeds data are saved as gzipped fragmented `.json` files.  They are intentionally fragmented so that when new items come, old files do not need to be updated (hence do not need to be synced).

## Acknowledgment
- This plugin makes use of the [rssParser](https://github.com/joethei/obsidian-rss/blob/master/src/parser/rssParser.ts) source code from the [RSS Reader](https://github.com/joethei/obsidian-rss) plugin written by [Johannes Theiner](https://github.com/joethei), with a few modifications.

## Known issues:

- Some item URLs cannot be embedded in the mobile, which I understand as a limitation of the current mobile implementation of Obsidian.
