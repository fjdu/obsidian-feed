export namespace Global {
  var showAll: boolean;
  var titleOnly: boolean;
  var feeds_reader_dir: string;
  var feeds_data_fname: string;
  var feeds_store_base: string;
  var subscriptions_fname: string;
  var currentFeed: string;
  var currentFeedName: string;
  var elUnreadCount, elTotalCount, elSepUnreadTotal;
  var feedList: {name: string, feedUrl: string, unread: number, updated: number, folder: string} [];
  var feedsStore: {[id: string]: RssFeedContent;};
  var feedsStoreChange: boolean;
  var hideThisItem: boolean;
  var itemIdx: number;
  var nMergeLookback: number;
  var lenStrPerFile: number;
  var undoList: number [];
}
