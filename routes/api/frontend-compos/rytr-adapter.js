class McopRytrElement {
    constructor(element) {
        if (! (typeof element === 'object' && element instanceof Element))
            throw new Error(element + " must be an instance of Element");
        this.element = element;
    }

    static create(element) {
        return new McopRytrElement(element);
    }

    getTagName() {
        if ('tagName' in this.element) {
            return ('' + this.element.tagName).toLowerCase();
        }

        return null;
    }

    hasAttr(name) {
        return this.element.hasAttribute(name);
    }

    removeAttr(name) {
        this.element.removeAttribute(name);
    }

    getAttr(name) {
        return this.element.getAttribute(name);
    }

    setAttr(name, value) {
        if (name && value) {
            this.element[name] = value;
            this.element.setAttribute(name, value);
        }
        return this;
    }


    isTargetedTag() {
        return typeof this.targetedTags()[this.getTagName()] === 'object';
    }

    targetedTags() {
        const thisElement = this;
        return {
            'a': {
                modify: function () {
                    const name = 'href';
                    const evtAttachedAttr = '__mcop_rytr_click_added';
                    const attrValue = thisElement.getAttr(name);
                    const clickHandler =  function (event) {
                        event.stopImmediatePropagation();
                        const clickedLink = event.target;
                        const hrefValue = clickedLink.href;
                        if (typeof hrefValue === 'string' && hrefValue.length > 0) location.assign(hrefValue);
                    };
                    if (typeof attrValue === 'string') {
                        thisElement.element.addEventListener('click', clickHandler);
                    }
                }
            },
            'button': {
                modify: function () {
                    if (/Create/.test(thisElement.element.textContent) &&
                        /alert-dialog-actions/.test(thisElement.element.parentElement.getAttribute('class'))) {
                        const clickHandler =  function (event) {
                            event.stopImmediatePropagation();
                            setTimeout(function () {
                                if (document.querySelector('.alert-dialog-actions') === null) {
                                    location.reload();
                                }
                            }, 1000);
                        };
                        thisElement.element.addEventListener('click', clickHandler);
                    } else if (/Ryte\s+for\s+me/i.test(thisElement.element.textContent) && /ryte?|ryte$/.test(location.href)) {
                        const clickHandler =  function (event) {
                            event.stopImmediatePropagation();
                            setTimeout(function () {
                                if (/Ryting/i.test(thisElement.element.textContent)){
                                    const interval = setInterval(function () {
                                        if (/Ryte\s+for\s+me/.test(thisElement.element.textContent)){
                                            clearInterval(interval);
                                            location.reload();
                                        }
                                    }, 1);
                                }
                            }, 300);
                        };
                        thisElement.element.addEventListener('click', clickHandler);
                    } else if (/Logout/i.test(thisElement.element.textContent) && /account?|account$/.test(location.href)) {
                        const clickHandler =  function (event) {
                            setTimeout(async function () {
                                const resp = await fetch(location.origin + '/mcop-rytr/delete_session');
                            }, 1000);
                        };
                        thisElement.element.addEventListener('click', clickHandler);
                    }
                }
            },
        };
    }

    modifyChildren() {
        if (!(this.element.children && this.element.children.length > 0))
            return false;

        for (let id = 0; id < this.element.children.length; id++) {
            if (this.element.children[id] instanceof Element) {
                (McopRytrElement.create(this.element.children[id])).applyChanges();
            }
        }
    }

    applyChanges() {
        const tagName = this.getTagName().toLowerCase();
        if (this.targetedTags()[tagName]) {
            this.targetedTags()[tagName].modify();
        }

        this.modifyChildren();
    }
}


const domObserver = new window.MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(function (currentNode) {
                if(currentNode instanceof Element) {
                    try{
                        const mcopElt = McopRytrElement.create(currentNode);
                        mcopElt.applyChanges();
                    } catch (error){

                    }
                }
            });
        } else {
            if (mutation.target  instanceof Element) {
                try{
                    const mcopElt = new McopRytrElement(mutation.target);
                    mcopElt.applyChanges();
                } catch (error){
                    console.log(error);
                }
            }
        }
    });
});

// configuration of the observer:
domObserver.observe(document.documentElement, {
    attributes: true, childList: true, characterData: true, subtree: true, attributeOldValue: true, characterDataOldValue: true
});

window.addEventListener('DOMContentLoaded', function () {
    if (window.parent !== window)
        return;

    const URLS = {
        SAVE_SESSION: location.origin + '/mcop-rytr/save_session',
        GET_SESSION: location.origin + '/mcop-rytr/get_session'
    };

    window.MCOP_RYTR_SESSION_SAVED = false;

    const utils = {
        closeConnection: function (ws) {
            try {
                ws.close(1000, 'Bye!');
            } catch (e) {}
        },
        loginOrRegisterBlockExists : function () {
            const paragraphs = document.querySelectorAll('p');
            let exists = false;
            paragraphs.forEach(function (currentItem) {
                if (/Please\s+login\s+or\s+create\s+your\s+Rytr\s+account/.test(currentItem.textContent)) {
                    exists = true;
                }
            });

            return exists;
        },
        ryteLinkExists : function () {
            return document.querySelector('a[href*="/ryte"]') !== null;
        },
        historyLinkExists : function () {
            return document.querySelector('a[href*="/history"]') !== null;
        },
        accountLinkExists : function () {
            return document.querySelector('a[href*="/account"]') !== null;
        },
        makeHttpRequest: async function (url, requestOptions) {
            return new Promise(function (resolve, reject) {
                fetch(url, requestOptions).then(async function (response) {
                    resolve(response);
                }).catch(function (error) {
                    reject(error);
                });
            });
        }
    };

    const anInterval = setInterval(async function () {
        try {
            if (window.localStorage.getItem('token') && window.localStorage.getItem('user')) {
                if (utils.loginOrRegisterBlockExists()) {
                    clearInterval(anInterval);
                    location.reload();
                    return;
                }

                const response = await utils.makeHttpRequest(URLS.SAVE_SESSION, {
                    method: "POST",
                    "Content-Type": "application/x-www-form-urlencoded",
                    body: JSON.stringify(window.localStorage),
                });

                if (response.status === 200) {
                    if (/application\/json/.test(response.headers.get("Content-Type"))) {
                        window.localStorage.clear();
                    }
                }
            } else {
                const response = await utils.makeHttpRequest(URLS.GET_SESSION);
                if (response.status === 200 && /application\/json/.test(response.headers.get("Content-Type"))) {
                    const sessionDetails = await response.json();
                    for (let propName in sessionDetails) {
                        window.localStorage.setItem(propName, sessionDetails[propName]);
                    }
                }
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 3000);
});