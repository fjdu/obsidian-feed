import {request} from "obsidian";

/**
 * parser for .rss files, build from scratch
 * because I could not find a parser that
 * - works on mobile
 * - is up-to-date
 * - works for multiple different interpretations of the rss spec
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
    description: string,
    content: string,
    category: string,
    link: string,
    creator: string,
    pubDate: string,
    folder: string,
    read: boolean,
    deleted: string,
    downloaded: string,
    tags: string[]
}

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

    } else if (element.getElementsByTagName(name).length > 0) {
        if (element.getElementsByTagName(name)[0].childNodes.length == 0) {
            value = element.getElementsByTagName(name)[0];
        } else {
            const node = element.getElementsByTagName(name)[0].childNodes[0];
            if (node !== undefined)
                value = node;
        }
    }
    //if(name === "content") console.log(value);

    return value;
}

/**
 * # to get attribute
 * Always returns the last found value for names
 * @param element
 * @param names possible names
 */
function getContent(element: Element | Document, names: string[]): string {
    let value: string;
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
                //@ts-ignore
                if(data.wholeText && data.wholeText.length > 0) {
                    //@ts-ignore
                    value = data.wholeText;
                }

                //@ts-ignore
                if (!value && data.nodeValue && data.nodeValue.length > 0) {
                    value = data.nodeValue;
                }
                //@ts-ignore
                if (!value && data.innerHTML && data.innerHTML.length > 0) {
                    //@ts-ignore
                    value = data.innerHTML;
                }
            }
        }
    }
    if (value === undefined) {
        return "";
    }
    return value;
}

function buildItem(element: Element): RssFeedItem {
    return {
        title: getContent(element, ["title"]),
        description: getContent(element, ["content", "content:encoded", "itunes:summary", "description", "summary", "media:description"]),
        content: getContent(element, ["itunes:summary", "description", "summary", "media:description", "content", "content:encoded", "ns0:encoded"]),
        category: getContent(element, ["category"]),
        link: getContent(element, ["link", "link#href"]),
        creator: getContent(element, ["creator", "dc:creator", "author", "author.name"]),
        pubDate: getContent(element, ["pubDate", "published", "updated", "dc:date"]),
        folder: null,
        read: null,
        deleted: null,
        downloaded: null,
        tags: [],
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
    return await request({url: feedUrl});
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
        console.error(e);
        return Promise.resolve(undefined);
    }


    const items: RssFeedItem[] = [];
    const rawItems = getAllItems(data);

    var now_str = nowdatetime();

    rawItems.forEach((rawItem) => {
        const item = buildItem(rawItem);
        if (item.title !== undefined && item.title.length !== 0) {
            item.read = false;
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
