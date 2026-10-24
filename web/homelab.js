/* Parses only numeric metrics from an existing LAN Checkmk agent. No credentials or remote commands. */
var Homelab = (function () {
  'use strict';
  function validHost(host) {
    if (typeof host !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    return host.split('.').every(function (part) { return Number(part) <= 255 && String(Number(part)) === part; });
  }
  function command(host) {
    if (!validHost(host)) return null;
    var filter = '/^<<<(mem|cpu|uptime|kernel|docker_node_info|lnx_thermal)(:|>)/ {section=$0;print;next} '
      + '/^<<</ {section="";next} '
      + 'section ~ /<<<mem/ && /^Mem(Total|Available):/ {print;next} '
      + 'section ~ /<<<kernel/ && /^cpu / {print;next} '
      + 'section ~ /<<<cpu/ && /^[0-9]/ {print;next} '
      + 'section ~ /<<<uptime/ && /^[0-9]/ {print;next} '
      + 'section ~ /<<<lnx_thermal/ {print;next} '
      + 'section ~ /<<<docker_node_info/ {n=split("Containers ContainersRunning ContainersStopped",keys," "); '
      + 'for(i=1;i<=n;i++){pattern="\\\"" keys[i] "\\\"[[:space:]]*:[[:space:]]*[0-9]+"; '
      + 'if(match($0,pattern)){v=substr($0,RSTART,RLENGTH);sub(/.*:/,"",v);gsub(/[[:space:]]/,"",v);print keys[i] "=" v}}}';
    return 'timeout 6 nc ' + host + " 6556 | awk '" + filter + "'";
  }
  function parse(text) {
    var stats = Diagnostics.parse(text), section = '', lines = text.split('\n');
    stats.load1 = stats.uptimeSeconds = stats.temperature = stats.dockerTotal = stats.dockerRunning = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i], header = /^<<<([^>:]+)[^>]*>>>$/.exec(line);
      if (header) { section = header[1]; continue; }
      if (section === 'cpu' && /^\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d/.test(line)) stats.load1 = Number(line.split(/\s+/)[0]);
      if (section === 'uptime' && /^\d+(\.\d+)?\s/.test(line)) stats.uptimeSeconds = Number(line.split(/\s+/)[0]);
      if (section === 'lnx_thermal') {
        var fields = line.split('|'), temp = Number(fields[3]) / 1000;
        if (fields[1] === 'enabled' && /x86_pkg_temp|cpu_thermal|cpu-thermal/.test(fields[2]) && temp > 0 && temp < 130) stats.temperature = temp;
      }
      var total = /^Containers=(\d+)$/.exec(line), running = /^ContainersRunning=(\d+)$/.exec(line);
      if (total) stats.dockerTotal = Number(total[1]);
      if (running) stats.dockerRunning = Number(running[1]);
    }
    if (stats.dockerTotal !== null && stats.dockerRunning > stats.dockerTotal) stats.dockerRunning = null;
    if (!isFinite(stats.load1)) stats.load1 = null;
    if (!isFinite(stats.uptimeSeconds)) stats.uptimeSeconds = null;
    stats.available = stats.totalMB !== null && stats.usedMB !== null && stats.uptimeSeconds !== null;
    return stats;
  }
  return {command: command, parse: parse};
})();
