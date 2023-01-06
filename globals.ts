export namespace Global {
  var showAll: boolean;
  var currentFeed: string;
  var feeds_reader_dir: string;
  var feeds_data_fname: string;
  var subscriptions_fname: string;
  var feedList: {name: string, feedUrl: string, unread: number, updated: number, folder: string} [];
  var feedsStore: {[id: string]: RssFeedContent;};
  var feedsStoreChange: boolean;
  var hideThisItem: boolean;
  var itemIdx: number;
}
