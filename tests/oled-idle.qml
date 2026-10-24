import QtQuick 2.4
import "../webos" as Policy

Item {
    id: test
    property int fired: 0
    property int forbidden: 0
    property int exits: 0
    Policy.OledIdle {
        monitorNativeState: false
        nativeScreenSaverActive: true
        idleElapsedMs: 1799000
        powerRequest: function() { test.fired++ }
    }
    Policy.OledIdle {
        monitorNativeState: false
        nativeScreenSaverActive: true
        screenSaverVisible: false
        idleElapsedMs: 1799000
        powerRequest: function() { test.forbidden++ }
    }
    Policy.OledIdle {
        monitorNativeState: false
        nativeScreenSaverActive: true
        id: cancelled
        idleElapsedMs: 1799000
        powerRequest: function() { test.forbidden++ }
    }
    Policy.OledIdle {
        monitorNativeState: false
        nativeScreenSaverActive: true
        id: reopened
        screenSaverVisible: false
        idleElapsedMs: 1799000
        powerRequest: function() { test.fired++ }
    }
    Timer { interval: 200; running: true; onTriggered: reopened.screenSaverVisible = true }
    Timer { interval: 200; running: true; onTriggered: cancelled.screenSaverVisible = false }
    Policy.OledIdle {
        id: background
        monitorNativeState: false
        idleElapsedMs: 1799000
        Component.onCompleted: updatePowerState({returnValue:true,state:"Screen Saver"})
        powerRequest: function() { test.forbidden++ }
        onNativeEnded: test.exits++
    }
    Timer {interval:200;running:true;onTriggered:background.updatePowerState({returnValue:true,state:"Active"})}
    Policy.OledIdle {
        startupDeadlineMs: 250
        idleElapsedMs: 1799000
        powerRequest: function() { test.forbidden++ }
        onNativeEnded: test.exits++
    }
    Timer {
        interval: 1600
        running: true
        onTriggered: {
            if (test.fired === 2 && test.forbidden === 0 && test.exits === 2) {
                console.warn("OLED-IDLE PASS: native state, fail-safe exit, timer, hidden guard, cancellation")
                Qt.quit()
            } else {
                console.warn("OLED-IDLE FAIL: " + test.fired + ", " + test.forbidden + ", " + test.exits)
                Qt.quit()
            }
        }
    }
}
