// CSGClaw's structured-output protocol is decoded only after a successful command.
export function publicationResourceLinks(state) {
  if (state?.schema_version !== 'ues-publication-state/0.1' || state.status !== 'published' || !state.verified_at || Number.isNaN(Date.parse(state.verified_at))) throw Error('Resource links require a verified published report');
  for (const key of ['project_id','run_id']) if (!/^[a-z0-9][a-z0-9_-]{0,100}$/.test(state[key] || '')) throw Error(`Invalid publication ${key}`);
  function safeURL(value) {
    const url=new URL(value);
    if (url.protocol!=='https:' || url.username || url.password || url.search || url.hash) throw Error('Resource links must be HTTPS URLs without credentials, queries or fragments');
    return url;
  }
  const index=safeURL(state.index_url),report=safeURL(state.report_url),project=safeURL(state.project_index_url);
  const base=index.href.replace(/\/$/,'');
  if (project.href!==`${base}/projects/${state.project_id}/` || report.origin!==index.origin || !report.href.startsWith(`${base}/reports/${state.project_id}/${state.run_id}/`) || !/\.html?$/i.test(report.pathname)) throw Error('Resource links do not belong to the same report archive');
  const definitions=[
    [`ues-report-${state.project_id}-${state.run_id}`,'本轮 UX 评估报告',report.href,'查看本次评估结论、整改建议与证据。','report'],
    [`ues-history-${state.project_id}`,'项目历史报告',project.href,'查看当前项目的全部评估批次。','project_history'],
    ['ues-report-directory','全部 UX 评估报告',index.href,'按项目、日期和关键词查阅报告。','directory'],
  ];
  return definitions.map(([name,title,uri,description,kind])=>({type:'resource_link',name,title,uri,description,mimeType:'text/html',annotations:{audience:['user'],lastModified:state.verified_at},_meta:{source:'ues-expert-suite',project_id:state.project_id,run_id:state.run_id,kind}}));
}

export function formatCsgclawPublication(state) {
  return ['UX 评估报告已发布，报告与证据资源已完成在线校验。',...publicationResourceLinks(state).map(link=>'::csgclaw-output::resource_link '+JSON.stringify(link))].join('\n');
}
