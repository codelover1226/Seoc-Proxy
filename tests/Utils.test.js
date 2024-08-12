const utils = require("../routes/api/Utils");

describe("Utils.randomInt test suite", function () {
    it('randomInt - Ok', function () {
        const randNumb = utils.randomInt(4, 5);
        expect(randNumb).toBeGreaterThanOrEqual(4);
        expect(randNumb).toBeLessThanOrEqual(5);
    })

    ;it('randomInt - Ok - 2', function () {
        const randNumb = utils.randomInt(10, 200);
        expect(randNumb).toBeGreaterThanOrEqual(10);
        expect(randNumb).toBeLessThanOrEqual(200);
    });

    it('randomInt - bad min', function () {
        const randNumb = utils.randomInt(4.5, 5);
        expect(randNumb).toEqual(0);
    });

    it('randomInt - bad max', function () {
        const randNumb = utils.randomInt(5, 0.9);
        expect(randNumb).toEqual(0);
    });

    it('randomInt - bad - min > max', function () {
        const randNumb = utils.randomInt(5, 1);
        expect(randNumb).toEqual(5);
    });

    it('randomInt - bad - min = max', function () {
        const randNumb = utils.randomInt(12, 12);
        expect(randNumb).toEqual(12);
    });
});

describe("Utils.findAllOccurrences test suite", function () {
    it('find a single letter once', function () {
        expect(utils.findAllOccurrences('a', 'a')).toEqual(Array.from([{index: 0}]));
    });

    it('find a single letter twice', function () {
        expect(utils.findAllOccurrences('a', 'abbbba')).toEqual(Array.from([{index: 0},{index: 5}]));
    });

    it('find a group of letters many times', function () {
        const jsCode = `window.location;throw new Error("fixUrls requires window.location");var a=window.location;`;
        expect(utils.findAllOccurrences('window.location', jsCode))
            .toEqual(Array.from([{index: 0},{index: 50},{index: 74}]));
    });
});

describe("Utils.isJsFile test suite", function () {
    it('is js file', function () {
        expect(utils.isJsFile('aea80afbab168f4ebea6da9237b1cc83.js')).toBeTruthy();
    });

    it('is js file with get var', function () {
        expect(utils.isJsFile('aea80afbab168f4ebea6da9237b1cc83.js?v=1705130628')).toBeTruthy();
    });

    it('is json', function () {
        expect(utils.isJsFile('aea80afbab168f4ebea6da9237b1cc83.json')).toBeFalsy();
    });
});