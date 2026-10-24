import QtQuick 2.4
import "../webos" as Policy

Item {
    id: test
    property int fired: 0
    property int forbidden: 0
    Policy.OledIdle {
        idleElapsedMs: 1799000
        powerRequest: function() { test.fired++ }
    }
    Policy.OledIdle {
        screenSaverVisible: false
        idleElapsedMs: 1799000
        powerRequest: function() { test.forbidden++ }
    }
    Policy.OledIdle {
        id: cancelled
        idleElapsedMs: 1799000
        powerRequest: function() { test.forbidden++ }
    }
    Policy.OledIdle {
        id: reopened
        screenSaverVisible: false
        idleElapsedMs: 1799000
        powerRequest: function() { test.fired++ }
    }
    Timer { interval: 200; running: true; onTriggered: reopened.screenSaverVisible = true }
    Timer { interval: 200; running: true; onTriggered: cancelled.screenSaverVisible = false }
    Timer {
        interval: 1600
        running: true
        onTriggered: {
            if (test.fired === 2 && test.forbidden === 0) {
                console.warn("OLED-IDLE PASS: timer, hidden guard, cancellation")
                Qt.quit()
            } else {
                console.warn("OLED-IDLE FAIL: " + test.fired + ", " + test.forbidden)
                Qt.quit()
            }
        }
    }
}
