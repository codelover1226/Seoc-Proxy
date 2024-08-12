window.addEventListener('DOMContentLoaded', function () {
    const anInterval = setInterval(function () {
        try {
            const buttons = document.querySelectorAll(`button.btn-info`);
            buttons.forEach(function (btn) {
                const wireClickAttr = btn.getAttribute('wire:click');
                if (wireClickAttr === `select('publisher')` && /analyze/i.test(btn.innerText + '')) {
                    btn.parentElement.parentElement.remove();
                }
            });

            const bulkSelectionForm = document.querySelector('#dropdown_selection_checkbox');
            if (bulkSelectionForm)
                bulkSelectionForm.remove();

            const alertCounter = document.querySelector('span.list-alert-count');
            if (alertCounter) {
                const matches = alertCounter.textContent.match(/[0-9]+/);
                if (Array.isArray(matches) && matches.length === 1) {
                    if (matches[0] > 1) {
                        alertCounter.parentElement.parentElement.parentElement.parentElement.parentElement.remove();
                    }
                }

            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 10);

    const paginators = document.querySelectorAll('button.page-link');
    paginators.forEach(function (currentItem) {
        const wireClickAttr = currentItem.getAttribute('wire:click');
        if (/gotoPage/.test(wireClickAttr)) {
            currentItem.addEventListener('click', function (event) {
                const wireClickAttr = event.target.getAttribute('wire:click') + '';
                const matches = wireClickAttr.match(/[0-9]+/);
                if (Array.isArray(matches) && matches.length === 1) {
                    const pageNb = matches[0];
                    const cuURL = new URL(location.href);
                    let pageUrl = cuURL.protocol + '//' + cuURL.hostname + cuURL.pathname + '?page=' + pageNb;
                    location.assign(pageUrl);
                }
            });
        }
    });
});