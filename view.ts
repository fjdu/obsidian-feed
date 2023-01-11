import { ItemView, WorkspaceLeaf } from "obsidian";
import { Global } from "./globals"
import { saveFeedsData, loadSubscriptions, loadFeedsStoredData } from "./main"

export const VIEW_TYPE_FEEDS_READER = "feeds-reader-view";

export class FRView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_FEEDS_READER;
  }

  getDisplayText() {
    return "Feeds";
  }

  async onOpen() {
    await loadSubscriptions();
    await loadFeedsStoredData();

    const container = this.containerEl.children[1];
    container.empty();

    const toggleNavi = container.createEl('div', {text: ">"});
    toggleNavi.id = 'toggleNavi';
    toggleNavi.className = 'toggleNavi';

    const navigation = container.createEl("div", {class: 'navigation'});
    const content = container.createEl("div", {class: "content"});
    navigation.className = 'navigation';
    content.className = 'content';
    navigation.id = 'naviBar';
    content.id = 'contentBox';

    const manage = navigation.createEl('div');
    manage.className = 'manage';
    const showAll = manage.createEl('div').createEl('span', {text: "New"});
    showAll.id = 'showAll';
    const saveData = manage.createEl('div').createEl('span', {text: "Save"});
    saveData.id = 'saveData';
    const add = manage.createEl('div').createEl('span', {text: "Add"});
    add.id = 'addFeed';
    const manageFeeds = manage.createEl('div').createEl('span', {text: "Manage"});
    manageFeeds.id = 'manageFeeds';
    manage.createEl('hr');

    Global.feedList.sort((n1,n2) => {
      if (n1.folder > n2.folder) {return 1;}
      if (n1.folder < n2.folder) {return -1;}
      return 0;
    });

    const feedTableDiv = navigation.createEl('div');
    feedTableDiv.className = 'feedTable';
    const feedTable = feedTableDiv.createEl('table');
    feedTable.id = 'feedTable';
    await createFeedBar();

    const feed_content = content.createEl('div');
    feed_content.id = 'feed_content';
  }

  async onClose() {
    // Nothing to clean up.
    await saveFeedsData();
    this.containerEl.empty();
  }
}

export async function createFeedBar() {
  var feedTable = document.getElementById('feedTable');
  feedTable.empty();
  var thisFolder = "";
  Global.feedList.forEach((item, idx) => {
    if (item.folder != thisFolder) {
      thisFolder = item.folder;
      if (thisFolder != "") {
        feedTable.createEl('tr').createEl('td').createEl('span', {text: thisFolder}).className = 'feedFolder';
      }
    }
    const tr = feedTable.createEl('tr');
    const showFeed = tr.createEl('td').createEl('span', {text: item.name});
    showFeed.className = 'showFeed';
    showFeed.id = item.feedUrl;

    const unreadCount = tr.createEl('td').createEl('span', {text: ''});
    unreadCount.className = 'unreadCount';
    unreadCount.id = 'unreadCount' + item.feedUrl;

    const totalCount = tr.createEl('td').createEl('span', {text: ''});
    totalCount.className = 'totalCount';
    totalCount.id = 'totalCount' + item.feedUrl;

    const refreshFeed = tr.createEl('td', {text: '\u21BB'});
    refreshFeed.className = 'refreshFeed';
    refreshFeed.id = item.feedUrl;
  });
}

