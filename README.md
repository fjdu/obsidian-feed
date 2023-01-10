# An rss feed reader plugin for Obsidian

This plugin is built for my own use.  At present it may still have an "unpolished" appearance, but its functions already satisfies me.

- It will create a folder named `feeds-reader` under the current vault.  All the feeds data (`json` files) and the saved items (`md` files) are saved in this folder.
- The top-left `>` is for toggling the navigation bar.
- `New` is for toggling displaying only new items or all items (i.e. whether to display those marked as "read" or "deleted").
- `Save` is for saving the feed data, so that your reading progress would not be accidentally lost.
- `Add` is for adding new feed subscriptions.
- All the subscribed sources are listed under their respective folders.
- The number of unread and total items are displayed after the feed name.  The are not displayed unless the feed name is clicked on.
- To retrieve new items, click the "refresh" button.  Wait a few seconds (depending on the internet speed), then click on the feed name again, and new items (if any) will be displayed.
- For each displayed item, you can click `Read` to mark it as read, `Save` to create an `md` note for it, and `Delete` to mark it as deleted.  All these must be done manually (instead of automatically by the plugin itself).  In the future I will try to find a way to permanently delete those marked as deleted (to save storage space).
