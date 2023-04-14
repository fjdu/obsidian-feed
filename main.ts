import { App, MarkdownPreviewView, htmlToMarkdown, Modal, Notice, addIcon, Plugin, PluginSettingTab, Setting, sanitizeHTMLToDom } from 'obsidian';
import { FRView, VIEW_TYPE_FEEDS_READER, createFeedBar, waitForElm } from "./view";
import { getFeedItems, RssFeedContent, nowdatetime, itemKeys } from "./getFeed";
import { GLB } from "./globals";

// Remember to rename these classes and interfaces!

interface FeedsReaderSettings {
	feeds_reader_dir: string;
	feeds_data_fname: string;
	subscriptions_fname: string;
	showAll: boolean;
}

const DEFAULT_SETTINGS: FeedsReaderSettings = {
  nItemPerPage: 20
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

    this.addSettingTab(new FeedReaderSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
      if (evt.target.id === 'updateAll') {
        GLB.feedList.forEach(async (f) => {
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
        var previousFeed = GLB.currentFeed;
        GLB.currentFeed = evt.target.id;
        if (GLB.currentFeed === '') {
          return;
        }
        GLB.currentFeedName = '';
        for (var i=0; i<GLB.feedList.length; i++) {
          if (GLB.feedList[i].feedUrl === GLB.currentFeed) {
            GLB.currentFeedName = GLB.feedList[i].name;
            break;
          }
        }
        if (previousFeed != '') {
          document.getElementById(previousFeed).className = 'showFeed nonShowingFeed';
        }
        document.getElementById(GLB.currentFeed).className = 'showFeed showingFeed';
        if (previousFeed != GLB.currentFeed) {
          GLB.undoList = [];
        }
        GLB.idxItemStart = 0;
        GLB.nPage = 1;
        makeDisplayList();
        GLB.elUnreadCount = document.getElementById('unreadCount' + GLB.currentFeed);
        show_feed();
      }
      if (evt.target.id === 'nextPage') {
        GLB.idxItemStart += GLB.nItemPerPage;
        GLB.nPage += 1;
        show_feed();
      }
      if (evt.target.id === 'prevPage') {
        GLB.idxItemStart -= GLB.nItemPerPage;
        GLB.nPage -= 1;
        show_feed();
      }
      if (evt.target.id === 'undo') {
        if (GLB.currentFeed != '') {
          GLB.idxItemStart = 0;
          GLB.nPage = 1;
          GLB.displayIndices = GLB.undoList.slice(0, GLB.nItemPerPage);
          show_feed();
        }
      }
      if (evt.target.className === 'showItemContent') {
        var idx = evt.target.getAttribute('_idx');
        if (evt.target.getAttribute('showContent') === '0') {
          var elID = evt.target.getAttribute('_link');
          var elContent = document.getElementById('itemContent' + idx);
          if (elContent !== null) {
            elContent.empty();
          } else {
            elContent = document.getElementById(elID).createEl('div');
            elContent.className = 'itemContent';
            elContent.id = 'itemContent' + idx;
          }
          var item = GLB.feedsStore[GLB.currentFeed].items[idx];
          var itemLink = sanitizeHTMLToDom(item.link).textContent;

          const elEmbedButton = elContent.createEl('span', {text: "Embed"});
          elEmbedButton.setAttribute('url', itemLink);
          elEmbedButton.setAttribute('_idx', idx);
          elEmbedButton.setAttribute('_link', elID);
          elEmbedButton.className = 'elEmbedButton';

          const elFetch = elContent.createEl('span', {text: "Fetch"});
          elFetch.setAttribute('url', itemLink);
          elFetch.setAttribute('_idx', idx);
          elFetch.setAttribute('_link', elID);
          elFetch.className = 'elFetch';

          elContent.createEl('span').createEl('a', {href: itemLink, text: "Link"}).parentElement.className = 'elLink';
          elContent.appendChild(sanitizeHTMLToDom(item.content.replace(/<img src="\/\//g,"<img src=\"https://")));
          evt.target.setAttribute('showContent', '1');
        } else {
          var elContent = document.getElementById('itemContent' + idx);
          if (elContent !== null) {
            elContent.remove();
          }
          evt.target.setAttribute('showContent', '0');
          var embeddedIframe = document.getElementById('embeddedIframe' + idx);
          if (embeddedIframe !== null) {
            embeddedIframe.remove();
          }
        }
      }
      if (evt.target.className === 'elEmbedButton') {
        var idx = evt.target.getAttribute('_idx');
        if (document.getElementById('embeddedIframe' + idx) !== null) {
          return;
        }
        var elContent = document.getElementById('itemContent' + idx);
        if (elContent !== null) {
          elContent.empty();
        }
        var elID = evt.target.getAttribute('_link');
        const url = evt.target.getAttribute('url');
        const embeddedIframe = elContent.createEl('iframe');
        embeddedIframe.className = 'embeddedIframe';
        embeddedIframe.id = 'embeddedIframe' + idx;
        embeddedIframe.src = url;
        // const embeddedIframe = elContent.createEl('object');
        // embeddedIframe.className = 'embeddedIframe';
        // embeddedIframe.id = 'embeddedIframe' + idx;
        // embeddedIframe.data = url;
      }
      if (evt.target.className === 'elFetch') {
        var idx = evt.target.getAttribute('_idx');
        var elID = evt.target.getAttribute('_link');
        const url = evt.target.getAttribute('url');
        if (document.getElementById('fetchContainer' + idx) !== null) {
          return;
        }
        var pageSrc = '';
        try {
          pageSrc = await request({url: url, method: "GET"});
        } catch (e) {
          new Notice('Fail to fetch ' + url, 1000);
          return;
        }
        var elContent = document.getElementById('itemContent' + idx);
        if (elContent !== null) {
          elContent.empty();
        }
        const fetchContainer = elContent.createEl('div');
        fetchContainer.className = 'fetchContainer';
        fetchContainer.id = 'fetchContainer' + idx;
        fetchContainer.appendChild(sanitizeHTMLToDom(pageSrc));
      }
      if (evt.target.className === 'renderMath') {
        var idx = this.getNumFromId(evt.target.id, 'renderMath');
        var elContent = document.getElementById('itemContent' + idx);
        const item = GLB.feedsStore[GLB.currentFeed].items[idx];
        const elID = item.link;
        if (elContent !== null) {
          elContent.empty();
        } else {
          elContent = document.getElementById(elID).createEl('div');
          elContent.id = 'itemContent' + idx;
        }
        MarkdownPreviewView.renderMarkdown(
          remedyLatex(htmlToMarkdown(item.content)), elContent);
      }
      if (evt.target.className === 'askChatGPT') {
        var idx = this.getNumFromId(evt.target.id, 'askChatGPT');
        const item = GLB.feedsStore[GLB.currentFeed].items[idx];
        const elID = item.link;
        const el = document.getElementById('shortNoteContainer' + idx);
        if (el === null) {
          const elActionContainer = document.getElementById('actionContainer' + idx);
          if (elActionContainer === null) {
            return;
          }
          const shortNoteContainer = elActionContainer.createEl('div');
          shortNoteContainer.id = 'shortNoteContainer' + idx;
          var shortNote = shortNoteContainer.createEl('textarea');
          shortNote.className = 'shortNote';
          shortNote.id = 'shortNote' + idx;
          shortNote.rows = 2;
          shortNote.placeholder = 'Waiting for ChatGPT to reply...';
        }
        var apiKey = this.settings.chatGPTAPIKey;
        var promptText = this.settings.chatGPTPrompt;
        try {
          var replyByGPT = await fetchChatGPT(apiKey, 0.0,
            promptText + '\n' + item.content);
          replyByGPT = replyByGPT.trim();
          if (replyByGPT !== '') {
            var shortNote = document.getElementById('shortNote' + idx);
            var existingNote = shortNote.value;
            if (existingNote !== '') {
              existingNote = existingNote + '\n\n';
            }
            shortNote.value = existingNote + replyByGPT;
          }
        } catch (e) {
          console.log(e);
        };
      }
      if (evt.target.className === 'noteThis') {
        if (! await this.app.vault.exists(GLB.feeds_reader_dir)) {
          await this.app.vault.createFolder(GLB.feeds_reader_dir);
        }

        var idx = this.getNumFromId(evt.target.id, 'noteThis');
        const the_item = GLB.feedsStore[GLB.currentFeed].items[idx];
        var dt_str: string = '';
        if (the_item.pubDate != '') {
          dt_str = the_item.pubDate;
        } else if (GLB.feedsStore[GLB.currentFeed].pubDate != '') {
          dt_str = GLB.feedsStore[GLB.currentFeed].pubDate;
        } else {
          dt_str = nowdatetime();
        }
        dt_str = dt_str.substring(0, 10) + '-';
        const fname: string = dt_str +
                              str2filename(
                              (GLB.currentFeedName === ''? '' :
                               GLB.currentFeedName.replace(/(\s+)/g, '-') + '-') +
                              the_item.title.trim()
                              .replace(/(<([^>]+)>)/g, " ")
                              .replace(/[:!?@#\*\^\$]+/g, '')) + '.md';
        const fpath: string = GLB.feeds_reader_dir + '/' + fname;
        var author_text = the_item.creator.trim();
        if (author_text !== '') {
          author_text = '\n> ' + htmlToMarkdown(author_text);
        }
        var shortNoteContent = '';
        const elShortNote = document.getElementById('shortNote' + idx);
        if (elShortNote !== null) {
          shortNoteContent = elShortNote.value;
        }
        var abstractOpen = '-';
        // if (shortNoteContent !== '') {
        //   abstractOpen = '-';
        // }
        if (! await this.app.vault.exists(fpath)) {
          await this.app.vault.create(fpath,
            shortNoteContent + '\n> [!abstract]' + abstractOpen + ' [' +
            the_item.title.trim().replace(/(<([^>]+)>)/gi, " ").replace(/\n/g, " ") +
            '](' + sanitizeHTMLToDom(the_item.link).textContent + ')\n> ' +
            remedyLatex(htmlToMarkdown(unEscape(handle_tags(handle_a_tag(handle_img_tag(the_item.content.replace(/\n/g, ' '))))
            .replace(/ +/g, ' ')
            .replace(/\s+$/g, '').replace(/^\s+/g, '')))) +
            // handle_a_tag(handle_img_tag(unEscape(
            //   the_item.content.replace(/\n/g, ' '))))
            // .replace(/(<([^>]+)>)/gi, " ")
            // .trim() +
            author_text);
          new Notice(fpath + " saved.", 1000);
        } else {
          new Notice(fpath + " already exists.", 1000);
        }
      }
      if (evt.target.className === 'saveSnippet') {
        if (! await this.app.vault.exists(GLB.feeds_reader_dir)) {
          await this.app.vault.createFolder(GLB.feeds_reader_dir);
        }

        var idx = this.getNumFromId(evt.target.id, 'saveSnippet');
        const the_item = GLB.feedsStore[GLB.currentFeed].items[idx];
        const fpath: string = GLB.feeds_reader_dir + '/' + GLB.saved_snippets_fname;
        const link_text = sanitizeHTMLToDom(the_item.link).textContent;
        var shortNoteContent = '';
        const elShortNote = document.getElementById('shortNote' + idx);
        if (elShortNote !== null) {
          shortNoteContent = elShortNote.value;
        }
        var abstractOpen = '-';
        // if (shortNoteContent !== '') {
        //   abstractOpen = '-';
        // }
        var author_text = the_item.creator.trim();
        if (author_text !== '') {
          author_text = '\n> ' + htmlToMarkdown(author_text);
        }
        var dt_str: string = nowdatetime();
        if (the_item.pubDate != '') {
          dt_str = the_item.pubDate;
        } else if (GLB.feedsStore[GLB.currentFeed].pubDate != '') {
          dt_str = GLB.feedsStore[GLB.currentFeed].pubDate;
        }
        if (dt_str !== '') {
          dt_str = '\n> <small>' + dt_str + '</small>';
        }
        var feedNameStr = GLB.currentFeedName;
        if (feedNameStr !== '') {
          feedNameStr = '\n> <small>' + feedNameStr + '</small>';
        }
        const snippet_content: string = (
            shortNoteContent + '\n> [!abstract]' + abstractOpen + ' [' +
            the_item.title.trim().replace(/(<([^>]+)>)/gi, " ").replace(/\n/g, " ") +
            '](' + link_text + ')\n> ' +
            remedyLatex(htmlToMarkdown(unEscape(handle_tags(handle_a_tag(handle_img_tag(the_item.content.replace(/\n/g, ' '))))
            .replace(/ +/g, ' ')
            .replace(/\s+$/g, '').replace(/^\s+/g, '')))) +
            author_text + dt_str + feedNameStr);
        if (! await this.app.vault.exists(fpath)) {
          await this.app.vault.create(fpath, snippet_content);
          new Notice(fpath + " saved.", 1000);
        } else {
          const prevContent: string = (await this.app.vault.adapter.read(fpath));
          if (prevContent.includes(link_text)) {
            new Notice("Snippet url already exists.", 1000);
          } else {
            await this.app.vault.adapter.append(fpath, '\n\n<hr>\n\n' + snippet_content);
            new Notice("Snippet saved to " + fpath + ".", 1000);
          }
        }
      }
      if ((evt.target.className === 'markPageRead') ||
          (evt.target.className === 'markPageDeleted')) {
        if (!GLB.feedsStore.hasOwnProperty(GLB.currentFeed)) {
          return;
        }
        var fd = GLB.feedsStore[GLB.currentFeed];
        const nowStr = nowdatetime();
        var changed = false;
        var nMarked = 0;

        for (var i=GLB.idxItemStart;
             i<Math.min(GLB.displayIndices.length, GLB.idxItemStart+GLB.nItemPerPage);
             i++) {
          const idx = GLB.displayIndices[i];
          const item = fd.items[idx];
          if ((item.read !== '') || (item.deleted !== '')) {
            continue;
          }
          changed = true;
          nMarked += 1;
          if (evt.target.className === 'markPageRead') {
            item.read = nowStr;
            const elToggleRead = document.getElementById('toggleRead' + idx);
            elToggleRead.innerText = 'Unread';
          } else {
            item.deleted = nowStr;
            const elToggleDeleted = document.getElementById('toggleDelete' + idx);
            elToggleDeleted.innerText = 'Undelete';
          }

          const idxOf = GLB.undoList.indexOf(idx);
          if (idxOf > -1) {
            GLB.undoList.splice(idxOf, 1);
          }
          GLB.undoList.unshift(idx);

          GLB.hideThisItem = true;
          if ((!GLB.showAll) && GLB.hideThisItem) {
            document.getElementById(item.link).className = 'hidedItem';
          }
        }
        if (changed) {
          GLB.feedsStoreChange = true;
          GLB.feedsStoreChangeList.add(GLB.currentFeed);
          GLB.elUnreadCount.innerText = parseInt(GLB.elUnreadCount.innerText) - nMarked;
          if (!GLB.showAll) {
            [...document.getElementsByClassName('pageActions')].forEach(el => {el.remove();});
            if (GLB.idxItemStart+GLB.nItemPerPage < GLB.displayIndices.length) {
              GLB.idxItemStart += GLB.nItemPerPage;
              GLB.nPage += 1;
              show_feed();
            } else {
              GLB.idxItemStart = 0;
              GLB.nPage = 1;
              makeDisplayList();
              show_feed();
            }
          }
        }
      }
      if (evt.target.className === 'removePageContent') {
        if (!GLB.feedsStore.hasOwnProperty(GLB.currentFeed)) {
          return;
        }
        var fd = GLB.feedsStore[GLB.currentFeed];
        var changed = false;
        var nMarked = 0;

        for (var i=GLB.idxItemStart;
             i<Math.min(GLB.displayIndices.length, GLB.idxItemStart+GLB.nItemPerPage);
             i++) {
          const idx = GLB.displayIndices[i];
          const item = fd.items[idx];
          if (item.read !== '') {
            continue;
          }
          changed = true;
          nMarked += 1;
          item.content = '';
          item.creator = '';
        }
        if (changed) {
          GLB.feedsStoreChange = true;
          GLB.feedsStoreChangeList.add(GLB.currentFeed);
          show_feed();
        }
      }

      if (evt.target.className === 'toggleRead') {
        var idx = this.getNumFromId(evt.target.id, 'toggleRead');
        GLB.feedsStoreChange = true;
        GLB.feedsStoreChangeList.add(GLB.currentFeed);
        var el = document.getElementById(evt.target.id);
        if (el.innerText === 'Read') {
          GLB.feedsStore[GLB.currentFeed].items[idx].read = nowdatetime();
          el.innerText = 'Unread';
          GLB.hideThisItem = true;
          if (GLB.feedsStore[GLB.currentFeed].items[idx].deleted === '') {
            GLB.elUnreadCount.innerText = parseInt(GLB.elUnreadCount.innerText) - 1;
          }
        } else {
          GLB.feedsStore[GLB.currentFeed].items[idx].read = '';
          el.innerText = 'Read';
          GLB.hideThisItem = false;
          if (GLB.feedsStore[GLB.currentFeed].items[idx].deleted === '') {
            GLB.elUnreadCount.innerText = parseInt(GLB.elUnreadCount.innerText) + 1;
          }
        }
        const idxOf = GLB.undoList.indexOf(idx);
        if (idxOf > -1) {
          GLB.undoList.splice(idxOf, 1);
        }
        GLB.undoList.unshift(idx);
        if ((!GLB.showAll) && GLB.hideThisItem) {
          document.getElementById(
            GLB.feedsStore[GLB.currentFeed].items[idx].link ).className = 'hidedItem';
        }
      }
      if (evt.target.className === 'toggleDelete') {
        var idx = this.getNumFromId(evt.target.id, 'toggleDelete');
        GLB.feedsStoreChange = true;
        GLB.feedsStoreChangeList.add(GLB.currentFeed);
        var el = document.getElementById(evt.target.id);
        if (el.innerText === 'Delete') {
          GLB.feedsStore[GLB.currentFeed].items[idx].deleted = nowdatetime();
          el.innerText = 'Undelete';
          GLB.hideThisItem = true;
          if (GLB.feedsStore[GLB.currentFeed].items[idx].read === '') {
            GLB.elUnreadCount.innerText = parseInt(GLB.elUnreadCount.innerText) - 1;
          }
        } else {
          GLB.feedsStore[GLB.currentFeed].items[idx].deleted = '';
          el.innerText = 'Delete';
          GLB.hideThisItem = false;
          if (GLB.feedsStore[GLB.currentFeed].items[idx].read === '') {
            GLB.elUnreadCount.innerText = parseInt(GLB.elUnreadCount.innerText) + 1;
          }
        }
        const idxOf = GLB.undoList.indexOf(idx);
        if (idxOf > -1) {
          GLB.undoList.splice(idxOf, 1);
        }
        GLB.undoList.unshift(idx);
        if ((!GLB.showAll) && GLB.hideThisItem) {
          document.getElementById(
            GLB.feedsStore[GLB.currentFeed].items[idx].link ).className = 'hidedItem';
        }
      }

      if (evt.target.className === 'jotNotes') {
        var idx = this.getNumFromId(evt.target.id, 'jotNotes');
        const el = document.getElementById('shortNoteContainer' + idx);
        if (el !== null) {
          el.remove();
          return;
        }
        const elActionContainer = document.getElementById('actionContainer' + idx);
        if (elActionContainer === null) {
          return;
        }
        const shortNoteContainer = elActionContainer.createEl('div');
        const shortNote = shortNoteContainer.createEl('textarea');
        shortNoteContainer.id = 'shortNoteContainer' + idx;
        shortNote.className = 'shortNote';
        shortNote.id = 'shortNote' + idx;
        shortNote.rows = 2;
        shortNote.placeholder = 'Enter notes here to be saved in the markdown or the snippets file.';
      }

      if (evt.target.id === 'showAll') {
        let toggle = document.getElementById('showAll');
        if (toggle.innerText == 'Show all') {
          toggle.innerText = 'Unread only';
          GLB.showAll = false;
        } else {
          toggle.innerText = 'Show all';
          GLB.showAll = true;
        }
      }
      if (evt.target.id === 'titleOnly') {
        let toggle = document.getElementById('titleOnly');
        if (toggle.innerText === 'Title only') {
          toggle.innerText = 'Show content';
          GLB.titleOnly = false;
        } else {
          toggle.innerText = 'Title only';
          GLB.titleOnly = true;
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
        GLB.itemOrder = toggle.innerText;
      }
      if ((evt.target.id === 'saveFeedsData') || (evt.target.id === 'save_data_toggling')) {
        var nSaved = await saveFeedsData();
        if (nSaved > 0) {
          new Notice("Data saved: " + nSaved.toString() + 'file(s) updated.', 1000);
        } else {
          new Notice("No need to save.", 1000);
        }
      }
      if ((evt.target.id === 'toggleNavi') && (GLB.currentFeed != '')) {
        let toggle = document.getElementById('toggleNavi');
        if (toggle.innerText === '>') {
          toggle.innerText = '<';
          var toggleNaviAux = document.getElementById('toggleNaviAux');
          const elUnreadcountWhileToggling = toggleNaviAux.createEl('span', {text: GLB.elUnreadCount.innerText});
          elUnreadcountWhileToggling.className = 'unreadcountWhileToggling';
          GLB.elUnreadCount = elUnreadcountWhileToggling;
          var save_data_toggling = toggleNaviAux.createEl('span', {text: 'Save progress'});
          save_data_toggling.id = 'save_data_toggling';
          save_data_toggling.className = 'save_data_toggling';
          document.getElementById('naviBar').className = 'navigation naviBarHidden';
          document.getElementById('contentBox').className = 'content contentBoxFullpage';
          document.getElementById('toggleNaviContainer').className = 'toggleNaviContainer';
        } else {
          toggle.innerText = '>';
          var s = GLB.elUnreadCount.innerText;
          GLB.elUnreadCount = document.getElementById('unreadCount' + GLB.currentFeed);
          GLB.elUnreadCount.innerText = s;
          document.getElementById('toggleNaviAux').empty();
          document.getElementById('naviBar').className = 'navigation naviBarShown';
          document.getElementById('contentBox').className = 'content contentBoxRightpage';
          document.getElementById('toggleNaviContainer').className = 'toggleNaviContainer';
        }
      }
      if (evt.target.id === 'search') {
        if (GLB.currentFeed === '') {
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

    if (GLB.currentFeed != '') {
      show_feed();
    }
  }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    GLB.nItemPerPage = this.settings.nItemPerPage;

    GLB.feeds_reader_dir = 'feeds-reader';
    GLB.feeds_data_fname = 'feeds-data.json';
    GLB.feeds_store_base = 'feeds-store';
    GLB.saved_snippets_fname = 'snippets.md';
    GLB.subscriptions_fname = 'subscriptions.json';
    GLB.showAll = false;
    GLB.titleOnly = true;
    GLB.itemOrder = 'New to old';
    GLB.currentFeed = '';
    GLB.currentFeedName = '';
    GLB.nMergeLookback = 100000;
    GLB.lenStrPerFile = 1024 * 1024;
    GLB.feedsStoreChange = false;
    GLB.feedsStoreChangeList = new Set<string>();
    GLB.elUnreadCount = undefined;
    GLB.maxTotalnumDisplayed = 1e5;
    GLB.nThanksSep = 16;
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
  if (!GLB.feedsStore.hasOwnProperty(key)) {
    GLB.feedsStore[key] = newdata;
    GLB.feedsStoreChange = true;
    GLB.feedsStoreChangeList.add(key);
    return newdata.items.length;
  }
  GLB.feedsStore[key].title = newdata.title;
  GLB.feedsStore[key].subtitle = newdata.subtitle;
  GLB.feedsStore[key].description = newdata.description;
  GLB.feedsStore[key].pubDate = newdata.pubDate;
  var nNew = 0;
  var nLookback = Math.min(GLB.nMergeLookback, GLB.feedsStore[key].items.length);
  for (var j=newdata.items.length-1; j>=0; j--) {
    var found = false;
    for (let i=0; i<nLookback; i++) {
      if (GLB.feedsStore[key].items[i].link === newdata.items[j].link) {
        found = true;
        break;
      }
    }
    if (!found) {
      nNew += 1;
      GLB.feedsStore[key].items.unshift(newdata.items[j]);
      GLB.feedsStoreChange = true;
      GLB.feedsStoreChangeList.add(key);
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
      if (fdUrl === GLB.currentFeed) {
        GLB.elUnreadCount.innerText = stats.unread.toString();
        GLB.undoList = [];
        GLB.idxItemStart = 0;
        GLB.nPage = 1;
        makeDisplayList();
        show_feed();
      }
      if (stats.total < GLB.maxTotalnumDisplayed) {
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
    form.className = "searchForm";
    const colgroup = form.createEl('colgroup');
    colgroup.createEl('col').className = 'searchCol1';
    colgroup.createEl('col').className = 'searchCol2';
    const tr = form.createEl('tr');
    tr.createEl('td', {text: 'Search terms'});
    const inputBox = tr.createEl('td').createEl('input');
    inputBox.id = 'searchTerms';
    inputBox.className = 'searchTerms';
    const trWordwise = form.createEl('tr');
    trWordwise.createEl('td', {text: "Wordwise"});
    var checkBoxWordwise = trWordwise.createEl('td').createEl('input');
    checkBoxWordwise.id = 'checkBoxWordwise';
    checkBoxWordwise.type = 'checkBox';
    var searchButton = form.createEl('tr').createEl('td').createEl('button', {text: "Search"});
    searchButton.addEventListener("click", async () => {
      var wordWise = document.getElementById('checkBoxWordwise').checked;
      var searchTerms = ([...new Set(document.getElementById('searchTerms').value.toLowerCase().split(/[ ,;\t\n]+/))]
                         .filter(i => i)
                         .sort((a,b) => {return b.length-a.length;}));
      if (searchTerms.length === 0) {
        return;
      }
      let fd = GLB.feedsStore[GLB.currentFeed].items;
      var sep = /\s+/;
      GLB.displayIndices = [];
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
          GLB.displayIndices.push(i);
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
    form.className = 'addFeedTable';
    const colgroup = form.createEl('colgroup');
    colgroup.createEl('col').className = 'addFeedCol1';
    colgroup.createEl('col').className = 'addFeedCol2';
    var tr = form.createEl('tr');
    tr.createEl('td', {text: "Name"});
    var tdnewFeedName = tr.createEl('td').createEl('input');
    tdnewFeedName.className = 'addFeedInput';
    tdnewFeedName.id = 'newFeedName';
    tr = form.createEl('tr');
    tr.createEl('td', {text: "URL"});
    var tdnewFeedUrl = tr.createEl('td').createEl('input');
    tdnewFeedUrl.className = 'addFeedInput';
    tdnewFeedUrl.id = 'newFeedUrl';
    tr = form.createEl('tr');
    tr.createEl('td', {text: "Folder"});
    var tdnewFeedFolder = tr.createEl('td').createEl('input');
    tdnewFeedFolder.id = 'newFeedFolder';
    tdnewFeedFolder.className = 'addFeedInput';
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
      for (var i=0; i<GLB.feedList.length; i++) {
        if (GLB.feedList[i].feedUrl == newFeedUrl) {
          new Notice("Not added: url already included.", 1000);
          return;
        }
        if (GLB.feedList[i].name == newFeedName) {
          new Notice("Not added: name already used.", 1000);
          return;
        }
      }
      GLB.feedList.push({
        name: newFeedName,
        feedUrl: newFeedUrl,
        folder: newFeedFolder,
        unread: 0,
        updated: 0
      });
      sort_feed_list();
      await saveSubscriptions();
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
      var changed = false;
      for (var i=0; i<GLB.feedList.length; i++) {
        var newName = document.getElementById('manageFdName' + i.toString()).value;
        var newUrl = document.getElementById('manageFdUrl' + i.toString()).value;
        var newFolder = document.getElementById('manageFdFolder' + i.toString()).value;
        var sMsg = '';
        if (GLB.feedList[i].name != newName) {
          sMsg += 'Name: ' + GLB.feedList[i].name + ' -> ' + newName;
        }
        if (GLB.feedList[i].feedUrl != newUrl) {
          sMsg += '\nUrl: ' + GLB.feedList[i].feedUrl + ' -> ' + newUrl;
        }
        if (GLB.feedList[i].folder != newFolder) {
          sMsg += '\nFolder: ' + GLB.feedList[i].folder + ' -> ' + newFolder;
        }
        if (sMsg !== '') {
          if (window.confirm("Apply changes for " + GLB.feedList[i].name + '?\n' + sMsg)) {
            changed = true;
            if (GLB.feedList[i].name != newName) {
              var alreadyIncluded = false;
              for (var j=0; j<GLB.feedList.length; j++) {
                if ((j != i) && (GLB.feedList[j].name === newName)) {
                  new Notice("Not changed: name already included.", 1000);
                  alreadyIncluded = True;
                  break;
                }
              }
              if (!alreadyIncluded) {
                for (var j=0;;j++) {
                  var fpath_old = [GLB.feeds_reader_dir, GLB.feeds_store_base,
                                   makeFilename(GLB.feedList[i].name, j)].join('/');
                  var fpath_new = [GLB.feeds_reader_dir, GLB.feeds_store_base,
                                   makeFilename(newName, j)].join('/');
                  if (await app.vault.exists(fpath_old)) {
                    await app.vault.adapter.rename(fpath_old, fpath_new);
                  } else {
                    break;
                  }
                }
                if (GLB.currentFeedName === GLB.feedList[i].name) {
                  GLB.currentFeedName = newName;
                }
                GLB.feedList[i].name = newName;
              }
            }
            if (GLB.feedList[i].feedUrl != newUrl) {
              var alreadyIncluded = false;
              for (var j=0; j<GLB.feedList.length; j++) {
                if ((j != i) && (GLB.feedList[j].feedUrl === newUrl)) {
                  new Notice("Not changed: url already included.", 1000);
                  alreadyIncluded = True;
                  break;
                }
              }
              if (!alreadyIncluded) {
                if (GLB.currentFeed === GLB.feedList[i].feedUrl) {
                  GLB.currentFeed = newUrl;
                }
                GLB.feedsStore[newUrl] = GLB.feedsStore[GLB.feedList[i].feedUrl];
                delete GLB.feedsStore[GLB.feedList[i].feedUrl];
                GLB.feedList[i].feedUrl = newUrl;
              }
            }
            if (GLB.feedList[i].folder != newFolder) {
              GLB.feedList[i].folder = newFolder;
            }
          }
        }
      }
      if (changed) {
        sort_feed_list();
        await saveSubscriptions();
        await createFeedBar();
        this.close();
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
                      if (nRemoved>0) {
                        new Notice(nRemoved + " removed for "
                        + el.getAttribute('fdName'), 2000);
                      }});}});
    btRemoveFeed.addEventListener('click', () => {
      if (window.confirm('Sure?')) {
      [...document.getElementsByClassName('checkThis')]
      .filter(el => el.checked)
      .forEach(el => {removeFeed(el.getAttribute('val'));});}});

    contentEl.createEl('br');

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
    for (var i=0; i<GLB.feedList.length; i++) {
      var tr = tbody.createEl('tr');
      var cellNameContainer = tr.createEl('td');
      cellNameContainer.className = 'cellNameContainer';
      const elName = cellNameContainer.createEl('input', {value: GLB.feedList[i].name});
      elName.readOnly = false;
      elName.id = 'manageFdName' + i.toString();
      const elUrl = cellNameContainer.createEl('input', {value: GLB.feedList[i].feedUrl});
      elUrl.readOnly = false;
      elUrl.id = 'manageFdUrl' + i.toString();
      const cellFolderContainer = tr.createEl('td');
      cellFolderContainer.className = 'cellFolderContainer';
      const elFolder = cellFolderContainer.createEl('input', {value: GLB.feedList[i].folder});
      elFolder.readOnly = false;
      elFolder.id = 'manageFdFolder' + i.toString();

      var stats = getFeedStats(GLB.feedList[i].feedUrl);
      var storeSizeInfo = getFeedStorageInfo(GLB.feedList[i].feedUrl);
      tr.createEl('td', {text: stats.total.toString()}).setAttribute('sortBy', stats.total);
      tr.createEl('td', {text: stats.read.toString()}).setAttribute('sortBy', stats.read);
      tr.createEl('td', {text: stats.deleted.toString()}).setAttribute('sortBy', stats.deleted);
      tr.createEl('td', {text: storeSizeInfo[0]}).setAttribute('sortBy', storeSizeInfo[2]/stats.total);
      tr.createEl('td', {text: storeSizeInfo[1]}).setAttribute('sortBy', storeSizeInfo[3]);
      const checkThis = tr.createEl('td').createEl('input');
      checkThis.type = 'checkBox';
      checkThis.className = 'checkThis';
      checkThis.setAttribute('val', GLB.feedList[i].feedUrl);
      checkThis.setAttribute('fdName', GLB.feedList[i].name);

      nTotal += stats.total;
      nRead += stats.read;
      nDeleted += stats.deleted;
      nLength += storeSizeInfo[2];
      nStoreSize += storeSizeInfo[3];
    }
    var tr = tbody.createEl('tr');
    tr.createEl('td', {text: 'Total: ' + GLB.feedList.length.toString()});
    tr.createEl('td');
    tr.createEl('td', {text: nTotal.toString()});
    tr.createEl('td', {text: nRead.toString()});
    tr.createEl('td', {text: nDeleted.toString()});
    tr.createEl('td', {text: Math.floor(nLength/nTotal).toString()});
    tr.createEl('td', {text: getStoreSizeStr(nStoreSize)});
    tr.createEl('td');

    // From: https://stackoverflow.com/questions/14267781/sorting-html-table-with-javascript
    // https://stackoverflow.com/questions/14267781/sorting-html-table-with-javascript/53880407#53880407
    const getCellValue = (tr, idx) => tr.children[idx].getAttribute('sortBy') || tr.children[idx].firstChild.value;
    
    const comparer = ((idx, asc) =>
      (a, b) =>
        ((v1, v2) =>
         v1 !== '' && v2 !== '' && !isNaN(v1) && !isNaN(v2) ? v1 - v2 : v1.toString().localeCompare(v2)
        )(getCellValue(asc ? a : b, idx), getCellValue(asc ? b : a, idx)));
    
    const rowSelectorStr ='tr:nth-child(-n+' + (GLB.feedList.length).toString() + ')';
    document.querySelectorAll('.manageFeedsForm th:nth-child(n+1):nth-child(-n+7)')
    .forEach(th => th.addEventListener('click', (() => {
        const table = th.closest('table');
        const tbody = table.querySelector('tbody');
        Array.from(tbody.querySelectorAll(rowSelectorStr))
            .sort(comparer(Array.from(th.parentNode.children).indexOf(th), this.asc = !this.asc))
            .forEach(tr => tbody.insertBefore(tr, tbody.lastChild));
    })));

	}

	async onClose() {
		const {contentEl} = this;
    if (GLB.feedsStoreChange) {
      await createFeedBar();
    }
		contentEl.empty();
	}
}


class FeedReaderSettingTab extends PluginSettingTab {
	plugin: FeedsReader;

	constructor(app: App, plugin: FeedsReader) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for RSS Feed Reader'});

		containerEl.createEl('h3', {text: 'ChatGPT'});
		new Setting(containerEl)
			.setName('ChatGPT API Key')
			.setDesc('Enter the API Key for ChatGPT')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.chatGPTAPIKey)
				.onChange(async (value) => {
					this.plugin.settings.chatGPTAPIKey = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('ChatGPT Prompt')
			.setDesc('Prompt text for ChatGPT')
			.addTextArea(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.chatGPTPrompt)
				.onChange(async (value) => {
					this.plugin.settings.chatGPTPrompt = value;
					await this.plugin.saveSettings();
				}));
		containerEl.createEl('h3', {text: 'Appearance'});
		new Setting(containerEl)
			.setName('Items per page')
			.setDesc('Number of items to display per page')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.nItemPerPage.toString())
				.onChange(async (value) => {
          GLB.nItemPerPage = parseInt(value);
					this.plugin.settings.nItemPerPage = GLB.nItemPerPage;
					await this.plugin.saveSettings();
				}));
	}
}

export async function saveFeedsData () {
  var nSaved = 0;
  if (!GLB.feedsStoreChange) {
    return nSaved;
  }
  for (var i=0; i<GLB.feedList.length; i++) {
    key = GLB.feedList[i].feedUrl;
    if (!GLB.feedsStoreChangeList.has(key)) {
      continue;
    }
    if (!GLB.feedsStore.hasOwnProperty(key)) {
      continue;
    }
    nSaved += (await saveStringSplitted(JSON.stringify(GLB.feedsStore[key], null, 1),
                GLB.feeds_reader_dir + '/' + GLB.feeds_store_base,
                GLB.feedList[i].name,
                GLB.lenStrPerFile, 0));
  }

  // if (! await this.app.vault.exists(GLB.feeds_reader_dir)) {
  //   await this.app.vault.createFolder(GLB.feeds_reader_dir);
  // }
  // var fpath: string = GLB.feeds_reader_dir + '/' + GLB.feeds_data_fname;
  // if (! await this.app.vault.exists(fpath)) {
  //   await this.app.vault.create(fpath, JSON.stringify(GLB.feedsStore, null, 1));
  // } else {
  //   await this.app.vault.adapter.write(fpath, JSON.stringify(GLB.feedsStore, null, 1));
  // }

  GLB.feedsStoreChange = false;
  GLB.feedsStoreChangeList.clear();
  return nSaved;
}

export async function loadFeedsStoredData() {
  var noSplitFile = true;
  GLB.feedsStore = {};
  for (var i=0; i<GLB.feedList.length; i++) {
    var res = await loadStringSplitted(GLB.feeds_reader_dir + '/' + GLB.feeds_store_base, GLB.feedList[i].name);
    if (res.length > 0) {
      try {
        GLB.feedsStore[GLB.feedList[i].feedUrl] = JSON.parse(res);
        noSplitFile = false;
      } catch (e) {
        console.log(e);
        console.log(GLB.feedList[i].feedUrl);
      }
    }
  }
  if (noSplitFile) {
    if (! await this.app.vault.exists(GLB.feeds_reader_dir)) {
      await this.app.vault.createFolder(GLB.feeds_reader_dir);
    }
    var fpath = GLB.feeds_reader_dir+'/'+GLB.feeds_data_fname;
    if (await this.app.vault.exists(fpath)) {
      GLB.feedsStore = JSON.parse(await this.app.vault.adapter.read(fpath));
    }
  }
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
  if (!GLB.feedsStore.hasOwnProperty(feedUrl)) {
    return {total: 0, read: 0, deleted: 0, unread: 0};
  }
  var fd = GLB.feedsStore[feedUrl];
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
  if (!GLB.feedsStore.hasOwnProperty(feedUrl)) {
    return ['0', '0', 0, 0];
  }
  if (GLB.feedsStore[feedUrl].items.length == 0) {
    return ['0', '0', 0, 0];
  }
  const s = JSON.stringify(GLB.feedsStore[feedUrl], null, 1);
  const sz = (new Blob([s])).size;
  const szstr = getStoreSizeStr(sz);
  return [Math.floor(s.length/GLB.feedsStore[feedUrl].items.length).toString(), szstr, s.length, sz];
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
  for (var i=0; i<GLB.feedsStore[feedUrl].items.length; i++) {
    if (GLB.feedsStore[feedUrl].items[i].read === "") {
      GLB.feedsStore[feedUrl].items[i].read = nowStr;
    }
  }
  GLB.feedsStoreChange = true;
  GLB.feedsStoreChangeList.add(feedUrl);
}

function purgeDeleted(feedUrl: string) {
  GLB.feedsStore[feedUrl].items = GLB.feedsStore[feedUrl].items.filter(item => item.deleted === "");
  GLB.feedsStoreChange = true;
  GLB.feedsStoreChangeList.add(feedUrl);
}

function removeContent(feedUrl: string) {
  for (var i=0; i<GLB.feedsStore[feedUrl].items.length; i++) {
    GLB.feedsStore[feedUrl].items[i].content = '';
    GLB.feedsStore[feedUrl].items[i].creator = '';
  }
  GLB.feedsStoreChange = true;
  GLB.feedsStoreChangeList.add(feedUrl);
}

function removeContentOld(feedUrl: string) {
  var iDel = Math.floor(GLB.feedsStore[feedUrl].items.length / 3);
  iDel = Math.min(iDel, 200);
  for (var i=iDel; i<GLB.feedsStore[feedUrl].items.length; i++) {
    GLB.feedsStore[feedUrl].items[i].content = '';
    GLB.feedsStore[feedUrl].items[i].creator = '';
  }
  GLB.feedsStoreChange = true;
  GLB.feedsStoreChangeList.add(feedUrl);
}

function purgeAll(feedUrl: string) {
  GLB.feedsStore[feedUrl].items.length = 0;
  GLB.feedsStoreChange = true;
  GLB.feedsStoreChangeList.add(feedUrl);
}

function purgeOldHalf(feedUrl: string) {
  var iDel = Math.floor(GLB.feedsStore[feedUrl].items.length / 2);
  GLB.feedsStore[feedUrl].items.splice(iDel);
  GLB.feedsStoreChange = true;
  GLB.feedsStoreChangeList.add(feedUrl);
}

function deduplicate(feedUrl: string) {
  var n = GLB.feedsStore[feedUrl].items.length;
  const delete_mark = 'DELETE-NOW';
  for (var i=0; i<n; i++) {
    for (var j=i+1; j<n; j++) {
      if (GLB.feedsStore[feedUrl].items[i].link === GLB.feedsStore[feedUrl].items[j].link) {
        GLB.feedsStore[feedUrl].items[j].deleted = delete_mark;
      }
    }
  }
  const nBefore = GLB.feedsStore[feedUrl].items.length;
  GLB.feedsStore[feedUrl].items = GLB.feedsStore[feedUrl].items.filter(item => item.deleted != delete_mark);
  const nAfter = GLB.feedsStore[feedUrl].items.length;
  if (nBefore > nAfter) {
    GLB.feedsStoreChange = true;
    GLB.feedsStoreChangeList.add(feedUrl);
  }
  return nBefore - nAfter;
}

async function removeFeed(feedUrl: string) {
  for (var i=0; i<GLB.feedList.length; i++) {
    if (GLB.feedList[i].feedUrl === feedUrl) {
      if (GLB.feedsStore.hasOwnProperty(feedUrl)) {
        delete GLB.feedsStore[feedUrl];
        await removeFileFragments(GLB.feeds_reader_dir + '/' + GLB.feeds_store_base, GLB.feedList[i].name);
      }
      GLB.feedList.splice(i, 1);
      GLB.feedsStoreChange = true;
      GLB.feedsStoreChangeList.add(feedUrl);
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
  GLB.feedList.sort((n1,n2) => {
    if (n1.folder > n2.folder) {return 1;}
    if (n1.folder < n2.folder) {return -1;}
    return 0;
  });
}

function makeDisplayList() {
  GLB.displayIndices = [];
  var fd = GLB.feedsStore[GLB.currentFeed];
  if (fd === undefined) {
    return;
  }
  for (var i=0; i<fd.items.length; i++) {
    if ((GLB.showAll) || ((fd.items[i].read === '') && (fd.items[i].deleted === ''))) {
      GLB.displayIndices.push(i);
    }
  }
  if (GLB.itemOrder === 'Old to new') {
    GLB.displayIndices.reverse();
  }
  if (GLB.itemOrder === 'Random') {
    // From: https://dev.to/codebubb/how-to-shuffle-an-array-in-javascript-2ikj
    (array => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
      }
    })(GLB.displayIndices);
  }
}


async function show_feed() {
   if (GLB.currentFeed === '') {
     return;
   }
   const feed_content = document.getElementById('feed_content');
   feed_content.empty();

   const feedTitle = feed_content.createEl('h2');
   feedTitle.className = 'feedTitle';

   if (!GLB.feedsStore.hasOwnProperty(GLB.currentFeed)) {
     return;
   }
   var fd = GLB.feedsStore[GLB.currentFeed];
   feedTitle.createEl('a', {href: sanitizeHTMLToDom(fd.link).textContent}).appendChild(sanitizeHTMLToDom(fd.title));
   if (fd.pubDate != '') {
     feed_content.createEl('div', {text: fd.pubDate});
   }
   feed_content.createEl('div').className = 'divAsSep';

   const elPageAction = feed_content.createEl('div');
   elPageAction.className = 'pageActions';
   const markPageRead = elPageAction.createEl('span', {text: 'Mark all as read'});
   markPageRead.className = 'markPageRead';
   const markPageDeleted = elPageAction.createEl('span', {text: 'Mark all as deleted'});
   markPageDeleted.className = 'markPageDeleted';
   const removePageContent = elPageAction.createEl('span', {text: 'Remove all content'});
   removePageContent.className = 'removePageContent';

   var nDisplayed = 0;
   for (var i=GLB.idxItemStart;
        i<Math.min(GLB.displayIndices.length, GLB.idxItemStart+GLB.nItemPerPage);
        i++) {
     const idx = GLB.displayIndices[i];
     const item = fd.items[idx];
     const itemEl = feed_content.createEl('div');
     itemEl.className = 'oneFeedItem';
     itemEl.id = item.link;
     const itemTitle = itemEl.createEl('div');
     itemTitle.className = 'itemTitle';
     if (!GLB.titleOnly) {
       itemTitle.createEl('a', {href: sanitizeHTMLToDom(item.link).textContent})
                .appendChild(sanitizeHTMLToDom(item.title));
     } else {
       const elTitle = itemTitle.createEl('div');
       elTitle.appendChild(sanitizeHTMLToDom(item.title));
       elTitle.className = 'showItemContent';
       elTitle.setAttribute('_link', item.link);
       elTitle.setAttribute('_idx', idx);
       elTitle.setAttribute('showContent', '0');
     }
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
     const elActionContainer = itemEl.createEl('div');
     elActionContainer.id = 'actionContainer' + idx;
     const itemActionTable = elActionContainer.createEl('table');
     let itemActionOneRow = itemActionTable.createEl('tr').createEl('td');
     itemActionOneRow.className = 'itemActions';

     const jot = itemActionOneRow.createEl('div', {text: 'Jot'});
     jot.className = 'jotNotes';
     jot.id = 'jotNotes' + idx;

     const saveSnippet = itemActionOneRow.createEl('div', {text: "Snippet"});
     saveSnippet.className = 'saveSnippet';
     saveSnippet.id = 'saveSnippet' + idx;

     var t_read = "Read";
     if (item.read !== '') {
       t_read = 'Unread';
     }
     const toggleRead = itemActionOneRow.createEl('div', {text: t_read});
     toggleRead.className = 'toggleRead';
     toggleRead.id = 'toggleRead' + idx;

     const noteThis = itemActionOneRow.createEl('div', {text: "Save"});
     noteThis.className = 'noteThis';
     noteThis.id = 'noteThis' + idx;

     const renderMath = itemActionOneRow.createEl('div', {text: "Math"});
     renderMath.className = 'renderMath';
     renderMath.id = 'renderMath' + idx;

     const askChatGPT = itemActionOneRow.createEl('div', {text: "GPT"});
     askChatGPT.className = 'askChatGPT';
     askChatGPT.id = 'askChatGPT' + idx;

     // const embed = itemActionOneRow.createEl('div', {text: "Embed"});
     // embed.setAttribute('url', item.link);
     // embed.setAttribute('_idx', idx);
     // embed.setAttribute('_link', item.link);
     // embed.className = 'elEmbedButton';

     // const fetch = itemActionOneRow.createEl('div', {text: "Fetch"});
     // fetch.setAttribute('url', item.link);
     // fetch.setAttribute('_idx', idx);
     // fetch.setAttribute('_link', item.link);
     // fetch.className = 'fetchContent';

     var t_delete = "Delete";
     if (item.deleted !== '') {
       t_delete = 'Undelete';
     }
     const toggleDelete = itemActionOneRow.createEl('div', {text: t_delete});
     toggleDelete.className = 'toggleDelete';
     toggleDelete.id = 'toggleDelete' + idx;

     if (!GLB.titleOnly) {
       const elContent = itemEl.createEl('div');
       elContent.className = 'itemContent';
       elContent.id = 'itemContent' + idx;
       elContent.appendChild(sanitizeHTMLToDom(item.content.replace(/<img src="\/\//g,"<img src=\"https://")));
     }
     nDisplayed += 1;
   }

   if (nDisplayed == 0) {
     elPageAction.remove();
   }
   if (nDisplayed >= 5) {
     feed_content.appendChild(elPageAction.cloneNode(true));
   }

   const next_prev = feed_content.createEl('div');
   next_prev.className = 'next_prev';
   if (GLB.nPage > 1) {
     const prevPage = next_prev.createEl('span', {text: "Prev"});
     prevPage.id = "prevPage";
   }
   if (GLB.idxItemStart+GLB.nItemPerPage < GLB.displayIndices.length) {
     const nextPage = next_prev.createEl('span', {text: "Next"});
     nextPage.id = "nextPage";
   }
   var stats = getFeedStats(GLB.currentFeed);
   //  GLB.elUnreadCount = document.getElementById('unreadCount' + GLB.currentFeed);
   GLB.elTotalCount = document.getElementById('totalCount' + GLB.currentFeed);
   GLB.elSepUnreadTotal = document.getElementById('sepUnreadTotal' + GLB.currentFeed);
   GLB.elUnreadCount.innerText = stats.unread.toString();
   if (fd.items.length < GLB.maxTotalnumDisplayed) {
     GLB.elTotalCount.innerText = fd.items.length.toString();
     GLB.elSepUnreadTotal.innerText = '/';
   } else {
     GLB.elTotalCount.innerText = '';
     GLB.elSepUnreadTotal.innerText = '';
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
  var fpath_feedList = GLB.feeds_reader_dir+'/'+GLB.subscriptions_fname;
  GLB.feedList = [];
  if (await this.app.vault.exists(fpath_feedList)) {
    GLB.feedList = await JSON.parse(await
      this.app.vault.adapter.read(fpath_feedList));
  }
  if (GLB.feedList.length == 0) {
    new Notice('No feed yet. Use "Add feed".', 5000);
  }
  sort_feed_list();
}


async function saveSubscriptions() {
  if (! await this.app.vault.exists(GLB.feeds_reader_dir)) {
    await this.app.vault.createFolder(GLB.feeds_reader_dir);
  }
  var fpath_feedList = GLB.feeds_reader_dir+'/'+GLB.subscriptions_fname;
  if (! await this.app.vault.exists(fpath_feedList)) {
      await this.app.vault.create(fpath_feedList, JSON.stringify(GLB.feedList, null, 1));
  } else {
      await this.app.vault.adapter.write(fpath_feedList, JSON.stringify(GLB.feedList, null, 1));
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

async function fetchChatGPT(apiKey, temperature, text) {
  var res = await
    fetch('https://api.openai.com/v1/chat/completions',
          {method: 'POST',
           mode: 'cors',
           headers: {
              Authorization: 'Bearer ' + apiKey,
              'Content-Type': 'application/json'},
           body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              temperature: temperature,
              messages: [{role: "user",
                          content: text}]})});
  var msg = (await res.json())['choices'][0].message;
  return msg.content;
}

function remedyLatex(s: string) {
  return s.replace(/\$\\sim\$([0-9+-.]+)/g, '\${\\sim}$1\$')
          .replace(/\$\\times\$([0-9+-.]+)/g, '\${\\times}$1\$')
          .replace(/\\micron/g, '\\mu{}m')
          .replace(/\\Msun/g, 'M_\\odot')
          .replace(/\\Mstar/g, 'M_\\ast')
          .replace(/_\*/g, '_\\ast')
          .replace(/_{\*}/g, '_{\\ast}')
          .replace(/\*/g, '\\*');
}
