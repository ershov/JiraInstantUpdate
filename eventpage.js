chrome.runtime.onInstalled.addListener(function (details) {
    console.log("Install: ", details);
    if (details.reason != "install" && details.reason != "update") return;
    chrome.tabs.query({'url' : [ "*://jira.mongodb.org/*" ], discarded: false}, tabs => {
        //console.log("Install reload tabs: ", tabs);
        //tabs.forEach(tab => chrome.tabs.reload(tab.id));
    });
    if (details.reason == "install") {
        //if (chrome.runtime.openOptionsPage) {
        //    chrome.runtime.openOptionsPage();
        //} else {
        //    window.open(chrome.runtime.getURL('options.html'));
        //}
    }
});
