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
    return "Feeds Reader";
  }

  async onOpen() {
    var startTime = performance.now();
    await loadSubscriptions();
    await loadFeedsStoredData();
    var endTime = performance.now();
    var timeSpent = (endTime-startTime)/1e3;
    if (timeSpent > 0.02) {
      var tStr = timeSpent.toFixed(2);
      new Notice(`Data loaded in ${tStr} seconds.`, 2000);
    }

    const container = this.containerEl.children[1];
    if (container === undefined) {
      console.log('Fail to get container.');
      return;
    }

    container.empty();

    const toggleNaviContainer = container.createEl('div');
    toggleNaviContainer.className = 'toggleNaviContainer';
    toggleNaviContainer.id = 'toggleNaviContainer';
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
    const search = manage.createEl('div').createEl('span', {text: "Search"});
    search.id = 'search';
    const showAll = manage.createEl('div').createEl('span', {text: "Unread only"});
    showAll.id = 'showAll';
    const titleOnly = manage.createEl('div').createEl('span', {text: "Title only"});
    titleOnly.id = 'titleOnly';
    const toggleOrder = manage.createEl('div').createEl('span', {text: Global.itemOrder});
    toggleOrder.id = 'toggleOrder';
    const saveFeedsData = manage.createEl('div').createEl('span', {text: "Save data"});
    saveFeedsData.id = 'saveFeedsData';
    const updateAll = manage.createEl('div').createEl('span', {text: "Update all"});
    updateAll.id = 'updateAll';
    const undo = manage.createEl('div').createEl('span', {text: "Undo"});
    undo.id = 'undo';
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

    if (Global.feedList.length > 2) {
      if (Global.feedList.length < Global.nThanksSep) {
        var nVertSep = Global.nThanksSep-Global.feedList.length;
        for (var i=0; i<nVertSep; i++) {
          feedTableDiv.createEl('br');
        }
      }
      feedTableDiv.createEl('hr');
      const thanksTable = feedTableDiv.createEl('table');
      const thanks = thanksTable.createEl('tr');
      thanks.className = 'thanks';
      thanks.createEl('td').createEl('a', {text: "Thanks", href: "https://www.buymeacoffee.com/fjdu"});
      thanks.createEl('td').createEl('span', {text: "or"});
      thanks.createEl('td').createEl('a', {text: "Complain", href: "https://github.com/fjdu/obsidian-feed/issues"});
    }

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
    elUnreadTotal.setAttribute('fdUrl', item.feedUrl);
    elUnreadTotal.setAttribute('fdName', item.name);
    elUnreadTotal.className = 'elUnreadTotalAndRefresh';
    const unreadCount = elUnreadTotal.createEl('span', {text: stats.unread.toString()});
    unreadCount.className = 'unreadCount';
    unreadCount.id = 'unreadCount' + item.feedUrl;
    var elSep = elUnreadTotal.createEl('span', {text: '/'});
    elSep.className = 'unreadCount';
    elSep.id = 'sepUnreadTotal'+item.feedUrl;
    const totalCount = elUnreadTotal.createEl('span', {text: stats.total.toString()});
    totalCount.className = 'unreadCount';
    totalCount.id = 'totalCount' + item.feedUrl;

    // const refreshFeed = tr.createEl('td', {text: '\u21BB'});
    // refreshFeed.className = 'refreshFeed';
    // refreshFeed.id = item.feedUrl;
    // refreshFeed.setAttribute('fdName', item.name);
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
