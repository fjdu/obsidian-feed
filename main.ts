import { App, Editor, MarkdownView, Menu, Modal, Notice, addIcon, Plugin, PluginSettingTab, Setting, sanitizeHTMLToDom } from 'obsidian';
import { FRView, VIEW_TYPE_FEEDS_READER, createFeedBar, waitForElm } from "./view";
import { getFeedItems, RssFeedContent, nowdatetime, itemKeys } from "./getFeed"
import { Global } from "./globals"

// Remember to rename these classes and interfaces!

interface FeedsReaderSettings {
	feeds_reader_dir: string;
	feeds_data_fname: string;
	subscriptions_fname: string;
	showAll: boolean;
}

const DEFAULT_SETTINGS: FeedsReaderSettings = {
	feeds_reader_dir: 'feeds-reader',
  subscriptions_fname: 'subscriptions.json',
  feeds_data_fname: 'feeds-data.json',
  showAll: false
}

export default class FeedsReader extends Plugin {
	settings: FeedsReaderSettings;

	async onload() {
		await this.loadSettings();

    this.registerView(
      VIEW_TYPE_FEEDS_READER,
      (leaf) => new FRView(leaf)
    );

		// This creates an icon in the left ribbon.
    //addIcon("circle", `<rect x="120" width="100" height="100" rx="15" fill="currentColor" />`);
    addIcon("circle", `<circle cx="50" cy="50" r="50" fill="currentColor" /> <circle cx="50" cy="50" r="30" fill="cyan" /> <circle cx="50" cy="50" r="10" fill="green" />`);
		const ribbonIconEl = this.addRibbonIcon('circle', 'Feeds reader', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
      this.activateView();

      // const menu = new Menu(this.app);
      // menu.addItem((item) =>
      //   item
      //     .setTitle("Copy")
      //     .setIcon("documents")
      //     .onClick(() => {
      //       new Notice("Copied");
      //     })
      // );
      // menu.addItem((item) =>
      //   item
      //     .setTitle("Paste")
      //     .setIcon("paste")
      //     .onClick(() => {
      //       new Notice("Pasted");
      //     })
      // );
      // menu.showAtMouseEvent(evt);
		});

    // this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
      if (evt.target.id === 'updateAll') {
        Global.feedList.forEach(async (f) => {
          var [nNew, nTotal] = await updateOneFeed(f.feedUrl);
          if (nNew > 0) {
            new Notice(f.name + ': ' + nTotal.toString() + ' retrieved, '
                       + nNew.toString() + " new.", 3000);
          }
        });
      }
      if (evt.target.className === 'elUnreadTotalAndRefresh') {
        var fdUrl = evt.target.getAttribute('fdUrl');
        var [nNew, nTotal] = await updateOneFeed(fdUrl);
        new Notice(evt.target.getAttribute('fdName') + ': '
                   + nTotal.toString() + " retrieved, "
                   + nNew.toString() + ' new.', 3000);
      }
      if (evt.target.className.includes('showFeed')) {
        var previousFeed = Global.currentFeed;
        Global.currentFeed = evt.target.id;
        if (Global.currentFeed === '') {
          return;
        }
        Global.currentFeedName = '';
        for (var i=0; i<Global.feedList.length; i++) {
          if (Global.feedList[i].feedUrl === Global.currentFeed) {
            Global.currentFeedName = Global.feedList[i].name;
            break;
          }
        }
        if (previousFeed != '') {
          document.getElementById(previousFeed).className = 'showFeed nonShowingFeed';
        }
        document.getElementById(Global.currentFeed).className = 'showFeed showingFeed';
        if (previousFeed != Global.currentFeed) {
          Global.undoList = [];
        }
        Global.idxItemStart = 0;
        Global.nPage = 1;
        makeDisplayList();
        Global.elUnreadCount = document.getElementById('unreadCount' + Global.currentFeed);
        show_feed();
      }
      if (evt.target.id === 'nextPage') {
        Global.idxItemStart += Global.nItemPerPage;
        Global.nPage += 1;
        show_feed();
      }
      if (evt.target.id === 'prevPage') {
        Global.idxItemStart -= Global.nItemPerPage;
        Global.nPage -= 1;
        show_feed();
      }
      if (evt.target.id === 'undo') {
        if (Global.currentFeed != '') {
          Global.idxItemStart = 0;
          Global.nPage = 1;
          Global.displayIndices = Global.undoList.slice(0, Global.nItemPerPage);
          show_feed();
        }
      }
      if (evt.target.className === 'showItemContent') {
        var idx = evt.target.getAttribute('_idx');
        if (evt.target.innerText === '>>> >>>') {
          var elID = evt.target.getAttribute('_link');
          var item = Global.feedsStore[Global.currentFeed].items[idx];
          var elContent = document.getElementById(elID).createEl('div');
          elContent.className = 'itemContent';
          elContent.appendChild(sanitizeHTMLToDom(item.content.replace(/<img src="\/\//g,"<img src=\"https://")));
          elContent.id = 'toggleContent' + idx;
          evt.target.innerText = '<<< <<<';
        } else {
          document.getElementById('toggleContent' + idx).remove();
          evt.target.innerText = '>>> >>>';
        }
      }
      if (evt.target.className === 'noteThis') {
        if (! await this.app.vault.exists(Global.feeds_reader_dir)) {
          await this.app.vault.createFolder(Global.feeds_reader_dir);
        }

        var idx = this.getNumFromId(evt.target.id, 'noteThis');
        const the_item = Global.feedsStore[Global.currentFeed].items[idx];
        var dt_str: string = '';
        if (the_item.pubDate != '') {
          dt_str = the_item.pubDate;
        } else if (Global.feedsStore[Global.currentFeed].pubDate != '') {
          dt_str = Global.feedsStore[Global.currentFeed].pubDate;
        } else {
          dt_str = nowdatetime();
        }
        dt_str = dt_str.substring(0, 10) + '-';
        const fname: string = dt_str + 
                              str2filename(
                              (Global.currentFeedName === ''? '' :
                               Global.currentFeedName.replace(/(\s+)/g, '-') + '-') +
                              the_item.title.trim()
                              .replace(/(<([^>]+)>)/g, " ")
                              .replace(/[:!?@#\*\^\$]+/g, '')) + '.md';
        const fpath: string = Global.feeds_reader_dir + '/' + fname;
        if (! await this.app.vault.exists(fpath)) {
          await this.app.vault.create(fpath,
            '\n> [!abstract]+ [' +
            the_item.title.trim().replace(/(<([^>]+)>)/gi, " ").replace(/\n/g, " ") +
            '](' + sanitizeHTMLToDom(the_item.link).textContent + ')\n> ' +
            unEscape(handle_tags(handle_a_tag(handle_img_tag(the_item.content.replace(/\n/g, ' '))))
            .replace(/ +/g, ' ')
            .replace(/\s+$/g, '').replace(/^\s+/g, '')) +
            // handle_a_tag(handle_img_tag(unEscape(
            //   the_item.content.replace(/\n/g, ' '))))
            // .replace(/(<([^>]+)>)/gi, " ")
            // .trim() +
            '\n<small>' + the_item.creator.trim() + '</small>');
          new Notice(fpath + " saved.", 1000);
        } else {
          new Notice(fpath + " already exists.", 1000);
        }
      }
      if (evt.target.className === 'toggleRead') {
        var idx = this.getNumFromId(evt.target.id, 'toggleRead');
        Global.feedsStoreChange = true;
        Global.feedsStoreChangeList.add(Global.currentFeed);
        var el = document.getElementById(evt.target.id);
        if (el.innerText === 'Read') {
          Global.feedsStore[Global.currentFeed].items[idx].read = nowdatetime();
          el.innerText = 'Unread';
          Global.hideThisItem = true;
          if (Global.feedsStore[Global.currentFeed].items[idx].deleted === '') {
            Global.elUnreadCount.innerText = parseInt(Global.elUnreadCount.innerText) - 1;
          }
        } else {
          Global.feedsStore[Global.currentFeed].items[idx].read = '';
          el.innerText = 'Read';
          Global.hideThisItem = false;
          if (Global.feedsStore[Global.currentFeed].items[idx].deleted === '') {
            Global.elUnreadCount.innerText = parseInt(Global.elUnreadCount.innerText) + 1;
          }
        }
        const idxOf = Global.undoList.indexOf(idx);
        if (idxOf > -1) {
          Global.undoList.splice(idxOf, 1);
        }
        Global.undoList.unshift(idx);
        if ((!Global.showAll) && Global.hideThisItem) {
          document.getElementById(
            Global.feedsStore[Global.currentFeed].items[idx].link ).style.display = 'none';
        }
      }
      if (evt.target.className === 'toggleDelete') {
        var idx = this.getNumFromId(evt.target.id, 'toggleDelete');
        Global.feedsStoreChange = true;
        Global.feedsStoreChangeList.add(Global.currentFeed);
        var el = document.getElementById(evt.target.id);
        if (el.innerText === 'Delete') {
          Global.feedsStore[Global.currentFeed].items[idx].deleted = nowdatetime();
          el.innerText = 'Undelete';
          Global.hideThisItem = true;
          if (Global.feedsStore[Global.currentFeed].items[idx].read === '') {
            Global.elUnreadCount.innerText = parseInt(Global.elUnreadCount.innerText) - 1;
          }
        } else {
          Global.feedsStore[Global.currentFeed].items[idx].deleted = '';
          el.innerText = 'Delete';
          Global.hideThisItem = false;
          if (Global.feedsStore[Global.currentFeed].items[idx].read === '') {
            Global.elUnreadCount.innerText = parseInt(Global.elUnreadCount.innerText) + 1;
          }
        }
        const idxOf = Global.undoList.indexOf(idx);
        if (idxOf > -1) {
          Global.undoList.splice(idxOf, 1);
        }
        Global.undoList.unshift(idx);
        if ((!Global.showAll) && Global.hideThisItem) {
          document.getElementById(
            Global.feedsStore[Global.currentFeed].items[idx].link ).style.display = 'none';
        }
      }

      if (evt.target.id === 'showAll') {
        let toggle = document.getElementById('showAll');
        if (toggle.innerText == 'Show all') {
          toggle.innerText = 'Unread only';
          Global.showAll = false;
        } else {
          toggle.innerText = 'Show all';
          Global.showAll = true;
        }
      }
      if (evt.target.id === 'titleOnly') {
        let toggle = document.getElementById('titleOnly');
        if (toggle.innerText === 'Title only') {
          toggle.innerText = 'Show content';
          Global.titleOnly = false;
        } else {
          toggle.innerText = 'Title only';
          Global.titleOnly = true;
        }
      }
      if (evt.target.id === 'toggleOrder') {
        let toggle = document.getElementById('toggleOrder');
        if (toggle.innerText === 'New to old') {
          toggle.innerText = 'Old to new';
        } else if (toggle.innerText === 'Old to new') {
          toggle.innerText = 'Random';
        } else {
          toggle.innerText = 'New to old';
        }
        Global.itemOrder = toggle.innerText;
      }
      if ((evt.target.id === 'saveFeedsData') || (evt.target.id === 'save_data_toggling')) {
        var nSaved = await saveFeedsData();
        if (nSaved > 0) {
          new Notice("Data saved: " + nSaved.toString() + 'file(s) updated.', 1000);
        } else {
          new Notice("No need to save.", 1000);
        }
      }
      if ((evt.target.id === 'toggleNavi') && (Global.currentFeed != '')) {
        let toggle = document.getElementById('toggleNavi');
        if (toggle.innerText === '>') {
          toggle.innerText = '<';
          var toggleNaviAux = document.getElementById('toggleNaviAux');
          Global.elUnreadCount = toggleNaviAux.createEl('span', {text: Global.elUnreadCount.innerText});
          var save_data_toggling = toggleNaviAux.createEl('span', {text: 'Save'});
          save_data_toggling.id = 'save_data_toggling';
          save_data_toggling.className = 'save_data_toggling';
          document.getElementById('naviBar').className = 'navigation naviBarHidden';
          document.getElementById('contentBox').className = 'content contentBoxFullpage';
          document.getElementById('toggleNaviContainer').className = 'toggleNaviContainer toggleNaviContainerExpanded';
        } else {
          toggle.innerText = '>';
          var s = Global.elUnreadCount.innerText;
          Global.elUnreadCount = document.getElementById('unreadCount' + Global.currentFeed);
          Global.elUnreadCount.innerText = s;
          document.getElementById('toggleNaviAux').empty();
          document.getElementById('naviBar').className = 'navigation naviBarShown';
          document.getElementById('contentBox').className = 'content contentBoxRightpage';
          document.getElementById('toggleNaviContainer').className = 'toggleNaviContainer toggleNaviContainerFolded';
        }
      }
      if (evt.target.id === 'search') {
        if (Global.currentFeed === '') {
          new Notice("Feed not selected: I can only search when a feed is selected.", 3000);
        } else {
          new SearchModal(this.app).open();
        }
      }
      if (evt.target.id === 'addFeed') {
        new AddFeedModal(this.app).open();
      }
      if (evt.target.id === 'manageFeeds') {
        new ManageFeedsModal(this.app).open();
      }
		});

		// this.registerInterval(window.setInterval(async () => await saveFeedsData(), 5 * 60 * 1000));
	}

	async onunload() {
    await saveFeedsData();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_FEEDS_READER);
	}

  async activateView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FEEDS_READER);
    let leaf: WorkspaceLeaf | null = null;

    if (leaves?.length > 0) {
        leaf = leaves[0];
    }
    if (!leaf) {
        leaf = this.app.workspace.getLeaf(false);
    }
    if (!leaf) {
        leaf = this.app.workspace.activeLeaf;
    }

    await leaf.setViewState({
        type: VIEW_TYPE_FEEDS_READER,
        active: true
    });

    this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(VIEW_TYPE_FEEDS_READER)[0]
    );

    if (Global.currentFeed != '') {
      show_feed();
    }
  }

	async loadSettings() {
    Global.feeds_reader_dir = 'feeds-reader';
    Global.feeds_data_fname = 'feeds-data.json';
    Global.feeds_store_base = 'feeds-store';
    Global.subscriptions_fname = 'subscriptions.json';
    Global.showAll = false;
    Global.titleOnly = true;
    Global.itemOrder = 'New to old';
    Global.currentFeed = '';
    Global.currentFeedName = '';
    Global.nMergeLookback = 1000;
    Global.lenStrPerFile = 1024 * 1024;
    Global.nItemPerPage = 100;
    Global.feedsStoreChange = false;
    Global.feedsStoreChangeList = new Set<string>();
    Global.elUnreadCount = undefined;
    Global.maxTotalnumDisplayed = 1e4;
    Global.nThanksSep = 20;

		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

  getNumFromId(idstr, pref) {
    var n = pref.length;
    return parseInt(idstr.substring(n));
  }
}

function mergeStoreWithNewData(newdata: RssFeedContent, key: string) {
  if (!Global.feedsStore.hasOwnProperty(key)) {
    Global.feedsStore[key] = newdata;
    Global.feedsStoreChange = true;
    Global.feedsStoreChangeList.add(key);
    return newdata.items.length;
  }
  Global.feedsStore[key].title = newdata.title;
  Global.feedsStore[key].subtitle = newdata.subtitle;
  Global.feedsStore[key].description = newdata.description;
  Global.feedsStore[key].pubDate = newdata.pubDate;
  var nNew = 0;
  var nLookback = Math.min(Global.nMergeLookback, Global.feedsStore[key].items.length);
  for (var j=newdata.items.length-1; j>=0; j--) {
    var found = false;
    for (let i=0; i<nLookback; i++) {
      if (Global.feedsStore[key].items[i].link === newdata.items[j].link) {
        found = true;
        break;
      }
    }
    if (!found) {
      nNew += 1;
      Global.feedsStore[key].items.unshift(newdata.items[j]);
      Global.feedsStoreChange = true;
      Global.feedsStoreChangeList.add(key);
    }
  }
  return nNew;
}

async function updateOneFeed(fdUrl: string) {
  var nNew = 0;
  var res = await getFeedItems(fdUrl);
  if ((res != undefined) && (res.items != undefined)) {
    nNew = mergeStoreWithNewData(res, fdUrl);
    if (nNew > 0) {
      var stats = getFeedStats(fdUrl);
      document.getElementById('unreadCount' + fdUrl).innerText = stats.unread.toString();
      if (fdUrl === Global.currentFeed) {
        Global.elUnreadCount.innerText = stats.unread.toString();
        Global.undoList = [];
        Global.idxItemStart = 0;
        Global.nPage = 1;
        makeDisplayList();
        show_feed();
      }
      if (stats.total < Global.maxTotalnumDisplayed) {
        document.getElementById('totalCount' + fdUrl).innerText = stats.total.toString();
      }
      await saveFeedsData();
    }
    return [nNew, res.items.length];
  } else {
    return [0, 0];
  }
}


class SearchModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
    this.titleEl.innerText = "Search";
    const form = contentEl.createEl('table');
    form.style["width"] = "100%";
    form.className = "searchForm";
    var tr = form.createEl('tr');
    tr.createEl('td', {text: 'Search terms'});
    var td = tr.createEl('td');
    td.style["width"] = "70%";
    var inputBox = td.createEl('input');
    inputBox.id = 'searchTerms';
    inputBox.style["width"] = "70%";
    tr = form.createEl('tr');
    tr.createEl('td', {text: "Wordwise"});
    var checkBoxWordwise = tr.createEl('td').createEl('input');
    checkBoxWordwise.id = 'checkBoxWordwise';
    checkBoxWordwise.type = 'checkBox';
    tr = form.createEl('tr');
    var searchButton = tr.createEl('td').createEl('button', {text: "Search"});
    searchButton.addEventListener("click", async () => {
      var wordWise = document.getElementById('checkBoxWordwise').checked;
      var searchTerms = ([...new Set(document.getElementById('searchTerms').value.toLowerCase().split(/[ ,;\t\n]+/))]
                         .filter(i => i)
                         .sort((a,b) => {return b.length-a.length;}));
      if (searchTerms.length === 0) {
        return;
      }
      let fd = Global.feedsStore[Global.currentFeed].items;
      var sep = /\s+/;
      Global.displayIndices = [];
      for (let i=0; i<fd.length; i++) {
        let item = fd[i];
        var sItems;
        if (wordWise) {
          sItems = (item.title.toLowerCase().split(sep)
              .concat(item.creator.toLowerCase().split(sep))
              .concat(item.content.toLowerCase().split(sep)));
        } else {
          sItems = [item.title.toLowerCase(), item.creator.toLowerCase(),
                    item.content.toLowerCase()].join(' ');
        }
        let found = true;
        for (let j=0; j<searchTerms.length; j++) {
          if (!sItems.includes(searchTerms[j])) {
            found = false;
            break;
          }
        }
        if (found) {
          Global.displayIndices.push(i);
        }
      }
      show_feed();
      this.close();
    });
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class AddFeedModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
    this.titleEl.innerText = "Add feed";
    const form = contentEl.createEl('table');
    form.className = "addFeedForm";
    var tr = form.createEl('tr');
    tr.createEl('td', {text: "Name"});
    var tdnewFeedName = tr.createEl('td').createEl('input');
    tdnewFeedName.style["width"] = "70%";
    tdnewFeedName.id = 'newFeedName';
    tr = form.createEl('tr');
    tr.createEl('td', {text: "URL"});
    var tdnewFeedUrl = tr.createEl('td').createEl('input');
    tdnewFeedUrl.style["width"] = "70%";
    tdnewFeedUrl.id = 'newFeedUrl';
    tr = form.createEl('tr');
    tr.createEl('td', {text: "Folder"});
    var tdnewFeedFolder = tr.createEl('td').createEl('input');
    tdnewFeedFolder.id = 'newFeedFolder';
    tdnewFeedFolder.style["width"] = "70%";
    tr = form.createEl('tr');
    var saveButton = tr.createEl('td').createEl('button', {text: "Save"});
    saveButton.addEventListener("click", async () => {
      var newFeedName = document.getElementById('newFeedName').value;
      var newFeedUrl = document.getElementById('newFeedUrl').value;
      var newFeedFolder = document.getElementById('newFeedFolder').value;
      if ((newFeedName == "") || (newFeedUrl == "")) {
        new Notice("Feed name and url must not be empty.", 1000);
        return;
      }
      for (var i=0; i<Global.feedList.length; i++) {
        if (Global.feedList[i].feedUrl == newFeedUrl) {
          new Notice("Not added: url already included.", 1000);
          return;
        }
        if (Global.feedList[i].name == newFeedName) {
          new Notice("Not added: name already used.", 1000);
          return;
        }
      }
      Global.feedList.push({
        name: newFeedName,
        feedUrl: newFeedUrl,
        folder: newFeedFolder,
        unread: 0,
        updated: 0
      });
      await saveSubscriptions();
      sort_feed_list();
      await createFeedBar();
    });
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}


class ManageFeedsModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
    this.titleEl.innerText = "Manage feeds";
    contentEl.appendChild(sanitizeHTMLToDom('<div><b>CAUTION:</b><br>All actions take effect immediately and cannot be undone!<br>N: name; U: url; F: folder; T: total number of items; R: number of items marked as read; D: number of items marked as deleted; A: average length of items; S: storage size.</div><hr>'));

    const actions = contentEl.createEl('div');

    const btApplyChanges = actions.createEl('button', {text: 'Modify N/U/F'});
    const btMarkAllRead = actions.createEl('button', {text: 'Mark all read'});
    const btPurgeDeleted = actions.createEl('button', {text: 'Purge deleted'});
    const btRemoveContent = actions.createEl('button', {text: 'Remove content'});
    const btRemoveContentOld = actions.createEl('button', {text: 'Remove old content'});
    const btPurgeAll = actions.createEl('button', {text: 'Purge all'});
    const btPurgeOldHalf = actions.createEl('button', {text: 'Purge old'});
    const btDeduplicate = actions.createEl('button', {text: 'Deduplicate'});
    const btRemoveFeed = actions.createEl('button', {text: 'Remove feed'});

    btApplyChanges.addEventListener('click', async () => {
      for (var i=0; i<Global.feedList.length; i++) {
        var newName = document.getElementById('manageFdName' + i.toString()).value;
        var newUrl = document.getElementById('manageFdUrl' + i.toString()).value;
        var newFolder = document.getElementById('manageFdFolder' + i.toString()).value;
        var sMsg = '';
        if (Global.feedList[i].name != newName) {
          sMsg += 'Name: ' + Global.feedList[i].name + ' -> ' + newName;
        }
        if (Global.feedList[i].feedUrl != newUrl) {
          sMsg += '\nUrl: ' + Global.feedList[i].feedUrl + ' -> ' + newUrl;
        }
        if (Global.feedList[i].folder != newFolder) {
          sMsg += '\nFolder: ' + Global.feedList[i].folder + ' -> ' + newFolder;
        }
        if (sMsg !== '') {
          if (window.confirm("Apply changes for " + Global.feedList[i].name + '?\n' + sMsg)) {
            if (Global.feedList[i].name != newName) {
              var alreadyIncluded = false;
              for (var j=0; j<Global.feedList.length; j++) {
                if ((j != i) && (Global.feedList[j].name === newName)) {
                  new Notice("Not changed: name already included.", 1000);
                  alreadyIncluded = True;
                  break;
                }
              }
              if (!alreadyIncluded) {
                for (var j=0;;j++) {
                  var fpath_old = [Global.feeds_reader_dir, Global.feeds_store_base,
                                   makeFilename(Global.feedList[i].name, j)].join('/');
                  var fpath_new = [Global.feeds_reader_dir, Global.feeds_store_base,
                                   makeFilename(newName, j)].join('/');
                  if (await app.vault.exists(fpath_old)) {
                    await app.vault.adapter.rename(fpath_old, fpath_new);
                  } else {
                    break;
                  }
                }
                if (Global.currentFeedName === Global.feedList[i].name) {
                  Global.currentFeedName = newName;
                }
                Global.feedList[i].name = newName;
              }
            }
            if (Global.feedList[i].feedUrl != newUrl) {
              var alreadyIncluded = false;
              for (var j=0; j<Global.feedList.length; j++) {
                if ((j != i) && (Global.feedList[j].feedUrl === newUrl)) {
                  new Notice("Not changed: url already included.", 1000);
                  alreadyIncluded = True;
                  break;
                }
              }
              if (!alreadyIncluded) {
                if (Global.currentFeed === Global.feedList[i].feedUrl) {
                  Global.currentFeed = newUrl;
                }
                Global.feedsStore[newUrl] = Global.feedsStore[Global.feedList[i].feedUrl];
                delete Global.feedsStore[Global.feedList[i].feedUrl];
                Global.feedList[i].feedUrl = newUrl;
              }
            }
            if (Global.feedList[i].folder != newFolder) {
              Global.feedList[i].folder = newFolder;
            }
            await saveSubscriptions();
            sort_feed_list();
            await createFeedBar();
          }
        }
      }
    });
    btMarkAllRead.addEventListener('click', () => {
      if (window.confirm('Sure?')) {
      [...document.getElementsByClassName('checkThis')]
      .filter(el => el.checked)
      .forEach(el => {markAllRead(el.getAttribute('val'));});}});
    btPurgeDeleted.addEventListener('click', () => {
      if (window.confirm('Sure?')) {
      [...document.getElementsByClassName('checkThis')]
      .filter(el => el.checked)
      .forEach(el => {purgeDeleted(el.getAttribute('val'));});}});
    btRemoveContent.addEventListener('click', () => {
      if (window.confirm('Sure?')) {
      [...document.getElementsByClassName('checkThis')]
      .filter(el => el.checked)
      .forEach(el => {removeContent(el.getAttribute('val'));});}});
    btRemoveContentOld.addEventListener('click', () => {
      if (window.confirm('Sure?')) {
      [...document.getElementsByClassName('checkThis')]
      .filter(el => el.checked)
      .forEach(el => {removeContentOld(el.getAttribute('val'));});}});
    btPurgeAll.addEventListener('click', () => {
      if (window.confirm('Sure?')) {
      [...document.getElementsByClassName('checkThis')]
      .filter(el => el.checked)
      .forEach(el => {purgeAll(el.getAttribute('val'));});}});
    btPurgeOldHalf.addEventListener('click', () => {
      if (window.confirm('Sure?')) {
      [...document.getElementsByClassName('checkThis')]
      .filter(el => el.checked)
      .forEach(el => {purgeOldHalf(el.getAttribute('val'));});}});
    btDeduplicate.addEventListener('click', () => {
      if (window.confirm('Sure?')) {
      [...document.getElementsByClassName('checkThis')]
      .filter(el => el.checked)
      .forEach(el => {var nRemoved = deduplicate(el.getAttribute('val'));
                      new Notice(nRemoved + " removed for " + el.getAttribute('fdName'), 2000);});}});
    btRemoveFeed.addEventListener('click', () => {
      if (window.confirm('Sure?')) {
      [...document.getElementsByClassName('checkThis')]
      .filter(el => el.checked)
      .forEach(el => {removeFeed(el.getAttribute('val'));});}});

    const formContainer = contentEl.createEl('div');
    const form = formContainer.createEl('table');
    form.className = 'manageFeedsForm';
    var tr = form.createEl('thead').createEl('tr');
    tr.createEl('th', {text: "N/U"});
    tr.createEl('th', {text: "F"});
    tr.createEl('th', {text: "T"});
    tr.createEl('th', {text: "R"});
    tr.createEl('th', {text: "D"});
    tr.createEl('th', {text: "A"});
    tr.createEl('th', {text: "S"});
    const checkAll = tr.createEl('th').createEl('input');
    checkAll.type = 'checkBox';
    checkAll.id = 'checkAll';
    checkAll.addEventListener('click', (evt) => {
      if (document.getElementById('checkAll').checked) {
        [...document.getElementsByClassName('checkThis')].forEach(el => {el.checked = true;});
      } else {
        [...document.getElementsByClassName('checkThis')].forEach(el => {el.checked = false;});
      }
    });

    var tbody = form.createEl('tbody');
    var nTotal=0, nRead=0, nDeleted=0, nLength=0, nStoreSize=0;
    for (var i=0; i<Global.feedList.length; i++) {
      var tr = tbody.createEl('tr');
      var cellNameContainer = tr.createEl('td');
      cellNameContainer.className = 'cellNameContainer';
      const elName = cellNameContainer.createEl('input', {value: Global.feedList[i].name});
      elName.readOnly = false;
      elName.id = 'manageFdName' + i.toString();
      const elUrl = cellNameContainer.createEl('input', {value: Global.feedList[i].feedUrl});
      elUrl.readOnly = false;
      elUrl.id = 'manageFdUrl' + i.toString();
      const cellFolderContainer = tr.createEl('td');
      cellFolderContainer.className = 'cellFolderContainer';
      const elFolder = cellFolderContainer.createEl('input', {value: Global.feedList[i].folder});
      elFolder.readOnly = false;
      elFolder.id = 'manageFdFolder' + i.toString();

      var stats = getFeedStats(Global.feedList[i].feedUrl);
      var storeSizeInfo = getFeedStorageInfo(Global.feedList[i].feedUrl);
      tr.createEl('td', {text: stats.total.toString()});
      tr.createEl('td', {text: stats.read.toString()});
      tr.createEl('td', {text: stats.deleted.toString()});
      tr.createEl('td', {text: storeSizeInfo[0]});
      tr.createEl('td', {text: storeSizeInfo[1]});
      const checkThis = tr.createEl('td').createEl('input');
      checkThis.type = 'checkBox';
      checkThis.className = 'checkThis';
      checkThis.setAttribute('val', Global.feedList[i].feedUrl);
      checkThis.setAttribute('fdName', Global.feedList[i].name);

      nTotal += stats.total;
      nRead += stats.read;
      nDeleted += stats.deleted;
      nLength += storeSizeInfo[2];
      nStoreSize += storeSizeInfo[3];
    }
    var tr = tbody.createEl('tr');
    tr.createEl('td');
    tr.createEl('td');
    tr.createEl('td', {text: nTotal.toString()});
    tr.createEl('td', {text: nRead.toString()});
    tr.createEl('td', {text: nDeleted.toString()});
    tr.createEl('td', {text: Math.floor(nLength/nTotal).toString()});
    tr.createEl('td', {text: getStoreSizeStr(nStoreSize)});
	}

	async onClose() {
		const {contentEl} = this;
    if (Global.feedsStoreChange) {
      await createFeedBar();
    }
		contentEl.empty();
	}
}


class SampleSettingTab extends PluginSettingTab {
	plugin: FeedsReader;

	constructor(app: App, plugin: FeedsReader) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for RSS Feed Reader.'});

		new Setting(containerEl)
			.setName('Folder name')
			.setDesc('This is the folder in the vault where to save the feeds data.')
			.addText(text => text
				.setPlaceholder('feeds-reader')
				.setValue(this.plugin.settings.feeds_reader_dir)
				.onChange(async (value) => {
					this.plugin.settings.feeds_reader_dir = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Subscription file name')
			.setDesc('This is the file name for the subscriptions.')
			.addText(text => text
				.setPlaceholder('subscriptions.json')
				.setValue(this.plugin.settings.subscriptions_fname)
				.onChange(async (value) => {
					this.plugin.settings.subscriptions_fname = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Feeds data file name')
			.setDesc('This is the file name for the feeds items.')
			.addText(text => text
				.setPlaceholder('feeds-data.json')
				.setValue(this.plugin.settings.feeds_data_fname)
				.onChange(async (value) => {
					this.plugin.settings.feeds_data_fname = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Show all by default')
			.setDesc('Show all items or only unread items.')
			.addToggle(cb => cb
        .setValue(this.plugin.settings.showAll)
        .onChange(async (val) => {
        this.plugin.settings.showAll = val;
        await this.plugin.saveSettings();}));
	}
}

export async function saveFeedsData () {
  var nSaved = 0;
  if (!Global.feedsStoreChange) {
    return nSaved;
  }
  for (var i=0; i<Global.feedList.length; i++) {
    key = Global.feedList[i].feedUrl;
    if (!Global.feedsStoreChangeList.has(key)) {
      continue;
    }
    if (!Global.feedsStore.hasOwnProperty(key)) {
      continue;
    }
    nSaved += (await saveStringSplitted(JSON.stringify(Global.feedsStore[key], null, 1),
                Global.feeds_reader_dir + '/' + Global.feeds_store_base,
                Global.feedList[i].name,
                Global.lenStrPerFile, 0));
  }

  // if (! await this.app.vault.exists(Global.feeds_reader_dir)) {
  //   await this.app.vault.createFolder(Global.feeds_reader_dir);
  // }
  // var fpath: string = Global.feeds_reader_dir + '/' + Global.feeds_data_fname;
  // if (! await this.app.vault.exists(fpath)) {
  //   await this.app.vault.create(fpath, JSON.stringify(Global.feedsStore, null, 1));
  // } else {
  //   await this.app.vault.adapter.write(fpath, JSON.stringify(Global.feedsStore, null, 1));
  // }

  Global.feedsStoreChange = false;
  Global.feedsStoreChangeList.clear();
  return nSaved;
}

export async function loadFeedsStoredData() {
  var noSplitFile = true;
  Global.feedsStore = {};
  for (var i=0; i<Global.feedList.length; i++) {
    var res = await loadStringSplitted(Global.feeds_reader_dir + '/' + Global.feeds_store_base, Global.feedList[i].name);
    if (res.length > 0) {
      Global.feedsStore[Global.feedList[i].feedUrl] = JSON.parse(res);
      noSplitFile = false;
    }
  }
  if (noSplitFile) {
    if (! await this.app.vault.exists(Global.feeds_reader_dir)) {
      await this.app.vault.createFolder(Global.feeds_reader_dir);
    }
    var fpath = Global.feeds_reader_dir+'/'+Global.feeds_data_fname;
    if (await this.app.vault.exists(fpath)) {
      Global.feedsStore = JSON.parse(await this.app.vault.adapter.read(fpath));
    }
  }
  // // Remove redundant properties saved in the json files.
  // for (const k in Global.feedsStore) {
  //   for (var i=0; i<Global.feedsStore[k].items.length; i++) {
  //     const item = Global.feedsStore[k].items[i];
  //     var keys = Object.keys(item);
  //     var change = false;
  //     for (var j=0; j<keys.length; j++) {
  //       if (!(itemKeys.includes(keys[j]))) {
  //         delete item[keys[j]];
  //         change = true;
  //       }
  //     }
  //     if (change) {
  //       Global.feedsStoreChange = true;
  //       Global.feedsStore[k].items[i] = item;
  //     }
  //   }
  // }
}

function str2filename(s: string) {
  var illegalRe = /[\/\?<>\\:\*\|"]/g;
  var controlRe = /[\x00-\x1f\x80-\x9f]/g;
  var reservedRe = /^\.+$/;
  var windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
  var windowsTrailingRe = /[\. ]+$/;
  var replacement = ' ';
  s = unEscape(s);
  return s.replace(illegalRe, replacement)
          .replace(controlRe, replacement)
          .replace(reservedRe, replacement)
          .replace(windowsReservedRe, replacement)
          .replace(windowsTrailingRe, replacement)
          .replace(/[\[\]]/g, '')
          .replace(/[_-]\s+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .replace(/[_-]*\s+$/g, '');
}

function unEscape(htmlStr) {
    return htmlStr.replace(/&lt;/g , "<")
                  .replace(/&gt;/g , ">")
                  .replace(/&quot;/g , "\"")
                  .replace(/&#39;/g , "\'")
                  .replace(/&amp;/g , "&")
                  .replace(/&nbsp;/g , " ");
}

export function getFeedStats(feedUrl: string) {
  if (!Global.feedsStore.hasOwnProperty(feedUrl)) {
    return {total: 0, read: 0, deleted: 0, unread: 0};
  }
  var fd = Global.feedsStore[feedUrl];
  var nRead = 0, nDeleted = 0, nUnread = 0, nTotal = fd.items.length;
  for (var i=0; i<nTotal; i++) {
    if (fd.items[i].read != '') {
      nRead += 1;
    }
    if (fd.items[i].deleted != '') {
      nDeleted += 1;
    }
    if ((fd.items[i].read === '') && (fd.items[i].deleted === '')) {
      nUnread += 1;
    }
  }
  return {total: nTotal, read: nRead, deleted: nDeleted, unread: nUnread};
}


export function getFeedStorageInfo(feedUrl: string) {
  if (!Global.feedsStore.hasOwnProperty(feedUrl)) {
    return ['0', '0', 0, 0];
  }
  if (Global.feedsStore[feedUrl].items.length == 0) {
    return ['0', '0', 0, 0];
  }
  const s = JSON.stringify(Global.feedsStore[feedUrl], null, 1);
  const sz = (new Blob([s])).size;
  const szstr = getStoreSizeStr(sz);
  return [Math.floor(s.length/Global.feedsStore[feedUrl].items.length).toString(), szstr, s.length, sz];
}

function getStoreSizeStr(sz: number) {
  let szstr = '';
  if (sz <= 1e3) {
    szstr = sz.toString() + 'B';
  } else if (sz <= 1e6) {
    szstr = (sz/1e3).toFixed(1) + 'kB';
  } else if (sz <= 1e9) {
    szstr = (sz/1e6).toFixed(1) + 'MB';
  } else if (sz <= 1e12) {
    szstr = (sz/1e9).toFixed(1) + 'GB';
  } else {
    szstr = (sz/1e12).toFixed(1) + 'TB';
  }
  return szstr;
}


function markAllRead(feedUrl: string) {
  var nowStr = nowdatetime();
  for (var i=0; i<Global.feedsStore[feedUrl].items.length; i++) {
    if (Global.feedsStore[feedUrl].items[i].read === "") {
      Global.feedsStore[feedUrl].items[i].read = nowStr;
    }
  }
  Global.feedsStoreChange = true;
  Global.feedsStoreChangeList.add(feedUrl);
}

function purgeDeleted(feedUrl: string) {
  Global.feedsStore[feedUrl].items = Global.feedsStore[feedUrl].items.filter(item => item.deleted === "");
  Global.feedsStoreChange = true;
  Global.feedsStoreChangeList.add(feedUrl);
}

function removeContent(feedUrl: string) {
  for (var i=0; i<Global.feedsStore[feedUrl].items.length; i++) {
    Global.feedsStore[feedUrl].items[i].content = '';
    Global.feedsStore[feedUrl].items[i].creator = '';
  }
  Global.feedsStoreChange = true;
  Global.feedsStoreChangeList.add(feedUrl);
}

function removeContentOld(feedUrl: string) {
  var iDel = Math.floor(Global.feedsStore[feedUrl].items.length / 2);
  for (var i=iDel; i<Global.feedsStore[feedUrl].items.length; i++) {
    Global.feedsStore[feedUrl].items[i].content = '';
    Global.feedsStore[feedUrl].items[i].creator = '';
  }
  Global.feedsStoreChange = true;
  Global.feedsStoreChangeList.add(feedUrl);
}

function purgeAll(feedUrl: string) {
  Global.feedsStore[feedUrl].items.length = 0;
  Global.feedsStoreChange = true;
  Global.feedsStoreChangeList.add(feedUrl);
}

function purgeOldHalf(feedUrl: string) {
  var iDel = Math.floor(Global.feedsStore[feedUrl].items.length / 2);
  Global.feedsStore[feedUrl].items.splice(iDel);
  Global.feedsStoreChange = true;
  Global.feedsStoreChangeList.add(feedUrl);
}

function deduplicate(feedUrl: string) {
  var n = Global.feedsStore[feedUrl].items.length;
  const delete_mark = 'DELETE-NOW';
  for (var i=0; i<n; i++) {
    for (var j=0; j<i; j++) {
      if (Global.feedsStore[feedUrl].items[i].link === Global.feedsStore[feedUrl].items[j].link) {
        Global.feedsStore[feedUrl].items[j].deleted = delete_mark;
      }
    }
  }
  const nBefore = Global.feedsStore[feedUrl].items.length;
  Global.feedsStore[feedUrl].items = Global.feedsStore[feedUrl].items.filter(item => item.deleted != delete_mark);
  const nAfter = Global.feedsStore[feedUrl].items.length;
  if (nBefore > nAfter) {
    Global.feedsStoreChange = true;
    Global.feedsStoreChangeList.add(feedUrl);
  }
  return nBefore - nAfter;
}

async function removeFeed(feedUrl: string) {
  for (var i=0; i<Global.feedList.length; i++) {
    if (Global.feedList[i].feedUrl === feedUrl) {
      if (Global.feedsStore.hasOwnProperty(feedUrl)) {
        delete Global.feedsStore[feedUrl];
        await removeFileFragments(Global.feeds_reader_dir + '/' + Global.feeds_store_base, Global.feedList[i].name);
      }
      Global.feedList.splice(i, 1);
      Global.feedsStoreChange = true;
      Global.feedsStoreChangeList.add(feedUrl);
      await saveSubscriptions();
      break;
    }
  }
}

function handle_img_tag(s: string) {
    // return s.replace(/<img src="\/\/([^>]+>)/g, "\n<img src=\"https://$1\n");
  return s.replace(/<img src="\/\//g, "<img src=\"https://")
          .replace(/<img src="([^"]+)"[^>]+>/g, "\n![]($1)\n");
}

function handle_a_tag(s: string) {
  return s.replace(/<a href="\/\//g, "<a href=\"https://")
          .replace(/<a href="([^"]+)"\s*>([^<]*)<\/a>/g, "[$2]($1)");
}

function handle_tags(s: string) {
  return s.replace(/<p>/g, ' ').replace(/<\/p>(\s*\S)/g, '\n>\n> $1').replace(/<\/p>/g, ' ')
          .replace(/<div>/g, ' ').replace(/<\/div>/g, ' ')
          .replace(/<br>/g, ' ').replace(/<br\/>/g, ' ')
          .replace(/<span>/g, ' ').replace(/<\/span>/g, ' ');
}

function sort_feed_list() {
  Global.feedList.sort((n1,n2) => {
    if (n1.folder > n2.folder) {return 1;}
    if (n1.folder < n2.folder) {return -1;}
    return 0;
  });
}

function makeDisplayList() {
  Global.displayIndices = [];
  var fd = Global.feedsStore[Global.currentFeed];
  if (fd === undefined) {
    return;
  }
  for (var i=0; i<fd.items.length; i++) {
    if ((Global.showAll) || ((fd.items[i].read === '') && (fd.items[i].deleted === ''))) {
      Global.displayIndices.push(i);
    }
  }
  if (Global.itemOrder === 'Old to new') {
    Global.displayIndices.reverse();
  }
  if (Global.itemOrder === 'Random') {
    // From: https://dev.to/codebubb/how-to-shuffle-an-array-in-javascript-2ikj
    (array => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
      }
    })(Global.displayIndices);
  }
}


async function show_feed() {
   if (Global.currentFeed === '') {
     return;
   }
   const feed_content = document.getElementById('feed_content');
   feed_content.empty();

   const feedTitle = feed_content.createEl('h1');
   feedTitle.className = 'feedTitle';

   if (!Global.feedsStore.hasOwnProperty(Global.currentFeed)) {
     return;
   }
   var fd = Global.feedsStore[Global.currentFeed];
   feedTitle.createEl('a', {href: sanitizeHTMLToDom(fd.link).textContent}).appendChild(sanitizeHTMLToDom(fd.title));
   if (fd.pubDate != '') {
     feed_content.createEl('div', {text: fd.pubDate});
   }
   var nDisplayed = 0;
   for (var i=Global.idxItemStart;
        i<Math.min(Global.displayIndices.length, Global.idxItemStart+Global.nItemPerPage);
        i++) {
     idx = Global.displayIndices[i];
     item = fd.items[idx];
     const itemEl = feed_content.createEl('div');
     itemEl.className = 'oneFeedItem';
     itemEl.id = item.link;
     itemEl.createEl('hr');
     const itemTitle = itemEl.createEl('div');
     itemTitle.className = 'itemTitle';
     itemTitle.createEl('a', {href: sanitizeHTMLToDom(item.link).textContent})
              .appendChild(sanitizeHTMLToDom(item.title));
     const elCreator = itemEl.createEl('div');
     elCreator.className = 'itemCreator';
     elCreator.appendChild(sanitizeHTMLToDom(item.creator));
     var elPubDate;
     if (item.pubDate != "") {
       elPubDate = itemEl.createEl('div', {text: item.pubDate});
     } else {
       elPubDate = itemEl.createEl('div', {text: item.downloaded});
     }
     elPubDate.className = 'elPubDate';
     let tr = itemEl.createEl('table').createEl('tr');
     tr.className = 'itemActions';
     var t_read = "Read";
     if (item.read != '') {
       t_read = 'Unread';
     }
     const toggleRead = tr.createEl('td').createEl('div', {text: t_read});
     toggleRead.className = 'toggleRead';
     toggleRead.id = 'toggleRead' + idx;
     const noteThis = tr.createEl('td').createEl('div', {text: "Save"});
     noteThis.className = 'noteThis';
     noteThis.id = 'noteThis' + idx;
     var t_delete = "Delete";
     if (item.deleted != '') {
       t_delete = 'Undelete';
     }
     const toggleDelete = tr.createEl('td').createEl('div', {text: t_delete});
     toggleDelete.className = 'toggleDelete';
     toggleDelete.id = 'toggleDelete' + idx;
     if (!Global.titleOnly) {
       const elContent = itemEl.createEl('div');
       elContent.className = 'itemContent';
       elContent.appendChild(sanitizeHTMLToDom(item.content.replace(/<img src="\/\//g,"<img src=\"https://")));
     } else {
       const showItemContent = itemEl.createEl('div', {text: '>>> >>>'});
       showItemContent.className = 'showItemContent';
       showItemContent.setAttribute('_link', item.link);
       showItemContent.setAttribute('_idx', idx);
     }
     nDisplayed += 1;
   }
   feed_content.createEl('hr');
   const next_prev = feed_content.createEl('div');
   if (Global.nPage > 1) {
     const prevPage = next_prev.createEl('span', {text: "Prev"});
     prevPage.className = "next_prev";
     prevPage.id = "prevPage";
   }
   if (Global.idxItemStart+Global.nItemPerPage < Global.displayIndices.length) {
     const nextPage = next_prev.createEl('span', {text: "Next"});
     nextPage.className = "next_prev";
     nextPage.id = "nextPage";
   }
   var stats = getFeedStats(Global.currentFeed);
   //  Global.elUnreadCount = document.getElementById('unreadCount' + Global.currentFeed);
   Global.elTotalCount = document.getElementById('totalCount' + Global.currentFeed);
   Global.elSepUnreadTotal = document.getElementById('sepUnreadTotal' + Global.currentFeed);
   Global.elUnreadCount.innerText = stats.unread.toString();
   if (fd.items.length < Global.maxTotalnumDisplayed) {
     Global.elTotalCount.innerText = fd.items.length.toString();
     Global.elSepUnreadTotal.innerText = '/';
   } else {
     Global.elTotalCount.innerText = '';
     Global.elSepUnreadTotal.innerText = '';
   }
}


function sanitize(s: string) {
  // https://stackoverflow.com/questions/6659351/removing-all-script-tags-from-html-with-js-regular-expression
  // var SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  var SCRIPT_REGEX = /<script(?:(?!\/\/)(?!\/\*)[^'"]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*(?:\n)|\/\*(?:(?:.|\s))*?\*\/)*?<\/script\s*>/gi;
  var onerror_regex = /onerror\s*=\s*/gi;
  var onclick_regex = /onclick\s*=\s*/gi;
  var onmouseover_regex = /onmouseover\s*=\s*/gi;
  var onload_regex = /onload\s*=\s*/gi;
  [SCRIPT_REGEX, onerror_regex, onclick_regex, onmouseover_regex, onload_regex].forEach(r => {
    while (r.test(s)) {
      s = s.replace(r, " ");
    }
  });
  return s;
}

export async function loadSubscriptions() {
  var fpath_feedList = Global.feeds_reader_dir+'/'+Global.subscriptions_fname;
  Global.feedList = [];
  if (await this.app.vault.exists(fpath_feedList)) {
    Global.feedList = await JSON.parse(await
      this.app.vault.adapter.read(fpath_feedList));
  }
  if (Global.feedList.length == 0) {
    new Notice('No feed yet. Use "Add feed".', 5000);
  }
  sort_feed_list();
}


async function saveSubscriptions() {
  if (! await this.app.vault.exists(Global.feeds_reader_dir)) {
    await this.app.vault.createFolder(Global.feeds_reader_dir);
  }
  var fpath_feedList = Global.feeds_reader_dir+'/'+Global.subscriptions_fname;
  if (! await this.app.vault.exists(fpath_feedList)) {
      await this.app.vault.create(fpath_feedList, JSON.stringify(Global.feedList, null, 1));
  } else {
      await this.app.vault.adapter.write(fpath_feedList, JSON.stringify(Global.feedList, null, 1));
  }
}

async function saveStringToFile(s: string, folder: string, fname: string) {
  var written = 0;
  if (! await app.vault.exists(folder)) {
    await app.vault.createFolder(folder);
  }
  var fpath = folder + "/" + fname;
  if (! await app.vault.exists(fpath)) {
    await app.vault.create(fpath, s);
    written = 1;
  } else {
    if ((await app.vault.adapter.read(fpath)) != s) {
      await app.vault.adapter.write(fpath, s);
      written = 1;
    }
  }
  return written;
}

async function saveStringSplitted(s: string, folder: string, fname_base: string, nCharPerFile: number, iPostfix: number) {
  try {
    var lenTotal = s.length;
    if (lenTotal === 0) {
      // Remove redundant files with higher serial number.
      for (var i=0;;i++) {
        var fpath_unneeded = folder + '/' + makeFilename(fname_base, iPostfix+i);
        if (await app.vault.exists(fpath_unneeded)) {
          await app.vault.adapter.remove(fpath_unneeded);
          new Notice('Redundant file ' + fpath_unneeded + ' removed.', 2000);
        } else {
          break;
        }
      }
      return 0;
    }
  } catch (e) {
    return 0;
  }
  var fname = makeFilename(fname_base, iPostfix);
  return ((await saveStringToFile(s.substring(lenTotal-nCharPerFile), folder, fname)) +
          + (await saveStringSplitted(s.substring(0, lenTotal-nCharPerFile), folder, fname_base, nCharPerFile, iPostfix+1)));
}

async function loadStringSplitted(folder: string, fname_base: string) {
  var res = '';
  if (await app.vault.exists(folder)) {
    for (var i=0;;i++) {
      var fpath = folder + '/' + makeFilename(fname_base, i);
      if (! await app.vault.exists(fpath)) {
        break;
      }
      res = (await app.vault.adapter.read(fpath)).concat('', res);
    }
  }
  return res;
}

function makeFilename (fname_base: string, iPostfix: number) {
  return fname_base + '-' + iPostfix.toString() + '.json.frag';
}

async function removeFileFragments(folder: string, fname_base: string) {
  for (var i=0;;i++) {
    var fpath = folder + '/' + makeFilename(fname_base, i);
    if (! await app.vault.exists(fpath)) {
      break;
    }
    await app.vault.adapter.remove(fpath);
    new Notice(fpath + ' removed.', 2000);
  }
}
