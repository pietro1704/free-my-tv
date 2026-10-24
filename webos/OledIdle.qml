// Optional rooted-TV adapter: apply oled-idle.patch to custom-screensaver source,
// then copy this file and web/idle.js alongside screensaver-main.qml and into staged qml/.
import QtQuick 2.4
import WebOSServices 1.0
import "idle.js" as Idle

Item {
    id: root
    property bool screenSaverVisible: true
    property bool monitorNativeState: true
    property bool nativeScreenSaverActive: false
    property bool observedNativeSaver: false
    property bool ended: false
    property int startupDeadlineMs: 3000
    signal nativeEnded()
    function updatePowerState(data) {
        nativeScreenSaverActive = !!data && data.returnValue === true && data.state === "Screen Saver"
        if (nativeScreenSaverActive) observedNativeSaver = true
        else if (observedNativeSaver) finish()
    }
    function finish() {
        if (ended) return
        ended = true
        nativeScreenSaverActive = false
        nativeEnded()
    }
    property int idleBudgetMs: 1800000
    property int nativeElapsedMs: 180000
    property var launchArguments: Qt.application.arguments
    property int idleElapsedMs: Idle.IdlePolicy.elapsedFromArgs(launchArguments, nativeElapsedMs)
    property int remainingMs: Idle.IdlePolicy.remaining(idleElapsedMs, idleBudgetMs)
    property var powerRequest: function() {
        power.call("luna://com.webos.service.tvpower", "/power/powerOff", "{}")
    }
    Service {
        id: power
        appId: "com.webos.app.screensaver-oled-idle"
        onResponse: {
            if (String(method).indexOf("getPowerState") >= 0) {
                try { root.updatePowerState(JSON.parse(payload)) }
                catch (error) { root.updatePowerState(null) }
            } else {
                try { if (JSON.parse(payload).returnValue === false) console.warn("OLED idle power request failed") }
                catch (error) { console.warn("OLED idle power response unavailable") }
            }
        }
    }
    Component.onCompleted: if (monitorNativeState) power.call("luna://com.webos.service.tvpower", "/power/getPowerState", '{"subscribe":true}')
    Timer {
        interval: root.startupDeadlineMs
        running: root.monitorNativeState && !root.observedNativeSaver && !root.ended
        onTriggered: root.finish()
    }
    Timer {
        interval: root.remainingMs
        running: root.screenSaverVisible && root.nativeScreenSaverActive && !root.ended
        repeat: false
        onTriggered: if (root.screenSaverVisible && root.nativeScreenSaverActive && !root.ended) root.powerRequest()
    }
}
