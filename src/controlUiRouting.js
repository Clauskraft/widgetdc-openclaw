export function rewriteControlUiBootstrapPath(reqPath, reqUrl) {
  if (!reqPath.startsWith("/openclaw/__openclaw/")) {
    return null;
  }

  const rewrittenPath = reqPath.slice("/openclaw".length);
  const query = reqUrl.includes("?") ? reqUrl.slice(reqUrl.indexOf("?")) : "";
  return `${rewrittenPath}${query}`;
}

