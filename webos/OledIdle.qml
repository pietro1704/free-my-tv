// Optional rooted-TV adapter: apply oled-idle.patch to custom-screensaver source,
// then copy this file and web/idle.js alongside screensaver-main.qml and into staged qml/.
import QtQuick 2.4
import WebOSServices 1.0
import "idle.js" as Idle

Item {
    id: root
    property bool screenSaverVisible: true
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
            try {
                if (JSON.parse(payload).returnValue === false) console.warn("OLED idle power request failed")
            } catch (error) { console.warn("OLED idle power response unavailable") }
        }
    }
    Timer {
        interval: root.remainingMs
        running: root.screenSaverVisible
        repeat: false
        onTriggered: if (root.screenSaverVisible) root.powerRequest()
    }
}
