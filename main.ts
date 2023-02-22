import { App, Editor, MarkdownView, Menu, Modal, Notice, addIcon, Plugin, PluginSettingTab, Setting } from 'obsidian';
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
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

    // this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
      if (evt.target.id === 'updateAll') {
        Global.feedList.forEach(async (f) => {
          var nNew = await updateOneFeed(f.feedUrl);
          if (nNew > 0) {
            new Notice(nNew.toString() + " new items for " + f.name, 3000);
          }
        });
      }
      if (evt.target.className === 'elUnreadTotalAndRefresh') {
        var fdUrl = evt.target.getAttribute('fdUrl');
        var nNew = await updateOneFeed(fdUrl);
        new Notice(nNew.toString() + " new items for " + evt.target.getAttribute('fdName'), 3000);
      }
      if (evt.target.className === 'showFeed') {
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
          var prevColor = document.getElementById(Global.currentFeed).style['color'];
          document.getElementById(previousFeed).style['color'] = prevColor;
        }
        document.getElementById(Global.currentFeed).style['color'] = '#f15500';
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
          elContent.innerHTML = sanitize(item.content.replace(/<img src="\/\//g,"<img src=\"https://"));
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
            '](' + sanitize(the_item.link) + ')\n> ' +
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
        Global.itemIdx = idx;
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
      }
      if (evt.target.className === 'toggleDelete') {
        var idx = this.getNumFromId(evt.target.id, 'toggleDelete');
        Global.itemIdx = idx;
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
      }
      if ((evt.target.className === 'toggleRead') ||
          (evt.target.className === 'toggleDelete')) {
        if ((!Global.showAll) && Global.hideThisItem) {
          document.getElementById(
            Global.feedsStore[Global.currentFeed].items[Global.itemIdx].link ).style.display = 'none';
        }
      }
      //
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
        if (toggle.innerText == 'Title only') {
          toggle.innerText = 'Show content';
          Global.titleOnly = false;
        } else {
          toggle.innerText = 'Title only';
          Global.titleOnly = true;
        }
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
          document.getElementById('naviBar').style.display = 'none';
          document.getElementById('contentBox').style['margin-left'] = '0mm';
          document.getElementById('toggleNaviContainer').style['background-color'] = '#bc90a1';
          document.getElementById('toggleNaviContainer').style['opacity'] = '0.9';
        } else {
          toggle.innerText = '>';
          var s = Global.elUnreadCount.innerText;
          Global.elUnreadCount = document.getElementById('unreadCount' + Global.currentFeed);
          Global.elUnreadCount.innerText = s;
          document.getElementById('toggleNaviAux').empty();
          document.getElementById('naviBar').style.display = 'block';
          document.getElementById('contentBox').style['margin-left'] = '160px';
          document.getElementById('toggleNaviContainer').style.removeProperty('background-color');
          document.getElementById('toggleNaviContainer').style.removeProperty('opacity');
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
  if (res != undefined) {
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
  }
  return nNew;
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
    var checkBox = tr.createEl('td').createEl('input');
    checkBox.id = 'checkBox';
    checkBox.type = 'checkBox';
    tr = form.createEl('tr');
    var searchButton = tr.createEl('td').createEl('button', {text: "Search"});
    searchButton.addEventListener("click", async () => {
      var wordWise = document.getElementById('checkBox').checked;
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
    contentEl.innerHTML = '<div><b>CAUTION:</b><br>All actions take effect immediately and cannot be undone!<br>To see the effect, save data then reopen the plugin.<br>N: name; U: url; F: folder; T: total number of items; R: number of items marked as read; D: number of items marked as deleted; A: average length of items; S: storage size.</div><hr>';
    const form = contentEl.createEl('table');
    form.className = "manageFeedsForm";
    var tr = form.createEl('thead').createEl('tr');
    tr.createEl('th', {text: "N/U/F/T/R/D/A/S"});
    tr.createEl('th', {text: "Actions"});
    var tbody = form.createEl('tbody');
    for (var i=0; i<Global.feedList.length; i++) {
      var tr = tbody.createEl('tr');
      var cellName = tr.createEl('td');
      cellName.className = 'cellInput';
      var stats = getFeedStats(Global.feedList[i].feedUrl);
      var storeSizeInfo = getFeedStorageInfo(Global.feedList[i].feedUrl);
      cellName.createEl('input', {value: Global.feedList[i].name}).readOnly = true;
      cellName.createEl('input', {value: Global.feedList[i].feedUrl}).readOnly = true;
      cellName.createEl('input', {value: Global.feedList[i].folder}).readOnly = true;
      cellName.createEl('input', {value: stats.total.toString() + '/' + stats.read.toString() +
          '/' + stats.deleted.toString() + '/' + storeSizeInfo[0] + '/' + storeSizeInfo[1]}).readOnly = true;
      var actions = tr.createEl('td');
      var btMarkAllRead = actions.createEl('button', {text: 'Mark all read'});
      var btPurgeDeleted = actions.createEl('button', {text: 'Purge deleted'});
      var btRemoveContent = actions.createEl('button', {text: 'Remove content'});
      var btRemoveContentOld = actions.createEl('button', {text: 'Remove old content'});
      var btPurgeAll = actions.createEl('button', {text: 'Purge all'});
      var btPurgeOldHalf = actions.createEl('button', {text: 'Purge old'});
      var btDeduplicate = actions.createEl('button', {text: 'Deduplicate'});
      var btRemoveFeed = actions.createEl('button', {text: 'Remove feed'});
      btMarkAllRead.setAttribute('val', Global.feedList[i].feedUrl);
      btPurgeDeleted.setAttribute('val', Global.feedList[i].feedUrl);
      btRemoveContent.setAttribute('val', Global.feedList[i].feedUrl);
      btRemoveContentOld.setAttribute('val', Global.feedList[i].feedUrl);
      btPurgeAll.setAttribute('val', Global.feedList[i].feedUrl);
      btPurgeOldHalf.setAttribute('val', Global.feedList[i].feedUrl);
      btDeduplicate.setAttribute('val', Global.feedList[i].feedUrl);
      btDeduplicate.setAttribute('fdName', Global.feedList[i].name);
      btRemoveFeed.setAttribute('val', Global.feedList[i].feedUrl);
      btMarkAllRead.addEventListener('click', (evt) => markAllRead(evt.target.getAttribute('val')));
      btPurgeDeleted.addEventListener('click', (evt) => purgeDeleted(evt.target.getAttribute('val')));
      btRemoveContent.addEventListener('click', (evt) => removeContent(evt.target.getAttribute('val')));
      btRemoveContentOld.addEventListener('click', (evt) => removeContentOld(evt.target.getAttribute('val')));
      btPurgeAll.addEventListener('click', (evt) => purgeAll(evt.target.getAttribute('val')));
      btPurgeOldHalf.addEventListener('click', (evt) => purgeOldHalf(evt.target.getAttribute('val')));
      btDeduplicate.addEventListener('click', (evt) => {
        var nRemoved = deduplicate(evt.target.getAttribute('val'));
        new Notice(nRemoved + " removed for " + evt.target.getAttribute('fdName'), 2000);});
      btRemoveFeed.addEventListener('click', async (evt) => removeFeed(evt.target.getAttribute('val')));
    }
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
    return ['0', '0'];
  }
  if (Global.feedsStore[feedUrl].items.length == 0) {
    return ['0', '0'];
  }
  const s = JSON.stringify(Global.feedsStore[feedUrl], null, 1);
  const sz = (new Blob([s])).size;
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
  return [Math.floor(s.length/Global.feedsStore[feedUrl].items.length).toString(), szstr];
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
   feedTitle.createEl('a', {href: sanitize(fd.link)}).innerText = sanitize(fd.title);
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
     itemEl.createEl('div')
     .createEl('a', {text: item.title.replace(/(<([^>]+)>)/gi, ""), href: sanitize(item.link)})
     .className = 'itemTitle';
     const elCreator = itemEl.createEl('div');
     elCreator.className = 'itemCreator';
     elCreator.innerHTML = sanitize(item.creator);
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
       elContent.innerHTML = sanitize(item.content.replace(/<img src="\/\//g,"<img src=\"https://"));
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
