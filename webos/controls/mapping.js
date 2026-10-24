/* Rooted-TV adapter: change only Disney's target; preserve every other mapping. */
'use strict';
function remap(message, target) {
  if (typeof target !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,199}$/.test(target)) return null;
  try {if (typeof message === 'string') message = JSON.parse(message);} catch (error) {return null;}
  var values = message && message.settings && message.settings.mapping_info;
  if (!message || message.returnValue === false || !Array.isArray(values)) return null;
  var index = -1;
  for (var i = 0; i < values.length; i++) {
    if (values[i] && Object.prototype.hasOwnProperty.call(values[i], 'disneyplus')) {
      if (index >= 0 || !values[i].disneyplus || typeof values[i].disneyplus !== 'object') return null;
      index = i;
    }
  }
  if (index < 0) return null;
  var button = values[index].disneyplus;
  if (button.app_id === target && button.launch_param === null && button.isActive === true) return null;
  var changed = JSON.parse(JSON.stringify(values));
  changed[index].disneyplus.app_id = target;
  changed[index].disneyplus.launch_param = null;
  changed[index].disneyplus.isActive = true;
  return {category: 'other', settings: {mapping_info: changed}};
}
module.exports = remap;
if (require.main === module) {
  var input = require('fs').readFileSync(0, 'utf8'), value;
  try {value = JSON.parse(input);} catch (error) {process.exit(0);}
  if (!value || typeof value !== 'object') process.exit(0);
  if (value.returnValue === false) process.exit(3);
  var payload = remap(value, process.argv[2]);
  if (payload) process.stdout.write(JSON.stringify(payload) + '\n');
}
