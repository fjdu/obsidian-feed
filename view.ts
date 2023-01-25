import { ItemView, WorkspaceLeaf } from "obsidian";
import { Global } from "./globals"
import { saveFeedsData, loadSubscriptions, loadFeedsStoredData, getFeedStats } from "./main"

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

    const toggleNaviContainer = container.createEl('div');
    toggleNaviContainer.className = 'toggleNaviContainer';
    const toggleNavi = toggleNaviContainer.createEl('span', {text: ">"});
    toggleNavi.id = 'toggleNavi';
    toggleNavi.className = 'toggleNavi';
    const toggleNaviAux = toggleNaviContainer.createEl('span');
    toggleNaviAux.id = 'toggleNaviAux';
    toggleNaviAux.className = 'toggleNaviAux';

    const navigation = container.createEl("div", {class: 'navigation'});
    const content = container.createEl("div", {class: "content"});
    navigation.className = 'navigation';
    content.className = 'content';
    navigation.id = 'naviBar';
    content.id = 'contentBox';

    const manage = navigation.createEl('div');
    manage.className = 'manage';
    const showAll = manage.createEl('div').createEl('span', {text: "Unread only"});
    showAll.id = 'showAll';
    const titleOnly = manage.createEl('div').createEl('span', {text: "Title only"});
    titleOnly.id = 'titleOnly';
    const saveFeedsData = manage.createEl('div').createEl('span', {text: "Save data"});
    saveFeedsData.id = 'saveFeedsData';
    const updateAll = manage.createEl('div').createEl('span', {text: "Update all"});
    updateAll.id = 'updateAll';
    const add = manage.createEl('div').createEl('span', {text: "Add feed"});
    add.id = 'addFeed';
    const manageFeeds = manage.createEl('div').createEl('span', {text: "Manage"});
    manageFeeds.id = 'manageFeeds';
    manage.createEl('hr');

    const feedTableDiv = navigation.createEl('div');
    feedTableDiv.className = 'feedTableDiv';
    const feedTable = feedTableDiv.createEl('table');
    feedTable.id = 'feedTable';
    feedTable.className = 'feedTable';
    waitForElm('.feedTable').then(async (elm) => {
      await createFeedBar();
    });

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
  await feedTable.empty();
  var thisFolder = "";
  Global.feedList.forEach(async (item, idx) => {
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

    var stats = getFeedStats(item.feedUrl);

    const elUnreadTotal = tr.createEl('td');
    const unreadCount = elUnreadTotal.createEl('span', {text: stats.unread.toString()});
    unreadCount.className = 'unreadCount';
    unreadCount.id = 'unreadCount' + item.feedUrl;
    var elSep = elUnreadTotal.createEl('span', {text: '/'});
    elSep.className = 'unreadCount';
    elSep.id = 'sepUnreadTotal'+item.feedUrl;
    const totalCount = elUnreadTotal.createEl('span', {text: stats.total.toString()});
    totalCount.className = 'totalCount';
    totalCount.id = 'totalCount' + item.feedUrl;

    const refreshFeed = tr.createEl('td', {text: '\u21BB'});
    refreshFeed.className = 'refreshFeed';
    refreshFeed.id = item.feedUrl;
    refreshFeed.setAttribute('fdName', item.name);
  });
}

export function waitForElm(selector) {
    return new Promise(resolve => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(mutations => {
            if (document.querySelector(selector)) {
                resolve(document.querySelector(selector));
                observer.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}
