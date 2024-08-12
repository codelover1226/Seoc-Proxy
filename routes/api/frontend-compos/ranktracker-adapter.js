window.addEventListener('DOMContentLoaded', function () {
    if (window.parent !== window)
        return;

    const URLS = {
        SAVE_SESSION: location.origin + '/mcop-ranktracker/save_session',
        GET_SESSION: location.origin + '/mcop-ranktracker/get_session'
    };

    const utils = {
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

    const logoutLink = document.querySelector('#menu-list-38-menuitem-53');
    if (logoutLink) logoutLink.remove();

    const anInterval = setInterval(async function () {
        try {
            if (window.localStorage.getItem('jwt')) {
                const response = await utils.makeHttpRequest(URLS.SAVE_SESSION, {
                    method: "POST",
                    "Content-Type": "application/x-www-form-urlencoded",
                    body: JSON.stringify(window.localStorage),
                });

                if (response.status === 200) {
                    if (/application\/json/.test(response.headers.get("Content-Type"))) {
                        const respDetails = await response.json();
                        if (respDetails.do_logout) {
                            localStorage.clear();
                        }
                    }
                    clearInterval(anInterval);
                }
            } else {
                const response = await utils.makeHttpRequest(URLS.GET_SESSION);
                if (response.status === 200 && /application\/json/.test(response.headers.get("Content-Type"))) {
                    const sessionDetails = await response.json();
                    for (let propName in sessionDetails) {
                        window.localStorage.setItem(propName, sessionDetails[propName]);
                    }
                    clearInterval(anInterval);
                    location.reload();
                } else if (response.status === 404) {
                    localStorage.clear();
                }
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 3000);
});