const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

test('OLED timer sends the required automatic shutdown reason to webOS', () => {
  const qml = fs.readFileSync('webos/OledIdle.qml', 'utf8');
  const request = qml.match(/property var powerRequest: function\(\) \{([\s\S]*?)\n    \}/);
  assert.ok(request, 'Exercise the production QML timer callback');
  const calls = [];
  vm.runInNewContext(request[1], {
    power: {call: (uri, method, payload) => {
      const params = JSON.parse(payload);
      calls.push({uri, method, params});
      // This firmware rejects requests without a shutdown reason.
      assert.equal(params.reason, 'autoOff');
      assert.equal(params.forced, undefined, 'Keep normal standby and panel maintenance');
    }}
  });
  assert.deepEqual(calls, [{
    uri: 'luna://com.webos.service.tvpower',
    method: '/power/powerOff',
    params: {reason: 'autoOff'}
  }]);
});
