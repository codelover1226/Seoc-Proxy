const handlerHelpers = require("../routes/api/HandlerHelpers");
const fs = require('fs');
const path = require('path');


describe("HandlerHelpers test suite", function () {
        it('cloudFlareClearanceCookieExists - True', function () {
            expect(handlerHelpers.cloudFlareClearanceCookieExists("a-cookie=value;cf_clearance=Gthyuiio_hgyt6756;")).toBeTruthy();
        });

        it('cloudFlareClearanceCookieExists - False with empty string', function () {
            expect(handlerHelpers.cloudFlareClearanceCookieExists("")).toBeFalsy();
        });

        it('cloudFlareClearanceCookieExists - False with null', function () {
            expect(handlerHelpers.cloudFlareClearanceCookieExists(null)).toBeFalsy();
        });

        it('containsCompositeGetVar - Full URL', function () {
            expect(handlerHelpers.containsCompositeGetVar('https://localhost:8092/web/js/graph.js?mcop-comenc=P3Q9MTY0NzU5MTY5NCZvcmlnaW5hbC1ob3N0PWZyLnNpc3RyaXguY29t')).toBeTruthy();
        });

        it('containsCompositeGetVar - Relative URL', function () {
            expect(handlerHelpers.containsCompositeGetVar('/web/js/graph.js?mcop-comenc=P3Q9MTY0NzU5MTY5NCZvcmlnaW5hbC1ob3N0PWZyLnNpc3RyaXguY29t')).toBeTruthy();
        });

        it('containsCompositeGetVar - Relative URL with many vars', function () {
            expect(handlerHelpers.containsCompositeGetVar('/web/js/graph.js?mcop-comenc=P3Q9MTY0NzU5MTY5NCZvcmlnaW5hbC1ob3N0PWZyLnNpc3RyaXguY29t&b=1')).toBeFalsy();
        });

        it('containsCompositeGetVar - Has no composite var', function () {
            expect(handlerHelpers.containsCompositeGetVar('/web/js/graph.js')).toBeFalsy();
        });

        it('containsCompositeGetVar - url is null', function () {
            expect(handlerHelpers.containsCompositeGetVar(null)).toBeFalsy();
        });

        it('decodeCompositeGetVar - Original full url gotten back', function () {
            expect(handlerHelpers.decodeCompositeGetVar('https://localhost:8092/web/js/graph.js?mcop-comenc=P3Q9MTY0NzU5MTY5NCZvcmlnaW5hbC1ob3N0PWZyLnNpc3RyaXguY29t'))
                .toEqual('https://localhost:8092/web/js/graph.js?t=1647591694&original-host=fr.sistrix.com');
        });

        it('decodeCompositeGetVar - Original relative url gotten back', function () {
            expect(handlerHelpers.decodeCompositeGetVar('/web/js/graph.js?mcop-comenc=P3Q9MTY0NzU5MTY5NCZvcmlnaW5hbC1ob3N0PWZyLnNpc3RyaXguY29t'))
                .toEqual('/web/js/graph.js?t=1647591694&original-host=fr.sistrix.com');
        });

        it('decodeCompositeGetVar - Failed to decode bad value', function () {
            expect(handlerHelpers.decodeCompositeGetVar('/web/js/graph.js?mcop-comenc=BAD_VALUE'))
                .toEqual('/web/js/graph.js?mcop-comenc=BAD_VALUE');
        });

        it('replaceLocationInJsCode - Good in quotes', function () {
            expect(handlerHelpers.replaceLocationInJsCode("'location'")).toContain("'__mcopLocation'");
        });

        it('replaceLocationInJsCode - Good', function () {
            expect(handlerHelpers.replaceLocationInJsCode("window.location")).toContain("window.__mcopLocation");
        });

        it('replaceLocationInJsCode - from window to href', function () {
            expect(handlerHelpers.replaceLocationInJsCode("window.location.href")).toContain("window.__mcopLocation.href");
        });

        it('replaceLocationInJsCode - from window to href with newline char', function () {
            expect(handlerHelpers.replaceLocationInJsCode("b&&\nwindow.location.href.indexOf")).toContain("window.__mcopLocation.href");
        });

        it('replaceLocationInJsCode - from window to href with newline char 2', function () {
            expect(handlerHelpers.replaceLocationInJsCode("b&&\rnwindow.location.href.indexOf")).toContain("window.__mcopLocation.href");
        });

        it('replaceLocationInJsCode - href form location', function () {
            expect(handlerHelpers.replaceLocationInJsCode("location.href;")).toContain("__mcopLocation.href");
        });

        it('replaceLocationInJsCode - href form location 2', function () {
            expect(handlerHelpers.replaceLocationInJsCode(";locationModel.href;location.href;")).toContain("locationModel.href;__mcopLocation.href");
        });


        it('replaceLocationInJsCode - loose location', function () {
            expect(handlerHelpers.replaceLocationInJsCode("location?e.location:ue(e.location);")).toContain("__mcopLocation?e.__mcopLocation:ue(e.__mcopLocation)");
        });

        it('replaceLocationInJsCode - loose location 2', function () {
            expect(handlerHelpers.replaceLocationInJsCode("var yt='hello';location?e.location:ue(e.location);"))
                .toContain("var yt='hello';__mcopLocation?e.__mcopLocation:ue(e.__mcopLocation)");
        });

        it('replaceLocationInJsCode - loose location 3', function () {
            expect(handlerHelpers.replaceLocationInJsCode("location?location:null;")).toContain("__mcopLocation?__mcopLocation:null");
        });

        it('replaceLocationInJsCode - Good Many', function () {
            expect(handlerHelpers.replaceLocationInJsCode("window.location;window.location;")).toContain("window.__mcopLocation;window.__mcopLocation");
        });

        it('replaceLocationInJsCode - Good in object notation', function () {
            expect(handlerHelpers.replaceLocationInJsCode("b={location:e};")).toContain("__mcopLocation:e");
        });

        it('replaceLocationInJsCode - Good in object notation 2', function () {
            expect(handlerHelpers.replaceLocationInJsCode("r.setState({location:e})")).toContain("__mcopLocation:e");
        });

        it('replaceLocationInJsCode - Good in object notation 3', function () {
            expect(handlerHelpers.replaceLocationInJsCode("r.setState({location:location})")).toContain("__mcopLocation:__mcopLocation");
        });

        it('replaceLocationInJsCode - Good in object notation 4', function () {
            expect(handlerHelpers.replaceLocationInJsCode("r.setState({locationModel:location})")).toContain("locationModel:__mcopLocation");
        });

        it('replaceLocationInJsCode - Good in object notation 5', function () {
            expect(handlerHelpers.replaceLocationInJsCode("r.setState({location:locationModel})")).toContain("__mcopLocation:locationModel");
        });

        it('replaceLocationInJsCode - Good in destructuring assignment func', function () {
            expect(handlerHelpers.replaceLocationInJsCode("function test({location:e}){}")).toContain("__mcopLocation:e");
        });

        it('replaceLocationInJsCode - Good in destructuring assignment arrow func', function () {
            expect(handlerHelpers.replaceLocationInJsCode("({location:e})=>{}")).toContain("__mcopLocation:e");
        });

        it('replaceLocationInJsCode - Good in function params', function () {
            expect(handlerHelpers.replaceLocationInJsCode(`O=Object(c.a)(e,["aria-current","activeClassName","activeStyle","className","exact","isActive","location","sensitive","strict","style","to","innerRef"]);`)).toContain(`,"__mcopLocation",`);
        });

        it('replaceLocationInJsCode - Good in array', function () {
            expect(handlerHelpers.replaceLocationInJsCode(`O=["window","location","href"];`)).toContain(`,"__mcopLocation",`);
        });

        it('replaceLocationInJsCode - complex function', function () {
            const jsCode = `function t(t){var n;return(n=e.call(this,t)||this).state={location:t.history.location},n._isMounted=!1,n._pendingLocation=null,t.staticContext||(n.unlisten=t.history.listen((function(e){n._isMounted?n.setState({location:e}):n._pendingLocation=e}))),n}`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode)).toContain(`function t(t){var n;return(n=e.call(this,t)||this).state={__mcopLocation:t.history.__mcopLocation},n._isMounted=!1,n._pendingLocation=null,t.staticContext||(n.unlisten=t.history.listen((function(e){n._isMounted?n.setState({__mcopLocation:e}):n._pendingLocation=e}))),n}`);
        });

        //$(`tr[data-ip-addr='${v.ip}']`).find('.td-__mcopLocation').text(v.__mcopLocation);

        it('replaceLocationInJsCode - complex object', function () {
            const jsCode = `this[d=(q=(L=(((P=Q[(Y=[0,(n=["file:","callImmediate","port1"],49),"host"],Y)[1]](18,document,"IFRAME"),P).style.display=l,document.documentElement).appendChild(P),B=P.contentWindow,B.document),L.open(),L.close(),n[1]+Math.random()),B).location.protocol==n[Y[0]]?"*":B.location.protocol+"//"+B.location[Y[2]],U=D(function(a){if(("*"==d||a.origin==d)&&a.data==q)this.port1.onmessage()},this),B.addEventListener("message",U,r),n[2]]`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode)).toContain(`this[d=(q=(L=(((P=Q[(Y=[0,(n=["file:","callImmediate","port1"],49),"host"],Y)[1]](18,document,"IFRAME"),P).style.display=l,document.documentElement).appendChild(P),B=P.contentWindow,B.document),L.open(),L.close(),n[1]+Math.random()),B).__mcopLocation.protocol==n[Y[0]]?"*":B.__mcopLocation.protocol+"//"+B.__mcopLocation[Y[2]],U=D(function(a){if(("*"==d||a.origin==d)&&a.data==q)this.port1.onmessage()},this),B.addEventListener("message",U,r),n[2]]`);
        });

        it('replaceLocationInJsCode - in file path skipped', function () {
            const jsCode = `i=n("./seoideas-wizard/es6/tracking/tracking-location-fabric.js")`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode)).toContain(`tracking-location-fabric.js`);
        });

        it('replaceLocationInJsCode - in file path skipped 2', function () {
            const jsCode = `"./seoideas-wizard/es6/tracking/tracking-location-fabric.js"`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode)).toContain(`./seoideas-wizard/es6/tracking/tracking-location-fabric.js`);
        });

        it('replaceLocationInJsCode - as method name', function () {
            const jsCode = `var b = this.locationModel.get("location")`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode)).toContain(`this.locationModel.get("__mcopLocation")`);
        });

        it('replaceLocationInJsCode - in parameters', function () {
            const jsCode = `{key:"serialize",value:function(){var e=this.location.model.toJSON();return{locationString:this._getLocationString(e,d.default,this.isSmall),deviceGroup:this._getDeviceName(e.device_group),templateDevice:this.templateDevice,t:r.default.t.bind(r.default)}}}`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode))
                .toContain(`{key:"serialize",value:function(){var e=this.__mcopLocation.model.toJSON();return{locationString:this._getLocationString(e,d.default,this.isSmall),deviceGroup:this._getDeviceName(e.device_group),templateDevice:this.templateDevice,t:r.default.t.bind(r.default)}}}`);
        });

        it('replaceLocationInJsCode - in location part skipped parameters', function () {
            const jsCode = `{className:"sc-location-loader"}`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode)).toContain(`{className:"sc-location-loader"}`);
        });

        it('replaceLocationInJsCode - in location part skipped 2', function () {
            const jsCode = `window.location;throw new Error("fixUrls requires window.location");var a=window.location;`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode))
                .toContain(`window.__mcopLocation;throw new Error("fixUrls requires window.location");var a=window.__mcopLocation;`);
        });

        it('replaceLocationInJsCode - progressive replacement', function () {
            const jsCode = `(function(t){return{id:t.id,text:t.location,location:t.location,device:t.device,language:t.language,selected:t.id===e}})`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode))
                .toContain(`(function(t){return{id:t.id,text:t.__mcopLocation,__mcopLocation:t.__mcopLocation,device:t.device,language:t.language,selected:t.id===e}})`);
        });

        it('replaceLocationInJsCode - in function call', function () {
            const jsCode = `function(e,t,n){"use strict";Object.defineProperty(t,"__esModule",{value:!0}),t.default={urls:{info:"/tracking/hashes/?id={campaign_id}",countries:"/api/tracking/get_countries?key={key}&display_hash={hash}&rnd={rnd}&hl=2&co=2",regions:"/api/tracking/get_regions?country_id={countryId}&key={key}&display_hash={hash}&rnd={rnd}",cities:"/api/tracking/get_cities?region_id={regionId}&key={key}&display_hash={hash}&rnd={rnd}",locationInfo:"/api/tracking/seoideas_location?key={key}&id={project_id}"},countriesCodes:{en:2840,es:2724,de:2276,fr:2250,it:2380,pt:2620,ru:2643},countriesNames:{en:"United States",es:"Spain",de:"Germany",fr:"France",it:"Italy",pt:"Portugal",ru:"Russia"}}}`;
            expect(handlerHelpers.replaceLocationInJsCode(jsCode))
                .toContain(`/api/tracking/seoideas_location`);
        });

        it('replaceLocationInJsCode - window.location. in real js file', function () {
            const fs = require('fs');
            const jsCode = fs.readFileSync(__dirname + '/assets/seoideas-wizard.min.2bd31cb1-real.js').toString();
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            const matches = newJsCode.match(/window\.__mcopLocation/mg) || [];
            const matches2 = newJsCode.match(/this\.__mcopLocation/mg) || [];
            const matches3 = newJsCode.match(/\)\.__mcopLocation/mg) || [];
            const matches6 = newJsCode.match(/\.sc-location-loader/mg) || [];
            const matches11 = newJsCode.match(/__mcopLocation\:/mg) || [];
            const matches12 = newJsCode.match(/no_location/mg) || [];
            const matches13 = newJsCode.match(/tracking:location:changed/mg) || [];
            const matches14 = newJsCode.match(/location:reload/mg) || [];
            const matches16 = newJsCode.match(/"\.\/seoideas-wizard\/es6\/tracking\/tracking-location-model-fabric\.js"/mg) || [];
            //fs.writeFileSync(path.join(__dirname, 'checkpoint.js'), newJsCode);
            expect(matches.length).toEqual(17);
            expect(matches2.length).toEqual(16);
            expect(matches3.length).toEqual(1);
            expect(matches6.length).toEqual(1);
            expect(matches11.length).toEqual(11);
            expect(matches12.length).toEqual(1);
            expect(matches13.length).toEqual(1);
            expect(matches14.length).toEqual(1);
            expect(matches16.length).toEqual(3);
        });

        it('replaceLocationInJsCode - location in real js file 2', function () {
            const fs = require('fs');
            const jsCode = fs.readFileSync(__dirname + '/assets/recaptcha.js').toString();
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            const matches = newJsCode.match(/\.__mcopLocation/mg) || [];
            //console.log(matches);
            //fs.writeFileSync(path.join(__dirname, 'recaptcha-result.js'), newJsCode);
            expect(matches.length).toEqual(13);
        });

        it('replaceLocationInJsCode - location in real js file 3', function () {
            const fs = require('fs');
            const jsCode = fs.readFileSync(__dirname + '/assets/api.js').toString();
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            const matches = newJsCode.match(/e\.__mcopLocation\.href\.startsWith\(\"http\"\)/mg) || [];
            //console.log(matches);
            //fs.writeFileSync(path.join(__dirname, 'recaptcha-result.js'), newJsCode);
            expect(matches.length).toEqual(1);
        });

        it('replaceLocationInJsCode - location in real js file 4', function () {
            const fs = require('fs');
            const jsCode = fs.readFileSync(__dirname + '/assets/sample-720-af4fc983a10eafad.js').toString();
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            const matches = newJsCode.match(/__mcopLocation:/mg) || [];
            const matches2 = newJsCode.match(/page_location:/mg) || [];
            const matches3 = newJsCode.match(/e\.page_location/mg) || [];
            const matches4 = newJsCode.match(/window\.__mcopLocation/mg) || [];
            const matches5 = newJsCode.match(/e\.__mcopLocation/mg) || [];
            //fs.writeFileSync(path.join(__dirname, 'recaptcha-result.js'), newJsCode);
            expect(matches.length).toEqual(2);
            expect(matches2.length).toEqual(3);
            expect(matches3.length).toEqual(1);
            expect(matches4.length).toEqual(2);
            expect(matches5.length).toEqual(1);
        });

        it('replaceLocationInJsCode - location in real js file 5', function () {
            const fs = require('fs');
            const jsCode = fs.readFileSync(__dirname + '/assets/index.67c2a400.js').toString();
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            const matches = newJsCode.match(/__mcopLocation/mg) || [];
            const matches2 = newJsCode.match(/location/mg) || [];
            //console.log(matches);
            //fs.writeFileSync(path.join(__dirname, 'recaptcha-result.js'), newJsCode);
            expect(matches.length).toEqual(44);
            expect(matches2.length).toEqual(49);
        });

        it('replaceLocationInJsCode - location in real js file 6', function () {
            const fs = require('fs');
            const jsCode = fs.readFileSync(__dirname + '/assets/freepik.js').toString();
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            const matches = newJsCode.match(/window\.__mcopLocation\.href\.indexOf\(/mg) || [];
            const matches2 = newJsCode.match(/"__mcopLocation":/mg) || [];
            //console.log(matches);
            fs.writeFileSync(path.join(__dirname, 'assets', 'recaptcha-result.js'), newJsCode);
            expect(matches.length).toEqual(30);
            expect(matches2.length).toEqual(31);
        });

        it('replaceLocationInJsCode - location in real js file 7', function () {
            const fs = require('fs');
            const jsCode = fs.readFileSync(__dirname + '/assets/va_gq-aebd79593921a2ca69811e99d87981f2.js').toString();
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            const matches2 = newJsCode.match(/__mcopLocation/mg) || [];
            //console.log(matches);
            //fs.writeFileSync(path.join(__dirname, 'assets', 'va_gq-aebd79593921a2ca69811e99d87981f2-result.js'), newJsCode);
            expect(matches2.length).toEqual(38);
        });

        it('replaceLocationInJsCode - this.location in long function', function () {
            const fs = require('fs');
            const jsCode = `function(){this.location=(0,i.TrackingLocationFabric)(this.projectId,{project:this.project,dispatcher:this.dispatcher,hasTracking:this.hasTracking,projectId:this.projectId,campaignExists:!0})}`;
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain(`this.__mcopLocation`);
        });


        it('replaceLocationInJsCode - o.locationModel', function () {
            const fs = require('fs');
            const jsCode = 'o.location={};o.locationModel; const locationObjt = null;';
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain('o.locationModel');
            expect(newJsCode).toContain('locationObjt');
        });

        it('replaceLocationInJsCode - o.locationModel 2', function () {
            const fs = require('fs');
            const jsCode = 'o.location={};o.locationModel;o.location={};';
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain('o.locationModel');
        });

        it('replaceLocationInJsCode - o.locationModel 3', function () {
            const fs = require('fs');
            const jsCode = 'o.location={};o.locationModel;o.location={};o.locationModel;';
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            const matches = newJsCode.match(/o.locationModel/mg) || [];
            expect(matches.length).toEqual(2);
        });

        it('replaceLocationInJsCode - o.locationModel 4', function () {
            const fs = require('fs');
            const jsCode = 'o.location={};o.locationModel';
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain('o.locationModel');
        });

        it('replaceLocationInJsCode - with get keyword', function () {
            const fs = require('fs');
            const jsCode = 'var obj = {get location(){return e(u,c);o.location=null;}}';
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain('get __mcopLocation');
            expect(newJsCode).toContain('o.__mcopLocation=null');
        });

        it('replaceLocationInJsCode - with get keyword 2', function () {
            const fs = require('fs');
            const jsCode = `location.href = ''; var obj = {get  location(){return e(u,c);o.location=null;}}`;
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain('get  __mcopLocation');
            expect(newJsCode).toContain('o.__mcopLocation=null');
            expect(newJsCode).toContain('__mcopLocation.href ');
        });


        it('replaceLocationInJsCode - this.location.render.bind', function () {
            const fs = require('fs');
            const jsCode = 'this.listenTo(this.wizard.dispatcher,"wizard:open:change-target",this.location.render.bind(this)))';
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            const matches = newJsCode.match(/,__mcopLocation:/mg) || [];
            expect(newJsCode).toContain('this.__mcopLocation.render.bind');
        });

        it('replaceLocationInJsCode - ,location:', function () {
            const fs = require('fs');
            const jsCode = `function(t){return{id:t.id,text:t.location,location:t.location,device:t.device,language:t.language,selected:t.id===e}}`;
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain('t.__mcopLocation');
        });

        it('replaceLocationInJsCode - this.tracking.location.model', function () {
            const fs = require('fs');
            const jsCode = 'var e,t;e=this.tracking.location.model.get("db").toLowerCase()';
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain('this.tracking.__mcopLocation.model.get("db")');
        });

        it('replaceLocationInJsCode - signin_location skipped', function () {
            const fs = require('fs');
            const jsCode = 'var objt = {signin_location:"hello"}';
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain('signin_location');
        });

        it('replaceLocationInJsCode - In Json', function () {
            const jsCode = 'const injectedVar={"id":"bb26269a2b3394e9624e","location":"/reports/bb26269a2b3394e9624e"}';
            const newJsCode = handlerHelpers.replaceLocationInJsCode(jsCode) + '';
            expect(newJsCode).toContain('"__mcopLocation"');
        });

        it('replaceLocationInJsCode - Failed', function () {
            expect(function () {
                handlerHelpers.replaceLocationInJsCode(null);
            }).toThrowError();
        });

        it('replaceLocationInInlineScripts - Good', function () {
            const page = '<!DOCTYPE html>\n' +
                '<html lang="en">\n' +
                '<head>\n' +
                '    <meta charset="UTF-8">\n' +
                '    <script type="text/javascript">!function(){for(var t="https://newassets.hcaptcha.com/captcha/v1/c0a1903",e={},c=document.getElementsByTagName("HEAD")[0],a=window.location.hash.slice(1).split("&"),s=0;s<a.length;s++){var n=a[s].split("=");e[n[0]]=n[1]}var o=e.assethost?decodeURIComponent(e.assethost)+(t.indexOf(".com")>0?t.substr(t.indexOf(".com")+4,t.length):""):t,h=document.createElement("script");h.type="text/javascript",h.src=o+"/hcaptcha-checkbox.js",c.appendChild(h)}();</script>\n' +
                '    <title>Title</title>\n' +
                '</head>\n' +
                '<body>\n' +
                '</body>\n' +
                '</html>';
            expect(handlerHelpers.replaceLocationInInlineScripts(page)).toMatch(/window\.__mcopLocation\.hash/mg);
        });

        it('replaceLocationInInlineScripts - Good Not Found', function () {
            const page = '<script src="/home.js"></script>';
            const returned = handlerHelpers.replaceLocationInInlineScripts(page);
            expect(/_mcopLocation/.test(returned)).toBeFalsy();
        });

        it('replaceLocationInInlineScripts - Failed', function () {
            const page = '<script src="/home.js"></script>';
            const returned = handlerHelpers.replaceLocationInInlineScripts(page);
            expect(function () {
                handlerHelpers.replaceLocationInInlineScripts(null);
            }).toThrowError(new Error("Invalid html document"));
        });

        it('getRealReferer - Good', function () {
            expect(handlerHelpers.getRealReferer("canva-domain", "servername", "https://servername?original-host=domain")).toEqual("https://domain/");
        });

        it('getRealReferer - Good 1', function () {
            expect(handlerHelpers.getRealReferer("canva-domain", "servername", "https://servername/")).toEqual("https://canva-domain/");
        });

        it('getRealReferer - Failed Invalid url', function () {
            expect(function () {
                handlerHelpers.getRealReferer("canva-domain", "servername", null)
            }).toThrowError(new Error("Invalid referer url"));
        });

        it('getRealReferer - Failed Bad targetSiteDomain', function () {
            expect(function () {
                handlerHelpers.getRealReferer(null, "servername", null)
            }).toThrowError(new Error("Invalid domain"));
        });

        it('getRealReferer - Failed Bad serverName', function () {
            expect(function () {
                handlerHelpers.getRealReferer("canva-domain", null, null)
            }).toThrowError(new Error("Invalid server name : null"));
        });

        it('isHCaptchaPage - Good', function () {
            const page = '<!DOCTYPE html>\n' +
                '<html lang="en">\n' +
                '<head>\n' +
                '    <meta charset="UTF-8">\n' +
                '    <meta name="captcha-bypass" id="captcha-bypass">' +
                '    <title>Title</title>\n' +
                '</head>\n' +
                '<body><form id="challenge-form"></form>\n' +
                '</body>\n' +
                '</html>';
            expect(handlerHelpers.isHCaptchaPage(page)).toBeTruthy();
        });

        it('isHCaptchaPage - Good', function () {
            expect(handlerHelpers.isHCaptchaPage(null)).toBeFalsy();
        });

        it('injectPageBase - Good', function () {
            const page = '<!DOCTYPE html>\n' +
                '<html lang="en">\n' +
                '<head>\n' +
                '    <meta charset="UTF-8">\n' +
                '    <meta name="captcha-bypass" id="captcha-bypass">' +
                '    <title>Title</title>\n' +
                '</head>\n' +
                '<body><form id="challenge-form"></form>\n' +
                '</body>\n' +
                '</html>';
            const newPage = handlerHelpers.injectPageBase(page, "https://servername/", "https://canva-domain/");
            expect(newPage).toMatch(/href="https:\/\/servername\/"/m);
            expect(newPage).toMatch(/mcophref="https:\/\/canva-domain\/"/m);
        });

        it('injectPageBase - Failed bad page', function () {
            expect(function () {
                handlerHelpers.injectPageBase(null, "https://servername/", "https://canva-domain/")
            }).toThrowError(new Error("Invalid html document"));
        });

        it('injectPageBase - href is null and ignored', function () {
            const page = handlerHelpers.injectPageBase("page", null, "https://canva-domain/");
            expect(page).toMatch(/mcophref="https:\/\/canva-domain\/"/m);
        });

        it('injectJsScriptInHead - Good', function () {
            const page = '<!DOCTYPE html>\n' +
                '<html lang="en">\n' +
                '<head>\n' +
                '    <meta charset="UTF-8">\n' +
                '    <title>Title</title>\n' +
                '</head>\n' +
                '<body>\n' +
                '</body>\n' +
                '</html>';
            const newPage = handlerHelpers.injectJsScriptInHead(page, "https://servername/res.js");
            expect(newPage).toMatch(/src="https:\/\/servername\/res\.js"/m);
        });

        it('injectJsScriptInHead - Failed bad page', function () {
            expect(function () {
                handlerHelpers.injectJsScriptInHead(null, "https://servername/res.js")
            }).toThrowError(new Error("Invalid html document"));
        });

        it('injectJsScriptInHead - Failed bad src', function () {
            expect(function () {
                handlerHelpers.injectJsScriptInHead("page", null)
            }).toThrowError(new Error("Invalid script src"));
        });

        it('urlContainsOriginalHost - Good', function () {
            expect(handlerHelpers.urlContainsOriginalHost("https://servername?original-host=domain")).toBeTruthy();
        });

        it('urlContainsOriginalHost - False', function () {
            expect(handlerHelpers.urlContainsOriginalHost("https://servername")).toBeFalsy();
        });

        it('urlContainsOriginalHost - False 2', function () {
            expect(handlerHelpers.urlContainsOriginalHost(null)).toBeFalsy();
        });

        it('extractOriginalHost - Good', function () {
            expect(handlerHelpers.extractOriginalHost("https://servername?original-host=domain")).toEqual("domain");
        });

        it('extractOriginalHost - Good with trailing get vars', function () {
            expect(handlerHelpers.extractOriginalHost("https://servername?original-host=domain&var=1")).toEqual("domain");
        });

        it('extractOriginalHost - Good with port number', function () {
            expect(handlerHelpers.extractOriginalHost("https://localhost:8095/download-file/18695430?original-host=www.freepik.com")).toEqual("www.freepik.com");
        });

        it('extractOriginalHost - Good with encoded host', function () {
            expect(handlerHelpers.extractOriginalHost("https://ansthepub.localhost.cm/1353196918.js?original-host%3Dtag.rightmessage.com")).toEqual("tag.rightmessage.com");
        });

        it('extractOriginalHost - Good empty string', function () {
            expect(handlerHelpers.extractOriginalHost("https://servername")).toEqual("");
        });

        it('extractOriginalHost - Good empty string', function () {
            expect(function () {
                handlerHelpers.extractOriginalHost(null)
            }).toThrowError(new Error("Invalid url"));
        });

        it('extractOriginalHost - Good encoded original-host', function () {
            expect(handlerHelpers.extractOriginalHost("https://ansthepub.localhost.cm/js/application.js?original-host%3Dbaremetrics-dunning.baremetrics.com")).toEqual("baremetrics-dunning.baremetrics.com");
        });

        it('extractOriginalHost - Good malformed search part', function () {
            expect(handlerHelpers.extractOriginalHost("https://freepik-wooupload.localhost.cm/collection/lingerie/1858?original-host=www.freepik.com?query=Close%20up%20woman%20with%20beautiful"))
                .toEqual("www.freepik.com");
        });

        it('extractOriginalHost - Good long url', function () {
            expect(handlerHelpers.extractOriginalHost("https://paraphraser.localhost.cm/a/api/fastlane.json?account_id=14598&site_id=399656&zone_id=2572270&size_id=9&alt_size_ids=8&gdpr=0&us_privacy=1---&rp_schain=1.0,1!snigelweb.com,7139,1,,,paraphraser.io&eid_criteo.com=FxvWtl8xd1clMkZzMEljdG5UeU04cWZCSiUyRmxtYkVXeURqcVBWc0pyaW5aSWE0JTJGQUhTOWtzUzlhb1ZTNGN0bllRVXdONXhGNkt1ZmlOYnFKS3UzWFlrTjlETjJ1QSUzRCUzRA%5E1&eid_id5-sync.com=ID5*rZhKeyCLYSz8dc3LvlqupbUkYdDzKyAKU1AxLUKAuDguL0tK30SlDqUBYdXEmGee%5E1%5E2&eid_pubcid.org=25af1d10-053c-47bc-945d-5f5de45f9a6b%5E1&tpid_tdid=c07e41e9-b87a-4453-a396-610ee54e4d10&eid_adserver.org=c07e41e9-b87a-4453-a396-610ee54e4d10&rf=https%3A%2F%2Fparaphraser.localhost.cm%2Ftext-summarizer%3Foriginal-host%3Dwww.paraphraser.io&tg_i.pbadslot=sticky_sidebar_left%23adngin-sticky_sidebar_left-0&tk_flint=pbjs_lite_v7.17.0&x_source.tid=9c934eb8-19d3-4e08-96a8-c7fa87220cf2&l_pb_bid_id=21cde2c869c29db&p_screen_res=1600x900&rp_secure=1&rp_hard_floor=0.0492&rp_maxbids=1&p_gpid=sticky_sidebar_left%23adngin-sticky_sidebar_left-0&slots=1&rand=0.9284820907212916&original-host=fastlane.rubiconproject.com"))
                .toEqual("fastlane.rubiconproject.com");
        });

        it('removeOriginalHost - Good', function () {
            expect(handlerHelpers.removeOriginalHost("https://servername?original-host=domain")).toEqual("https://servername/");
        });

        it('removeOriginalHost - Good 2', function () {
            expect(handlerHelpers.removeOriginalHost("https://servername?what=ok&original-host=domain")).toEqual("https://servername/?what=ok");
        });

        it('removeOriginalHost - Good with trailing get variables', function () {
            expect(handlerHelpers.removeOriginalHost("https://servername?original-host=domain&var1=ok")).toEqual("https://servername/?var1=ok");
        });

        it('removeOriginalHost - Good with trailing get variables 2', function () {
            expect(handlerHelpers.removeOriginalHost("https://servername/?what=ok&original-host=domain&var1=ok")).toEqual("https://servername/?what=ok&var1=ok");
        });

        it('removeOriginalHost - Good with encoded urls', function () {
            expect(handlerHelpers.removeOriginalHost("https://servername/?what=ok&original-host=domain&url=https%3A%2F%2Fanalytics.moz.com%2Fpro%2Fkeyword-explorer")).toEqual("https://servername/?what=ok&url=https%3A%2F%2Fanalytics.moz.com%2Fpro%2Fkeyword-explorer");
        });

        it('removeOriginalHost - Good with encoded urls 2', function () {
            expect(handlerHelpers.removeOriginalHost("https://servername/?url=https%3A%2F%2Flocalhost.com%2Fhome%3Foriginal-host%3Danalytics.moz.com", 'localhost.com', 'analytics.moz.com'))
                .toEqual("https://servername/?url=https%3A%2F%2Fanalytics.moz.com%2Fhome");
        });

        it('removeOriginalHost - Good a var without name', function () {
            expect(handlerHelpers.removeOriginalHost("https://servername/api/v1/items.json?type&includeTopHitsByItemType=true&page=1&searchTerms=kim&languageCode=en&original-host=elements.envato.com")).toEqual("https://servername/api/v1/items.json?type&includeTopHitsByItemType=true&page=1&searchTerms=kim&languageCode=en");
        });

        it('removeOriginalHost - Good malformed search part', function () {
            expect(handlerHelpers.removeOriginalHost("https://servername/collection/lingerie/1858?original-host=www.freepik.com?query=Close%20up%20woman%20with%20beautiful"))
                .toEqual("https://servername/collection/lingerie/1858?query=Close%20up%20woman%20with%20beautiful");
        });

        it('removeOriginalHost - Good with encoded urls 3', function () {
            const url = 'https://servername/g/collect?v=2&tid=G-HYWKMHR981&gtm=2oe4k0&_p=163931602&_z=ccd.NbB&gcs=G100&cid=620529818.1650710018&ul=en-us&sr=1600x900&_s=1&uid=7426547&sid=1650710012&sct=1&seg=0&dl=https%3A%2F%2Flocalhost%2Fanalytics%2Foverview%2F%3FsearchType%3Ddomain&dr=https%3A%2F%2Flocalhost%3A8091%2F&dt=Domain%20Overview%3A%20Get%20Instant%20Domain%20SEO%20Analysis&en=page_view&_fv=1&_ss=1&upn.custom_user_id=7426547&up.user_type=Free-User&up.dashboard=all%20tools&up.db_type=not%20set';
            const finalUrl = 'https://servername/g/collect?v=2&tid=G-HYWKMHR981&gtm=2oe4k0&_p=163931602&_z=ccd.NbB&gcs=G100&cid=620529818.1650710018&ul=en-us&sr=1600x900&_s=1&uid=7426547&sid=1650710012&sct=1&seg=0&dl=https%3A%2F%2Flocalhost%2Fanalytics%2Foverview%2F%3FsearchType%3Ddomain&dr=https%3A%2F%2Flocalhost%3A8091%2F&dt=Domain%20Overview%3A%20Get%20Instant%20Domain%20SEO%20Analysis&en=page_view&_fv=1&_ss=1&upn.custom_user_id=7426547&up.user_type=Free-User&up.dashboard=all%20tools&up.db_type=not%20set';
            expect(handlerHelpers.removeOriginalHost(url, 'localhost', 'semrush.com')).toEqual(finalUrl);
        });

        it('removeOriginalHost - Good with encoded urls 4', function () {
            const url = 'https://servername/j/collect?v=1&_v=j96&a=341163436&t=pageview&_s=1&dl=https%3A%2F%2Fanswerthepublic.com%2Fzkhwng%2Freports%2Fe998533d-bd81-4758-bcb8-66455ff33977%2Fedit%3Foriginal-host%3Danswerthepublic.com&dr=https%3A%2F%2Fansthepub.localhost.cm%2Fzkhwng%2Fsearches&ul=en-us&de=UTF-8&dt=%27johnston%27%20EN%20visual%20keyword%20research%20%26%20content%20ideas%20%3A%20AnswerThePublic&sd=24-bit&sr=1600x900&vp=1583x403&je=0&_u=IADAAEABAAAAAC~&jid=1633537605&gjid=742609330&cid=1662889148.1658445129&tid=UA-56335171-1&_gid=1537576782.1661004163&_r=1&_slc=1&z=699191692&original-host=www.google-analytics.com';
            const finalUrl = 'https://servername/j/collect?v=1&_v=j96&a=341163436&t=pageview&_s=1&dl=https%3A%2F%2Fanswerthepublic.com%2Fzkhwng%2Freports%2Fe998533d-bd81-4758-bcb8-66455ff33977%2Fedit%3Foriginal-host%3Dsemrush.com&dr=https%3A%2F%2Fansthepub.localhost.cm%2Fzkhwng%2Fsearches&ul=en-us&de=UTF-8&dt=%27johnston%27%20EN%20visual%20keyword%20research%20%26%20content%20ideas%20%3A%20AnswerThePublic&sd=24-bit&sr=1600x900&vp=1583x403&je=0&_u=IADAAEABAAAAAC~&jid=1633537605&gjid=742609330&cid=1662889148.1658445129&tid=UA-56335171-1&_gid=1537576782.1661004163&_r=1&_slc=1&z=699191692';
            expect(handlerHelpers.removeOriginalHost(url, 'ansthepub.localhost.cm', 'semrush.com')).toEqual(finalUrl);
        });

        it('removeOriginalHost - Good with encoded host', function () {
            const url = 'https://ansthepub.localhost.cm/1353196918.js?original-host%3Dtag.rightmessage.com';
            const finalUrl = 'https://ansthepub.localhost.cm/1353196918.js';
            expect(handlerHelpers.removeOriginalHost(url, 'ansthepub.localhost.cm', 'semrush.com')).toEqual(finalUrl);
        });

        it('removeOriginalHost - Good with encoded host with var after', function () {
            const url = 'https://ansthepub.localhost.cm/1353196918.js?original-host%3Dtag.rightmessage.com&h=k';
            const finalUrl = 'https://ansthepub.localhost.cm/1353196918.js?h=k';
            expect(handlerHelpers.removeOriginalHost(url, 'ansthepub.localhost.cm', 'semrush.com')).toEqual(finalUrl);
        });

        it('removeOriginalHost - Good 3', function () {
            expect(handlerHelpers.removeOriginalHost("")).toEqual("");
        });

        it('removeOriginalHost - Good relative url', function () {
            expect(handlerHelpers.removeOriginalHost("/?original-host=domain")).toEqual("/");
        });

        it('removeOriginalHost - Good relative url with trailing get variables', function () {
            expect(handlerHelpers.removeOriginalHost("/path/?what=ok&original-host=domain&var1=ok")).toEqual("/path/?what=ok&var1=ok");
        });

        it('removeOriginalHost - Good 3', function () {
            expect(handlerHelpers.removeOriginalHost(null)).toEqual(null);
        });

        it('removeOriginalHost - Malformed variables', function () {
            expect(handlerHelpers.removeOriginalHost("https://servername/&what=ok&original-host=domain")).toEqual("https://servername/?what=ok");
        });

        it('removeOriginalHost - in special url', function () {
            expect(handlerHelpers.removeOriginalHost("https://freepik-wooupload.localhost.cm/d/12686080/1017/31/30352/clean-style-modern-business-card-template.zip?token=exp=1666546531~hmac=304b11aecc164cfbade1c924d27fd7a8&original-host=downloadscdn5.freepik.com"))
                .toEqual("https://freepik-wooupload.localhost.cm/d/12686080/1017/31/30352/clean-style-modern-business-card-template.zip?token=exp=1666546531~hmac=304b11aecc164cfbade1c924d27fd7a8");
        });


        it('removeVarFromUrl - One get variable - Good', function () {
            expect(handlerHelpers.removeVarFromUrl("https://servername?_mcop-scope=worker", "_mcop-scope")).toEqual("https://servername/");
        });

        it('removeVarFromUrl - two get variables - Good', function () {
            expect(handlerHelpers.removeVarFromUrl("https://servername?_mcop-scope=worker&original-host=domain", "_mcop-scope")).toEqual("https://servername/?original-host=domain");
        });

        it('removeVarFromUrl - two get variables 2 - Good', function () {
            expect(handlerHelpers.removeVarFromUrl("https://servername?original-host=domain&_mcop-scope=worker", "_mcop-scope")).toEqual("https://servername/?original-host=domain");
        });

        it('getClientSideCookies - Good', function () {
            expect(handlerHelpers.getClientSideCookies("cookie=value;cookie2@www.canva.com=value1;cco@static.canva.com=value3;", "canva.com")).toEqual("cookie2=value1;cco=value3;");
        });

        it('getClientSideCookies - Good 2', function () {
            expect(handlerHelpers.getClientSideCookies("cookie=value;cookie2@www.canva.com=value1;cco@static.canva.com=value3;", ".canva.com")).toEqual("cookie2=value1;cco=value3;");
        });

        it('getClientSideCookies - Good 3', function () {
            expect(handlerHelpers.getClientSideCookies("cookie=value;cookie2@www.canva.com=value1;cco@static.canva.com=value3;", "www.canva.com")).toEqual("cookie2=value1;");
        });

        it('getClientSideCookies - Good 4', function () {
            expect(handlerHelpers.getClientSideCookies("_gid@alexa.com=GA1.2.1367783436.1629510616;alexa_user_lifecycles@.alexa.com=%7B%22undefined%22%3A%22prospect%22%7D; _gat_UA-2146411-12@alexa.com=1", "alexa.com")).toEqual("_gid=GA1.2.1367783436.1629510616;alexa_user_lifecycles=%7B%22undefined%22%3A%22prospect%22%7D;_gat_UA-2146411-12=1;");
        });

        it('getClientSideCookies - Good empty string', function () {
            expect(handlerHelpers.getClientSideCookies("cookie=value;cookie2@www.canva.com=value1;cco@static.canva.com=value3;", "free.canva.com")).toEqual("");
        });

        it('getClientSideCookies - Good empty string 2', function () {
            expect(handlerHelpers.getClientSideCookies("cookie=value;@www.canva.com=value1;", ".canva.com")).toEqual("");
        });

        it('getClientSideCookies - Long list', function () {
            expect(handlerHelpers.getClientSideCookies("_gat_gtag_UA_19303147_34@id.freepikcompany.com=1; _gcl_au@id.freepikcompany.com=1.1.3027267.1645839091; _ga@id.freepikcompany.com=GA1.1.157589239.1645839091; _gid@id.freepikcompany.com=GA1.1.1898408927.1645839091; _gat_gtag_UA_19303147_34@freepikcompany.com=1; _cs_same_site@id.freepikcompany.com=Test%20same%20site; _cs_root-domain@freepikcompany.com=freepikcompany.com; _cs_root-domain@id.freepikcompany.com=id.freepikcompany.com; _cs_c@id.freepikcompany.com=1; _hjTLDTest@freepikcompany.com=.freepikcompany.com; G_ENABLED_IDPS@id.freepikcompany.com=google; _gcl_au@freepikcompany.com=1.1.2143106859.1645840970; _gid@freepikcompany.com=GA1.2.1818784438.1645840971; fp_ga@freepikcompany.com=GA1.1.1358842524.1645840971; _cs_id@id.freepikcompany.com=c9ec273f-407e-ad41-fbab-13bed02b681a.1645840975.1.1645840975.1645840975.1.1680004975142;",
                "id.freepikcompany.com")).toEqual("_gat_gtag_UA_19303147_34=1;_gcl_au=1.1.3027267.1645839091;_ga=GA1.1.157589239.1645839091;_gid=GA1.1.1898408927.1645839091;_cs_same_site=Test%20same%20site;_cs_root-domain=id.freepikcompany.com;_cs_c=1;G_ENABLED_IDPS=google;_cs_id=c9ec273f-407e-ad41-fbab-13bed02b681a.1645840975.1.1645840975.1645840975.1.1680004975142;");
        });

        it('getClientSideCookies - Good empty string 3', function () {
            expect(handlerHelpers.getClientSideCookies("", ".canva.com")).toEqual("");
        });

        it('getClientSideCookies - Failed invalid domain', function () {
            expect(function () {
                handlerHelpers.getClientSideCookies("cookie=val;", null)
            }).toThrowError(new Error("Invalid domain"));
        });

        it('getClientSideCookies - Good cookies from root domain', function () {
            expect(handlerHelpers.getClientSideCookies("_dd_s@elements.envato.com=rum=0&expire=1664634593718; GO_EXP_STOREFRONT@elements.envato.com=acDRkPbsSg6ejqGlTTHslg=0&HL6xcjMGSku4vKxP-DiJOw=2;",
                "envato.com")).toEqual("_dd_s=rum=0&expire=1664634593718;GO_EXP_STOREFRONT=acDRkPbsSg6ejqGlTTHslg=0&HL6xcjMGSku4vKxP-DiJOw=2;");
        });


        it('getAllowedRequestHeaders - Good', function () {
            const supportedHeaders = [
                "Connection", "Sec-Fetch-Mode",
                "Sec-Fetch-Dest", "CF-Challenge",
                "Referer",  "Content-Type",
                "Content-Length", "X-Canva-Analytics",
                "X-Canva-Brand", "X-Canva-Build-Name",
                "Canva-Build-Sha", "X-Canva-Locale",
                "X-Csrf-Token"
            ];

            const requestHeaders = {
                "Connection": "keep-alive",
                "Sec-Fetch-Mode": "no-cors",
                "Sec-Fetch-Dest": "document", "CF-Challenge": "okijhuyopPIIju65rfderswq",
                "Referer": "https://junglescout.my-proxies.cm/",  "Content-Type": "text/plain",
                "Content-Length": "567", "X-Canva-Analytics": "sdefr",
                "X-Canva-Brand": "as", "X-Canva-Build-Name": "bc",
                "Canva-Build-Sha": "89fyrgrtr", "X-Canva-Locale": "en",
                "X-Csrf-Token": "jgdhgeteeevcfgderGFDtrrde34321","Cookie": "cookie=value;cookie2=dgeter;"
            };
            expect(handlerHelpers.getAllowedRequestHeaders(requestHeaders, supportedHeaders, "https://members.junglescout.com/")).toEqual(
                {
                    "Connection": "keep-alive",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Dest": "document", "CF-Challenge": "okijhuyopPIIju65rfderswq",
                    "Referer": "https://members.junglescout.com/",  "Content-Type": "text/plain",
                    "Content-Length": "567", "X-Canva-Analytics": "sdefr",
                    "X-Canva-Brand": "as", "X-Canva-Build-Name": "bc",
                    "Canva-Build-Sha": "89fyrgrtr", "X-Canva-Locale": "en",
                    "X-Csrf-Token": "jgdhgeteeevcfgderGFDtrrde34321"
                }
            );
        });

        it('getAllowedRequestHeaders - Good single', function () {
            const supportedHeaders = [
                "Connection", "Sec-Fetch-Mode",
                "Sec-Fetch-Dest", "CF-Challenge",
                "Referer",  "Content-Type",
                "Content-Length", "X-Canva-Analytics",
                "X-Canva-Brand", "X-Canva-Build-Name",
                "Canva-Build-Sha", "X-Canva-Locale",
                "X-Csrf-Token"
            ];

            const requestHeaders = {
                "Connection": "keep-alive",
                "Cookie": "cookie=value;cookie2=dgeter;"
            };
            expect(handlerHelpers.getAllowedRequestHeaders(requestHeaders, supportedHeaders, "https://members.junglescout.com/")).toEqual(
                {
                    "Connection": "keep-alive"
                }
            );
        });

        it('getAllowedRequestHeaders - Good bad referer', function () {
            const supportedHeaders = [
                "Connection", "Sec-Fetch-Mode",
                "Sec-Fetch-Dest", "CF-Challenge",
                "Referer",  "Content-Type",
                "Content-Length", "X-Canva-Analytics",
                "X-Canva-Brand", "X-Canva-Build-Name",
                "Canva-Build-Sha", "X-Canva-Locale",
                "X-Csrf-Token"
            ];

            const requestHeaders = {
                "Connection": "keep-alive",
                "Referer": "https://junglescout.my-proxies.cm/"
            };
            expect(handlerHelpers.getAllowedRequestHeaders(requestHeaders, supportedHeaders, null)).toEqual(
                {
                    "Connection": "keep-alive"
                }
            );
        });

        it('getAllowedRequestHeaders - Good bad request headers null', function () {
            const supportedHeaders = [
                "Connection", "Sec-Fetch-Mode",
                "Sec-Fetch-Dest", "CF-Challenge",
                "Referer",  "Content-Type",
                "Content-Length", "X-Canva-Analytics",
                "X-Canva-Brand", "X-Canva-Build-Name",
                "Canva-Build-Sha", "X-Canva-Locale",
                "X-Csrf-Token"
            ];

            const requestHeaders = null;
            expect(handlerHelpers.getAllowedRequestHeaders(requestHeaders, supportedHeaders, null)).toEqual({});
        });

        it('getAllowedRequestHeaders - Good bad request headers string', function () {
            const supportedHeaders = [
                "Connection", "Sec-Fetch-Mode",
                "Sec-Fetch-Dest", "CF-Challenge",
                "Referer",  "Content-Type",
                "Content-Length", "X-Canva-Analytics",
                "X-Canva-Brand", "X-Canva-Build-Name",
                "Canva-Build-Sha", "X-Canva-Locale",
                "X-Csrf-Token"
            ];

            //const requestHeaders = null;
            expect(handlerHelpers.getAllowedRequestHeaders("headers", supportedHeaders, null)).toEqual({});
        });

        it('getAllowedRequestHeaders - Good empty approved headers', function () {
            expect(handlerHelpers.getAllowedRequestHeaders("headers", [], null)).toEqual({});
        });

        it('getAllowedRequestHeaders - Good bad approved headers', function () {
            expect(handlerHelpers.getAllowedRequestHeaders("headers", null, null)).toEqual({});
        });


        it('filterRequestHeaders - Good', function () {
            const originalHeaders = {
                'user-agent': 'Mozilla',
                'cookie': 'cookie-1=val1;',
                'referer': "https://original.com/home"
            };
            const excluded = ["cookie"];
            const finalValues = {'referer': "https://final.com/home"};
            expect(handlerHelpers.filterRequestHeaders(originalHeaders, excluded, finalValues))
                .toEqual({
                    'user-agent': 'Mozilla',
                    'referer': "https://final.com/home"
                });
        });

        it('filterRequestHeaders - Good - 2', function () {
            const originalHeaders = {
                'user-agent': 'Mozilla',
                'cookie': 'cookie-1=val1;',
                'sec-fetch-mode': 'no-cors',
                'referer': "https://original.com/home"
            };
            const excluded = ["cookie","host"];
            const finalValues = {'referer': "https://final.com/home",'origin': "https://final.com"};
            expect(handlerHelpers.filterRequestHeaders(originalHeaders, excluded, finalValues))
                .toEqual({
                    'user-agent': 'Mozilla',
                    'sec-fetch-mode': 'no-cors',
                    'referer': "https://final.com/home"
                });
        });

        it('filterRequestHeaders - Empty', function () {
            expect(handlerHelpers.filterRequestHeaders(null, null, null))
                .toEqual({});
        });

        it('isBinary - True image/png', function () {
            expect(handlerHelpers.isBinary("image/png")).toBeTruthy();
        });

        it('isBinary - True application', function () {
            expect(handlerHelpers.isBinary("application/json")).toBeFalsy();
        });

        it('isBinary - False Js', function () {
            expect(handlerHelpers.isBinary("application/javascript")).toBeFalsy();
        });

        it('isBinary - False bad content type', function () {
            expect(handlerHelpers.isBinary(null)).toBeFalsy();
        });

        it('isHtml - Good', function () {
            expect(handlerHelpers.isHtml("text/html")).toBeFalsy();
        });

        it('isHtml - False', function () {
            expect(handlerHelpers.isHtml("text/plain")).toBeFalsy();
        });

        it('isHtml - False bad content type', function () {
            expect(handlerHelpers.isHtml(null)).toBeFalsy();
        });

        it('isJsCode - Good', function () {
            expect(handlerHelpers.isJsCode("text/javascript")).toBeFalsy();
        });

        it('isJsCode - Good 2', function () {
            expect(handlerHelpers.isJsCode("application/javascript")).toBeFalsy();
        });

        it('isJsCode - False', function () {
            expect(handlerHelpers.isJsCode("application/json")).toBeFalsy();
        });

        it('isJsCode - False 2', function () {
            expect(handlerHelpers.isJsCode("")).toBeFalsy();
        });

        it('isJsCode - False 3', function () {
            expect(handlerHelpers.isJsCode(null)).toBeFalsy();
        });

        it('modifyUrl - Good', function () {
            expect(handlerHelpers.modifyUrl("https://a-domain/", "server-name")).toEqual("https://server-name/?original-host=a-domain");
        });

        it('modifyUrl - Good 2', function () {
            expect(handlerHelpers.modifyUrl("https://a-domain/?what=ok", "server-name")).toEqual("https://server-name/?what=ok&original-host=a-domain");
        });

        it('modifyUrl - Good 2 with hash', function () {
            expect(handlerHelpers.modifyUrl("https://www.freepik.com/premium-psd/data-analysis-illustration-3d-rendering_19673932.htm#page=1&query=Data%20analysis%20illustration%203d%20rendering&position=6&from_view=search",
                "server-name")).toEqual("https://server-name/premium-psd/data-analysis-illustration-3d-rendering_19673932.htm?original-host=www.freepik.com#page=1&query=Data%20analysis%20illustration%203d%20rendering&position=6&from_view=search");
        });

        it('modifyUrl - Good 2', function () {
            expect(handlerHelpers.modifyUrl("https://a-domain/?what=ok", "server-name")).toEqual("https://server-name/?what=ok&original-host=a-domain");
        });

        it('modifyUrl - Good wss', function () {
            expect(handlerHelpers.modifyUrl("wss://a-domain/?what=ok", "server-name")).toEqual("wss://server-name/?what=ok&original-host=a-domain");
        });

        it('modifyUrl - Good relative url', function () {
            expect(handlerHelpers.modifyUrl("/?what=ok", "server-name")).toEqual("https://server-name/?what=ok");
        });

        it('modifyUrl - Good relative url 2', function () {
            expect(handlerHelpers.modifyUrl("home", "server-name")).toEqual("https://server-name/home");
        });

        it('modifyUrl - Good already modified', function () {
            expect(handlerHelpers.modifyUrl("https://server-name/?what=ok&original-host=a-domain", "server-name")).toEqual("https://server-name/?what=ok&original-host=a-domain");
        });

        it('modifyUrl - Good empty string', function () {
            expect(handlerHelpers.modifyUrl("", "server-name")).toEqual("");
        });

        it('modifyUrl - Good empty string', function () {
            expect(handlerHelpers.modifyUrl("", "server-name")).toEqual("");
        });

        it('modifyUrl - Good url is null', function () {
            expect(handlerHelpers.modifyUrl(null, "server-name")).toEqual(null);
        });

        it('modifyUrl - Fail server name is null', function () {
            expect(function () {
                handlerHelpers.modifyUrl(null, null)
            }).toThrowError(new Error("Invalid server name"));
        });

        it('modifyUrl - url with subdomain', function () {
            expect(handlerHelpers.modifyUrl("https://app.rytr.me", "server-name")).toEqual("https://server-name/?original-host=app.rytr.me");
        });

        it('modifyUrlInJson - Good simple url in json', function () {
            const jsonStr = JSON.stringify({
                url: "https://simple.com/home/"
            });
            expect(handlerHelpers.modifyUrlInJson(jsonStr, 'servername')).toContain("https://servername/home/?original-host=simple.com");
        });

        it('modifyUrlInJson - Good simple url in json 2', function () {
            const jsonStr = JSON.stringify({
                url: "http://simple.com/home/"
            });
            expect(handlerHelpers.modifyUrlInJson(jsonStr, 'servername')).toContain("http://servername/home/?original-host=simple.com");
        });

        it('modifyUrlInJson - Good simple url in json 3', function () {
            const jsonStr = JSON.stringify({
                url: "wss://simple.com/home/"
            });
            expect(handlerHelpers.modifyUrlInJson(jsonStr, 'servername')).toContain("wss://servername/home/?original-host=simple.com");
        });

        it('modifyUrlInJson - Good simple url in json 4', function () {
            const jsonStr = JSON.stringify({
                url: "ws://simple.com/home/"
            });
            expect(handlerHelpers.modifyUrlInJson(jsonStr, 'servername')).toContain("ws://servername/home/?original-host=simple.com");
        });

        it('modifyUrlInJson - Good simple escaped url in json', function () {
            const jsonStr = `{"url": "https:\\/\\/simple.com\\/home\\/"}`;
            expect(handlerHelpers.modifyUrlInJson(jsonStr, 'servername')).toContain("https:\\/\\/servername\\/home\\/?original-host=simple.com");
        });

        it('modifyUrlInJson - Good long complex url', function () {
            const jsonStr = `{"success":true,"data":{"redirectUrl":"https:\\/\\/www.freepik.com\\/oauth-login?refreshToken=AOEOulaH1mG2g3i6upsb-4Kvr7UDtUh02maStGNDOuK-95jshrTzucLQoMvY8v14dFUx9XvnT1WaqYoEZLbMwOpVJnVO403Gs5NvlRDu8VNrwGtaKP_VXzab5fJ_obL1xlNX_YzooaLQDB0z1sQ12GhcS-xwRe89tLr7WrCHETAKC2cs5HyMRPXbJcyy6BojWx-QRo0CIhlRomGNGeu_6jEJXsviwas7I3nVhqN-tl9QpPm7D8GtsP6InwtzRuOH1XrUbNRfP5Bd&idToken=eyJhbGciOiJSUzI1NiIsImtpZCI6IjNmNjcyNDYxOTk4YjJiMzMyYWQ4MTY0ZTFiM2JlN2VkYTY4NDZiMzciLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoibWFkaXNlbzY1IiwicGljdHVyZSI6Imh0dHBzOi8vYXZhdGFyLmNkbnBrLm5ldC9kZWZhdWx0XzAyLnBuZyIsImFjY291bnRzX3VzZXJfaWQiOjc5NjEwODI2LCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vZmMtcHJvZmlsZS1wcm8tcmV2MSIsImF1ZCI6ImZjLXByb2ZpbGUtcHJvLXJldjEiLCJhdXRoX3RpbWUiOjE2NjY0OTU2MTQsInVzZXJfaWQiOiIyODc1NjQzODcxNjU0NzM3YmMxNGYyZjA4Y2Y1YmI1ZCIsInN1YiI6IjI4NzU2NDM4NzE2NTQ3MzdiYzE0ZjJmMDhjZjViYjVkIiwiaWF0IjoxNjY2NDk1NjE0LCJleHAiOjE2NjY0OTkyMTQsImVtYWlsIjoibWFkaXNlbzY1QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7ImVtYWlsIjpbIm1hZGlzZW82NUBnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9fQ.jJ9zdqpTtO_oxop9NjfM_o5s4RNOwIUXmqRyfgmzW0_4qryS7cHsckgLYwE4k5NQ3O4ZUeXWGnEciAI9JPumTxvzEDgYcds0c_XZVREEewQ1q7q1n-YH0wMOi59LvHn_M7MTwNw0W1M_hbUIf9ZZto_SjzWNSYpgOUGyLLSFA-NvMVZIPsvrV3THYsndn1xaZeE1UhXSDbzLgKy59jzjUDHVHhx6xiQLyjsfwO58ZM5g9j7OHI5UcJFira7Dt8We5b8dknZLGXywAWpcxp97rVJOf2umj54Cpsz655_jq99LTS0-9Guuj4BecNTfk0APISVyarwD2hPp4MoCblBf1Q&rememberSession=1","email":"madiseo65@gmail.com","photoUrl":"https:\\/\\/avatar.cdnpk.net\\/default_04.png","userId":79610826,"userType":"payment-user","refreshToken":"AOEOulaH1mG2g3i6upsb-4Kvr7UDtUh02maStGNDOuK-95jshrTzucLQoMvY8v14dFUx9XvnT1WaqYoEZLbMwOpVJnVO403Gs5NvlRDu8VNrwGtaKP_VXzab5fJ_obL1xlNX_YzooaLQDB0z1sQ12GhcS-xwRe89tLr7WrCHETAKC2cs5HyMRPXbJcyy6BojWx-QRo0CIhlRomGNGeu_6jEJXsviwas7I3nVhqN-tl9QpPm7D8GtsP6InwtzRuOH1XrUbNRfP5Bd"}}`;
            expect(handlerHelpers.modifyUrlInJson(jsonStr, 'servername'))
                .toContain("https:\\/\\/servername\\/oauth-login?refreshToken=AOEOulaH1mG2g3i6upsb-4Kvr7UDtUh02maStGNDOuK-95jshrTzucLQoMvY8v14dFUx9XvnT1WaqYoEZLbMwOpVJnVO403Gs5NvlRDu8VNrwGtaKP_VXzab5fJ_obL1xlNX_YzooaLQDB0z1sQ12GhcS-xwRe89tLr7WrCHETAKC2cs5HyMRPXbJcyy6BojWx-QRo0CIhlRomGNGeu_6jEJXsviwas7I3nVhqN-tl9QpPm7D8GtsP6InwtzRuOH1XrUbNRfP5Bd&idToken=eyJhbGciOiJSUzI1NiIsImtpZCI6IjNmNjcyNDYxOTk4YjJiMzMyYWQ4MTY0ZTFiM2JlN2VkYTY4NDZiMzciLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoibWFkaXNlbzY1IiwicGljdHVyZSI6Imh0dHBzOi8vYXZhdGFyLmNkbnBrLm5ldC9kZWZhdWx0XzAyLnBuZyIsImFjY291bnRzX3VzZXJfaWQiOjc5NjEwODI2LCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vZmMtcHJvZmlsZS1wcm8tcmV2MSIsImF1ZCI6ImZjLXByb2ZpbGUtcHJvLXJldjEiLCJhdXRoX3RpbWUiOjE2NjY0OTU2MTQsInVzZXJfaWQiOiIyODc1NjQzODcxNjU0NzM3YmMxNGYyZjA4Y2Y1YmI1ZCIsInN1YiI6IjI4NzU2NDM4NzE2NTQ3MzdiYzE0ZjJmMDhjZjViYjVkIiwiaWF0IjoxNjY2NDk1NjE0LCJleHAiOjE2NjY0OTkyMTQsImVtYWlsIjoibWFkaXNlbzY1QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7ImVtYWlsIjpbIm1hZGlzZW82NUBnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9fQ.jJ9zdqpTtO_oxop9NjfM_o5s4RNOwIUXmqRyfgmzW0_4qryS7cHsckgLYwE4k5NQ3O4ZUeXWGnEciAI9JPumTxvzEDgYcds0c_XZVREEewQ1q7q1n-YH0wMOi59LvHn_M7MTwNw0W1M_hbUIf9ZZto_SjzWNSYpgOUGyLLSFA-NvMVZIPsvrV3THYsndn1xaZeE1UhXSDbzLgKy59jzjUDHVHhx6xiQLyjsfwO58ZM5g9j7OHI5UcJFira7Dt8We5b8dknZLGXywAWpcxp97rVJOf2umj54Cpsz655_jq99LTS0-9Guuj4BecNTfk0APISVyarwD2hPp4MoCblBf1Q&rememberSession=1&original-host=www.freepik.com");
        });

        it('serviceWorkerIsLoader - True', function () {
            expect(handlerHelpers.serviceWorkerIsLoaded("a-cookie=val;a-cookie2=value;SWLODED-COOKIE=hdgfeterdf4w4w4w4;", "SWLODED-COOKIE"))
                .toBeTruthy();
        });

        it('serviceWorkerIsLoader - True 2', function () {
            expect(handlerHelpers.serviceWorkerIsLoaded("a-cookie=val;a-cookie2=value; SWLODED-COOKIE=hdgfeterdf4w4w4w4", "SWLODED-COOKIE"))
                .toBeTruthy();
        });

        it('serviceWorkerIsLoader - True 3', function () {
            const cookies = "SEO-CROMOM-ADMIN-SESS=22GRnN45C9363b9f05478OeF8UN05IXGP61aDF71iYd9V4fvUy1z58pG8nf75zZ1u2J18T96ik558V46j; MCOP-SWREADY-rWetvGHi=Voug0L0IfsFiyWF4v31D0u3H4u5U5t";
            expect(handlerHelpers.serviceWorkerIsLoaded(cookies, "MCOP-SWREADY-rWetvGHi"))
                .toBeTruthy();
        });

        it('serviceWorkerIsLoader - False', function () {
            expect(handlerHelpers.serviceWorkerIsLoaded("a-cookie=val;a-cookie2=value;", "SWLODED-COOKIE"))
                .toBeFalsy();
        });

        it('serviceWorkerIsLoader - False cookies ia null', function () {
            expect(handlerHelpers.serviceWorkerIsLoaded(null, "SWLODED-COOKIE"))
                .toBeFalsy();
        });

        it('serviceWorkerIsLoader - False cookie name is null', function () {
            expect(handlerHelpers.serviceWorkerIsLoaded("a-cookie=val;a-cookie2=value;", null))
                .toBeFalsy();
        });

        it('isMcoProxyPart - Good service worker loader', function () {
            expect(handlerHelpers.isMcoProxyPart("https://server-name/mcop-sw-loader123456789.js"))
                .toBeTruthy();
        });

        it('isMcoProxyPart - Good service worker', function () {
            expect(handlerHelpers.isMcoProxyPart("https://server-name/mcop-sw123456789.js"))
                .toBeTruthy();
        });

        it('isMcoProxyPart - Good components', function () {
            expect(handlerHelpers.isMcoProxyPart("https://server-name/mcop-compos123456789.js"))
                .toBeTruthy();
        });

        it('isMcoProxyPart - False', function () {
            expect(handlerHelpers.isMcoProxyPart("https://server-name/"))
                .toBeFalsy();
        });

        it('isMcoProxyPart - False null', function () {
            expect(handlerHelpers.isMcoProxyPart(null))
                .toBeFalsy();
        });

        it('replacePostMessage - 1 param - complex', function () {
            const jsCode = "const check = 0;const y=function(l){f.port2.postMessage ( ( Q=(Q.next={RS:l},Q).next,0 ) )};";
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('postMessage(_mcopPreparePostMessageMsg((Q=(Q.next={RS:l},Q).next,0)))');
        });

        it('replacePostMessage - 1 param - complex 2', function () {
            const jsCode = "const check = 0;X.postMessage(c[35](20,'finish',E));";
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain("postMessage(_mcopPreparePostMessageMsg(c[35](20,'finish',E)))");
        });

        it('replacePostMessage - 1 param - complex 3', function () {
            const jsCode = 'const check = 0;X.postMessage(c[35](2,"progress",E));';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain(`postMessage(_mcopPreparePostMessageMsg(c[35](2,"progress",E)))`);
        });

        it('replacePostMessage - 1 param - complex 4', function () {
            const jsCode = 'const check = 0;z.U.postMessage(c[35](29,P,A.I()));';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('postMessage(_mcopPreparePostMessageMsg(c[35](29,P,A.I())))');
        });

        it('replacePostMessage - 1 param - complex 5', function () {
            const jsCode = 'const check = 0;z.U.postMessage((Q=X.P,Q));';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('postMessage(_mcopPreparePostMessageMsg((Q=X.P,Q))');
        });

        it('replacePostMessage - 1 param - complex 5 with spaces', function () {
            const jsCode = 'const check = 0;z.U.postMessage(    (Q=X.P,Q)   );';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('postMessage(_mcopPreparePostMessageMsg((Q=X.P,Q)))');
        });

        it('replacePostMessage - 1 param - array', function () {
            const jsCode = 'self.postMessage([e,a,c]);';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('postMessage(_mcopPreparePostMessageMsg([e,a,c]))');
        });


        it('replacePostMessage - 1 param - real long script', function () {
            const jsCode = '(function(){var t=function hn(){var t={_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",_f:String.fromCharCode,compressToBase64:function(e){if(null==e)return"";var r,i,n,o,s,a,c,u="",p=0;for(e=t.compress(e);p<2*e.length;)p%2==0?(r=e.charCodeAt(p/2)>>8,i=255&e.charCodeAt(p/2),n=p/2+1<e.length?e.charCodeAt(p/2+1)>>8:NaN):(r=255&e.charCodeAt((p-1)/2),(p+1)/2<e.length?(i=e.charCodeAt((p+1)/2)>>8,n=255&e.charCodeAt((p+1)/2)):i=n=NaN),p+=3,o=r>>2,s=(3&r)<<4|i>>4,a=(15&i)<<2|n>>6,c=63&n,isNaN(i)?a=c=64:isNaN(n)&&(c=64),u=u+t._keyStr.charAt(o)+t._keyStr.charAt(s)+t._keyStr.charAt(a)+t._keyStr.charAt(c);return u},decompressFromBase64:function(e){if(null==e)return"";var r,i,n,o,s,a,c,u="",p=0,l=0,h=t._f;for(e=e.replace(/[^A-Za-z0-9\\+\\/\\=]/g,"");l<e.length;)i=t._keyStr.indexOf(e.charAt(l++))<<2|(s=t._keyStr.indexOf(e.charAt(l++)))>>4,n=(15&s)<<4|(a=t._keyStr.indexOf(e.charAt(l++)))>>2,o=(3&a)<<6|(c=t._keyStr.indexOf(e.charAt(l++))),p%2==0?(r=i<<8,64!=a&&(u+=h(r|n)),64!=c&&(r=o<<8)):(u+=h(r|i),64!=a&&(r=n<<8),64!=c&&(u+=h(r|o))),p+=3;return t.decompress(u)},compressToUTF16:function(e){if(null==e)return"";var r,i,n,o="",s=0,a=t._f;for(e=t.compress(e),r=0;r<e.length;r++)switch(i=e.charCodeAt(r),s++){case 0:o+=a(32+(i>>1)),n=(1&i)<<14;break;case 1:o+=a(n+(i>>2)+32),n=(3&i)<<13;break;case 2:o+=a(n+(i>>3)+32),n=(7&i)<<12;break;case 3:o+=a(n+(i>>4)+32),n=(15&i)<<11;break;case 4:o+=a(n+(i>>5)+32),n=(31&i)<<10;break;case 5:o+=a(n+(i>>6)+32),n=(63&i)<<9;break;case 6:o+=a(n+(i>>7)+32),n=(127&i)<<8;break;case 7:o+=a(n+(i>>8)+32),n=(255&i)<<7;break;case 8:o+=a(n+(i>>9)+32),n=(511&i)<<6;break;case 9:o+=a(n+(i>>10)+32),n=(1023&i)<<5;break;case 10:o+=a(n+(i>>11)+32),n=(2047&i)<<4;break;case 11:o+=a(n+(i>>12)+32),n=(4095&i)<<3;break;case 12:o+=a(n+(i>>13)+32),n=(8191&i)<<2;break;case 13:o+=a(n+(i>>14)+32),n=(16383&i)<<1;break;case 14:o+=a(n+(i>>15)+32,32+(32767&i)),s=0}return o+a(n+32)},decompressFromUTF16:function(e){if(null==e)return"";for(var r,i,n="",o=0,s=0,a=t._f;s<e.length;){switch(i=e.charCodeAt(s)-32,o++){case 0:r=i<<1;break;case 1:n+=a(r|i>>14),r=(16383&i)<<2;break;case 2:n+=a(r|i>>13),r=(8191&i)<<3;break;case 3:n+=a(r|i>>12),r=(4095&i)<<4;break;case 4:n+=a(r|i>>11),r=(2047&i)<<5;break;case 5:n+=a(r|i>>10),r=(1023&i)<<6;break;case 6:n+=a(r|i>>9),r=(511&i)<<7;break;case 7:n+=a(r|i>>8),r=(255&i)<<8;break;case 8:n+=a(r|i>>7),r=(127&i)<<9;break;case 9:n+=a(r|i>>6),r=(63&i)<<10;break;case 10:n+=a(r|i>>5),r=(31&i)<<11;break;case 11:n+=a(r|i>>4),r=(15&i)<<12;break;case 12:n+=a(r|i>>3),r=(7&i)<<13;break;case 13:n+=a(r|i>>2),r=(3&i)<<14;break;case 14:n+=a(r|i>>1),r=(1&i)<<15;break;case 15:n+=a(r|i),o=0}s++}return t.decompress(n)},compressToUint8Array:function(e){for(var r=t.compress(e),i=new Uint8Array(2*r.length),n=0,o=r.length;n<o;n++){var s=r.charCodeAt(n);i[2*n]=s>>>8,i[2*n+1]=s%256}return i},decompressFromUint8Array:function(e){if(null==e)return t.decompress(e);for(var r=new Array(e.length/2),i=0,n=r.length;i<n;i++)r[i]=256*e[2*i]+e[2*i+1];return t.decompress(String.fromCharCode.apply(null,r))},compressToEncodedURIComponent:function(e){return t.compressToBase64(e).replace("=","$").replace("/","-")},decompressFromEncodedURIComponent:function(e){return e&&(e=e.replace("$","=").replace("-","/")),t.decompressFromBase64(e)},compress:function(e){if(null==e)return"";var r,i,n,o={},s={},a="",c="",u="",p=2,l=3,h=2,f="",d=0,y=0,v=t._f;for(n=0;n<e.length;n+=1)if(a=e.charAt(n),Object.prototype.hasOwnProperty.call(o,a)||(o[a]=l++,s[a]=!0),c=u+a,Object.prototype.hasOwnProperty.call(o,c))u=c;else{if(Object.prototype.hasOwnProperty.call(s,u)){if(u.charCodeAt(0)<256){for(r=0;r<h;r++)d<<=1,15==y?(y=0,f+=v(d),d=0):y++;for(i=u.charCodeAt(0),r=0;r<8;r++)d=d<<1|1&i,15==y?(y=0,f+=v(d),d=0):y++,i>>=1}else{for(i=1,r=0;r<h;r++)d=d<<1|i,15==y?(y=0,f+=v(d),d=0):y++,i=0;for(i=u.charCodeAt(0),r=0;r<16;r++)d=d<<1|1&i,15==y?(y=0,f+=v(d),d=0):y++,i>>=1}0==--p&&(p=Math.pow(2,h),h++),delete s[u]}else for(i=o[u],r=0;r<h;r++)d=d<<1|1&i,15==y?(y=0,f+=v(d),d=0):y++,i>>=1;0==--p&&(p=Math.pow(2,h),h++),o[c]=l++,u=String(a)}if(""!==u){if(Object.prototype.hasOwnProperty.call(s,u)){if(u.charCodeAt(0)<256){for(r=0;r<h;r++)d<<=1,15==y?(y=0,f+=v(d),d=0):y++;for(i=u.charCodeAt(0),r=0;r<8;r++)d=d<<1|1&i,15==y?(y=0,f+=v(d),d=0):y++,i>>=1}else{for(i=1,r=0;r<h;r++)d=d<<1|i,15==y?(y=0,f+=v(d),d=0):y++,i=0;for(i=u.charCodeAt(0),r=0;r<16;r++)d=d<<1|1&i,15==y?(y=0,f+=v(d),d=0):y++,i>>=1}0==--p&&(p=Math.pow(2,h),h++),delete s[u]}else for(i=o[u],r=0;r<h;r++)d=d<<1|1&i,15==y?(y=0,f+=v(d),d=0):y++,i>>=1;0==--p&&(p=Math.pow(2,h),h++)}for(i=2,r=0;r<h;r++)d=d<<1|1&i,15==y?(y=0,f+=v(d),d=0):y++,i>>=1;for(;;){if(d<<=1,15==y){f+=v(d);break}y++}return f},decompress:function(e){if(null==e)return"";if(""==e)return null;var r,i,n,o,s,a,c,u=[],p=4,l=4,h=3,f="",d="",y=t._f,v={string:e,val:e.charCodeAt(0),position:32768,index:1};for(r=0;r<3;r+=1)u[r]=r;for(n=0,s=Math.pow(2,2),a=1;a!=s;)o=v.val&v.position,v.position>>=1,0==v.position&&(v.position=32768,v.val=v.string.charCodeAt(v.index++)),n|=(o>0?1:0)*a,a<<=1;switch(n){case 0:for(n=0,s=Math.pow(2,8),a=1;a!=s;)o=v.val&v.position,v.position>>=1,0==v.position&&(v.position=32768,v.val=v.string.charCodeAt(v.index++)),n|=(o>0?1:0)*a,a<<=1;c=y(n);break;case 1:for(n=0,s=Math.pow(2,16),a=1;a!=s;)o=v.val&v.position,v.position>>=1,0==v.position&&(v.position=32768,v.val=v.string.charCodeAt(v.index++)),n|=(o>0?1:0)*a,a<<=1;c=y(n);break;case 2:return""}for(u[3]=c,i=d=c;;){if(v.index>v.string.length)return"";for(n=0,s=Math.pow(2,h),a=1;a!=s;)o=v.val&v.position,v.position>>=1,0==v.position&&(v.position=32768,v.val=v.string.charCodeAt(v.index++)),n|=(o>0?1:0)*a,a<<=1;switch(c=n){case 0:for(n=0,s=Math.pow(2,8),a=1;a!=s;)o=v.val&v.position,v.position>>=1,0==v.position&&(v.position=32768,v.val=v.string.charCodeAt(v.index++)),n|=(o>0?1:0)*a,a<<=1;u[l++]=y(n),c=l-1,p--;break;case 1:for(n=0,s=Math.pow(2,16),a=1;a!=s;)o=v.val&v.position,v.position>>=1,0==v.position&&(v.position=32768,v.val=v.string.charCodeAt(v.index++)),n|=(o>0?1:0)*a,a<<=1;u[l++]=y(n),c=l-1,p--;break;case 2:return d}if(0==p&&(p=Math.pow(2,h),h++),u[c])f=u[c];else{if(c!==l)return null;f=i+i.charAt(0)}d+=f,u[l++]=i+f.charAt(0),i=f,0==--p&&(p=Math.pow(2,h),h++)}}};return t}(),e="CS_WORKER_SIGNATURE";self.addEventListener("message",(function(r){var i=r.data,n=i[0],o=i[1],s=i[2],a=i[3];if(n===e){var c;switch(o){case"base64":c=t.compressToBase64(s);break;case"byteArray":c=t.compressToUint8Array(s).buffer}self.postMessage([e,a,c])}}))})();';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('self.postMessage(_mcopPreparePostMessageMsg([e,a,c]))');
        });

        it('replacePostMessage - 1 param as function call', function () {
            const jsCode = 'D.L.postMessage( G[36](18,P,d[1](I[2],T)) )';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('D.L.postMessage(_mcopPreparePostMessageMsg(G[36](18,P,d[1](I[2],T)))');
        });

        it('replacePostMessage - 1 param as function call 2', function () {
            const jsCode = 'function(t,Y){t.postMessage(G[36](16,"finish",Y))}';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('t.postMessage(_mcopPreparePostMessageMsg(G[36](16,"finish",Y)))');
        });

        it('replacePostMessage - 1 param with void operator', function () {
            const jsCode = 'i.postMessage(void 0)';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('i.postMessage(_mcopPreparePostMessageMsg(void 0))');
        });

        it('replacePostMessage - 2 params - Good', function () {
            //const jsCode = 'try{CookieConsent.iframe.contentWindow.postMessage(e,this.CDN)}catch(e){CookieConsent.iframeReady=!0}';
            const jsCode = 'CookieConsent.iframe.contentWindow.postMessage(e,this.CDN)';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('postMessage(_mcopPreparePostMessageMsg(e),_mcopPreparePostMessageOrigin(this.CDN))');
        });

        it('replacePostMessage - 2 params complex - Good', function () {
            //const jsCode = 'try{CookieConsent.iframe.contentWindow.postMessage(e,this.CDN)}catch(e){CookieConsent.iframeReady=!0}';
            const jsCode = 'CookieConsent.iframe.contentWindow.postMessage((Q=(Q.next={RS:l},Q).next,0),this.CDN)';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('postMessage(_mcopPreparePostMessageMsg((Q=(Q.next={RS:l},Q).next,0)),_mcopPreparePostMessageOrigin(this.CDN))');
        });

        it('replacePostMessage - Good 2', function () {
            const jsCode = "const check = 0;this.iframe.contentWindow.postMessage(e,this.CDN);";
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('postMessage(_mcopPreparePostMessageMsg(e),_mcopPreparePostMessageOrigin(this.CDN))');
        });

        it('replacePostMessage - 2 params with new line', function () {
            const jsCode = 'P.postMessage("recaptcha-setup",\nK[24]\n\n\n(p[1],U,D)' +
                ');';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('P.postMessage(_mcopPreparePostMessageMsg("recaptcha-setup"),_mcopPreparePostMessageOrigin(K[24](p[1],U,D)))');
        });

        it('replacePostMessage - 2 complex params', function () {
            const jsCode = 'P.postMessage((Q=X.P,Q),[t.port2]);';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('P.postMessage(_mcopPreparePostMessageMsg((Q=X.P,Q)),_mcopPreparePostMessageOrigin([t.port2]))');
        });

        it('replacePostMessage - 2 params - yet another complex kind', function () {
            const jsCode = 'const a = {postMessage:function(){I.postMessage(Z,\n' +
                'e)}}';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain("postMessage(_mcopPreparePostMessageMsg(Z),_mcopPreparePostMessageOrigin(e))");
        });

        it('replacePostMessage - 2 params - yet another complex kind 2', function () {
            const jsCode = '(function(){var n="CookieConsentBulkSetting-";this.handleRequest=function(t){function f(n){t.source.postMessage(n,t.origin)}var i,e,o,r,u;try{if(i=t.data,e=typeof i=="string",e&&(i=JSON.parse(i)),o=i.value&&i.value.expireMonths&&i.value.expireMonths===0,!i.serial||o){f("bcEmpty");return}r=n+i.serial;switch(i.action){case"get":u=JSON.parse(localStorage.getItem(r));u?f(u):f("bcEmpty");break;case"set":localStorage.setItem(r,JSON.stringify(i.value));break;case"remove":localStorage.removeItem(r)}}catch(s){}};window.addEventListener("message",this.handleRequest,!1)})()';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain("t.source.postMessage(_mcopPreparePostMessageMsg(n),_mcopPreparePostMessageOrigin(t.origin))");
        });

        it('replacePostMessage - 2 params - yet another complex kind 3', function () {
            const jsCode = '(event) => {try {window.parent.postMessage({ key: "_epik_localstore",value: window.localStorage.getItem("_epik_localstore") },"*")} catch (error) {}}';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain(`window.parent.postMessage(_mcopPreparePostMessageMsg({key:"_epik_localstore",value:window.localStorage.getItem("_epik_localstore")}),_mcopPreparePostMessageOrigin("*"))`);
        });

        it('replacePostMessage - Good 3', function () {
            const jsCode = '(function(){function n(n,t){t=t||{bubbles:!1,cancelable:!1,detail:null};var i=document.createEvent("CustomEvent");return i.initCustomEvent(n,t.bubbles,t.cancelable,t.detail),i}if(typeof window.CustomEvent=="function")return!1;window.CustomEvent=n})(),function(){function t(){}function n(){}var u="CookieConsentBulkSetting-",r="sessionStorageUpdated",i,f;this.handleRequest=function(i){function c(n){i.source.postMessage(n,i.origin,v)}var r,o,f,s,h,e;try{if(r=i.data,o=typeof r=="string",o&&(r=JSON.parse(r)),f=u+r.serial,r.action==="get"){s=t.getData(f);n.getData(f,function(n){var t=s||n;t?c(t):c("bcEmpty")});return}h=r.value.expireMonths===0;e=t;h&&(e=n);switch(r.action){case"set":e.setData(f,r.value);break;case"remove":e.removeData(f)}}catch(l){}};t.getData=function(n,t){var i=JSON.parse(localStorage.getItem(n));return t&&t(i),i};t.setData=function(n,t){localStorage.setItem(n,JSON.stringify(t))};t.removeData=function(n){localStorage.removeItem(n)};i=undefined;f=300;n.getData=function(t,u){var e=sessionStorage.getItem(t);e?u(JSON.parse(e)):(window.addEventListener(r,function(){typeof i=="number"&&window.clearTimeout(i);i=undefined;e=JSON.parse(sessionStorage.getItem(t));u(e)}),n.pulseLocalStorage("req",t),i=window.setTimeout(function(){window.dispatchEvent(new CustomEvent(r,{detail:{answerReceived:!1}}))},f))};n.setData=function(t,i){var u=typeof i=="string",r;r=u?i:JSON.stringify(i);sessionStorage.setItem(t,r);n.pulseLocalStorage("msg",r)};n.removeData=function(n){sessionStorage.removeItem(n)};n.pulseLocalStorage=function(n,t){localStorage.setItem(n,t);localStorage.removeItem(n)};n.msgCallBack=function(t){var i,f;switch(t.key){case"req":i=t.newValue;sessionStorage.getItem(i)&&n.pulseLocalStorage("msg",sessionStorage.getItem(i));break;case"msg":t.newValue!==null&&(f=JSON.parse(t.newValue),i=u+f.serial,t.newValue!==sessionStorage.getItem(i)&&n.setData(i,t.newValue),window.dispatchEvent(new CustomEvent(r,{detail:{answerReceived:!0}})))}};window.addEventListener("message",this.handleRequest,!1);window.addEventListener("storage",n.msgCallBack,!1)}()';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('(_mcopPreparePostMessageMsg(n),_mcopPreparePostMessageOrigin(i.origin),v)');
        });


        it('replacePostMessage - 3 params', function () {
            const jsCode = ";b.g.postMessage(\"GoogleBasRYoCJlVEB\",\"https://tpc.googlesyndication.com\",[d.port2])";
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain(`postMessage(_mcopPreparePostMessageMsg("GoogleBasRYoCJlVEB"),_mcopPreparePostMessageOrigin("https://tpc.googlesyndication.com"),[d.port2])`);
        });

        it('replacePostMessage - 3 params with spaces', function () {
            const jsCode = ";b.g.postMessage(  \"GoogleBasRYoCJlVEB\"  ,  \"https://tpc.googlesyndication.com\"  , [d.port2] )";
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain(`postMessage(_mcopPreparePostMessageMsg("GoogleBasRYoCJlVEB"),_mcopPreparePostMessageOrigin("https://tpc.googlesyndication.com"),[d.port2])`);
        });

        it('replacePostMessage - 3 params - another kind', function () {
            const jsCode = 'I.postMessage("recaptcha-setup",h[14](12,Q,v),[E.port2])';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain(`postMessage(_mcopPreparePostMessageMsg("recaptcha-setup"),_mcopPreparePostMessageOrigin(h[14](12,Q,v)),[E.port2])`);
        });

        it('replacePostMessage - 3 params - another kind with spaces', function () {
            const jsCode = 'I.postMessage( "recaptcha-setup" ,  h[14](12,Q,v)   ,   [E.port2]   ) ';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain(`postMessage(_mcopPreparePostMessageMsg("recaptcha-setup"),_mcopPreparePostMessageOrigin(h[14](12,Q,v)),[E.port2])`);
        });

        it('replacePostMessage - 3 params - yet another kind', function () {
            const jsCode = 'L=new MessageChannel,k.postMessage("recaptcha-setup",C[11](17,M,D),[L.port2]),V=new ZG(L.port1,T,l,D,L)';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain(`postMessage(_mcopPreparePostMessageMsg("recaptcha-setup"),_mcopPreparePostMessageOrigin(C[11](17,M,D)),[L.port2])`);
        });

        it('replacePostMessage - 3 params with new lines', function () {
            const jsCode = 'P.postMessage("recaptcha-setup",K[24](p[1],U,D),\n\n\n\n' +
                '[t.port2]);';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('P.postMessage(_mcopPreparePostMessageMsg("recaptcha-setup"),_mcopPreparePostMessageOrigin(K[24](p[1],U,D)),[t.port2])');
        });

        it('replacePostMessage - 3 params with new lines 2', function () {
            const jsCode = 'P.postMessage("recaptcha-setup",K[24](p[1],U,D)\n,' +
                '[t.port2]);';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain('P.postMessage(_mcopPreparePostMessageMsg("recaptcha-setup"),_mcopPreparePostMessageOrigin(K[24](p[1],U,D)),[t.port2])');
        });

        it('replacePostMessage - 3 params - yet another complex kind', function () {
            const jsCode = 'const a = {postMessage:function(){I.postMessage(Z,\n' + 'e\n' + ',b)}}';
            expect(handlerHelpers.replacePostMessage(jsCode))
                .toContain("postMessage(_mcopPreparePostMessageMsg(Z),_mcopPreparePostMessageOrigin(e),b)");
        });

        it('replacePostMessage - in real file', function () {
            const jsCode = fs.readFileSync(__dirname + '/recaptcha.js').toString();
            const modifiedCode = handlerHelpers.replacePostMessage(jsCode);
            expect(modifiedCode)
                .toContain("U.postMessage(_mcopPreparePostMessageMsg(Q[W[0]](W[1],w,X[5](2,t))))");
            expect(modifiedCode)
                .toContain('d.postMessage(_mcopPreparePostMessageMsg("recaptcha-setup"),_mcopPreparePostMessageOrigin(X[5](41,w,t)),[J[v[2]]])');
            expect(modifiedCode)
                .toContain('K.postMessage(_mcopPreparePostMessageMsg(P),_mcopPreparePostMessageOrigin(v))');
            expect(modifiedCode)
                .toContain('port2.postMessage(_mcopPreparePostMessageMsg(0))');
            expect(modifiedCode)
                .toContain('v.postMessage(_mcopPreparePostMessageMsg(Q[8](10,"finish",a)))');
            expect(modifiedCode)
                .toContain('v.postMessage(_mcopPreparePostMessageMsg(Q[8](11,"progress",a)))');
            expect(modifiedCode)
                .toContain('h.U.postMessage(_mcopPreparePostMessageMsg((J=W[T[0]],J)))');
        });

        it('replaceDomainInString - 1 occurrence', function () {
            const str = 'original.com';
            expect(handlerHelpers.replaceDomainInString(str, 'original.com', 'replaced.com'))
                .toContain('replaced.com');
        });

        it('replaceDomainInString - 2 occurrences', function () {
            const str = 'original.com|original.com';
            expect(handlerHelpers.replaceDomainInString(str, 'original.com', 'replaced.com'))
                .toContain('replaced.com|replaced.com');
        });

        it('replaceDomainInString - 2 occurrences with subdomain', function () {
            const str = 'sub.original.com|sub.original.com';
            expect(handlerHelpers.replaceDomainInString(str, 'sub.original.com', 'replaced.com'))
                .toContain('replaced.com|replaced.com');
        });

        it('replaceDomainInString - str is not a string', function () {
            const str = null;
            expect(handlerHelpers.replaceDomainInString(str, 'sub.original.com', 'replaced.com'))
                .toEqual(str);
        });

        it('replaceDomainInString - targetedDomain is not a string', function () {
            const str = 'sub.original.com|sub.original.com';
            expect(handlerHelpers.replaceDomainInString(str, undefined, 'replaced.com'))
                .toEqual(str);
        });

        it('replaceDomainInString - replacementDomain is not a string', function () {
            const str = 'sub.original.com|sub.original.com';
            expect(handlerHelpers.replaceDomainInString(str, 'sub.original.com', null))
                .toEqual(str);
        });

        it('replaceDomainInString - in json content', function () {
            const str = `{"success":true,"data":{"redirectUrl":"https:\\/\\/www.freepik.com\\/oauth-login?refreshToken=AOEOulaH1mG2g3i6upsb-4Kvr7UDtUh02maStGNDOuK-95jshrTzucLQoMvY8v14dFUx9XvnT1WaqYoEZLbMwOpVJnVO403Gs5NvlRDu8VNrwGtaKP_VXzab5fJ_obL1xlNX_YzooaLQDB0z1sQ12GhcS-xwRe89tLr7WrCHETAKC2cs5HyMRPXbJcyy6BojWx-QRo0CIhlRomGNGeu_6jEJXsviwas7I3nVhqN-tl9QpPm7D8GtsP6InwtzRuOH1XrUbNRfP5Bd&idToken=eyJhbGciOiJSUzI1NiIsImtpZCI6IjNmNjcyNDYxOTk4YjJiMzMyYWQ4MTY0ZTFiM2JlN2VkYTY4NDZiMzciLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoibWFkaXNlbzY1IiwicGljdHVyZSI6Imh0dHBzOi8vYXZhdGFyLmNkbnBrLm5ldC9kZWZhdWx0XzAyLnBuZyIsImFjY291bnRzX3VzZXJfaWQiOjc5NjEwODI2LCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vZmMtcHJvZmlsZS1wcm8tcmV2MSIsImF1ZCI6ImZjLXByb2ZpbGUtcHJvLXJldjEiLCJhdXRoX3RpbWUiOjE2NjY0OTU2MTQsInVzZXJfaWQiOiIyODc1NjQzODcxNjU0NzM3YmMxNGYyZjA4Y2Y1YmI1ZCIsInN1YiI6IjI4NzU2NDM4NzE2NTQ3MzdiYzE0ZjJmMDhjZjViYjVkIiwiaWF0IjoxNjY2NDk1NjE0LCJleHAiOjE2NjY0OTkyMTQsImVtYWlsIjoibWFkaXNlbzY1QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7ImVtYWlsIjpbIm1hZGlzZW82NUBnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJwYXNzd29yZCJ9fQ.jJ9zdqpTtO_oxop9NjfM_o5s4RNOwIUXmqRyfgmzW0_4qryS7cHsckgLYwE4k5NQ3O4ZUeXWGnEciAI9JPumTxvzEDgYcds0c_XZVREEewQ1q7q1n-YH0wMOi59LvHn_M7MTwNw0W1M_hbUIf9ZZto_SjzWNSYpgOUGyLLSFA-NvMVZIPsvrV3THYsndn1xaZeE1UhXSDbzLgKy59jzjUDHVHhx6xiQLyjsfwO58ZM5g9j7OHI5UcJFira7Dt8We5b8dknZLGXywAWpcxp97rVJOf2umj54Cpsz655_jq99LTS0-9Guuj4BecNTfk0APISVyarwD2hPp4MoCblBf1Q&rememberSession=1","email":"madiseo65@gmail.com","photoUrl":"https:\\/\\/avatar.cdnpk.net\\/default_04.png","userId":79610826,"userType":"payment-user","refreshToken":"AOEOulaH1mG2g3i6upsb-4Kvr7UDtUh02maStGNDOuK-95jshrTzucLQoMvY8v14dFUx9XvnT1WaqYoEZLbMwOpVJnVO403Gs5NvlRDu8VNrwGtaKP_VXzab5fJ_obL1xlNX_YzooaLQDB0z1sQ12GhcS-xwRe89tLr7WrCHETAKC2cs5HyMRPXbJcyy6BojWx-QRo0CIhlRomGNGeu_6jEJXsviwas7I3nVhqN-tl9QpPm7D8GtsP6InwtzRuOH1XrUbNRfP5Bd"}}`;
            expect(handlerHelpers.replaceDomainInString(str, 'www.freepik.com', 'replaced.com'))
                .toContain('replaced.com\\/oauth-login');
        });

        it('containsPortNumber - host with port number', function () {
            expect(handlerHelpers.containsPortNumber("localhost:8899"))
                .toBeTruthy();
        });

        it('containsPortNumber - Only port number', function () {
            expect(handlerHelpers.containsPortNumber(":8899"))
                .toBeFalsy();
        });

        it('containsPortNumber - Invalid port number', function () {
            expect(handlerHelpers.containsPortNumber(":8899a"))
                .toBeFalsy();
        });

        it('containsPortNumber - No port number', function () {
            expect(handlerHelpers.containsPortNumber("localhost"))
                .toBeFalsy();
        });

        it('extractPortNumber - host with port number', function () {
            expect(handlerHelpers.extractPortNumber("localhost:8899"))
                .toEqual('8899');
        });

        it('extractPortNumber - No port number', function () {
            expect(handlerHelpers.extractPortNumber("localhost"))
                .toEqual('');
        });

        it('extractPortNumber - Weird host', function () {
            expect(handlerHelpers.extractPortNumber("localhost::8899"))
                .toEqual('');
        });

        it('extractPortNumber - Web URL', function () {
            expect(handlerHelpers.extractPortNumber("https://localhost:8090"))
                .toEqual('');
        });

        it('stripPortNumber - host with port number', function () {
            expect(handlerHelpers.stripPortNumber("localhost:8090"))
                .toEqual('localhost');
        });

        it('stripPortNumber - host without port number', function () {
            expect(handlerHelpers.stripPortNumber("localhost"))
                .toEqual('localhost');
        });

        it('stripPortNumber - empty string', function () {
            expect(handlerHelpers.stripPortNumber(""))
                .toEqual('');
        });

        it('stripPortNumber - invalid host', function () {
            expect(handlerHelpers.stripPortNumber(null))
                .toEqual(null);
        });
});

describe("HandlerHelpers > toAbsoluteUrl test suite", function () {
    it('convert relative url without /', function () {
        expect(handlerHelpers.toAbsoluteUrl('index.php', 'https://mysite.cm'))
            .toEqual('https://mysite.cm/index.php');
    });

    it('convert relative url without / (type 2)', function () {
        expect(handlerHelpers.toAbsoluteUrl('_index.php', 'https://mysite.cm'))
            .toEqual('https://mysite.cm/_index.php');
    });

    it('convert relative url without / (type 3)', function () {
        expect(handlerHelpers.toAbsoluteUrl('01index.php', 'https://mysite.cm'))
            .toEqual('https://mysite.cm/01index.php');
    });

    it('convert relative url starting with /', function () {
        expect(handlerHelpers.toAbsoluteUrl('/index.php', 'https://mysite.cm'))
            .toEqual('https://mysite.cm/index.php');
    });

    it('convert protocol independent url starting with //', function () {
        expect(handlerHelpers.toAbsoluteUrl('//mysite.cm/index.php'))
            .toEqual('https://mysite.cm/index.php');
    });

    it('convert protocol independent url starting with //', function () {
        expect(handlerHelpers.toAbsoluteUrl('//mysite.cm/index.php', 'https://mysite.cm'))
            .toEqual('https://mysite.cm/index.php');
    });

    it('convert protocol independent url starting with // (type 2)', function () {
        expect(handlerHelpers.toAbsoluteUrl('//mysite.cm/index.php', 'http://mysite.cm'))
            .toEqual('http://mysite.cm/index.php');
    });

    it('convert protocol independent url starting with // (type 3)', function () {
        expect(handlerHelpers.toAbsoluteUrl('//mysite.cm/index.php'))
            .toEqual('https://mysite.cm/index.php');
    });

    it('no modification to absolute url', function () {
        expect(handlerHelpers.toAbsoluteUrl('https://mysite.cm/index.php'))
            .toEqual('https://mysite.cm/index.php');
    });

    it('no modification to absolute url (type 2)', function () {
        expect(handlerHelpers.toAbsoluteUrl('http://mysite.cm/index.php'))
            .toEqual('http://mysite.cm/index.php');
    });

    it('no modification to absolute url (type 3)', function () {
        expect(handlerHelpers.toAbsoluteUrl('wss://mysite.cm/index.php'))
            .toEqual('wss://mysite.cm/index.php');
    });
});
