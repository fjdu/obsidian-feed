import { ItemView, WorkspaceLeaf } from "obsidian";
import { Global } from "./globals"

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
    const container = this.containerEl.children[1];
    container.empty();
    const navigation = container.createEl("div", {class: 'navigation'});
    const content = container.createEl("div", {class: "content"});
    navigation.className = 'navigation';
    content.className = 'content';
    navigation.id = 'naviBar';
    content.id = 'contentBox';

    navigation.createEl('br');
    navigation.createEl('br');

    const manage = navigation.createEl('div');
    manage.className = 'manage';
    const showAll = manage.createEl('div').createEl('span', {text: "N"});
    showAll.id = 'showAll';
    const saveData = manage.createEl('div').createEl('span', {text: "S"});
    saveData.id = 'saveData';
    const add = manage.createEl('div').createEl('span', {text: "+"});
    add.id = 'addFeed';
    const toggleNavi = manage.createEl('div').createEl('span', {text: ">"});
    toggleNavi.id = 'toggleNavi';
    manage.createEl('hr');

    Global.feedList.sort((n1,n2) => {
      if (n1.folder > n2.folder) {return 1;}
      if (n1.folder < n2.folder) {return -1;}
      return 0;
    });
    // let folders_set = new Set<string>();
    // feedList.forEach((item) => {
    //   folders_set.add(item.folder);
    // });
    // let folders_list = Array.from(folders_set).sort();
    // console.log(folders_list);
    // folders_list.forEach((item, idx) => {
    //   navigation.createEl('div', {text: item});
    // });

    const feedTableDiv = navigation.createEl('div');
    feedTableDiv.className = 'feedTable';
    const feedTable = feedTableDiv.createEl('table');
    Global.feedList.forEach((item, idx) => {
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

      const refreshFeed = tr.createEl('td', {text: '\u21BB'}); //\u22ee
      refreshFeed.className = 'refreshFeed';
      refreshFeed.id = item.feedUrl;
    });

   const feed_content = content.createEl('div');
   feed_content.id = 'feed_content';

  }

  async onClose() {
    // Nothing to clean up.
    this.containerEl.empty();
  }
}
