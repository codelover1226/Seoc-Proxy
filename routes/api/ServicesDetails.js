const dashboardUrl = require('./AdminUrls').DASHBOARD_URL;


const allServices = {};


/**
 * This object contains details of all services (or proxies) supported by SEO Cromom
 * @class ServicesDetails
 */
module.exports = allServices;

/**
 * This object contains details of the **spyfu** service which proxies requests of https://www.spyfu.com/.
 * @type {Object}
 */
allServices.seocromom = Object.create(Object.prototype, {
    name: {
        value: 'seocromom',
        writable: false
    },
    homeUrl: {
        value: dashboardUrl,
        writable: false
    },
    tokenName: {
        value: 'adminCurrentToken',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-ADMIN-SESS',
        writable: false
    }
});


/**
 * This object contains details of the **spyfu** service which proxies requests of https://www.spyfu.com/.
 * @type {Object}
 */
allServices.spyfu = Object.create(Object.prototype, {
    name: {
        value: 'spyfu',
        writable: false
    },
    homeUrl: {
        value: '/hq?b=4',
        writable: false
    },
    tokenName: {
        value: 'spyfuCurrentToken',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SPYFU-SESS',
        writable: false
    }
});

/**
 * This object contains details of the **spyfu** service which proxies requests of https://www.spyfu.com/.
 * @type {Object}
 */
allServices.crunchbase = Object.create(Object.prototype, {
    name: {
        value: 'zonbase',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    tokenName: {
        value: 'zonbaseCurrentToken',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-ZONBASE-SESS',
        writable: false
    }
});

/**
 * This object contains details of the **onehourindexing** service which proxies requests of https://onehourindexing.co.
 * @type {Object}
 */
allServices.onehourindexing = Object.create(Object.prototype, {
    name: {
        value: 'onehourindexing',
        writable: false
    },
    homeUrl: {
        value: '/account',
        writable: false
    },
    tokenName: {
        value: 'onehourindexingCurrentToken',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-ONEHOURINDEXING-SESS',
        writable: false
    }
});



/**
 * This object contains details of the **yourtext** service which proxies requests of https://yourtext.guru/.
 * @type {Object}
 */
allServices.yourtext = Object.create(Object.prototype, {
    name: {
        value: 'yourtext',
        writable: false
    },
    homeUrl: {
        value: '/orders',
        writable: false
    },
    tokenName: {
        value: 'yourtextCurrentToken',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-YOURTEXT-SESS',
        writable: false
    }
});


allServices.semrush = Object.create(Object.prototype, {
    name: {
        value: 'semrush',
        writable: false
    },
    homeUrl: {
        value: '/analytics/overview/?searchType=domain',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SEMRUSH-SESS',
        writable: false
    }
});

allServices.sistrix = Object.create(Object.prototype, {
    name: {
        value: 'sistrix',
        writable: false
    },
    homeUrl: {
        value: '/toolbox',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SISTRIX-SESS',
        writable: false
    }
});

allServices.majestic = Object.create(Object.prototype, {
    name: {
        value: 'majestic',
        writable: false
    },
    homeUrl: {
        value: '/reports/site-explorer',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-MAJESTIC-SESS',
        writable: false
    }
});

allServices.babbar = Object.create(Object.prototype, {
    name: {
        value: 'babbar',
        writable: false
    },
    homeUrl: {
        value: '/dashboard',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-BABBAR-SESS',
        writable: false
    }
});

allServices.spinrewriter = Object.create(Object.prototype, {
    name: {
        value: 'spinrewriter',
        writable: false
    },
    homeUrl: {
        value: '/cp-home',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SPINREWRITER-SESS',
        writable: false
    }
});

allServices.smodin = Object.create(Object.prototype, {
    name: {
        value: 'smodin',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SMODIN-SESS',
        writable: false
    }
});

allServices.iconscout = Object.create(Object.prototype, {
    name: {
        value: 'iconscout',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-ICONSC-SESS',
        writable: false
    }
});

allServices.espinner = Object.create(Object.prototype, {
    name: {
        value: 'espinner',
        writable: false
    },
    homeUrl: {
        value: '/miembros',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-ESPINNER-SESS',
        writable: false
    }
});

allServices.seolyze = Object.create(Object.prototype, {
    name: {
        value: 'seolyze',
        writable: false
    },
    homeUrl: {
        value: '/EPS-KF',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SEOLYZE-SESS',
        writable: false
    }
});

allServices.dinorank = Object.create(Object.prototype, {
    name: {
        value: 'dinorank',
        writable: false
    },
    homeUrl: {
        value: '/homed',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-DINORANK-SESS',
        writable: false
    }
});

allServices.wordhero = Object.create(Object.prototype, {
    name: {
        value: 'wordhero',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-WORDHERO-SESS',
        writable: false
    }
});

allServices.lowfruits = Object.create(Object.prototype, {
    name: {
        value: 'lowfruits',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-LOWFRUITS-SESS',
        writable: false
    }
});

allServices.answerthepublic = Object.create(Object.prototype, {
    name: {
        value: 'answerthepublic',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-ANSTHEPUB-SESS',
        writable: false
    }
});

allServices.pbnpremium = Object.create(Object.prototype, {
    name: {
        value: 'pbnpremium',
        writable: false
    },
    homeUrl: {
        value: '/member',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-PBNPREM-SESS',
        writable: false
    }
});

allServices.closerscopy = Object.create(Object.prototype, {
    name: {
        value: 'closerscopy',
        writable: false
    },
    homeUrl: {
        value: '/dashboard',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-CLOSERSCP-SESS',
        writable: false
    }
});

allServices.domcop = Object.create(Object.prototype, {
    name: {
        value: 'domcop',
        writable: false
    },
    homeUrl: {
        value: '/domains',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-DOMCOP-SESS',
        writable: false
    }
});

allServices.neilpatel = Object.create(Object.prototype, {
    name: {
        value: 'neilpatel',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-NEILPAT-SESS',
        writable: false
    }
});

allServices.envato = Object.create(Object.prototype, {
    name: {
        value: 'envato',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-ELTsENVATO-SESS',
        writable: false
    }
});

allServices.freepik = Object.create(Object.prototype, {
    name: {
        value: 'freepik',
        writable: false
    },
    homeUrl: {
        value: '/popular-vectors',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-FREEPIK-SESS',
        writable: false
    }
});

allServices.rytr = Object.create(Object.prototype, {
    name: {
        value: 'rytr',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-RYTR-SESS',
        writable: false
    }
});

allServices.keysearch = Object.create(Object.prototype, {
    name: {
        value: 'keysearch',
        writable: false
    },
    homeUrl: {
        value: '/research',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-KEYSEARCH-SESS',
        writable: false
    }
});

allServices.paraphraser = Object.create(Object.prototype, {
    name: {
        value: 'paraphraser',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-PARAPH-SESS',
        writable: false
    }
});

allServices.bigspy = Object.create(Object.prototype, {
    name: {
        value: 'bigspy',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-BIGSPY-SESS',
        writable: false
    }
});

allServices.quetext = Object.create(Object.prototype, {
    name: {
        value: 'quetext',
        writable: false
    },
    homeUrl: {
        value: '/search',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-QUETEXT-SESS',
        writable: false
    }
});

allServices.ranktracker = Object.create(Object.prototype, {
    name: {
        value: 'ranktracker',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-RANKTRACKER-SESS',
        writable: false
    }
});

allServices.ahrefs = Object.create(Object.prototype, {
    name: {
        value: 'ahrefs',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-AHREFS-SESS',
        writable: false
    }
});

allServices.spamzilla = Object.create(Object.prototype, {
    name: {
        value: 'spamzilla',
        writable: false
    },
    homeUrl: {
        value: '/domains/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SPAMZILLA-SESS',
        writable: false
    }
});

allServices.seomonitor = Object.create(Object.prototype, {
    name: {
        value: 'seomonitor',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SEOMONITOR-SESS',
        writable: false
    }
});

allServices.colinkri = Object.create(Object.prototype, {
    name: {
        value: 'colinkri',
        writable: false
    },
    homeUrl: {
        value: '/amember/crawler',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-COLINKRI-SESS',
        writable: false
    }
});

allServices.keywordspeopleuse = Object.create(Object.prototype, {
    name: {
        value: 'keywordspeopleuse',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-KEYWORDSPU-SESS',
        writable: false
    }
});

allServices.serpstat = Object.create(Object.prototype, {
    name: {
        value: 'serpstat',
        writable: false
    },
    homeUrl: {
        value: '/projects/dashboard',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SERPSTAT-SESS',
        writable: false
    }
});

allServices.haloscan = Object.create(Object.prototype, {
    name: {
        value: 'haloscan',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-HALOSCAN-SESS',
        writable: false
    }
});

allServices.copyfy = Object.create(Object.prototype, {
    name: {
        value: 'copyfy',
        writable: false
    },
    homeUrl: {
        value: '/dashboard',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-COPYFY-SESS',
        writable: false
    }
});

allServices.languagetool = Object.create(Object.prototype, {
    name: {
        value: 'languagetool',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-LANGTOOL-SESS',
        writable: false
    }
});

allServices.xovi = Object.create(Object.prototype, {
    name: {
        value: 'xovi',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-XOVI-SESS',
        writable: false
    }
});

allServices.seoptimer = Object.create(Object.prototype, {
    name: {
        value: 'seoptimer',
        writable: false
    },
    homeUrl: {
        value: '/dashboard',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-SEOPTIMER-SESS',
        writable: false
    }
});

allServices.placeit = Object.create(Object.prototype, {
    name: {
        value: 'placeit',
        writable: false
    },
    homeUrl: {
        value: '/',
        writable: false
    },
    cookieName: {
        value: 'SEOCROMOM-PLACEIT-SESS',
        writable: false
    }
});