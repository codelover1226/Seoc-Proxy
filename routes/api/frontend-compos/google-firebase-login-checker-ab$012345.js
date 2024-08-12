/*
* This file contains code to check a firebase session is stored in a local IndexedDb and send them to the Seo Cromom firebase server.
* */

const SmodinFirebase = {
    //Opens the firebase database and returns an objectStore object
    openDb: function () {
        return new Promise(function (resolve, reject) {
            // In the following line, you should include the prefixes of implementations you want to test.
            window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
            // DON'T use "const indexedDB = ..." if you're not in a function.
            // Moreover, you may need references to some window.IDB* objects:
            window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
            window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
            // (Mozilla has never prefixed these objects, so we don't need window.mozIDB*)

            let db = undefined;
            const DBOpenRequest = window.indexedDB.open('firebaseLocalStorageDb', 1);

            DBOpenRequest.onsuccess = function(event) {
                db = DBOpenRequest.result;
                let transaction = db.transaction(['firebaseLocalStorage'], 'readwrite');
                let objectStore = transaction.objectStore('firebaseLocalStorage');
                resolve(objectStore);
            };

            DBOpenRequest.onupgradeneeded = function(event) {
                db = event.target.result;

                db.onerror = function(event) {
                    reject('Error loading database.');
                };
            };

        });
    },
    getStoredSession: function (objectStore) {
        return new Promise(function (resolve, reject) {
            try {
                const request = objectStore.openCursor();
                    request.onsuccess = function(event) {
                        const cursor = event.target.result;
                        if (cursor) {
                            const connectedUserDetails = cursor.value;

                            if (typeof connectedUserDetails.fbase_key) {
                                return resolve(connectedUserDetails);
                            }
                        }

                        return resolve(false);
                    };
            } catch (error) {
                reject(error);
            }
        });
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


window.addEventListener("DOMContentLoaded", function() {
    const parentFrame = window.frameElement;

    //console.log(parentFrame);
    if (parentFrame === null) {
        let counter = 0;
        const anInterval = setInterval(async function () {
            const errorStyle = 'color: #be0000;background-color: #f8d7da;border-color: #f5c6cb;' +
                'margin-left: auto;margin-right: auto;width: 70%; padding: 20px;font-size: 1.6rem;text-align: center;';

            try {
                const objectStore = await SmodinFirebase.openDb();
                const storedSession = await SmodinFirebase.getStoredSession(objectStore);
                if (storedSession) {
                    const sessionDetails = btoa(JSON.stringify(storedSession));
                    let requestOptions = {
                        method: "POST",
                        "Content-Type": "application/x-www-form-urlencoded",
                        body: sessionDetails,
                    };

                    const url = "/firebase/save/u-details.po";
                    const response = await SmodinFirebase.makeHttpRequest(url, requestOptions);
                    return clearInterval(anInterval);
                } else {
                    const requestOptions = {method: "GET"};
                    const url = "/firebase/get/u-details.po";
                    const response = await SmodinFirebase.makeHttpRequest(url, requestOptions);
                    if (response.status === 200 && /application\/json/.test(response.headers.get("Content-Type"))) {
                        const sessionDetails = await response.json();
                        if (typeof sessionDetails.data !== "undefined") {
                            const decodedData = atob(sessionDetails.data);
                            const parsedData = JSON.parse(decodedData);

                            if (typeof parsedData.fbase_key !== "undefined" && typeof parsedData.value !== "undefined") {
                                const objectStore = await SmodinFirebase.openDb();
                                objectStore.put(parsedData);
                                clearInterval(anInterval);
                                location.replace("/");
                            }
                        } else {
                            const objectStore = await SmodinFirebase.openDb();
                            objectStore.clear();
                        }

                        return clearInterval(anInterval);
                    }
                    clearInterval(anInterval);
                }
            } catch (error) {
                clearInterval(anInterval);
                document.body.innerHTML = '<div style="' + errorStyle + '">An unpredictable error occurred whilst getting session. Contact admin</div>';
                console.log(error);
            }
            counter++;
        }, 3000);
    }
});