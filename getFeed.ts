import {request, Notice} from "obsidian";

/**
 This file is adapted from https://github.com/joethei/obsidian-rss/blob/master/src/parser/rssParser.ts, with a few modifications.
 */

export interface RssFeedContent {
    subtitle: string,
    title: string,
    name: string,
    link: string,
    image: string,
    folder: string,
    description: string,
    pubDate: string,
    items: RssFeedItem[]
}

export interface RssFeedItem {
    title: string,
    content: string,
    category: string,
    link: string,
    creator: string,
    pubDate: string,
    read: string
    deleted: string,
    downloaded: string
}

export const itemKeys = ["title", "content", "link", "creator", "pubDate", "read", "deleted", "downloaded"];

/**
 * return the node with the specified name
 * : to get namespaced element
 * . to get nested element
 * @param element
 * @param name
 */
function getElementByName(element: Element | Document, name: string): ChildNode {
    let value: ChildNode;
    if (typeof element.getElementsByTagName !== 'function' && typeof element.getElementsByTagNameNS !== 'function') {
        //the required methods do not exist on element, aborting
        return;
    }

    if (name.includes(":")) {
        const [namespace, tag] = name.split(":");
        const namespaceUri = element.lookupNamespaceURI(namespace);
        const byNamespace = element.getElementsByTagNameNS(namespaceUri, tag);
        if (byNamespace.length > 0) {
            value = byNamespace[0].childNodes[0];
        } else {
            //there is no element in that namespace, probably because no namespace has been defined
            const tmp = element.getElementsByTagName(name);
            if (tmp.length > 0) {
                if (tmp[0].childNodes.length === 0) {
                    value = tmp[0];
                } else {
                    const node = tmp[0].childNodes[0];
                    if (node !== undefined) {
                        value = node;
                    }
                }
            }
        }

    } else if (name.includes(".")) {
        const [prefix, tag] = name.split(".");
        if (element.getElementsByTagName(prefix).length > 0) {
            const nodes = Array.from(element.getElementsByTagName(prefix)[0].childNodes);
            nodes.forEach((node) => {
                if (node.nodeName == tag) {
                    value = node;
                }
            });
        }

    } else {
        var els = element.getElementsByTagName(name);
        if (els.length > 0) {
          var el = els[0];
          if (el.childNodes.length === 0) {
            value = el;
          } else {
            //value = el.firstChild;
            value = [... el.childNodes].reduce((a, b) => {return getElLen(a) > getElLen(b) ? a : b;});
          }
        }
    }

    return value;
}

function getElLen(el) {
  var possibleTextTags = ['innerHTML', 'wholeText', 'innerText', 'nodeValue', 'textContent', 'data'];
  var len_s = [0];
  for (var t of possibleTextTags) {
    if ((typeof el[t]) === 'string') {
      len_s.push(el[t].length);
    }
  }
  return Math.max(...len_s);
}

function getElPossibleText(el) {
  var possibleTextTags = ['innerHTML', 'wholeText', 'innerText', 'nodeValue', 'textContent', 'data'];
  var possibleTexts = [''];
  for (var t of possibleTextTags) {
    if ((typeof el[t]) === 'string') {
      possibleTexts.push(el[t]);
    }
  }
  return possibleTexts;
}

/**
 * # to get attribute
 * Always returns the longest value for names
 * @param element
 * @param names possible names
 */
function getContent(element: Element | Document, names: string[]): string {
    let value: string;
    let values: string [] = [];
    for (const name of names) {
        if (name.includes("#")) {
            const [elementName, attr] = name.split("#");
            const data = getElementByName(element, elementName);
            if (data) {
                if (data.nodeName === elementName) {
                    //@ts-ignore
                    const tmp = data.getAttribute(attr);
                    if (tmp.length > 0) {
                        value = tmp;
                    }
                }
            }
        } else {
            const data = getElementByName(element, name);
            if (data) {
                value = getElPossibleText(data).reduce((a, b) => {return a.length > b.length ? a : b;});
                // //@ts-ignore
                // if(data.innerHTML && data.innerHTML.length > 0) {
                //     //@ts-ignore
                //     value = data.innerHTML;
                // }

                // //@ts-ignore
                // if (!value && data.nodeValue && data.nodeValue.length > 0) {
                //     value = data.nodeValue;
                // }
                // //@ts-ignore
                // if (!value && data.wholeText && data.wholeText.length > 0) {
                //     //@ts-ignore
                //     value = data.wholeText;
                // }
            }
        }
        if (value === undefined) {
          value = '';
        }
        values.push(value);
    }
    return values.reduce((a, b) => {return a.length > b.length ? a : b;});
}

function buildItem(element: Element): RssFeedItem {
    return {
        title: getContent(element, ["title"]),
        // description: getContent(element, ["content", "content:encoded", "itunes:summary", "description", "summary", "media:description"]),
        content: getContent(element, ["itunes:summary", "description", "summary", "media:description", "ns0:encoded", "abstract", "content", "content:encoded"]),
        category: getContent(element, ["category"]),
        link: getContent(element, ["link", "link#href"]),
        creator: getContent(element, ["creator", "dc:creator", "author", "author.name"]),
        pubDate: getContent(element, ["pubDate", "published", "updated", "dc:date"]),
        read: null,
        deleted: null,
        downloaded: null
    }
}

function getAllItems(doc: Document): Element[] {
    const items: Element[] = [];

    if (doc.getElementsByTagName("item")) {
        for (const elementsByTagNameKey in doc.getElementsByTagName("item")) {
            const entry = doc.getElementsByTagName("item")[elementsByTagNameKey];
            items.push(entry);

        }
    }
    if (doc.getElementsByTagName("entry")) {
        for (const elementsByTagNameKey in doc.getElementsByTagName("entry")) {
            const entry = doc.getElementsByTagName("entry")[elementsByTagNameKey];
            items.push(entry);
        }
    }
    return items;
}

async function requestFeed(feedUrl: string) : Promise<string> {
    return await request({url: feedUrl,
                          method: "GET",
                          headers: {"Cache-Control": "max-age=0, no-cache"}
                         });
}

export function nowdatetime(): string {
  var a = new Date();
  return a.toISOString();
}

export async function getFeedItems(feedUrl: string): Promise<RssFeedContent> {
    let data;
    try {
        const rawData = await requestFeed(feedUrl);
        data = new window.DOMParser().parseFromString(rawData, "text/xml");
    } catch (e) {
        new Notice('Fail to fetch ' + feedUrl, 3000);
        return Promise.resolve(undefined);
    }


    const items: RssFeedItem[] = [];
    const rawItems = getAllItems(data);

    var now_str = nowdatetime();

    rawItems.forEach((rawItem) => {
        const item = buildItem(rawItem);
        if (item.title !== undefined && item.title.length !== 0) {
            item.read = '';
            item.deleted = '';
            item.downloaded = now_str;

            items.push(item);
        }
    })
    const image = getContent(data, ["image", "image.url", "icon"]);

    const content: RssFeedContent = {
        title: getContent(data, ["title"]),
        subtitle: getContent(data, ["subtitle"]),
        link: getContent(data, ["link"]),
        pubDate: getContent(data, ["pubDate", 'dc:date', 'published', 'updated']),
        //we don't want any leading or trailing slashes in image urls(i.e. reddit does that)
        image: image ? image.replace(/^\/|\/$/g, '') : null,
        description: getContent(data, ["description"]),
        items: items,
    };

    return Promise.resolve(content);
}
