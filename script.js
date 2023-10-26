// https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-comments
// https://docs.atlassian.com/software/jira/docs/api/REST/7.12.0/
// https://jira.mongodb.org/rest/api/2/myself
// https://jira.mongodb.org/rest/api/2/search?jql=...
// https://jira.mongodb.org/rest/api/2/field
// branches, pull requests, ... https://jira.mongodb.org/rest/dev-status/1.0/issue/summary?issueId=2436084&_=1694234168146
// dev status: https://jira.mongodb.org/rest/dev-status/1.0/issue/summary?issueId=2436084 https://jira.mongodb.org/rest/dev-status/1.0/issue/detail?issueId=2436084&applicationType=github&dataType=pullrequest

// https://confluence.atlassian.com/jirakb/how-to-create-issues-using-direct-html-links-in-jira-server-159474.html
//    add ?expand=names to include field key -> name

// Jira Server platform REST API reference https://docs.atlassian.com/software/jira/docs/api/REST/9.11.0/#api/2/issue-getIssue

//var D=false;
//var DEBUG = ()=>{};
var D=true;
function DEBUG(...args) { console.log(`[instant] ${DEBUG.caller.name}:`, ...args); }
//function DEBUG(...args) {
//    let ss = 0, fn = DEBUG.caller;
//    while (true) {
//        try {
//            if (!(fn = fn?.caller)) break;
//        } catch (ex) { break; }
//        ss++;
//    }
//    console.log(`${"  ".repeat(ss)}${DEBUG.caller.name}:`, ...args);
//}

var QS = (q,e) => (e || document).querySelector(q);
var QA = (q,e) => [...(e || document).querySelectorAll(q)];

function escapeHTML(s) { return s.replace(/[&<>"'`]/g, x => `&#${x.charCodeAt(0)};`); }

function normalizeText(s) { return s.replace(/\s+/g, " ").trim(); }

function isObject(x) { return typeof x === 'object' && x !== null; }  // this is to fix: typeof null === object

let time = (...args) => new Date(...args).getTime();

var originalIcon = QS('head link[rel="shortcut icon"]')?.getAttribute('href');
var iconState = false;
function updateIcon(changedState) {
    if (iconState === changedState) return;
    iconState = changedState;
    let icon = changedState ? chrome.runtime.getURL(`icon3-128.png`) : originalIcon;
    let iconElement = QS('head link[rel="shortcut icon"]');
    if (iconElement && iconElement.getAttribute('href') !== icon) {
        iconElement.setAttribute('href', icon);
    }
}

function fmtDate(d) {
    return Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        // timeZoneName: "short",
    }).format(d);
}

var ex;
function getIssueKey() {
    return (document.querySelector(`meta[name="ajs-issue-key"]`)?.content) ||
        (document.querySelector('a#key-val.issue-link')?.getAttribute("data-issue-key")) ||
        // (location.pathname.split('/').slice(-1)[0]) ||
        '';
}

async function getUpdate() {
    return JSON.stringify((await (await fetch(`/rest/api/2/issue/${getIssueKey()}?fields=updated,watches`)).json())?.fields);
}
async function getState() {
    return await (await fetch(`/rest/api/2/issue/${getIssueKey()}?expand=names,renderedFields`)).json();
}

class FieldHandler {
    stateForCmp = state => JSON.stringify(state);
    isEqual = (state1, state2) => this.stateForCmp(state1) === this.stateForCmp(state2);

    onUpdate = (fieldId, newVal, oldVal = null, renderedHTML = null) => {
        let valElement = this.getValElement(fieldId);
        if (!valElement) return;    // TODO: add new element?
        let wrapperElement = this.getWrapperElement(valElement, fieldId);
        if (renderedHTML == null || !this.preferRendered()) {
            renderedHTML = this.render(newVal, oldVal);
            if (!this.isHtml()) renderedHTML = escapeHTML(renderedHTML);
        }
        this.displayUpdate(valElement, wrapperElement, renderedHTML);
    };

    getValElementSel     = fieldId => `#${fieldId}-val`;
    getWrapperElementSel = (valElement, fieldId) => `li, dl`;
    getValElement     = fieldId => QS(this.getValElementSel(fieldId));
    getWrapperElement = (valElement, fieldId) => valElement.closest(this.getWrapperElementSel(valElement, fieldId)) || valElement;

    isHtml = () => false;
    preferRendered = () => false;

    render = (val, old) =>
        Array.isArray(val) ? this.renderArray(val, old) :
        isObject(val) ? this.renderObject(val, old) :
        this.renderVal(val, old);
    renderArray  = (val, old) =>
        val.map(x => this.render(x)).join(', ');
    renderObject = (val, old) =>
        val?.displayName != null ? val.displayName :
        val?.name != null ? val.name :
        val?.value != null ? val.value :
        val?.description != null ? val.description :
        val?.id != null ? val.id :
        Object.entries(val).map(([k,v]) => `${k}: ${this.render(v)}`).join(', ');
    renderVal = (val, old) => {
        val = `${val}`;
        if (val.match(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d.\d{3}.*/)) { // Date-time
            let d = new Date(val);
            if (d.getTime()) return fmtDate(d);
        }
        if (val.match(/^[^@\s]+@[^(\s]+\(\w+\)$/)) {              // email(JIRAUSERID)
            val.replace(/[(].*/, "");
        }
        return val;
    };

    displayUpdate = (valElement, wrapperElement, renderedHTML) => {
        valElement.innerHTML = renderedHTML;
        wrapperElement.style.backgroundColor = "#FFFF0080";
    };
}

var defaultHandler = new FieldHandler();

var fieldHandlers = {
    assignee: class extends FieldHandler {
        getValElementSel = () => "#assignee-val .user-hover";
        render = val => val?.displayName || "?";
    },
    attachment: class extends FieldHandler {
        getValElementSel     = () => "#attachmentmodule #attachment_thumbnails";
        getWrapperElementSel = () => "#attachmentmodule #attachment_thumbnails";
        isHtml = () => true;
        renderObject = val => `<li>
    <a href="${escapeHTML(val?.content || "")}">
        <dl><dt>${escapeHTML(val?.filename || "?")}</dt></dl>
    </a>
</li>`;
    },
    // TODO: this is an async function: make a guard
    comment: class extends FieldHandler {
        onUpdate = () => reloadActivitySection();
    },
    // "components" uses array of obj.name => default works
    created: class extends FieldHandler {
        render = val => fmtDate(new Date(val));
    },
    // Sprint: array of: com.atlassian.greenhopper.service.sprint.Sprint@793bc0dc[id=7728,rapidViewId=467,state=CLOSED,name=BermudaTriangle- 2023-09-05,startDate=2023-08-21T23:31:00.000Z,endDate=2023-09-04T23:31:00.000Z,completeDate=2023-09-05T05:43:20.050Z,activatedDate=2023-08-22T02:50:13.883Z,sequence=7623,goal=,autoStartStop=false,synced=false]
    customfield_10557: class extends FieldHandler {
        renderVal = (val) => {
            let m = val.match(/^com\.atlassian\..*[\[,]name=([^,\]]*)[\],]/);
            return m ? m[1] : "?";
        };
    },
    // Development: branches, pull requests, etc
    // TODO: use https://jira.mongodb.org/rest/dev-status/1.0/issue/summary?issueId=2452210 ?
    customfield_15850: class extends FieldHandler {
        // stateForCmp = state => (state || "").replace(/^.*devSummaryJson=/, "");  // this doesn't work because ".stale" can change for no reason
        stateForCmp = state => JSON.stringify(this.parse(state || ""));
        onUpdate = (fieldId, newVal, oldVal) => {
            let json = newVal ? this.parse(newVal) : null;
            if (!isObject(json?.summary)) return;

            let devPanel = QS("#viewissue-devstatus-panel");
            let devPanelList = QS("#viewissue-devstatus-panel .status-panels.devstatus-entry");
            if (!devPanel || !devPanelList) return;

            devPanel.style.display = "block";
            devPanelList.classList.remove("empty-status");

            for (let devPart of Object.keys(json.summary)) {
                let devPartData = json.summary[devPart];
                let devPartPanel = QS(`#viewissue-devstatus-panel .status-panels.devstatus-entry #${devPart}-status-panel`);
                if (!devPartPanel) continue;
                let countEl = devPartPanel ? QS(".count", devPartPanel) : null;
                let timeEl = devPartPanel ? QS("time", devPartPanel) : null;
                if (countEl && timeEl) {
                    devPartPanel.classList.remove("hidden");
                    let count = devPartData?.overall?.count || 0;
                    let d = fmtDate(new Date(devPartData?.overall?.lastUpdated || 0));
                    if (normalizeText(countEl.innerText) !== count) {
                        countEl.innerText = count;
                        timeEl.innetText = d;
                        devPanel.style.backgroundColor = "#FFFF0080";
                    }
                } else if (devPartData?.overall?.count) {
                    devPartPanel.classList.remove("hidden");
                    let html = `${devPart}: ${devPartData.overall.count}`;
                    if (devPartData?.overall?.state) html += ` [(${devPartData.overall.state})]`;
                    if (devPartData?.overall?.lastUpdated) html += ` ${fmtDate(new Date(devPartData.overall.lastUpdated))}`;
                    devPartPanel.innerHTML = html;
                    devPartPanel.style.backgroundColor = "#FFFF0080";
                }
            }
        };
        parse = (val) => {
            // Extract JSON from Jira's weird format.
            let m = val.match(/devSummaryJson=(.*)/);
            if (!m) return null;
            let s = m[1];
            while (true) {
                try { return JSON.parse(s)?.cachedValue; } catch (ex) {}
                let pos = s.lastIndexOf("}");
                if (pos < 0) return null;
                s = s.substring(0, pos);
            }
        };
    },
    description: class extends FieldHandler {
        preferRendered = () => true;
        getValElementSel     = () => "#descriptionmodule .user-content-block";
        getWrapperElementSel = () => "#descriptionmodule";
    },
    fixVersions: class extends FieldHandler {
        getValElementSel     = () => "#fixfor-val";
    },
    issuelinks: class extends FieldHandler {
        isHtml = () => true;
        getValElementSel     = () => "#linkingmodule .links-container";
        getWrapperElementSel = () => "#linkingmodule";
        renderArray  = val => val.map(x => `<div>${this.render(x)}</div>`).join('');
        renderObject = (val) => {
            let other = val?.outwardIssue || val?.inwardIssue;
            let key = escapeHTML(other?.key || "");
            let summary = escapeHTML(other?.fields?.summary || "");
            return `${val?.type?.inward}: <a href="/browse/${key}">${key}</a>${summary}`;
        };
    },
    issuetype: class extends FieldHandler {
        isHtml = () => true;
        getValElementSel = () => `#details-module #type-val`;
        render = val => `<img alt="" height="16" src="${escapeHTML(val?.iconUrl)}" title="${escapeHTML(val?.name)} - ${escapeHTML(val?.description)}" width="16"> ${escapeHTML(val?.name)}<span class="overlay-icon aui-icon aui-icon-small aui-iconfont-edit"></span>`;
    },
    labels: class extends FieldHandler {
        isHtml = () => true;
        getValElementSel = () => "#details-module #wrap-labels .labels";
        renderArray  = val => val.map(x => {
            let l = escapeHTML(this.render(x));
            return `<li><a class="lozenge" href="/issues/?jql=labels+%3D+${l}" title="${l}"><span>${l}</span></a></li>`;
        }).join('');
    },
    votes: class extends FieldHandler {
        getValElementSel = () => "#peoplemodule #view-voter-list aui-badge#vote-data";
        render = val => `${val?.votes}`;
    },
    watches: class extends FieldHandler {
        getValElementSel = () => "#peoplemodule #view-watcher-list aui-badge#watcher-data";
        render = val => `${val?.watchCount}`;
    },
};

var fieldHandlerInstances = Object.entries(fieldHandlers).reduce((a, [k, v]) => (a[k] = new v(), a), {});

function processNewStatus(status, oldStatus) {
    if (!status || !oldStatus || status?.key !== oldStatus?.key) return;
    if (!status.fields) return;
    for (let fieldId of Object.keys(status.fields)) {
        let handler = fieldHandlerInstances[fieldId] || defaultHandler;
        if (!handler.isEqual(status.fields[fieldId], oldStatus?.fields?.[fieldId])) {
            updateIcon(true);
            D&&DEBUG('Field update:', status.names?.[fieldId], fieldId, oldStatus?.fields?.[fieldId], ' => ', status.fields[fieldId]);
            handler.onUpdate(fieldId, status.fields[fieldId], oldStatus?.fields?.[fieldId], status.renderedFields?.[fieldId]);
        }
    }
}

// https://jira.mongodb.org/browse/${getIssueKey()}?page=com.tengen.tengen-jira-plugin:xgen-all-tabpanel&_=1694489139724
// https://jira.mongodb.org/browse/${getIssueKey()}?page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel&showAll=true
// https://jira.mongodb.org/browse/${getIssueKey()}?page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel&_=1694489139735
// https://jira.mongodb.org/browse/${getIssueKey()}?page=com.tengen.tengen-jira-plugin:xgen-changehistory-tabpanel&_=1694489139731
// https://jira.mongodb.org/browse/${getIssueKey()}?page=com.atlassian.streams.streams-jira-plugin:activity-stream-issue-tab&_=1694489139733

// https://jira.mongodb.org/browse/WT-11604?actionOrder=desc&_=1695022595793
// https://jira.mongodb.org/browse/WT-11604?actionOrder=asc&_=1695022595797

function getActiveTab() { return QS(`#issue-tabs > .menu-item.active`)?.id; }

async function reloadActivitySection() {
    let tabPage = '';
    //let isFullHistory = !QS(`#activitymodule .show-more-comments.aui-button`);
    switch (getActiveTab()) {
        case 'xgen-all-tabpanel':
            tabPage = 'com.tengen.tengen-jira-plugin:xgen-all-tabpanel';
            break;
        case 'comment-tabpanel':
            tabPage = 'com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel';
            break;
        case 'xgen-changehistory-tabpanel':
            tabPage = 'com.tengen.tengen-jira-plugin:xgen-changehistory-tabpanel';
            break;
        case 'activity-stream-issue-tab':
            tabPage = 'com.atlassian.streams.streams-jira-plugin:activity-stream-issue-tab';
            break;
        default:
            throw "Active tab?";
    }

    let isAscendingOrder = !QS('#activitymodule .sortwrap .issue-activity-sort-link[data-order="asc"]');  // the label is the opposite to the actual order
    // Using ?actionOrder=asc / actionOrder=desc changes the user's defaults, so don't use it.
    // Always load full history: if it's not full, then the earliest message will disappear and will be considered as deleted.
    let url = `https://jira.mongodb.org/browse/${getIssueKey()}?page=${tabPage}&showAll=true`;

    // document.querySelector('#activitymodule .mod-content').innerHTML =
    //     await (await fetch(url, {headers: {"X-Pjax": "true", "X-Requested-With": "XMLHttpRequest"}})).text();

    let text = await (await fetch(url, {headers: {"X-Pjax": "true", "X-Requested-With": "XMLHttpRequest"}})).text();
    let e = document.createElement('template');
    e.innerHTML = text;
    [...e.content.querySelectorAll('* + .concise')].forEach(e => e.remove());

    let getTimestamp = e => new Date(e.querySelector('.livestamp')?.getAttribute("datetime")).getTime();
    let sortFn = (a,b) => getTimestamp(a) - getTimestamp(b);   // Always sort ascending
    let onPageElements = [...QS(`#issue_actions_container`).children].filter(e => e.querySelector('.livestamp')).sort(sortFn);
    let loadedElements = [...QS(`#issue_actions_container`, e.content).children].filter(e => e.querySelector('.livestamp')).sort(sortFn);
    // If it's not the full history, only consider elements that are newer than the first element on the page.
    if (onPageElements.length) loadedElements = loadedElements.filter(e => getTimestamp(e) >= getTimestamp(onPageElements[0]));

    let i = 0, j = 0, e1, e2;
    while (i < onPageElements.length && j < loadedElements.length) {
        e1 = onPageElements[i];
        e2 = loadedElements[j];
        let t1 = getTimestamp(e1), t2 = getTimestamp(e2);
        if (t1 < t2) {
            // deleted element
            e1.style.backgroundColor = "#FF000040"; // e1.remove();
            i++;
        } else if (t1 > t2) {
            // new element
            e1.insertAdjacentElement(isAscendingOrder ? 'beforeBegin' : 'afterEnd', e2);
            e2.style.backgroundColor = "#FFFF0040";
            j++;
        } else {
            // update existing element (if needed)
            let norm1 = normalizeText(QS('.twixi-wrap.verbose.actionContainer .action-body', e1).innerText);
            let norm2 = normalizeText(QS('.twixi-wrap.verbose.actionContainer .action-body', e2).innerText);
            if (norm1 !== norm2) {
                e1.replaceWith(e2);
                e2.style.backgroundColor = "#FFFF0040";
            }
            i++; j++;
        }
    }
    while (j < loadedElements.length) {
        // new element
        e2 = loadedElements[j++];
        QS(`#issue_actions_container`).insertAdjacentElement(isAscendingOrder ? 'beforeEnd' : 'afterBegin', e2);
        e2.style.backgroundColor = "#B0FF0060";
    }
    while (i < onPageElements.length) {
        // deleted element
        e1 = onPageElements[i++];
        e1.style.backgroundColor = "#FF000040"; // e1.remove();
    }
}

var state;

var issueKey = "";
var checking = false;
var lastUpdate = '';
var lastCheckT = 0;
var nextCheckTimer = 0;
var lastLocation = '';

async function update() {
    let key = getIssueKey();
    if (issueKey != key) {
        D&DEBUG(`new issue key: ${key}`);
        lastUpdate = '';
        issueKey = key;
    }
    if (!key) {
        D&&DEBUG('Not a ticket page');
        return;
    }
    D&&DEBUG('Checking update quick', key, !!key);
    let curUpdate = await getUpdate();
    D&&DEBUG(`Checking update quick: ${curUpdate} ${lastUpdate}`);
    if (curUpdate === lastUpdate) return;
    lastUpdate = curUpdate;

    D&&DEBUG('Checking getState');
    let newState = await getState();
    if (newState?.fields) {
        processNewStatus(newState, state);
        state = newState;
    } else {
        console.error("Error getting state: ", newState);
        throw "Error getting state: " + JSON.stringify(newState);
    }
}

async function checkUpdate() {
    D&&DEBUG(`checking = ${checking}`);
    if (checking) return;
    let e, ex;
    (e = QS(`#instant-banner-update-icon`)) && (e.style.display = "");
    checking = true;
    lastCheckT = time();
    try {
        await update();
    } catch(exx) {
        console.log(ex = exx);
    } finally {
        checking = false;
        if (!getIssueKey()) {
            QS('#instant-update-status')?.remove();
            return;
        }
        let msg = fmtDate(new Date());
        if (ex) msg += ` <span style="color:red" title="${ex}">[ERROR]</span>`;
        (e = QS(`#instant-banner-update-icon`)) && (e.style.display = "none");
        (e = QS(`#instant-banner-timestamp`)) && (e.innerHTML = msg) || document.body.insertAdjacentHTML("beforeEnd", `
<div id="instant-update-status" onclick="this.remove()">
<style>
#instant-update-status {
  right: 0;
  bottom: -2px;
  position: fixed;
  background-color: #FFC;
  color: #AAA;
  border-radius: 0.5em;
  padding: 0 0.5em;
  font-family: Arial;
  font-size: 8pt;
  font-weight: 500;
  z-index: 999;
  /*pointer-events: none;*/
  cursor: default;
}
#instant-update-status:hover {
  opacity: 0.3;
}
#instant-banner-timestamp {
  color:#555;
}
@keyframes spinner-rotate {
  0%       { transform: rotate(0deg); }
  100%     { transform: rotate(360deg); }
}
</style>
        <svg id="instant-banner-update-icon" height="9" viewBox="0 0 24 24" width="9" fill="#333" fit="" preserveAspectRatio="xMidYMid meet" focusable="false" style="display: none; animation: spinner-rotate 700ms linear infinite;">
        <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z">
        </path>
        </svg>
        Auto-updated on:
        <span id="instant-banner-timestamp">${msg}</span>
</div>`);
    }
}

function scheduleNextCheckIfNeeded() {
    //D&&DEBUG(`checking = ${checking}   nextCheckTimer = ${nextCheckTimer}`);
    if (checking) return;
    let key = getIssueKey();
    if (issueKey != key) {
        D&&DEBUG(`issue key changed: force update ${issueKey} => ${key}`);
        if (nextCheckTimer) { clearTimeout(nextCheckTimer); nextCheckTimer = 0; }
        lastCheckT = 0;
        QS('#instant-update-status')?.remove();
    }
    if (nextCheckTimer) return;
    let t = time();
    let dt = t - lastCheckT;
    //D&&DEBUG(`dt = ${dt}`);
    if (dt >= 15000) {
        D&&DEBUG(`dt = ${dt} : Update now`);
        checkUpdate();
    } else if (dt < 4000) {
        //D&&DEBUG(`dt = ${dt} : Ignoring too frequent checks`);
    } else {
        D&&DEBUG(`dt = ${dt} : Hold update`);
        dt = 15000 - dt;
        D&&DEBUG(`Checking in ${dt}`);
        nextCheckTimer = setTimeout(async() => {
            await checkUpdate();
            nextCheckTimer = 0;
        }, dt);
    }
}

function onUserActive() {
    updateIcon(false);
    scheduleNextCheckIfNeeded();
}

function activate() {
    //if (!QS('.issue-navigator')) {
    //    D&DEBUG('Not a ticket page');
    //    return;
    //}
    [
      'blur', 'focus',
      'mousemove', 'mousewheel', 'mouseup',
      'keyup',
    ].forEach(ev => window.addEventListener(ev, onUserActive, {passive: true}));
    onUserActive();

    // Check every 10 minutes to update the page icon if the user is not active.
    // Don't check if the icon already indicates an update.
    setInterval(() => iconState || scheduleNextCheckIfNeeded(), 10*60*1000);
}
activate();

// monitor URL change:
// window.addEventListener('popstate', listener);  // or hashchange
// const pushUrl = (href) => {
//   history.pushState({}, '', href);
//   window.dispatchEvent(new Event('popstate'));
// };

// monitor in-page content changes...
// if (document.querySelector('.bv2-content')) {
//   let observer = new MutationObserver((mutations) => {
//     LOG("Page changed");
//     prevIssueNo = curIssueNo = 0;
//     lastState = null;
//     if (nextCheckTimer) { clearTimeout(nextCheckTimer); nextCheckTimer = 0; }
//     if (!isChecking) {
//       LOG(`:Checking NOW`);
//       CheckNewEvents();
//     } else {
//       LOG(`:Checking in 2s`);
//       nextCheckTimer = setTimeout(() => {
//         CheckNewEvents();
//         nextCheckTimer = 0;
//       }, 2000);
//     }
//   });
//   observer.observe(document.querySelector('.bv2-content'), {childList: true});
// }







///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////





/* Shift-click on code scrollbar or resize corner expands the code */
document.addEventListener("mousedown", ev =>
  ev.shiftKey && !ev.altKey &&
  ev.target?.id === "syntaxplugin" &&
	/*ev.target.offsetHeight < ev.target.firstElementChild.offsetHeight && */ (
    ev.target.style.maxHeight = '',
	  ev.target.style.height = ev.target.style.height ? '' : '30em',
    ev.target.style.resize="vertical",
    event.preventDefault()
  )
);

/* Alt+Shift-click on code adds resize corner */
document.addEventListener("mousedown", ev =>
  ev.shiftKey &&
  ev.altKey &&
  ev.target?.id != "syntaxplugin" &&
  (e = ev.target.closest(".syntaxplugin#syntaxplugin")) && (
//    (e.style.maxHeight = e.style.maxHeight ? "" : "30em"),
		e.style.height=`${e.offsetHeight}px`,
    e.style.maxHeight='',
		e.style.resize="vertical",
    event.preventDefault(),
    ev.cancelBubble = true
  ),
true);

/* Alt-click on code scrollbar enables code wrap */
document.addEventListener("mousedown", ev => { if (ev.altKey && !ev.shiftKey && ev.target.closest(".syntaxplugin#syntaxplugin")) {
	ev.preventDefault();
	ev.cancelBubble = true;
	let e = document.querySelector("#codewrapstyle");
	if (e) {
		e.remove();
	} else {
		document.head.insertAdjacentHTML("beforeEnd", `
<style id="codewrapstyle">
.syntaxplugin tr#syntaxplugin_code_and_gutter pre {
	text-wrap: wrap;
	word-break: break-all;
}
</style>
`);
	}
}}, {capture: true});

// Auto-expand links
document.querySelector('#show-more-links-link')?.click();

// Auto-expand participants
[...document.querySelectorAll('.ellipsis.shortener-expand')].forEach(e => e.click())

