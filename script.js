
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

/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////
/////////////////////////////////////////////////////

// https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issue-comments
// https://docs.atlassian.com/software/jira/docs/api/REST/7.12.0/
// https://jira.mongodb.org/rest/api/2/myself
// https://jira.mongodb.org/rest/api/2/search?jql=...
// https://jira.mongodb.org/rest/api/2/field
// branches, pull requests, ... https://jira.mongodb.org/rest/dev-status/1.0/issue/summary?issueId=2436084&_=1694234168146
// dev status: https://jira.mongodb.org/rest/dev-status/1.0/issue/summary?issueId=2436084 https://jira.mongodb.org/rest/dev-status/1.0/issue/detail?issueId=2436084&applicationType=github&dataType=pullrequest

//var D=false;
//var DEBUG = ()=>{};
var D=true;
function DEBUG(...args) { console.log(`[instant] ${DEBUG.caller.name}:`, ...args); }

var QS = (q,e) => (e || document).querySelector(q);
var QA = (q,e) => [...(e || document).querySelectorAll(q)];
// Can do down and up
function QQ(q,e) {
    e ||= document;
    if (!Array.isArray(q)) return e.querySelector(q);
    for (let i = 0; e && i < q.length; i++) { e = (i % 2) ? e.closest(q[i]) : e.querySelector(q[i]); }
    return e;
}

let time = (...args) => new Date(...args).getTime();

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
        (location.pathname.split('/').slice(-1)[0]) ||
        '';
}

async function getUpdate() {
    return JSON.stringify((await (await fetch(`/rest/api/2/issue/${getIssueKey()}?fields=updated,watches`)).json())?.fields);
}
async function getState() {
    return await (await fetch(`/rest/api/2/issue/${getIssueKey()}`)).json();
}

function handler(name, stGetter, updater) {
    let lastState = null;
    let lastStateHash = "";
    return newState => {
        D&&DEBUG('on new state:', name);
        try {
            let st = stGetter(newState);
            let stHash = JSON.stringify(st);
            if (lastState != null) {
                if (stHash === lastStateHash) return false;
                D&&DEBUG('newState update');
                updater(st, lastState);
            } else {
                D&&DEBUG('newState init');
            }
            lastState = st;
            lastStateHash = stHash;
            return true;
        } catch (ex) {
            console.error(ex, stGetter, updater);
            return false;
        }
    };
}

function updateText(sel1, sel2, val) {
    D&&DEBUG(sel1, sel2, val);
    let e;
    (e = QQ(sel2)) && (e.innerText = val);
    (e = QQ(sel1)) && (e.style.backgroundColor = "#FFFF0080");
}
function updateHTML(sel1, sel2, val) {
    D&&DEBUG(sel1, sel2, val);
    let e;
    (e = QQ(sel2)) && (e.innerHTML = val);
    (e = QQ(sel1)) && (e.style.backgroundColor = "#FFFF0080");
}

async function updateAllComments() {
    D&&DEBUG();
    document.querySelector('#activitymodule .mod-content').innerHTML =
        await (
            await fetch(`https://jira.mongodb.org/browse/${getIssueKey()}?page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel&showAll=true`,
                {headers: {"X-Pjax": "true", "X-Requested-With": "XMLHttpRequest"}}
           )
        ).text();
    let e;
    (e = QS('#issue_actions_container')) && (e.style.backgroundColor = "#80800020");
}

async function updateComment(id) {
    D&&DEBUG(id);
    if (!QS(`#activitymodule .issuePanelContainer .action-body`)) return updateAllComments();

    D&&DEBUG(id, 'fetch...');
    let c = await (await fetch(`https://jira.mongodb.org/rest/api/2/issue/${getIssueKey()}/comment/${id}?expand=renderedBody`)).json();

    let e = QS(`#comment-${id} .action-body`);
    if (e) {
        D&&DEBUG(id, 'update');
        e.innerHTML = c.renderedBody;
        e.style.backgroundColor = "#FFFF0060";
        return;
    }

    let a = QA(`#activitymodule .issuePanelContainer .activity-comment`);
    if (!a.length) return updateAllComments();
    id = parseInt(id);
    let comment, comment_id;
    for (comment of a.reverse()) {
        comment_id = parseInt(comment.id.match(/\d+/)?.[0]);
        if (id > comment_id) break;
    }
    D&&DEBUG(id, 'insert', id > comment_id ? 'afterEnd' : 'beforeBegin', comment_id);
    comment.insertAdjacentHTML(id > comment_id ? 'afterEnd' : 'beforeBegin', `
<div id="comment-${id}" class="issue-data-block activity-comment twixi-block  expanded" style="background-color: #B0FF0080">
    <div class="twixi-wrap verbose actionContainer">
        <div class="action-head-fake">
            <!--<button aria-label="Collapse comment" title="Collapse comment" class="twixi icon-default aui-icon aui-icon-small aui-iconfont-expanded"></button>-->
            <div class="action-details">
                <a href="mailto:${c.author.emailAddress}">
                    <span class="aui-avatar aui-avatar-xsmall"><span class="aui-avatar-inner"><img src="${c.author.avatarUrls["16x16"]}"></span></span>
                    ${c.author.displayName}
                </a>
                ${fmtDate(new Date(c.created))}
                ${c.visibility ? ` - Visibility: <span class="redText">${c.visibility?.value}</span>` : ''}
            </div>
        </div>
        <div class="action-body flooded">
        ${c.renderedBody}
        </div>
    </div>
</div>`);
}

var state;
function initState() {
    DEBUG();
    // TODO: add "Story Points" and other fields hidden by default
    state = [
        handler('assignee',    st => st?.fields?.assignee,            f => updateText('#assignee-val', '#assignee-val .user-hover', f?.displayName)),
        handler('description', st => st?.fields?.description,         f => updateText('#descriptionmodule', '#descriptionmodule .user-content-block', f)),
        //handler('duedate',     st => st?.fields?.,                    f => update('#duedate', '# .', f)),
        handler('fixVersions', st => st?.fields?.fixVersions,         f => updateText([`#issuedetails #fixfor-val`, `li`], '#fixfor-val', f.map(x => x.name).join(', '))),
        handler('issuelinks',  st => st?.fields?.issuelinks,          f => updateHTML('#linkingmodule', '#linkingmodule .links-container', f.map(l =>
            `<a href="https://jira.mongodb.org/browse/${l?.inwardIssue?.key}">${l?.inwardIssue?.key}</a> ${l?.inwardIssue?.fields?.summary}`).join('<BR>'))),
        handler('issuetype',   st => st?.fields?.issuetype,           f => updateText([`#issuedetails #type-val`, `li`], '#type-val', f.name)),
        handler('labels',      st => st?.fields?.labels,              f => updateText(['#wrap-labels', 'li'], '#wrap-labels ul.labels', f.join(" "))),
        handler('priority',    st => st?.fields?.priority,            f => updateText(['#priority-val', 'li'], '#priority-val', f.name)),
        handler('status',      st => st?.fields?.status,              f => updateText(['#status-val', 'li'], '#status-val', f.name)),
        handler('summary',     st => st?.fields?.summary,             f => updateText('#summary-val', '#summary-val', f)),
        handler('updated',     st => st?.fields?.updated,             f => updateText(['#updated-val', 'dl'], '#updated-val', fmtDate(new Date(f)))),
        handler('votes',       st => st?.fields?.votes?.votes,        f => updateText(['#vote-data', 'dl'], '#vote-data', f)),
        handler('watches',     st => st?.fields?.watches?.watchCount, f => updateText(['#watcher-data', 'dl'], '#watcher-data', f)),
        handler('comments',    st => st?.fields?.comment, (f, lf) => {
            // let fs = f.reduce((a, b) => Object.assign(a, {[b.id]: b}), {});
            // let lfs = lf.reduce((a, b) => Object.assign(a, {[b.id]: b}), {});
            f = f.comments; lf = lf.comments;
            let runaway = 0, e;
                // TODO: respect sort order: '.sortwrap .issue-activity-sort-link'
                for (let fi = 0, lfi = 0; fi < f.length || lfi < lf.length; ) {
                D&&DEBUG('comments', `[${fi} : ${lfi}]`);
                if (++runaway > 1000) break;
                let d = (fi < f.length ? parseInt(f[fi].id) : 10000000000) - (lfi < lf.length ? parseInt(lf[lfi].id) : 10000000000);
                D&&DEBUG('comments', `{${fi < f.length ? parseInt(f[fi].id) : 10000000000} : ${lfi < lf.length ? parseInt(lf[lfi].id) : 10000000000}}`);
                //QS('#activitymodule .mod-content');
                //await (await fetch('https://jira.mongodb.org/browse/WT-11460?page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel&showAll=true', {headers: {"X-Pjax": "true", "X-Requested-With": "XMLHttpRequest"}})).text()
                // https://jira.mongodb.org/rest/api/2/issue/WT-11460/comment/5688331?expand=renderedBody
                if (d < 0) {
                    // new state has a comment where the old one didn't: inserted comment (???)
                    let id = f[fi].id;
                    D&&DEBUG('comments', 'insert', id);
                    (e = QS(`#comment-${id}`)) && (e.style.backgroundColor = "#B0FF0060");
                    updateComment(id);
                    fi++;
                } else if (d > 0) {
                    // new state doesn't have a comment: deleted comment
                    let id = lf[lfi].id;
                    D&&DEBUG('comments', 'delete', id);
                    (e = QS(`#comment-${id}`)) && (e.style.backgroundColor = "#FF000040");
                    lfi++;
                } else {
                    // match
                    if (JSON.stringify(f[fi]) != JSON.stringify(lf[lfi])) {
                        let id = lf[lfi].id;
                        D&&DEBUG('comments', 'edit', id);
                        (e = QS(`#comment-${id}`)) && (e.style.backgroundColor = "#FFFF0040");
                        updateComment(id);
                    }
                    fi++; lfi++;
                }
            }
        }),
    ];
}

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
        initState();
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
    let st = await getState();
    state.forEach(handler => handler(st));
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
</div>
        `);
    }
}

function onUserActive() {
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
}
activate();

