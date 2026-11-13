const pages = new Set([
  "Today",
  "Calendar",
  "Projects",
  "School",
  "People",
  "Inbox",
  "Memory",
  "Settings",
]);
export function readLifeRoute(url) {
  const p = new URL(url).searchParams;
  return {
    page: pages.has(p.get("page")) ? p.get("page") : "Today",
    course: p.get("course") || null,
    person: p.get("person") || null,
    project: p.get("project") || null,
    edit: p.get("edit") || null,
  };
}
export function lifeRouteURL(url, route) {
  const next = new URL(url);
  next.searchParams.set("workspace", "life");
  for (const key of ["page", "course", "person", "project", "edit"]) {
    if (route[key] && !(key === "page" && route[key] === "Today"))
      next.searchParams.set(key, route[key]);
    else next.searchParams.delete(key);
  }
  return next.href;
}
