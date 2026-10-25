/* Only completed Frank reports with current evidence; artwork is cached locally. */
var NewsFeed = (function () {
  'use strict';
  function report(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return null;
    function text(v, limit) {return typeof v === 'string' ? v.slice(0,limit) : '';}
    function points(v) {var out=[];for(var i=0;Object.prototype.toString.call(v)==='[object Array]'&&i<v.length&&i<10;i++)if(typeof v[i]==='string')out.push(v[i].slice(0,1000));return out;}
    var counts={}, codes=['pending','supported','disputed','mixed','needs_more_evidence','not_checkable'];
    for(var i=0;i<codes.length;i++){var n=value.verdicts&&value.verdicts[codes[i]];if(typeof n==='number'&&isFinite(n)&&n>0&&n<=10000&&n%1===0)counts[codes[i]]=n;}
    return {conclusion:text(value.conclusion,8000),strengths:points(value.strengths),weaknesses:points(value.weaknesses),quality:text(value.quality,500),verdicts:counts,reused:value.reused===true,degraded:value.degraded===true};
  }
  function records(config) {
    var feed=config&&config.newsFeed;
    return feed&&feed.source==='frank_investigator'&&Object.prototype.toString.call(feed.items)==='[object Array]'?feed.items:[];
  }
  function dates(row,now) {
    if(!row||row.ready!==true||row.status!=='completed'||typeof row.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(row.id)||typeof row.title!=='string'||!row.title||typeof row.sourceUrl!=='string')return null;
    var host=/^https:\/\/([A-Za-z0-9.-]+)(?:\/|$)/.exec(row.sourceUrl),analyzed=Date.parse(row.analyzedAt),published=row.publishedAt?Date.parse(row.publishedAt):null;
    if(!host||host[1].toLowerCase()!==row.source||!isFinite(analyzed)||analyzed>now+300000||now-analyzed>172800000||(published!==null&&(!isFinite(published)||published>now+300000||now-published>604800000)))return null;
    return {analyzedAt:analyzed,publishedAt:published};
  }
  function current(config,id,analyzedAt,at) {
    var rows=records(config),now=typeof at==='number'?at:Date.now();
    for(var i=0;i<rows.length&&i<100;i++)if(rows[i]&&rows[i].id===id){var stamp=dates(rows[i],now);if(stamp)return stamp.analyzedAt===analyzedAt;}
    return false;
  }
  function items(config, at) {
    var rows=records(config),out=[],seen={},now=typeof at==='number'?at:Date.now();
    for(var i=0;i<rows.length&&i<100&&out.length<6;i++){
      var row=rows[i],stamp=dates(row,now);
      if(!stamp||seen['$'+row.id])continue;
      seen['$'+row.id]=true;
      var image=typeof row.image==='string'&&row.image.length<=600000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/.test(row.image)?row.image:'';
      out.push({id:row.id,title:row.title.slice(0,300),summary:typeof row.summary==='string'?row.summary.slice(0,1000):'',source:row.source,sourceUrl:row.sourceUrl.slice(0,2048),publishedAt:stamp.publishedAt,analyzedAt:stamp.analyzedAt,image:image,report:report(row.report)});
    }
    return out;
  }
  return {items:items,current:current};
})();
