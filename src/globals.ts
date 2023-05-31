export namespace GLB {
  var showAll: boolean;
  var titleOnly: boolean;
  var itemOrder: string;
  var feeds_reader_dir: string;
  var feeds_data_fname: string;
  var feeds_store_base: string;
  var subscriptions_fname: string;
  var saved_snippets_fname: string;
  var currentFeed: string;
  var currentFeedName: string;
  var elUnreadCount, elTotalCount, elSepUnreadTotal;
  var feedList: {name: string, feedUrl: string, unread: number, updated: number, folder: string} [];
  var feedsStore: {[id: string]: RssFeedContent;};
  var feedsStoreChange: boolean;
  var feedsStoreChangeList;
  var hideThisItem: boolean;
  var nMergeLookback: number;
  var lenStrPerFile: number;
  var undoList: number [];
  var nItemPerPage: number;
  var saveContent: boolean;
  var nPage: number;
  var idxItemStart: number;
  var displayIndices: number [];
  var maxTotalnumDisplayed: number;
  var nThanksSep: number;
  var settings;
}
