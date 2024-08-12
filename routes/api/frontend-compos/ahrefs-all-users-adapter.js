window.addEventListener('DOMContentLoaded', function () {
    const anInterval = setInterval(function () {
        const markedAttrib = '__mcopp-ahrefs-marked';
        const allLinks = document.querySelectorAll(`a`);
        allLinks.forEach(function (curElt) {
            const targetAttrValue = curElt.getAttribute('target') + '';
            const href = curElt.getAttribute('href') + '';
            const classAttrValue = curElt.getAttribute('class') + '';
            if (targetAttrValue !== '_blank' && /^(https|http)/.test(href) && classAttrValue.includes('-link')) {
                curElt.setAttribute(markedAttrib, '1');
                curElt.addEventListener('click', function () {
                    location.assign(href);
                });
            }
        });
    }, 1);
});