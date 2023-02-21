# An Obsidian plugin for reading rss feeds

This plugin is mostly built for my own use.  Online services are good, but it is also good to be able to save important rss messages in the local machine.  At present it may still look rudimentary (it does not even have a settings page), but its functions already quite satisfies me.  It differs from the existing plugin `RSS Reader` in a few aspects, some of which are described in the [issues](https://github.com/joethei/obsidian-rss/issues/112) I raised for that plugin some time ago.

## How it works

- It creates an icon in the left sidebar (for the mobile version the icon is located in the bottom right pop-up menu).
- It creates nested folders `feeds-reader/feeds-store/` in the current vault.  All the saved items (`.md` files) are stored in `feeds-reader`, and all the feeds data (`.json.frag` files, i.e. json fragments.) are saved in `feeds-reader/feeds-store/`.
- The top-left `>` is for toggling the navigation bar.  This is useful when reading on a small screen.
- `Search` is for searching for one or more keywords (separated by space) in the current selected feed.
- `Unread only`/`Show all` is for toggling displaying only unread items or all items (Note: all those marked as "read" or "deleted" are considered "read").
- `Title only`/`Show content` is for toggling whether to show the content of each item.  My own experience is that most of the time a glancing over the title is enough to decide whether to read an article in detail.
- `Save data` is for saving the feed data (after you have marking some items as `read/deleted`), so that your reading progress would not be accidentally lost.
- `Update all` is for fetching new items for all the subscribed feeds.
- `Undo` is for undoing recent `mark as read` and `mark as deleted` actions for the **selected feed**.
- `Add feed` is for adding new feed subscriptions.  The first time you use this plugin, you will need to add subscriptions with this `Add`.  **Keep the feed name as short as possible, and it must be unique.**
   - *Be careful with the feed provider!  Sanitization is not performed for the feed contents, and malicious content may cause data loss!*
   - While it is true that meticulously crafted contents may sabotage your data, normal feed providers have no intention to do this (unless they are hacked).  So please only subscribe from legitimate websites.  I choose not to thoroughly purify the contents, because that would ruin the reading experience (we need the outgoing links, images, etc.).  If you have a better solution please let me know.
- `Manage` is for managing your feeds, where you can mark all as read, purge those that are marked as deleted, and purge all (i.e. to permanently remove all items of a feed).  Be cautious that these actions cannot be undone.
- All the subscribed sources are listed under their respective folders.
- The number of unread and total items are displayed after the feed name.
- To retrieve new items, click the `refresh` (↻) button.  Wait a few seconds (depending on the internet speed), then click on the feed name again, and new items (if any) will be displayed.
- For each displayed item, you can click `Read` to mark it as read, `Save` to create an `.md` note for it, and `Delete` to mark it as deleted.  All these must be done manually (instead of automatically by the plugin itself).  Click on `>>> >>>` to show the item content.
  - If you would like to add notes to an item, you have to first use `Save` to create the `.md` file, then edit that file directly.
- The items are paginated with 100 items per page.
- The feeds data are saved as fragmented `.json` files.  They are intentionally fragmented so that when new items come, old files do not need to be updated (hence do not need to be synced).

## Acknowledgment
- This plugin makes use of the [rssParser](https://github.com/joethei/obsidian-rss/blob/master/src/parser/rssParser.ts) source code from the [RSS Reader](https://github.com/joethei/obsidian-rss) plugin, with a few modifications.

## Known issues:

- The plugin uses the Obsidian `request` api.  Sometimes it appears to me that the `request` call returns prematurely and too quickly (my network speed can't be that fast), but I am not sure and don't know why.
- I would like the LaTeX equations in the contents to be properly displayed with something like MathJax, but I have not figured out how to do this yet.
