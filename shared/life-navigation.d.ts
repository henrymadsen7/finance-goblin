export type LifeRoute = {page:string;course:string|null;person:string|null;project:string|null;edit:string|null};
export function readLifeRoute(url:string):LifeRoute;
export function lifeRouteURL(url:string,route:LifeRoute):string;
