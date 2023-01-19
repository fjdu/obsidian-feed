# An rss feed reader plugin for Obsidian

This plugin is built for my own use.  At present it still has an "unpolished" appearance, but its functions already satisfies me.

- It will create a folder named `feeds-reader` under the current vault.  All the feeds data (`json` files) and the saved items (`md` files) are saved in this folder.
- The top-left `>` is for toggling the navigation bar.
- `Unread only` (`Show all`) is for toggling displaying only unread items or all items (i.e. whether to display those marked as "read" or "deleted").
- `Title only` is for toggling whether to show the content of each item.
- `Save data` is for saving the feed data, so that your reading progress would not be accidentally lost.
- `Update all` is for fetching new items for all the subscribed feeds.
- `Add feed` is for adding new feed subscriptions.  The first time you use this plugin, you will need to add subscriptions with this `Add`.  **Keep the feed name as short as possible.**
- `Manage` is for managing your feeds, where you can mark all as read, purge those that are marked as deleted, and purge all (i.e. to permanently remove all items of a feed).  Be cautious that these actions cannot be undone.
- All the subscribed sources are listed under their respective folders.
- The number of unread and total items are displayed after the feed name.
- To retrieve new items, click the "refresh" button.  Wait a few seconds (depending on the internet speed), then click on the feed name again, and new items (if any) will be displayed.
- For each displayed item, you can click `Read` to mark it as read, `Save` to create an `md` note for it, and `Delete` to mark it as deleted.  All these must be done manually (instead of automatically by the plugin itself).  Click on `>>> >>>` to show the item content.
